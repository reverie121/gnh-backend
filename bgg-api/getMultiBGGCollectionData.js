// bgg-api/getMultiBGGCollectionData.js
"use strict";

const db = require("../db");
const GameNightBGGHelperAPI = require("./bgg-api");
const convert = require("xml-js");
// optional helpers you may use later
const { computePlayerCount, computePlayerAge } = require("./gameDataHelpers");

/**
 * Fetch a user's BGG collection, process, and upsert into DB (copy-aware via collid).
 */
async function fetchCollectionFromBGGAndStore(bggUsername, lastModifiedSince = null) {
  const bggUsernameLC = String(bggUsername).trim().toLowerCase();
  console.debug(`Fetching BGG collection for ${bggUsernameLC}, modified since: ${lastModifiedSince ?? "none"}`);

  const safeNumber = (text) => {
    const num = Number(text);
    return Number.isFinite(num) ? num : null;
  };
  const safeUserNumber = (text) => {
    const num = Number(text);
    return (Number.isFinite(num) && text !== "N/A") ? num : null;
  };

  // ensure bgg_usernames row + tick
  await db.query(
    `INSERT INTO bgg_usernames (bgg_username, last_synced_at)
     VALUES ($1, NOW())
     ON CONFLICT (bgg_username) DO UPDATE SET last_synced_at = NOW()`,
    [bggUsernameLC]
  );

  // call API (rich fields if available)
  const collectionApiResponse = await GameNightBGGHelperAPI.getCollection(
    bggUsernameLC,
    "user",
    { version: 1, showprivate: 1, modifiedsince: lastModifiedSince }
  );
  if (collectionApiResponse.status !== 200) {
    throw new Error(`BGG /collection status ${collectionApiResponse.status} for ${bggUsernameLC}`);
  }

  // parse XML -> JS
  const collectionData = JSON.parse(
    convert.xml2json(collectionApiResponse.data, { compact: true, spaces: 2 })
  );
  if (!collectionData.items || collectionData.items._attributes?.totalitems === "0") {
    console.debug(`No games for ${bggUsernameLC}`);
    return [];
  }

  const gamesInCollection = Array.isArray(collectionData.items.item)
    ? collectionData.items.item
    : [collectionData.items.item];

  // prefetch /thing details
  const ids = new Set();
  for (const g of gamesInCollection) {
    if (g?._attributes?.objectid) ids.add(g._attributes.objectid);
  }
  const detailedGameDataMap = new Map();
  if (ids.size) {
    const all = [...ids];
    for (let i = 0; i < all.length; i += 20) {
      const chunk = all.slice(i, i + 20).join(",");
      const detailed = await GameNightBGGHelperAPI.getGameData(chunk, { stats: 1 });
      const arr = Array.isArray(detailed?.items?.item) ? detailed.items.item
                : detailed?.items?.item ? [detailed.items.item] : [];
      for (const game of arr) {
        if (game) detailedGameDataMap.set(String(game._attributes.id), game);
      }
    }
  }

  const processed = [];

  for (const g of gamesInCollection) {
    const bggId = safeNumber(g?._attributes?.objectid);
    if (!bggId) continue;

    const bggName = g?.name?._text || null;
    const detail = detailedGameDataMap.get(String(bggId));

    // compute rank
    let bggRank = null;
    const ranks = detail?.statistics?.ratings?.ranks?.rank;
    if (ranks) {
      const list = Array.isArray(ranks) ? ranks : [ranks];
      const board = list.find(r => r?._attributes?.name === "boardgame");
      if (board && board._attributes?.value !== "N/A") {
        bggRank = safeNumber(board._attributes.value);
      }
    }

    // upsert bgg_games
    try {
      if (detail) {
        const nameToStore = detail?.name?._text || bggName;
        await db.query(
          `INSERT INTO bgg_games (
              bgg_id, name, year_published, thumbnail_url, image_url,
              min_players, max_players, playing_time, min_playtime, max_playtime, min_age, description,
              bgg_avg_rating, bgg_bayes_avg_rating, bgg_rank, bgg_weight,
              last_updated_general_data_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
            ON CONFLICT (bgg_id) DO UPDATE SET
              name = EXCLUDED.name,
              year_published = EXCLUDED.year_published,
              thumbnail_url = EXCLUDED.thumbnail_url,
              image_url = EXCLUDED.image_url,
              min_players = EXCLUDED.min_players,
              max_players = EXCLUDED.max_players,
              playing_time = EXCLUDED.playing_time,
              min_playtime = EXCLUDED.min_playtime,
              max_playtime = EXCLUDED.max_playtime,
              min_age = EXCLUDED.min_age,
              description = EXCLUDED.description,
              bgg_avg_rating = EXCLUDED.bgg_avg_rating,
              bgg_bayes_avg_rating = EXCLUDED.bgg_bayes_avg_rating,
              bgg_rank = EXCLUDED.bgg_rank,
              bgg_weight = EXCLUDED.bgg_weight,
              last_updated_general_data_at = NOW()
            WHERE bgg_games.last_updated_general_data_at < NOW() - INTERVAL '1 day'
               OR bgg_games.last_updated_general_data_at IS NULL`,
          [
            bggId,
            nameToStore,
            safeNumber(detail?.yearpublished?._text),
            detail?.thumbnail?._text || null,
            detail?.image?._text || null,
            safeNumber(detail?.minplayers?._text),
            safeNumber(detail?.maxplayers?._text),
            safeNumber(detail?.playingtime?._text),
            safeNumber(detail?.minplaytime?._text),
            safeNumber(detail?.maxplaytime?._text),
            safeNumber(detail?.minage?._text),
            detail?.description?._text || null,
            safeNumber(detail?.statistics?.ratings?.average?._text),
            safeNumber(detail?.statistics?.ratings?.bayesaverage?._text),
            bggRank,
            safeNumber(detail?.statistics?.ratings?.averageweight?._text)
          ]
        );
      } else {
        await db.query(
          `INSERT INTO bgg_games (
              bgg_id, name, thumbnail_url, image_url, last_updated_general_data_at
            ) VALUES ($1,$2,$3,$4,NOW())
            ON CONFLICT (bgg_id) DO UPDATE SET
              name = EXCLUDED.name,
              thumbnail_url = EXCLUDED.thumbnail_url,
              image_url = EXCLUDED.image_url,
              last_updated_general_data_at = NOW()
            WHERE bgg_games.last_updated_general_data_at < NOW() - INTERVAL '1 day'
               OR bgg_games.last_updated_general_data_at IS NULL`,
          [bggId, bggName, g?.thumbnail?._text || null, g?.image?._text || null]
        );
      }
    } catch (e) {
      console.error(`bgg_games upsert failed for ${bggId}:`, e.message);
    }

    // collection identity/status
    const collid = safeNumber(g?._attributes?.collid);
    const subtype = g?._attributes?.subtype || g?._attributes?.objecttype || null;

    const st = g?.status?._attributes || {};
    const lastModBGG = st.lastmodified
        ? new Date(st.lastmodified.replace(' ', 'T') + 'Z')  // treat as UTC
        : null;

    const is_owned     = st.own === "1";
    const is_for_trade = st.fortrade === "1";
    const is_want      = st.want === "1";
    const is_wishlist  = st.wishlist === "1";
    const wishlist_priority = st.wishlistpriority ? safeNumber(st.wishlistpriority) : null;

    const prevowned   = st.prevowned === "1";
    const wanttoplay  = st.wanttoplay === "1";
    const wanttobuy   = st.wanttobuy === "1";
    const preordered  = st.preordered === "1";

    const private_comment    = g?.privatecomment?._text || null;
    const wishlist_comment   = g?.wishlistcomment?._text || null;
    const condition_text     = g?.conditiontext?._text || null;
    const has_parts_text     = g?.hasparts?._text || g?.haspartstext?._text || null;
    const want_parts_text    = g?.wantparts?._text || g?.wantpartstext?._text || null;
    const acquired_from      = g?.acquiredfrom?._text || null;
    const inventory_location = g?.inventorylocation?._text || null;
    const acquired_date      = g?.acquisitiondate?._text || null;
    const price_paid         = safeNumber(g?.pricepaid?._text);
    const price_currency     = g?.currencysymbol?._text || g?.pricecurrency?._text || null;

    // version block
    const vItem = g?.version?.item || g?.versions?.item || g?.version || null;
    const vAttr = vItem?._attributes || {};
    const bgg_version_id         = safeNumber(vAttr.id);
    const version_name           = vItem?.name?._text || vAttr.name || vItem?.name?._attributes?.value || null;
    const version_year_published = safeNumber(
      vItem?.yearpublished?._text || vItem?.yearpublished?._attributes?.value || vAttr.yearpublished
    );
    const version_language       = vItem?.language?._text || vItem?.language?._attributes?.value || vAttr.language || null;
    const version_thumbnail_url  = vItem?.thumbnail?._text || vItem?.thumbnail?._attributes?.value || null;
    const version_image_url      = vItem?.image?._text || vItem?.image?._attributes?.value || null;

    const num_plays   = safeUserNumber(g?.numplays?._text) || 0;
    const user_rating = safeUserNumber(g?.stats?.rating?._attributes?.value);
    const user_comment= g?.comment?._text || null;

    // upsert user_game_collection_items
    try {
      const colsNoTs = `
        bgg_username, bgg_game_id, bgg_collid, subtype, last_modified_from_bgg,
        is_owned, is_for_trade, is_want, is_wishlist, wishlist_priority,
        prevowned, wanttoplay, wanttobuy, preordered,
        num_plays, user_rating, user_comment,
        private_comment, wishlist_comment, condition_text, has_parts_text, want_parts_text,
        acquired_from, inventory_location, acquired_date, price_paid, price_currency,
        bgg_version_id, version_name, version_year_published, version_language, version_thumbnail_url, version_image_url,
        raw_collection_item
      `;
      const vals = [
        bggUsernameLC, bggId, collid, subtype, lastModBGG,
        is_owned, is_for_trade, is_want, is_wishlist, wishlist_priority,
        prevowned, wanttoplay, wanttobuy, preordered,
        num_plays, user_rating, user_comment,
        private_comment, wishlist_comment, condition_text, has_parts_text, want_parts_text,
        acquired_from, inventory_location, acquired_date, price_paid, price_currency,
        bgg_version_id, version_name, version_year_published, version_language, version_thumbnail_url, version_image_url,
        JSON.stringify(g)
      ];
      const placeholders = (n) => Array.from({ length: n }, (_, i) => `$${i + 1}`).join(",");

      if (collid != null) {
        await db.query(
          `
          INSERT INTO user_game_collection_items (${colsNoTs}, last_updated_collection_item_at)
          VALUES (${placeholders(vals.length)}, NOW())
          ON CONFLICT ON CONSTRAINT unique_bgg_user_collid DO UPDATE SET
            subtype                    = EXCLUDED.subtype,
            last_modified_from_bgg     = EXCLUDED.last_modified_from_bgg,
            is_owned                   = EXCLUDED.is_owned,
            is_for_trade               = EXCLUDED.is_for_trade,
            is_want                    = EXCLUDED.is_want,
            is_wishlist                = EXCLUDED.is_wishlist,
            wishlist_priority          = EXCLUDED.wishlist_priority,
            prevowned                  = EXCLUDED.prevowned,
            wanttoplay                 = EXCLUDED.wanttoplay,
            wanttobuy                  = EXCLUDED.wanttobuy,
            preordered                 = EXCLUDED.preordered,
            num_plays                  = EXCLUDED.num_plays,
            user_rating                = EXCLUDED.user_rating,
            user_comment               = EXCLUDED.user_comment,
            private_comment            = EXCLUDED.private_comment,
            wishlist_comment           = EXCLUDED.wishlist_comment,
            condition_text             = EXCLUDED.condition_text,
            has_parts_text             = EXCLUDED.has_parts_text,
            want_parts_text            = EXCLUDED.want_parts_text,
            acquired_from              = EXCLUDED.acquired_from,
            inventory_location         = EXCLUDED.inventory_location,
            acquired_date              = EXCLUDED.acquired_date,
            price_paid                 = EXCLUDED.price_paid,
            price_currency             = EXCLUDED.price_currency,
            bgg_version_id             = EXCLUDED.bgg_version_id,
            version_name               = EXCLUDED.version_name,
            version_year_published     = EXCLUDED.version_year_published,
            version_language           = EXCLUDED.version_language,
            version_thumbnail_url      = EXCLUDED.version_thumbnail_url,
            version_image_url          = EXCLUDED.version_image_url,
            raw_collection_item        = EXCLUDED.raw_collection_item,
            last_updated_collection_item_at = NOW()
          `,
          vals
        );
      } else {
        // IMPORTANT: relies on a PARTIAL UNIQUE INDEX:
        //   CREATE UNIQUE INDEX unique_bgg_user_game_when_collid_null
        //     ON user_game_collection_items (bgg_username, bgg_game_id)
        //     WHERE bgg_collid IS NULL;
        // We use ON CONFLICT with index inference + matching predicate.
        await db.query(
          `
          INSERT INTO user_game_collection_items (${colsNoTs}, last_updated_collection_item_at)
          VALUES (${placeholders(vals.length)}, NOW())
          ON CONFLICT (bgg_username, bgg_game_id) WHERE bgg_collid IS NULL DO UPDATE SET
            subtype                    = EXCLUDED.subtype,
            last_modified_from_bgg     = EXCLUDED.last_modified_from_bgg,
            is_owned                   = EXCLUDED.is_owned,
            is_for_trade               = EXCLUDED.is_for_trade,
            is_want                    = EXCLUDED.is_want,
            is_wishlist                = EXCLUDED.is_wishlist,
            wishlist_priority          = EXCLUDED.wishlist_priority,
            prevowned                  = EXCLUDED.prevowned,
            wanttoplay                 = EXCLUDED.wanttoplay,
            wanttobuy                  = EXCLUDED.wanttobuy,
            preordered                 = EXCLUDED.preordered,
            num_plays                  = EXCLUDED.num_plays,
            user_rating                = EXCLUDED.user_rating,
            user_comment               = EXCLUDED.user_comment,
            private_comment            = EXCLUDED.private_comment,
            wishlist_comment           = EXCLUDED.wishlist_comment,
            condition_text             = EXCLUDED.condition_text,
            has_parts_text             = EXCLUDED.has_parts_text,
            want_parts_text            = EXCLUDED.want_parts_text,
            acquired_from              = EXCLUDED.acquired_from,
            inventory_location         = EXCLUDED.inventory_location,
            acquired_date              = EXCLUDED.acquired_date,
            price_paid                 = EXCLUDED.price_paid,
            price_currency             = EXCLUDED.price_currency,
            bgg_version_id             = EXCLUDED.bgg_version_id,
            version_name               = EXCLUDED.version_name,
            version_year_published     = EXCLUDED.version_year_published,
            version_language           = EXCLUDED.version_language,
            version_thumbnail_url      = EXCLUDED.version_thumbnail_url,
            version_image_url          = EXCLUDED.version_image_url,
            raw_collection_item        = EXCLUDED.raw_collection_item,
            last_updated_collection_item_at = NOW()
          `,
          vals
        );
      }
    } catch (e) {
      console.error(`ugci upsert failed for ${bggUsernameLC}/${bggId}:`, e.message);
    }

    // response item
    processed.push({
      bgg_id: bggId,
      name: bggName,
      year_published: safeNumber(detail?.yearpublished?._text),
      thumbnail_url: g?.thumbnail?._text || null,
      image_url: g?.image?._text || null,
      min_players: safeNumber(detail?.minplayers?._text),
      max_players: safeNumber(detail?.maxplayers?._text),
      playing_time: safeNumber(detail?.playingtime?._text),
      min_playtime: safeNumber(detail?.minplaytime?._text),
      max_playtime: safeNumber(detail?.maxplaytime?._text),
      min_age: safeNumber(detail?.minage?._text),
      description: detail?.description?._text || null,
      bgg_avg_rating: safeNumber(detail?.statistics?.ratings?.average?._text),
      bgg_bayes_avg_rating: safeNumber(detail?.statistics?.ratings?.bayesaverage?._text),
      bgg_rank: bggRank,
      bgg_weight: safeNumber(detail?.statistics?.ratings?.averageweight?._text),

      bgg_username: bggUsernameLC,
      bgg_collid: collid,
      subtype,
      last_modified_from_bgg: lastModBGG,
      is_owned,
      is_for_trade,
      is_want,
      is_wishlist,
      wishlist_priority,
      prevowned,
      wanttoplay,
      wanttobuy,
      preordered,
      num_plays,
      user_rating,
      user_comment,

      private_comment,
      wishlist_comment,
      condition_text,
      has_parts_text,
      want_parts_text,
      acquired_from,
      inventory_location,
      acquired_date,
      price_paid,
      price_currency,

      bgg_version_id,
      version_name,
      version_year_published,
      version_language,
      version_thumbnail_url,
      version_image_url,

      last_updated_collection_item_at: new Date()
    });
  }

  console.debug(`fetchCollectionFromBGGAndStore: ${processed.length} items for ${bggUsernameLC}`);
  return processed;
}

function initiateBackgroundCollectionUpdate(bggUsername, lastSyncedAt) {
  const uname = String(bggUsername).trim().toLowerCase();
  setTimeout(async () => {
    try {
      console.debug(`Background update for ${uname}`);
      await fetchCollectionFromBGGAndStore(uname, lastSyncedAt);
      console.debug(`Background update complete for ${uname}`);
    } catch (e) {
      console.error(`Background update failed for ${uname}:`, e.message);
    }
  }, 0);
}

// DB fetch (normalized username)
async function fetchCollectionFromDB(bggUsername) {
  const uname = String(bggUsername).trim().toLowerCase();
  const res = await db.query(
    `SELECT
        ugci.bgg_game_id AS bgg_id,
        bg.name, bg.year_published, bg.thumbnail_url, bg.image_url,
        bg.min_players, bg.max_players, bg.playing_time, bg.min_playtime, bg.max_playtime,
        bg.min_age, bg.description, bg.bgg_avg_rating, bg.bgg_bayes_avg_rating, bg.bgg_rank, bg.bgg_weight,

        ugci.is_owned, ugci.is_for_trade, ugci.is_want, ugci.is_wishlist, ugci.wishlist_priority,
        ugci.num_plays, ugci.user_rating, ugci.user_comment, ugci.last_updated_collection_item_at,

        ugci.bgg_collid,
        ugci.subtype AS collection_subtype,
        ugci.last_modified_from_bgg,

        ugci.prevowned, ugci.wanttoplay, ugci.wanttobuy, ugci.preordered,
        ugci.private_comment, ugci.wishlist_comment, ugci.condition_text,
        ugci.has_parts_text, ugci.want_parts_text, ugci.acquired_from,
        ugci.inventory_location, ugci.acquired_date, ugci.price_paid, ugci.price_currency,

        ugci.bgg_version_id, ugci.version_name, ugci.version_year_published,
        ugci.version_language, ugci.version_thumbnail_url, ugci.version_image_url,

        bu.bgg_username
     FROM user_game_collection_items ugci
     JOIN bgg_games bg ON ugci.bgg_game_id = bg.bgg_id
     JOIN bgg_usernames bu ON ugci.bgg_username = bu.bgg_username
     WHERE ugci.bgg_username = $1`,
    [uname]
  );
  return res.rows;
}

async function getMultiBGGCollectionData(bggUsernames) {
    const usernames = [...new Set(
    (Array.isArray(bggUsernames) ? bggUsernames : [bggUsernames])
        .flatMap(u => String(u).split(","))
        .map(u => u.trim().toLowerCase())
        .filter(Boolean)
    )];    

  const results = [];

  for (const username of usernames) {
    let entry = await db.query(
      `SELECT bgg_username, last_synced_at FROM bgg_usernames WHERE bgg_username = $1`,
      [username]
    );
    entry = entry.rows[0];

    let userCollectionData = [];
    if (entry && entry.last_synced_at) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (entry.last_synced_at > hourAgo) {
        userCollectionData = await fetchCollectionFromDB(entry.bgg_username);
        console.debug(`Serving fresh DB data for ${username}`);
      } else {
        console.debug(`Serving stale DB data for ${username}, kicking background sync`);
        userCollectionData = await fetchCollectionFromDB(entry.bgg_username);
        initiateBackgroundCollectionUpdate(username, entry.last_synced_at);
      }
    } else {
      console.debug(`First-time fetch for ${username}`);
      userCollectionData = await fetchCollectionFromBGGAndStore(username);
    }

    const internalUser = await db.query(
      `SELECT username FROM users WHERE lower(bgg_username) = $1`,
      [username]
    );
    const internalUsername = internalUser.rows[0]?.username || null;

    results.push({
      username: internalUsername,
      bgg_username: username,
      games: userCollectionData
    });
  }

    // aggregate by game id
    const aggregated = {};
    const seenPerGame = new Map();

    for (const userResult of results) {
    for (const g of userResult.games) {
        const id = g.bgg_id;

        if (!aggregated[id]) {
        aggregated[id] = {
            bgg_id: g.bgg_id,
            name: g.name,
            year_published: g.year_published,
            thumbnail_url: g.thumbnail_url,
            image_url: g.image_url,
            min_players: g.min_players,
            max_players: g.max_players,
            playing_time: g.playing_time,
            min_playtime: g.min_playtime,
            max_playtime: g.max_playtime,
            min_age: g.min_age,
            description: g.description,
            bgg_avg_rating: g.bgg_avg_rating,
            bgg_bayes_avg_rating: g.bgg_bayes_avg_rating,
            bgg_rank: g.bgg_rank,
            bgg_weight: g.bgg_weight,
            userCollections: []
        };
        }

        const copyKey = `${userResult.bgg_username}::${g.bgg_collid ?? "null"}::${g.bgg_version_id ?? "null"}`;
        if (!seenPerGame.has(id)) seenPerGame.set(id, new Set());
        const seen = seenPerGame.get(id);
        if (seen.has(copyKey)) continue;
        seen.add(copyKey);

        aggregated[id].userCollections.push({
        username: userResult.username,
        bgg_username: userResult.bgg_username,

        // copy identity
        bgg_collid: g.bgg_collid,
        bgg_version_id: g.bgg_version_id,

        // version display info
        version_name: g.version_name,
        version_year_published: g.version_year_published,
        version_language: g.version_language,
        version_thumbnail_url: g.version_thumbnail_url,
        version_image_url: g.version_image_url,

        subtype: g.collection_subtype || g.subtype || null,
        last_modified_from_bgg: g.last_modified_from_bgg,

        // status/flags
        is_owned: g.is_owned,
        is_for_trade: g.is_for_trade,
        is_want: g.is_want,
        is_wishlist: g.is_wishlist,
        wishlist_priority: g.wishlist_priority,
        num_plays: g.num_plays,
        user_rating: g.user_rating,
        user_comment: g.user_comment,

        // optional private fields
        private_comment: g.private_comment,
        wishlist_comment: g.wishlist_comment,
        condition_text: g.condition_text,
        has_parts_text: g.has_parts_text,
        want_parts_text: g.want_parts_text,
        acquired_from: g.acquired_from,
        inventory_location: g.inventory_location,
        acquired_date: g.acquired_date,
        price_paid: g.price_paid,
        price_currency: g.price_currency,

        last_updated_collection_item_at: g.last_updated_collection_item_at
        });
    }
    }

    return Object.values(aggregated);

}

module.exports = getMultiBGGCollectionData;
