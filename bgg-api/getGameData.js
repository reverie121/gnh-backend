// bgg-api/getBGGCollectionData.js
"use strict";

const convert = require("xml-js");
const GameNightBGGHelperAPI = require("./bgg-api");
const { computePlayerCount, computePlayerAge } = require("./gameDataHelpers");

// Makes an API get request to BGG API for data for multiple games.
// Takes an array (or Set) of game IDs and returns an array of /thing items.
const getGameData = async (gameIDSet) => {
  const idSet = new Set(gameIDSet);            // de-dupe
  if (idSet.size === 0) return [];
  const idList = [...idSet].join(",");
  const res = await GameNightBGGHelperAPI.getGameData(idList); // returns parsed JS
  const items = res?.items?.item;
  return Array.isArray(items) ? items : (items ? [items] : []);
};

// Fetch collection data (either “collection” or “user” view), then fetch /thing
// details for all games, and integrate basic per-user fields into the result.
const getCollectionData = async (bggUsername, mode = "collection", playsIDs = []) => {
  // Holder sets/arrays for categorization
  const gameIDSet = new Set();

  const userCollectionIDs    = [];
  const userPreviouslyOwnedIDs = [];
  const userForTradeIDs      = [];
  const userWantIDs          = [];
  const userWantToPlayIDs    = [];
  const userWantToBuyIDs     = [];
  const userPreOrderedIDs    = [];

  // Per-game collection item extras to merge back into /thing items
  const userWishListData     = [];   // [[gameId, wishlistPriority], ...]
  const collectionItemsData  = [];   // { id, numPlays, userRating?, comments? }

  // Helper to safely pull attributes/fields
  const attr = (node, k) => node && node._attributes ? node._attributes[k] : undefined;
  const text = (node) => node && (node._text ?? node?._attributes?.value) || undefined;

  // Binary-search helper moved OUTSIDE of the “user” block so scope is correct
  function findCollectionItemData(gameID, dataToIntegrate) {
    let l = 0, r = dataToIntegrate.length - 1;
    while (l <= r) {
      if (String(dataToIntegrate[l].id) === String(gameID)) return dataToIntegrate[l];
      if (String(dataToIntegrate[r].id) === String(gameID)) return dataToIntegrate[r];
      const m = Math.floor((l + r) / 2);
      const mid = Number(dataToIntegrate[m].id);
      const gid = Number(gameID);
      if (mid === gid) return dataToIntegrate[m];
      if (mid > gid) r = m - 1; else l = m + 1;
    }
    return undefined;
  }

  // Add poll summaries & (for user mode) merge per-item collection data
  function integrateGameData(game, modeStr) {
    // Poll summaries (guard for shape)
    const polls = Array.isArray(game.poll) ? game.poll : (game.poll ? [game.poll] : []);
    if (polls[0]?._attributes?.totalvotes && Number(polls[0]._attributes.totalvotes) > 0) {
      polls[0].resultSummary = computePlayerCount(game);
    }
    if (polls[1]?._attributes?.totalvotes && Number(polls[1]._attributes.totalvotes) > 0) {
      polls[1].resultSummary = computePlayerAge(game);
    }

    if (modeStr === "user") {
      const d = findCollectionItemData(game?._attributes?.id, collectionItemsData);
      if (d) game.collectionData = d;
    }
  }

  // Pull IDs and basic per-item flags from a collection XML payload
  function extractDataFromCollection(xml) {
    const collectionData = JSON.parse(convert.xml2json(xml, { compact: true, spaces: 2 }));
    if (!collectionData?.items || collectionData.items._attributes?.totalitems === "0") return;

    const items = Array.isArray(collectionData.items.item)
      ? collectionData.items.item
      : [collectionData.items.item];

    for (const g of items) {
      const gid = attr(g, "objectid");
      if (!gid) continue;
      gameIDSet.add(gid);

      if (mode === "user") {
        const st = g?.status?._attributes || {};

        if (st.own === "1")        userCollectionIDs.push(gid);
        if (st.prevowned === "1")  userPreviouslyOwnedIDs.push(gid);
        if (st.fortrade === "1")   userForTradeIDs.push(gid);
        if (st.want === "1")       userWantIDs.push(gid);
        if (st.wanttoplay === "1") userWantToPlayIDs.push(gid);   // fixed: wanttoplay (was wantoplay)
        if (st.wanttobuy === "1")  userWantToBuyIDs.push(gid);
        if (st.preordered === "1") userPreOrderedIDs.push(gid);

        if (st.wishlist === "1") {
          userWishListData.push([gid, st.wishlistpriority]);
        }

        const entry = { id: gid, numPlays: g?.numplays?._text || "0" };
        const ratingVal = g?.stats?.rating?._attributes?.value;
        if (ratingVal && ratingVal !== "N/A") entry.userRating = ratingVal;
        if (g?.comment?._text) entry.comments = g.comment._text;
        collectionItemsData.push(entry);
      }
    }
  }

  // ----- Branch: “collection” (owned-only) -----
  if (mode === "collection") {
    // IMPORTANT: pass mode = "collection" so own=1 is applied by the helper
    const res = await GameNightBGGHelperAPI.getCollection(bggUsername, "collection");
    extractDataFromCollection(res.data);

    const userGames = await getGameData(gameIDSet);
    for (const game of userGames) integrateGameData(game, "collection");
    return userGames;
  }

  // ----- Branch: “user” (full status lists) -----
  if (mode === "user") {
    const res = await GameNightBGGHelperAPI.getCollection(bggUsername, "user");
    extractDataFromCollection(res.data);

    // include any “playsIDs” in the detailed /thing fetch
    for (const id of playsIDs) gameIDSet.add(id);

    // sort the side-car arrays to enable binary search merging
    userWishListData.sort((a, b) => Number(a[0]) - Number(b[0]));
    collectionItemsData.sort((a, b) => Number(a.id) - Number(b.id));

    let userGames = await getGameData(gameIDSet);

    if (Array.isArray(userGames)) {
      for (const game of userGames) integrateGameData(game, "user");
    } else if (userGames) {
      integrateGameData(userGames, "user");
    }

    return {
      userGames,
      userCollectionIDs,
      userPreviouslyOwnedIDs,
      userForTradeIDs,
      userWantIDs,
      userWantToPlayIDs,
      userWantToBuyIDs,
      userPreOrderedIDs,
      userWishListData
    };
  }

  // Fallback: treat as collection mode
  const res = await GameNightBGGHelperAPI.getCollection(bggUsername, "collection");
  extractDataFromCollection(res.data);
  const userGames = await getGameData(gameIDSet);
  for (const game of userGames) integrateGameData(game, "collection");
  return userGames;
};

module.exports = getCollectionData;
