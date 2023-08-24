const GameNightBGGHelperAPI = require("./bgg-api");

const convert = require("xml-js");

// Makes an API get request to BGG API for data for multiple games. Takes an array of game IDs as input and returns an arrat of game data.
const getGameData = async (gameIDArray) => {
    // Get a set (exclude duplicates) of IDs from collection.
    const idSet = new Set(gameIDArray);
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

    let gameIDArray = [];
    
    function getIDArrayFromCollection(res) {
        const collectionData = JSON.parse(
            convert.xml2json(res, { compact: true, spaces: 2 })
        );
        if (Array.isArray(collectionData.items.item)) {
            Object.values(collectionData.items.item).map(g => gameIDArray.push(g._attributes.objectid));
        }
    }
    
    // User requests get game data for the user's collection as well as other potential lists of games relevant to that user.
    if (mode === "user") {
        const [ collectionRes, WishlistRes, WantToPlayRes ] = await Promise.all([
            GameNightBGGHelperAPI.getCollection(bggUsername), 
            GameNightBGGHelperAPI.getCollection(bggUsername, "wishList"), 
            GameNightBGGHelperAPI.getCollection(bggUsername, "wantToPlayList"), 
        ])
        getIDArrayFromCollection(collectionRes.data);
        getIDArrayFromCollection(WishlistRes.data);
        getIDArrayFromCollection(WantToPlayRes.data);
        gameIDArray.push(...playsIDs);                   
    }
    // If not a user request, make simple request for collection data.
    else {
        const res = await GameNightBGGHelperAPI.getCollection(bggUsername);
        getIDArrayFromCollection(res.data);
    }

    // User array of game IDs is used to request detailed game information from BGG.
    const gameData = await getGameData(gameIDArray);

    return(gameData);
};

module.exports =  getCollectionData;