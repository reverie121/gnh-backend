"use strict";

const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");
const db = require("../db.js");
const QuickFilter = require("../models/quickFilter.js")
const {
  commonBeforeAll,
  commonBeforeEach,
  commonAfterEach,
  commonAfterAll,
} = require("./_testCommon");

beforeAll(commonBeforeAll);
beforeEach(commonBeforeEach);
afterEach(commonAfterEach);
afterAll(commonAfterAll);

/************************************** add */

describe("add", function () {
    const newQuickFilter = {
        username: "u1", 
        filterName: "Best to Worst", 
        filterSettings: '{"selections": {"primary": "rating", "primaryDirection": "descending"}}'
    };
  
    test("works", async function () {
      let filter = await QuickFilter.add({
        ...newQuickFilter
      });
      expect(filter).toMatchObject(newQuickFilter);
      const u1Filters = await db.query("SELECT * FROM quick_filters WHERE username = 'u1'");
      expect(u1Filters.rows.length).toEqual(2);
      expect(u1Filters.rows[1].filter_name).toEqual("Best to Worst");
    });
  
  });

/************************************** findAll */

describe("findAll", function () {
    test("works", async function () {
      const filters = await QuickFilter.findAll();
      expect(filters).toEqual([
        {
            id: 1, 
            username: "u1", 
            filterName: "Good Games Only", 
            filterSettings: '{"formData": {"gameRating": "7"}}'
        },
        {
            id: 2, 
            username: "u2", 
            filterName: "Two-Player Games", 
            filterSettings: '{"formData": {"playerCount": "2"}, "checkboxes": {"playerCountBest": true, "playerCountRecommended": true}}'
        },
      ]);
    });
  });

/************************************** getAllForUser */

describe("findAll", function () {
    test("works", async function () {
      const filters = await QuickFilter.getAllForUser("u2");
      expect(filters).toEqual([
        {
            id: 2, 
            username: "u2", 
            filterName: "Two-Player Games", 
            filterSettings: '{"formData": {"playerCount": "2"}, "checkboxes": {"playerCountBest": true, "playerCountRecommended": true}}'
        },
      ]);
    });
  });  

/************************************** get */

describe("get", function () {
    test("works", async function () {
      let filter = await QuickFilter.get(1);
      expect(filter).toEqual({
        id: 1, 
        username: "u1", 
        filterName: "Good Games Only", 
        filterSettings: '{"formData": {"gameRating": "7"}}'
      });
    });
  
    test("not found if no such filter", async function () {
      try {
        await QuickFilter.get(0);
        fail();
      } catch (err) {
        expect(err instanceof NotFoundError).toBeTruthy();
      }
    });
  });
  
  /************************************** update */

describe("update", function () {
    const updateData = {
        filterName: "Great Games Only", 
        filterSettings: '{"formData": {"gameRating": "8"}}'
    };
  
    test("works", async function () {
      let res = await QuickFilter.update(1, updateData);
      expect(res).toEqual({
        id: 1, 
        username: "u1", 
        ...updateData,
      });
    });
  
    test("not found if no such filter", async function () {
      try {
        await QuickFilter.update(0, {
          filterName: "not a filter name",
        });
        fail();
      } catch (err) {
        expect(err instanceof NotFoundError).toBeTruthy();
      }
    });
  
    test("bad request if no data", async function () {
      expect.assertions(1);
      try {
        await QuickFilter.update(2, {});
        fail();
      } catch (err) {
        expect(err instanceof BadRequestError).toBeTruthy();
      }
    });
  });

  /************************************** remove */

describe("remove", function () {
    test("works", async function () {
      await QuickFilter.remove(1);
      const res = await db.query(
          "SELECT * FROM quick_filters WHERE id=1");
      expect(res.rows.length).toEqual(0);
    });
  
    test("not found if no such filter", async function () {
      try {
        await QuickFilter.remove(0);
        fail();
      } catch (err) {
        expect(err instanceof NotFoundError).toBeTruthy();
      }
    });
  });
  