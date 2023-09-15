"use strict";

/** Routes for Board Game Geek (external) data. */

const express = require("express");

const getBGGCollectionData = require("../bgg-api/getBGGCollectionData")
const getBGGUserData = require("../bgg-api/getUserData")

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

module.exports = router;
