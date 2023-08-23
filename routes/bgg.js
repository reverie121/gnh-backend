"use strict";

/** Routes for Board Game Geek (external) data. */

const express = require("express");
const jsonschema = require("jsonschema");

const { BadRequestError } = require("../expressError");

const getCollectionData = require("../bgg-api/getGameData");

// const User = require("../models/user");
// const userNewSchema = require("../schemas/userNew.json");
// const userUpdateSchema = require("../schemas/userUpdate.json");

const router = express.Router();

router.get("/collection/:bggUsername", async function(req, res, next) {
    try {
        const collection = await getCollectionData(req.params.bggUsername);
        return res.json({ collection });
      } catch (err) {
        return next(err);
      }
});


module.exports = router;
