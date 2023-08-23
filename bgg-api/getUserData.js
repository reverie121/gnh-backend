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
        GameNightBGGHelperAPI.getWishlist(bggUsername),
        GameNightBGGHelperAPI.getWantToPlayList(bggUsername),
        GameNightBGGHelperAPI.getPlays(bggUsername)
    ]);

    // userDetails includes basic user data.
    const userDetails = JSON.parse(xml2json(userDataRes, { compact: true, spaces: 2 }));

    // userCollection is used to provide an array of game IDs for the user's collection.
    const userCollectionData =  JSON.parse(xml2json(userCollectionRes, { compact: true, spaces: 2 }));
    let userCollectionIDs = [];
    if (Array.isArray(userCollectionData.items.item)) {
        Object.values(userCollectionData.items.item).map(g => userCollectionIDs.push(g._attributes.objectid));    
    }

    // userWishListData is used to provide an array of game IDs for the user's wishlist.
    const userWishListData =  JSON.parse(xml2json(userWishListRes, { compact: true, spaces: 2 }));
    let userWishListIDs = [];
    if (Array.isArray(userWishListData.items.item)) {
        Object.values(userWishListData.items.item).map(g => userWishListIDs.push(g._attributes.objectid));  
    }
    
    // userWantToPlayListData is used to provide an array of game IDs that the user has marked as 'Want to play' on BGG.    
    const userWantToPlayListData =  JSON.parse(xml2json(userWantToPlayListRes, { compact: true, spaces: 2 })); 
    let userWantToPlayListIDs = [];
    if (Array.isArray(userWantToPlayListData.items.item)) {
        Object.values(userWantToPlayListData.items.item).map(g => userWantToPlayListIDs.push(g._attributes.objectid));
    }

    // userPlays provides data for the BGG user's logged plays.
    // userPlays is also used to provide an array of game IDs for the user's logged plays.
    const userPlays = JSON.parse(xml2json(userPlaysData, { compact: true, spaces: 2 }));
    let userPlayIDs = [];
    if (userPlays.plays._attributes.total !== "0") {
        Object.values(userPlays.plays.play.map(p => userPlayIDs.push(p.item._attributes.objectid)));
    }

    // Make a get request for game data as a User Request. Provides IDs for the BGG user's userPlays (logged plays).
    const userGames = await getCollectionData(bggUsername, "user", userPlayIDs)

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