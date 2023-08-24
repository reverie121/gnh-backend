const axios = require("axios");

const BASE_URL = process.env.REACT_APP_BASE_URL || "https://boardgamegeek.com/xmlapi2";

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
      let message = err.response.data.error.message;
      throw Array.isArray(message) ? message : [message];
    }
  }

  // COLLECTION API Routes

  /** Get a collection (any type). */

  static async getCollection(username, type='collection', tries=0, res={}) {
    // Determine substring for type of collection request.
    let subString = '&own=1';
    if (type === 'wishList') subString = '&wishlist=1';
    else if (type === 'wantToPlayList') subString = '&wanttoplay=1';
    // Get the complete request string.
    const requestString = `collection?username=${username}&excludesubtype=boardgameexpansion&brief=1${subString}`
    // Increment a "tries" counter to reflect the number of the current request attempt for this collection.
    tries++;
    // BGG API will return status code 429 on the 7th attempt. What to do instead of 7th attempt?
    if (tries > 6) return console.log("too many tries!!!");

    if (res.status) {
        // Base Case:
        if (res.status !== 202) {
            if (res.status === 200) {
                console.debug(`Collection (type ${type}) data received.`)
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
    console.debug('Requesting detailed game/s data.');
    let res = await this.request(`thing?id=${id}&stats=1`);
    return res.data;
  }

}

module.exports = GameNightBGGHelperAPI;