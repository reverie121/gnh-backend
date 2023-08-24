const convert = require("xml-js");

const GameNightBGGHelperAPI = require("./bgg-api");
// const parseLinkData = require("./bggUserDataParser");

// Makes an API get request to BGG API for data for multiple games. Takes an array of game IDs as input and returns an arrat of game data.
const getGameData = async (gameIDSet) => {
    // Get a set (exclude duplicates) of IDs from collection.
    const idSet = new Set(gameIDSet);
    // Convert id set into a comma-separated string for request.
    const idList = [...idSet].join(",");
    // Make request for game details for all unique games in collection.
    const res = await GameNightBGGHelperAPI.getGameData(idList);
    const data = JSON.parse(
        convert.xml2json(res, { compact: true, spaces: 2 })
    );
    const gameData = data.items.item

    return gameData;
}

// Makes multiple get requests to BGG API to get game data for a collection or user. Collection requests provide limited game data, so a follow-up game request is required using IDs from the collection/s.
// Process: One or more collection requests => make list of game IDs => request for data for all games from list.
const getCollectionData = async (bggUsername, mode="collection", playsIDs=[]) => {

    // Initialize Sets for user's game ID lists.
    const gameIDSet = new Set();
    const userCollectionIDSet = new Set();
    const userWishListIDSet = new Set();
    const userWantToPlayListIDSet = new Set();
    
    // Helper function for iterating through a collection request (any type) response and adding IDs to corresponding ID sets.
    function getIDArrayFromCollection(res, type="collection") {
        const collectionData = JSON.parse(
            convert.xml2json(res, { compact: true, spaces: 2 })
        );
        if (Array.isArray(collectionData.items.item)) {
            Object.values(collectionData.items.item).map(g => {
                gameIDSet.add(g._attributes.objectid)
                if (type == "collection") userCollectionIDSet.add(g._attributes.objectid)
                else if (type == "wishList") userWishListIDSet.add(g._attributes.objectid)
                else if (type == "wantToPlayList") userWantToPlayListIDSet.add(g._attributes.objectid)
            });
        }
    }
    
    // Handle request for collection type request.
    if (mode === "collection") {
        const res = await GameNightBGGHelperAPI.getCollection(bggUsername);
        getIDArrayFromCollection(res.data);

        // User array of game IDs is used to request detailed game information from BGG.
        const userGames = await getGameData(gameIDSet);

        // If for a Collection type request gameData can be returned alone.
        return userGames;
    }

    // User requests get game data for the user's collection as well as other potential lists of games relevant to that user.
    else if (mode === "user") {
        // Make requests to BGG API.
        const [ collectionRes, wishListRes, wantToPlayRes ] = await Promise.all([
            GameNightBGGHelperAPI.getCollection(bggUsername), 
            GameNightBGGHelperAPI.getCollection(bggUsername, "wishList"), 
            GameNightBGGHelperAPI.getCollection(bggUsername, "wantToPlayList"), 
        ])         
        // Get user game ID lists from API response data.
        getIDArrayFromCollection(collectionRes.data);
        getIDArrayFromCollection(wishListRes.data, "wishList");
        getIDArrayFromCollection(wantToPlayRes.data, "wantToPlayList");
        // Add play IDs to inclusive ID list.
        gameIDSet.add(...playsIDs);     
        
        // User array of game IDs is used to request detailed game information from BGG.
        const userGames = await getGameData(gameIDSet);

        // If for a User type request, convert ID sets to sorted arrays and then return all required data in an object.
        const userCollectionIDs = [...userCollectionIDSet].sort((a,b) => a-b);
        const userWishListIDs = [...userWishListIDSet].sort((a,b) => a-b);
        const userWantToPlayListIDs = [...userWantToPlayListIDSet].sort((a,b) => a-b);

        // // NOT CURRENTLY IN USE
        // // Creates lists of game IDs for the categories, mechanics, and families present in the user's game collection.
        // const userCollectionGameList = userGames.filter(g => userCollectionIDs.includes(g._attributes.id));
        // const {categories, mechanics, families} = parseLinkData(userCollectionGameList);

        return { userGames, userCollectionIDs, userWishListIDs, userWantToPlayListIDs };
        }

};

module.exports =  getCollectionData;