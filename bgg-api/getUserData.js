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
    const playsResponseObject = JSON.parse(xml2json(userPlaysData, { compact: true, spaces: 2 }));
    const userPlayIDSet = new Set();
    if (playsResponseObject.plays._attributes.total !== "0") {
        Object.values(playsResponseObject.plays.play.map(p => userPlayIDSet.add(p.item._attributes.objectid)));
    }
    const userPlayIDs = [...userPlayIDSet].sort((a,b) => a-b);

    // Make a get request for game data as a User Request. Returns game data as well as game ID lists for the user.
    const { userGames, userCollectionIDs, userPreviouslyOwnedIDs, userForTradeIDs, userWantIDs, userWantToPlayIDs, userWantToBuyIDs, userPreOrderedIDs, userWishListData } = await getCollectionData(bggUsername, "user", userPlayIDs)

    // Initialize userPlays object and add thumbnail src key object.
    const userPlays = playsResponseObject.plays;
    userPlays.thumbnailURLs = {};
    for (const game of userGames) {
        if (userPlayIDSet.has(game._attributes.id)) userPlays.thumbnailURLs[`${game._attributes.id}`] = game.thumbnail._text || "no image available";
    }

    const bggUser = {
        userDetails: userDetails.user,
        userGames,
        userCollectionIDs, 
        userPreviouslyOwnedIDs, 
        userForTradeIDs, 
        userWantIDs, 
        userWantToPlayIDs, 
        userWantToBuyIDs,
        userPreOrderedIDs, 
        userWishListData,        
        userPlays
    };
    
    return(bggUser);
};

module.exports =  getBGGUserData;