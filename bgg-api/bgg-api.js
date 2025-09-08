// bgg-api/bgg-api.js
"use strict";

const axios = require("axios");
const convert = require("xml-js");
const getTopIdString = require("./top100Scraper");

const BASE_URL = "https://boardgamegeek.com/xmlapi2";

// Small helper
const isoDateOnly = (d) => {
  try {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch {
    return null;
  }
};

class GameNightBGGHelperAPI {
  static async request(endpoint, method = "get") {
    const url = `${BASE_URL}/${endpoint}`;
    console.debug("BGG API Call:", url);
    try {
      return await axios({ url, method });
    } catch (err) {
      const status = err?.response?.status || 500;
      let message = "BGG request failed";
      try {
        if (err?.response?.data) {
          const parsed = convert.xml2js(err.response.data, { compact: true, spaces: 2 });
          message =
            parsed?.error?.message?._text ||
            parsed?.message?._text ||
            err?.response?.statusText ||
            message;
        } else if (err?.message) {
          message = err.message;
        }
      } catch {
        // swallow parse error; keep fallback message
      }
      // Bubble a normalized error
      const e = new Error(message);
      e.status = status;
      throw e;
    }
  }

  // ----------------------------
  // /thing (multi-id convenience)
  // ----------------------------
  static async getMultipleGames(idString) {
    const MAX_IDS_PER_REQUEST = 20;
    const ids = idString.split(",").map((s) => s.trim()).filter(Boolean);
    const requests = [];

    for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
      const chunk = ids.slice(i, i + MAX_IDS_PER_REQUEST);
      const requestString = `thing?id=${chunk.join(",")}&stats=1`;
      requests.push(this.request(requestString));
    }

    const responses = await Promise.all(requests);
    const combined = { items: { item: [] } };

    for (const res of responses) {
      if (!res?.data) continue;
      const js = convert.xml2js(res.data, { compact: true, spaces: 2 });
      const it = js?.items?.item;
      if (!it) continue;
      if (Array.isArray(it)) combined.items.item = combined.items.item.concat(it);
      else combined.items.item.push(it);
    }
    // mirror prior shape { data: combined } then unwrap
    return combined;
  }

  /**
   * Get data for one or more games.
   * Accepts an optional opts param for future flexibility (e.g., { stats: 1 }).
   * Returns a JS object with .items.item already parsed (not raw XML).
   */
  static async getGameData(id, _opts = {}) {
    console.debug("Requesting detailed game data (thing).");
    const data = await this.getMultipleGames(id);
    return data; // { items: { item: [...] } }
  }

  // ----------------------------
  // /collection
  // ----------------------------
  /**
   * Fetch a user's collection. Handles BGG's 202 retry behavior.
   * mode: 'user' (default) or 'collection' (when you want own=1)
   * opts: { stats, version, showprivate, modifiedsince, subtype, excludesubtype, own }
   *   - stats/version/showprivate: numbers or '1'
   *   - modifiedsince: Date/string; will be coerced to YYYY-MM-DD if possible
   */
  static async getCollection(username, mode = "user", opts = {}, tries = 0, priorRes = null) {
    // Build query
    const params = new URLSearchParams();
    params.set("username", username);

    // Defaults you had previously
    if (opts.excludesubtype !== null && opts.excludesubtype !== undefined) {
      if (String(opts.excludesubtype).length) params.set("excludesubtype", String(opts.excludesubtype));
    } else {
      // keep prior default to exclude expansions
      params.set("excludesubtype", "boardgameexpansion");
    }

    // Always include stats (prior behavior) unless explicitly disabled
    if (opts.stats === 0 || opts.stats === "0" || opts.stats === false) {
      // do not set
    } else {
      params.set("stats", "1");
    }

    // Add rich fields if requested
    if (opts.version) params.set("version", "1");
    if (opts.showprivate) params.set("showprivate", "1");

    // Honor "own=1" when mode === 'collection' (prior behavior)
    if (mode === "collection" || opts.own === 1 || opts.own === "1" || opts.own === true) {
      params.set("own", "1");
    }

    // Optional subtype filter override
    if (opts.subtype) params.set("subtype", String(opts.subtype));

    // Modified-since (attempt YYYY-MM-DD per common usage)
    const ms = isoDateOnly(opts.modifiedsince);
    if (ms) params.set("modifiedsince", ms);

    const requestString = `collection?${params.toString()}`;

    // Retry logic (BGG returns 202 while queued)
    tries += 1;
    if (tries > 6) {
      // Avoid 429s; surface what we have
      console.warn(`BGG /collection retry limit reached for ${username}`);
      return priorRes ?? { status: 429, data: "<error>Too many retries</error>" };
    }

    const makeRequest = async () => this.request(requestString);

    let res;
    if (!priorRes) {
      // initial call
      res = await makeRequest();
    } else {
      res = priorRes;
    }

    if (res.status === 200) {
      return res; // axios response with raw XML in res.data
    }

    if (res.status === 202) {
      const delayMs = tries * 2000;
      await new Promise((r) => setTimeout(r, delayMs));
      const next = await makeRequest();
      return this.getCollection(username, mode, opts, tries, next);
    }

    // other statuses: return as-is (caller will handle)
    return res;
  }

  // ----------------------------
  // /user
  // ----------------------------
  static async getUser(username) {
    console.debug(`Requesting user data for BGG user ${username}`);
    const res = await this.request(
      `user?name=${encodeURIComponent(username)}&buddies=1&guilds=1&hot=1&top=1&domain=boardgame`
    );
    return res.data; // raw XML
  }

  // ----------------------------
  // /plays
  // ----------------------------
  static async getPlays(username, extraQuery = "") {
    console.debug(`Requesting plays data for BGG user ${username}`);
    const suffix = extraQuery ? `&${extraQuery.replace(/^\&/, "")}` : "";
    const res = await this.request(`plays?username=${encodeURIComponent(username)}${suffix}`);
    return res.data; // raw XML
  }

  // ----------------------------
  // Top / Hot convenience
  // ----------------------------
  static async getTop100() {
    console.debug("Requesting Top 100 game data.");
    const idString = await getTopIdString();
    const data = await this.getMultipleGames(idString);
    return data; // parsed JS
  }

  static async getHot50() {
    console.debug("Requesting Hot 50 game data.");
    const res = await this.request(`hot?type=boardgame`);
    return res.data; // raw XML
  }
}

module.exports = GameNightBGGHelperAPI;
