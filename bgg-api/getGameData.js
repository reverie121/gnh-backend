const convert = require("xml-js");

const GameNightBGGHelperAPI = require("./bgg-api");

const { computePlayerCount, computePlayerAge } = require("./gameDataHelpers");

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
    const gameData = data.items.item;

    return gameData;
}

// Makes multiple get requests to BGG API to get game data for a collection or user. Collection requests provide limited game data, so a follow-up game request is required using IDs from the collection/s.
// Process: One or more collection requests => make list of game IDs => request for data for all games from list.
const getCollectionData = async (bggUsername, mode="collection", playsIDs=[]) => {

    // Initialize a set to hold the game IDs for every game in the user's collection, to be used for a follow-up game query.
    const gameIDSet = new Set();
    // Initialize arrays for user's categorical game ID lists.
    const userCollectionIDs = [];
    const userPreviouslyOwnedIDs = [];
    const userForTradeIDs = [];
    const userWantIDs = [];
    const userWantToPlayIDs = [];
    const userWantToBuyIDs = [];
    const userPreOrderedIDs = [];    
    // Initialize array to hold extracted collection item data.
    const userWishListData = [];
    const collectionItemsData = [];    
    
    // Helper function for iterating through a collection request (any type) response and adding IDs to corresponding ID sets.
    function extractDataFromCollection(res) {
        // Convert data from XML to JSON.
        const collectionData = JSON.parse(
            convert.xml2json(res, { compact: true, spaces: 2 })
        );

        // Do nothing (return undefined) if there are no games in the user's collection.
        if (collectionData.items._attributes.totalitems === "0") return undefined;

        // Helper function to extract data from a game.
        function extractDataFromGame(g) {
            // Add game ID to set of all IDs for upcoming game data request.
            gameIDSet.add(g._attributes.objectid);

            if (mode === "user") {
                // Add game ID to applicable categorical game ID lists.
                if (g.status._attributes.own == "1") userCollectionIDs.push(g._attributes.objectid)
                if (g.status._attributes.prevowned == "1") userPreviouslyOwnedIDs.push(g._attributes.objectid)     
                if (g.status._attributes.fortrade == "1") userForTradeIDs.push(g._attributes.objectid) 
                if (g.status._attributes.want == "1") userWantIDs.push(g._attributes.objectid) 
                if (g.status._attributes.wantoplay == "1") userWantToPlayIDs.push(g._attributes.objectid) 
                if (g.status._attributes.wanttobuy == "1") userWantToBuyIDs.push(g._attributes.objectid)         
                if (g.status._attributes.preordered == "1") userPreOrderedIDs.push(g._attributes.objectid)  
                // Wishlist data will be stored as an array of arrays.
                // [[game ID, Wishlist Priority], ...]
                if (g.status._attributes.wishlist == "1") {
                    userWishListData.push([g._attributes.objectid, g.status._attributes.wishlistpriority])
                }
                // Extract additional data...
                const collectionItemData = {
                    id: g._attributes.objectid,
                    numPlays: g.numplays._text
                }
                if (g.stats.rating._attributes.value != "N/A") collectionItemData["userRating"] = g.stats.rating._attributes.value;
                if (g.comment) collectionItemData["comments"] = g.comment._text;
                // Add additional extracted data to data array.
                collectionItemsData.push(collectionItemData)
            }
        }

        if (Array.isArray(collectionData.items.item)) {
            console.debug("Extracting collection data from collection response.")            
            Object.values(collectionData.items.item).map(g => {
                extractDataFromGame(g);
            });
        } else extractDataFromGame(collectionData.items.item);
    }

    // Helper function for integrating data with user games.
    function integrateGameData(game, mode) {
        // Add poll result summary data to games.
        if (Array.isArray(game.poll) && Number(game.poll[0]._attributes.totalvotes) > 0) game.poll[0].resultSummary = computePlayerCount(game);
        if (Array.isArray(game.poll) && Number(game.poll[1]._attributes.totalvotes) > 0) game.poll[1].resultSummary = computePlayerAge(game);

        if (mode == "user") {
            // Find collection item data for the current game.
            const d = findCollectionItemData(game._attributes.id, collectionItemsData);
            // Add collection item data to game object.
            if (d) game.collectionData = d;
            // Remove id from collectionData within the game object now that it is no longer required.
            // ***This is disabled because it was causing an error.
            // if (game.collectionData.id) delete game.collectionData.id;            
        }
    }
    
    // Handle request for collection type request.
    if (mode === "collection") {
        const res = await GameNightBGGHelperAPI.getCollection(bggUsername);
        extractDataFromCollection(res.data);

        // User array of game IDs is used to request detailed game information from BGG.
        const userGames = await getGameData(gameIDSet);

        for (const game of userGames) {
            integrateGameData(game);
        }

        // If for a Collection type request gameData can be returned alone.
        return userGames;
    }

    // User requests get game data for the user's collection as well as other potential lists of games relevant to that user.
    else if (mode === "user") {
        // Make requests to BGG API.
        const res = await GameNightBGGHelperAPI.getCollection(bggUsername, "user");

        // Get collection-specific data for games.
        extractDataFromCollection(res.data);

        // Add (logged) play IDs for user to inclusive ID list.
        for (const id of playsIDs) {
            gameIDSet.add(id);
        }

        // User's array of game IDs is used to request detailed game information from BGG.
        let userGames = await getGameData(gameIDSet);

        // Sort data arrays.
        userWishListData.sort((a,b) => a[0]-b[0]);
        collectionItemsData.sort((a,b) => a["id"]-b["id"]);          

        // Helper function to find game data from collectionItemsData for a particular game ID.
        function findCollectionItemData(gameID, dataToIntegrate) {
            let lIndx = 0;
            let rIndx = dataToIntegrate.length - 1;
            let mIndx;
            // Use binary search to find the correct data to integrate, matching on game ID.
            while (lIndx <= rIndx) {
                if (dataToIntegrate[lIndx].id == gameID) return dataToIntegrate[lIndx];
                else if (dataToIntegrate[rIndx].id == gameID) return dataToIntegrate[rIndx];

                mIndx = Math.floor((lIndx + rIndx) / 2);
                if (dataToIntegrate[mIndx].id == gameID) return dataToIntegrate[mIndx];
                else {
                    if (Number(dataToIntegrate[mIndx].id) > Number(gameID)) rIndx = mIndx - 1;
                    else lIndx = mIndx + 1;
                }
            }            
        }
        // Integrate collectionItemsData with userGames and add poll result summary data. At this point userGames will either be undefined, an object, or an array.
        if (Array.isArray(userGames)) {
            for (const game of userGames) {
                integrateGameData(game, "user");
            }
        } else if (userGames !== undefined) {
            integrateGameData(userGames, "user");
        }

        // // ***NOT CURRENTLY IN USE
        // // Creates lists of game IDs for the categories, mechanics, and families present in the user's game collection.
        // const userCollectionGameList = userGames.filter(g => userCollectionIDs.includes(g._attributes.id));
        // const {categories, mechanics, families} = parseLinkData(userCollectionGameList);

        return { userGames, userCollectionIDs, userPreviouslyOwnedIDs, userForTradeIDs, userWantIDs, userWantToPlayIDs, userWantToBuyIDs, userPreOrderedIDs, userWishListData };
        }

};

module.exports =  getCollectionData;