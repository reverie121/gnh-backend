// Gets comprehensive data for a BGG user from BGG.

const { xml2json } = require("xml-js");

const GameNightBGGHelperAPI = require("./bgg-api");
const getCollectionData = require("./getGameData");
// const parseLinkData = require("./bggUserDataParser");

const getBGGUserData = async (bggUsername) => {

    // Make initial get requests to BGG API for user data.
    const [ userDataRes, userCollectionRes, userWishListRes, userWantToPlayListRes, userPlaysData ] = await Promise.all([
        GameNightBGGHelperAPI.getUser(bggUsername),
        GameNightBGGHelperAPI.getCollection(bggUsername),
        GameNightBGGHelperAPI.getCollection(bggUsername, "wishList"),
        GameNightBGGHelperAPI.getCollection(bggUsername, "wantToPlayList"),
        GameNightBGGHelperAPI.getPlays(bggUsername)
    ]);

    // userDetails includes basic user data.
    const userDetails = JSON.parse(xml2json(userDataRes, { compact: true, spaces: 2 }));

    // userPlays provides data for the BGG user's logged plays.
    // userPlays is also used to provide an array of game IDs for the user's logged plays.
    const userPlays = JSON.parse(xml2json(userPlaysData, { compact: true, spaces: 2 }));
    let userPlayIDs = [];
    if (userPlays.plays._attributes.total !== "0") {
        Object.values(userPlays.plays.play.map(p => userPlayIDs.push(p.item._attributes.objectid)));
    }

    // Make a get request for game data as a User Request. Returns game data as well as game ID lists for the user.
    const { userGames, userCollectionIDs, userWishListIDs, userWantToPlayListIDs } = await getCollectionData(bggUsername, "user", userPlayIDs)

    let bggUser = {
        userDetails,
        userGames,
        userCollectionIDs,
        userWishListIDs,
        userWantToPlayListIDs,        
        userPlays
    };

    // Not currently used. Logs to console some basic statistics for a game collection.
    // if (userGames && userCollectionIDs) {
    //     const userCollectionGameList = userGames.filter(g => userCollectionIDs.includes(g._attributes.id));
    //     const userCollectionDemographics = parseLinkData(userCollectionGameList);
    //     console.log(userCollectionDemographics)
    //     bggUser['userCollectionDemographics'] = userCollectionDemographics;
    // }

    // Add user data to localStorage.
    // bggUserToLocal(bggUser);
    
    return(bggUser);
};

module.exports =  getBGGUserData;