"use strict";

/** Routes for Quick Filters. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureCorrectUserOrAdmin, ensureAdmin, ensureLoggedIn } = require("../middleware/auth");
const { UnauthorizedError, BadRequestError } = require("../expressError");
const QuickFilter = require("../models/quickFilter")
const quickFilterNewSchema = require("../schemas/quickFilterNew.json");
const quickFilterUpdateSchema = require("../schemas/quickFilterUpdate.json");

const router = express.Router();


/** POST / { quickFilter }  => { quickFilter }
 *
 * Adds a new Quick Filter.
 *
 * This returns the newly created filter:
 *  {quickFilter: { id, username, filter_name, filter_settings } }
 *
 * Authorization required: any logged in user
 **/

router.post("/", ensureLoggedIn, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, quickFilterNewSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    const filter = await QuickFilter.add(req.body);
    return res.status(201).json({ quickFilter: filter });
  } catch (err) {
    return next(err);
  }
});


/** GET / => { quickFilters: [ { id, username, filter_name, filter_settings }, ... ] }
 *
 * Returns list of all Quick Filters.
 *
 * Authorization required: admin
 **/

router.get("/", ensureAdmin, async function (req, res, next) {
  try {
    const quickFilters = await QuickFilter.findAll();
    return res.json({ quickFilters });
  } catch (err) {
    return next(err);
  }
});


/** GET / => { quickFilters: [ { id, username, filter_name, filter_settings }, ... ] }
 *
 * Returns list of all Quick Filters for a given username.
 *
 * Authorization required: admin or same user-as-:username
 **/

router.get("/user/:username", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    const quickFilters = await QuickFilter.getAllForUser(req.params.username);
    return res.json({ quickFilters });
  } catch (err) {
    return next(err);
  }
});


/** GET /[id] => { quickFilter }
 *
 * Returns { id, username, filter_name, filter_settings }
 *
 * Authorization required: admin
 **/

router.get("/id/:id", ensureAdmin, async function (req, res, next) {
  try {
    const filter = await QuickFilter.get(req.params.id);
    return res.json({ quickFilter: filter });
  } catch (err) {
    return next(err);
  }
});


/** PATCH /[id] { quickFilter } => { quickFilter }
 *
 * Data can include:
 *   { filter_name, filter_settings }
 *
 * Returns { id, username, filter_name, filter_settings }
 *
 * Authorization required: any logged in user for middleware, after getting filter: admin or same user
 **/

router.patch("/id/:id", ensureLoggedIn, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, quickFilterUpdateSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }
    let filter = await QuickFilter.get(req.params.id);
    if (filter.username != res.locals.user.username && !res.locals.user.isAdmin) throw new UnauthorizedError();

    filter = await QuickFilter.update(req.params.id, req.body);
    return res.json({ quickFilter: filter });
  } catch (err) {
    return next(err);
  }
});


/** DELETE /[id]  =>  { deleted: id }
 *
 * Authorization required: any logged in user for middleware, after getting filter: admin or same user
 **/

router.delete("/id/:id", ensureLoggedIn, async function (req, res, next) {
  try {
    let filter = await QuickFilter.get(req.params.id);
    if (filter.username != res.locals.user.username && !res.locals.user.isAdmin) throw new UnauthorizedError();

    await QuickFilter.remove(req.params.id);
    return res.json({ deleted: req.params.id });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;
