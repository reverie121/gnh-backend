// Gets comprehensive data for a BGG user from BGG.

const { xml2json } = require("xml-js");

const GameNightBGGHelperAPI = require("./bgg-api");
const getCollectionData = require("./getGameData");

const getBGGUserData = async (bggUsername) => {

    // Make initial get requests to BGG API for user data.
    const [ userDataRes, userPlaysData ] = await Promise.all([
        GameNightBGGHelperAPI.getUser(bggUsername),
        GameNightBGGHelperAPI.getPlays(bggUsername)
    ]);

    // userDetails includes basic user data.
    const userDetails = JSON.parse(xml2json(userDataRes, { compact: true, spaces: 2 }));

    // userPlays provides data for the BGG user's logged plays.
    // userPlays is also used to provide an array of game IDs for the user's logged plays for use in getCollectionData.
    const userPlays = JSON.parse(xml2json(userPlaysData, { compact: true, spaces: 2 }));
    const userPlayIDset = new Set();
    if (userPlays.plays._attributes.total !== "0") {
        Object.values(userPlays.plays.play.map(p => userPlayIDset.add(p.item._attributes.objectid)));
    }
    const userPlayIDs = [...userPlayIDset].sort((a,b) => a-b);

    // Make a get request for game data as a User Request. Returns game data as well as game ID lists for the user.
    const { userGames, userCollectionIDs, userWishListIDs, userWantToPlayListIDs } = await getCollectionData(bggUsername, "user", userPlayIDs)

    const bggUser = {
        userDetails,
        userGames,
        userCollectionIDs,
        userWishListIDs,
        userWantToPlayListIDs,        
        userPlays
    };
    
    return(bggUser);
};

module.exports =  getBGGUserData;