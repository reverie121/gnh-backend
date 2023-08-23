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

  /** Get a collection. */

  static async getCollection(username, res={}) {

    console.log('******************')
    console.log('Inside getCollection')
    if (res.status) {
        console.log(res.status)
        // Base Case:
        if (res.status !== 202) {
            if (res.status === 200) {
                console.log('status code 200')
                return res.data;
            } else {
                console.log('status code not 200 or 202')
                console.log(res)
                return res;
            }
        } 
        // If request has been made but is still in queue, status code will be 202.
        else if (res.status === 202) {
            setTimeout(async () => {
                console.log('Response in queue. Repeating request after 5 seconds.');
                res = await this.request(`collection?username=${username}&excludesubtype=boardgameexpansion&own=1`);
                return await this.getCollection(username, res);
            }, 5000)
        }
    }
    // When initially called res will be an empty object.
    else {
        // Make initial request to BGG API
        console.log('Making initial request for collection.')
        res = await this.request(`collection?username=${username}&excludesubtype=boardgameexpansion&own=1`);
        return await this.getCollection(username, res);
    }
  }

  /** Get a wishlist. */

  static async getWishlist(username) {
    let res = await this.request(`collection?username=${username}&excludesubtype=boardgameexpansion&wishlist=1`);
    if (res.status === 202) {
      setTimeout(() => {
        console.debug('Response in queue. Repeating request after 1 second.');
        this.getCollection(username);
      }, 20000)
    } else {
      console.debug('Wishlist data received.')
      return res.data;
    }
  }  

  /** Get a want-to-play list. */

  static async getWantToPlayList(username) {
    let res = await this.request(`collection?username=${username}&excludesubtype=boardgameexpansion&wanttoplay=1`);
    if (res.status === 202) {
      setTimeout(() => {
        console.debug('Response in queue. Repeating request after 1 second.');
        this.getCollection(username);
      }, 20000)
    } else {
      console.debug('Wishlist data received.')
      return res.data;
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