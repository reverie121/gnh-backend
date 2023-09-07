"use strict";

const request = require("supertest");

const db = require("../db.js");
const app = require("../app");
const QuickFilter = require("../models/quickFilter");

const {
  commonBeforeAll,
  commonBeforeEach,
  commonAfterEach,
  commonAfterAll,
  u1Token,
  u2Token,
  adminToken,
} = require("./_testCommon");

beforeAll(commonBeforeAll);
beforeEach(commonBeforeEach);
afterEach(commonAfterEach);
afterAll(commonAfterAll);

/************************************** POST /quick-filters */

describe("POST /quick-filters", function () {
    test("works for admins: create for another user", async function () {
        const resp = await request(app)
            .post("/quick-filters")
            .send({
                username: "u1",
                filterName: "Best to Worst",
                filterSettings: '{"selections": {"primary": "rating", "primaryDirection": "descending"}}',
            })
            .set("authorization", `Bearer ${adminToken}`);
        expect(resp.statusCode).toEqual(201);
        expect(resp.body).toMatchObject({
                quickFilter: {
                username: "u1",
                filterName: "Best to Worst",
                filterSettings: '{"selections": {"primary": "rating", "primaryDirection": "descending"}}',
                }
        });
    });
  
    test("works for users", async function () {
        const resp = await request(app)
            .post("/quick-filters")
            .send({
                username: "u1",
                filterName: "Best to Worst",
                filterSettings: '{"selections": {"primary": "rating", "primaryDirection": "descending"}}',
            })
            .set("authorization", `Bearer ${u1Token}`);
        expect(resp.statusCode).toEqual(201);
        expect(resp.body).toMatchObject({
                quickFilter: {
                username: "u1",
                filterName: "Best to Worst",
                filterSettings: '{"selections": {"primary": "rating", "primaryDirection": "descending"}}',
                }
        });
    });
  
    test("unauth for anon", async function () {
        const resp = await request(app)
            .post("/quick-filters")
            .send({
                username: "u1",
                filterName: "Best to Worst",
                filterSettings: '{"selections": {"primary": "rating", "primaryDirection": "descending"}}',
            })
        expect(resp.statusCode).toEqual(401);
    });
  
    test("bad request if missing data", async function () {
        const resp = await request(app)
            .post("/quick-filters")
            .send({
                username: "a1",
            })
            .set("authorization", `Bearer ${adminToken}`);
        expect(resp.statusCode).toEqual(400);
    });
  
    test("bad request if invalid data", async function () {
        const resp = await request(app)
            .post("/quick-filters")
            .send({
                username: 42,
                filterName: [],
                filterSettings: true,
            })
            .set("authorization", `Bearer ${adminToken}`);
        expect(resp.statusCode).toEqual(400);
    });
  });


/************************************** GET /quick-filters */

describe("GET /quick-filters", function () {
    test("works for admins", async function () {
      const resp = await request(app)
          .get("/quick-filters")
          .set("authorization", `Bearer ${adminToken}`);
      expect(resp.body).toMatchObject({
        quickFilters: [
          {
            username: "u1",
            filterName: "Good Games Only",
            filterSettings: '{"formData": {"gameRating": "7"}}',
          },
          {
            username: "u2",
            filterName: "Two-Player Games",
            filterSettings: '{"formData": {"playerCount": "2"}, "checkboxes": {"playerCountBest": true, "playerCountRecommended": true}}',
          },
        ],
      });
    });
  
    test("unauth for non-admin users", async function () {
      const resp = await request(app)
          .get("/quick-filters")
          .set("authorization", `Bearer ${u1Token}`);
      expect(resp.statusCode).toEqual(401);
    });
  
    test("unauth for anon", async function () {
      const resp = await request(app)
          .get("/quick-filters");
      expect(resp.statusCode).toEqual(401);
    });
  
    test("fails: test next() handler", async function () {
      // there's no normal failure event which will cause this route to fail ---
      // thus making it hard to test that the error-handler works with it. This
      // should cause an error, all right :)
      await db.query("DROP TABLE quick_filters CASCADE");
      const resp = await request(app)
          .get("/quick-filters")
          .set("authorization", `Bearer ${adminToken}`);
      expect(resp.statusCode).toEqual(500);
    });
  });


/************************************** GET /quick-filters/user/:username */

describe("GET /quick-filters/user/:username", function () {
    test("works for admin", async function () {
      const resp = await request(app)
          .get(`/quick-filters/user/u1`)
          .set("authorization", `Bearer ${adminToken}`);
          expect(resp.body).toMatchObject({
            quickFilters: [{
                username: "u1",
                filterName: "Good Games Only",
                filterSettings: '{"formData": {"gameRating": "7"}}',
            }],
      });
    });
  
    test("works for same user", async function () {
      const resp = await request(app)
        .get(`/quick-filters/user/u1`)
        .set("authorization", `Bearer ${u1Token}`);
        expect(resp.body).toMatchObject({
        quickFilters: [{
            username: "u1",
            filterName: "Good Games Only",
            filterSettings: '{"formData": {"gameRating": "7"}}',
        }],
      });
    });
  
    test("unauth for other users", async function () {
        const resp = await request(app)
        .get(`/quick-filters/user/u1`)
        .set("authorization", `Bearer ${u2Token}`);
      expect(resp.statusCode).toEqual(401);
    });
  
    test("unauth for anon", async function () {
        const resp = await request(app)
        .get(`/quick-filters/user/u1`)
        expect(resp.statusCode).toEqual(401);
    });
  
  });  

/************************************** GET /quick-filters/id/:id */

describe("GET /quick-filters/id/:id", function () {
    let foundID;

    beforeEach(async () => {
        const findIDresponse = await request(app)
            .get(`/quick-filters/user/u1`)
            .set("authorization", `Bearer ${adminToken}`);
        foundID = findIDresponse.body.quickFilters[0].id
    })

    test("works for admin", async function () {
        const resp = await request(app)
            .get(`/quick-filters/id/${foundID}`)
            .set("authorization", `Bearer ${adminToken}`);
        expect(resp.body).toMatchObject({
            quickFilter: {
                username: "u1",
                filterName: "Good Games Only",
                filterSettings: '{"formData": {"gameRating": "7"}}',
            },
        });
    });

    test("unauth for same user", async function () {
        const resp = await request(app)
            .get(`/quick-filters/id/${foundID}`)
            .set("authorization", `Bearer ${u1Token}`);
        expect(resp.statusCode).toEqual(401);
    });
  
    test("unauth if not same user", async function () {
        const resp = await request(app)
            .get(`/quick-filters/id/${foundID}`)
            .set("authorization", `Bearer ${u2Token}`);
        expect(resp.statusCode).toEqual(401);
    });
  
    test("unauth for anon", async function () {
        const resp = await request(app)
            .get(`/quick-filters/id/${foundID}`)
        expect(resp.statusCode).toEqual(401);
    });
  
    test("not found if user missing", async function () {
        const resp = await request(app)
            .get(`/quick-filters/id/${0}`)
            .set("authorization", `Bearer ${adminToken}`);
        expect(resp.statusCode).toEqual(404);
    });
  });    



/************************************** PATCH /quick-filters/id/:id */

describe("PATCH /quick-filters/id/:id", () => {
    let foundID;

    beforeEach(async () => {
        const findIDresponse = await request(app)
            .get(`/quick-filters/user/u1`)
            .set("authorization", `Bearer ${adminToken}`);
        foundID = findIDresponse.body.quickFilters[0].id
    })

    test("works for admins", async function () {
      const resp = await request(app)
          .patch(`/quick-filters/id/${foundID}`)
          .send({
            filterName: "New Filter Name",
          })
          .set("authorization", `Bearer ${adminToken}`);
      expect(resp.body).toEqual({
        quickFilter: {
          id: foundID,
          username: "u1",
          filterName: "New Filter Name",
          filterSettings: '{"formData": {"gameRating": "7"}}',
        },
      });
    });
  
    test("works for same user", async function () {
        const resp = await request(app)
            .patch(`/quick-filters/id/${foundID}`)
            .send({
                filterName: "New Filter Name",
            })
            .set("authorization", `Bearer ${u1Token}`);
        expect(resp.body).toEqual({
            quickFilter: {
                id: foundID,
                username: "u1",
                filterName: "New Filter Name",
                filterSettings: '{"formData": {"gameRating": "7"}}',
            },
        });
    });
  
    test("unauth if not same user", async function () {
        const resp = await request(app)
            .patch(`/quick-filters/id/${foundID}`)
            .send({
                filterName: "New Filter Name",
            })
            .set("authorization", `Bearer ${u2Token}`);
        expect(resp.statusCode).toEqual(401);
    });
  
    test("unauth for anon", async function () {
        const resp = await request(app)
            .patch(`/quick-filters/id/${foundID}`)
            .send({
                filterName: "New Filter Name",
            })
        expect(resp.statusCode).toEqual(401);
    });
  
    test("not found if no such id", async function () {
        const resp = await request(app)
            .patch(`/quick-filters/id/0`)
            .send({
                filterName: "Should Not Work",
            })
            .set("authorization", `Bearer ${adminToken}`);
        expect(resp.statusCode).toEqual(404);
    });
  
    test("bad request if invalid data", async function () {
        const resp = await request(app)
            .patch(`/quick-filters/id/${foundID}`)
            .send({
                filterName: 42,
            })
            .set("authorization", `Bearer ${adminToken}`);
        expect(resp.statusCode).toEqual(400);
    });
  
  });

/************************************** DELETE /quick-filters/id/:id */

describe("DELETE /quick-filters/id/:id", function () {
    let foundID;

    beforeEach(async () => {
        const findIDresponse = await request(app)
            .get(`/quick-filters/user/u1`)
            .set("authorization", `Bearer ${adminToken}`);
        foundID = findIDresponse.body.quickFilters[0].id
    })

    test("works for admin", async function () {

        const resp = await request(app)
            .delete(`/quick-filters/id/${foundID}`)
            .set("authorization", `Bearer ${adminToken}`);
        expect(resp.body).toEqual({ deleted: `${foundID}` });
    });
  
    test("works for same user", async function () {
        const resp = await request(app)
            .delete(`/quick-filters/id/${foundID}`)
            .set("authorization", `Bearer ${u1Token}`);
        expect(resp.body).toEqual({ deleted: `${foundID}` });
    });
  
    test("unauth if not same user", async function () {
        const resp = await request(app)
            .delete(`/quick-filters/id/${foundID}`)
            .set("authorization", `Bearer ${u2Token}`);
        expect(resp.statusCode).toEqual(401);
    });
  
    test("unauth for anon", async function () {
        const resp = await request(app)
            .delete(`/quick-filters/id/${foundID}`)
        expect(resp.statusCode).toEqual(401);
    });
  
    test("not found if user missing", async function () {
        const resp = await request(app)
            .delete(`/quick-filters/id/${0}`)
            .set("authorization", `Bearer ${adminToken}`);
        expect(resp.statusCode).toEqual(404);
    });
  });  