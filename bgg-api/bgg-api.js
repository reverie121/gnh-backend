const axios = require("axios");
const convert = require("xml-js");

const getTopIdString = require("./top100Scraper");

const BASE_URL = "https://boardgamegeek.com/xmlapi2";

/** API Class.
 *
 * Static class tying together methods used to get/send to to the API.
 * There shouldn't be any frontend-specific stuff here, and there shouldn't
 * be any API-aware stuff elsewhere in the frontend.
 *
 */

class GameNightBGGHelperAPI {

  static async request(endpoint, data = {}, method = "get") {
    console.debug("BGG API Call:", endpoint, data, method);

    const url = `${BASE_URL}/${endpoint}`;
    try {
      return await axios({ url, method });
    } catch (err) {
      console.error("API Error:", err.response);
      let data = convert.xml2js(err.response.data, { compact: true, spaces: 2 });
      let message = data.error.message._text;
      throw { status: err.response.status, message }
    }
  }

  /**
   * Fetches data for multiple games specified by comma-separated IDs.
   * Makes multiple requests if the number of IDs exceeds the BGG API limit (20).
   * @param {string} idString Comma-separated string of game IDs.
   * @returns {Promise<object>} Combined game data from all requests.
   */
  static async getMultipleGames(idString) {
    const MAX_IDS_PER_REQUEST = 20;
    const ids = idString.split(',');
    const requests = [];
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
      const chunk = ids.slice(i, i + MAX_IDS_PER_REQUEST);
      const requestString = `thing?id=${chunk.join(',')}&stats=1`;
      requests.push(this.request(requestString));
    }

    const responses = await Promise.all(requests);
    // Combine data from all responses (assuming consistent structure)
    const combinedData = responses.reduce((acc, res) => {
      if (res.data) {
        let js_res = convert.xml2js(res.data, { compact: true, spaces: 2 });
        if (js_res.items) { // Check for valid data structure
          acc.items.item = acc.items.item.concat(js_res.items.item);
        }
      }
      return acc;
    }, { items: { item: [] } });

    let res = {data: combinedData}
    return res;
  }

  // COLLECTION API Routes

  /** Get a collection. */

  static async getCollection(username, type='collection', tries=0, res={}) {

    let requestString = `collection?username=${username}&excludesubtype=boardgameexpansion&stats=1`
    if (type=="collection") requestString = requestString + "&own=1";

    // Increment a "tries" counter to reflect the number of the current request attempt for this collection.
    tries++;
    // BGG API will return status code 429 on the 7th attempt. What to do instead of 7th attempt?
    if (tries > 6) return console.log("too many tries!!!");

    if (res.status) {
        // Base Case:
        if (res.status !== 202) {
            if (res.status === 200) {
                return res;
            } else {
                // What might this be???
                console.debug(res);
                return res;
            }
        } 
        // If request has been made but is still in queue, status code will be 202. We should delay and then send the request again.
        else if (res.status === 202) {
            // Helper function to implement a delay.
            function delay(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }
            console.debug(`Response in queue. Repeating request after ${tries*2} seconds.`);
            // Set delay equal to the current attempt (#) * 2 seconds and await delay.
            const msDelay = tries*2000
            await delay(msDelay);
            // Make new request to BGG API, overwriting the res variable.
            res = await this.request(requestString);
            // Call this function again with the updated res.
            return await this.getCollection(username, type, tries, res);
        }
    }
    // When initially called res will be an empty object.
    else {
        console.debug('Making initial request for collection.')
        // Make initial request to BGG API, overwriting the empty res object.
        res = await this.request(requestString);
        // Call this function again with the updated res.
        return await this.getCollection(username, type, tries, res);
    }
  }

  /** Get a user. */

  static async getUser(username) {
    console.debug(`Requesting user data for BGG user ${username}`);
    let res = await this.request(`user?name=${username}&buddies=1&guilds=1&hot=1&top=1&domain=boardgame`);
    return res.data;
  }

  /** Get plays data for a user. */

  static async getPlays(username) {
    console.debug(`Requesting plays data for BGG user ${username}`);
    let res = await this.request(`plays?username=${username}`);
    return res.data;
  }

  /** Get data for one or more games. */

  static async getGameData(id) {
    console.debug('Requesting detailed game data.');
    //let res = await this.request(`thing?id=${id}&stats=1`);
    let res = await this.getMultipleGames(id);
    return res.data;
  }

  /** Get data for the top 100 ranked games. */

  static async getTop100() {
    console.debug('Requesting Top 100 game data.');
    const idString = await getTopIdString();
    //let res = await this.request(`thing?id=${idString}&stats=1`);
    let res = await this.getMultipleGames(idString);
    return res.data;
  }

  /** Get data for the 50 hottest (most active) games. */

  static async getHot50() {
    console.debug('Requesting Hot 50 game data.');
    let res = await this.request(`hot?type=boardgame`);
    return res.data;
  }

}

module.exports = GameNightBGGHelperAPI;