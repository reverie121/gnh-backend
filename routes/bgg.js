"use strict";

/** Routes for Board Game Geek (external) data. */

const express = require("express");

const getBGGCollectionData = require("../bgg-api/getBGGCollectionData");
const getMultiBGGCollectionData = require("../bgg-api/getMultiBGGCollectionData"); 
const getBGGUserData = require("../bgg-api/getUserData");
const getTop100 = require("../bgg-api/getTop100");
const getHot50 = require("../bgg-api/getHot50");

// const User = require("../models/user");
// const userNewSchema = require("../schemas/userNew.json");
// const userUpdateSchema = require("../schemas/userUpdate.json");

const router = express.Router();

/** GET / => { collection: [ {_attributes, thumbnail, image, name, description,yearpublished, minplayers, maxplayers, poll, playingtime, minplaytime, maxplaytime, minage, link, statistics}, ... ] }
 *
 * Returns list of game data for a BGG user.
 *
 * Authorization required: none
 **/

router.get("/collection/:bggUsername", async function(req, res, next) {
    try {
        const collection = await getBGGCollectionData(req.params.bggUsername)
        return res.json({ collection });
      } catch (err) {
        return next(err);
      }
});

router.get("/collections", async function(req, res, next) {
  try {
    const raw = Array.isArray(req.query.usernames)
      ? req.query.usernames
      : req.query.usernames ? req.query.usernames.split(",") : [];

    // normalize + de-dupe inputs
    const usernames = [...new Set(
      raw.map(u => u.trim()).filter(Boolean).map(u => u.toLowerCase())
  )];
    if (usernames.length === 0) {
      return res.status(400).json({ error: "No usernames provided." });
    }

    const collectionData = await getMultiBGGCollectionData(usernames);

    // ✅ de-dupe per-game userCollections by (bgg_username, bgg_game_id)
    const sanitized = collectionData.map(g => {
      const seen = new Set();
      const uniqueUC = [];
      for (const uc of g.userCollections || []) {
        const key = `${uc.bgg_username}|${g.bgg_id}|${uc.bgg_collid ?? `no-collid:${uc.bgg_version_id ?? 'no-version'}`}`;
        if (!seen.has(key)) { seen.add(key); uniqueUC.push(uc); }
      }
      return { ...g, userCollections: uniqueUC };
    });

    return res.json({ collectionData: sanitized });
  } catch (err) {
    return next(err);
  }
});

/** GET / => { userData: {
 *              userDetails: {_attributes, firstname, lastname, avatarlink, yearregistered, lastlogin, stateorprovince, country, webaddress, xboxaccount, wiiaccount, psnaccount, battlenetaccount, steamaccount, traderating, buddies, guilds}, 
                userGames: [ {_attributes, thumbnail, image, name, description, yearpublished, minplayers, maxplayers, poll, playingtime, minplaytime, maxplaytime, minage, link, statistics}, ... ], 
                userCollectionIDs: [ #, ... ], 
                userPreviouslyOwnedIDs: [ #, ... ], 
                userForTradeIDs: [ #, ... ], 
                userWantIDs: [ #, ... ], 
                userWantToPlayIDs: [ #, ... ], 
                userWantToBuyIDs: [ #, ... ],
                userPreOrderedIDs: [ #, ... ], 
                userWishListData: [ [game ID, Wishlist Priority], ... ],       
                userPlays: [ {_attributes: {}, play: {}/[]}, ... ]
 *            } }
 *
 * Returns comprehensive user data for a BGG user.
 *
 * Authorization required: none
 **/

router.get("/user/:bggUsername", async function(req, res, next) {
  try {
      const userData = await getBGGUserData(req.params.bggUsername);
      return res.json({ userData });
    } catch (err) {
      return next(err);
    }
});



router.get("/top100", async function(req, res, next) {
  try {
    const top100Data = await getTop100();
    return res.json(top100Data);
  } catch (err) {
    return next(err);
  }
});

router.get("/hot50", async function(req, res, next) {
  try {
    const hot50Data = await getHot50();
    return res.json(hot50Data);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
