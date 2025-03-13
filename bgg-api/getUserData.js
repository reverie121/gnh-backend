const { xml2json } = require("xml-js");
const { redisClient } = require("../utils/redis"); // Correct import
const GameNightBGGHelperAPI = require("./bgg-api");
const getCollectionData = require("./getGameData");

const getBGGUserData = async (bggUsername) => {
    console.log(`getUserData: Checking redisClient.isReady: ${redisClient && redisClient.isReady}`); // Log redisClient.isReady

    if (redisClient && redisClient.isReady) {
        try {
            await redisClient.ping();
            console.log(`getUserData: Redis PING successful.`);
            console.log(`getUserData: Attempting to get user data from Redis for ${bggUsername}`);
            const cachedUserData = await redisClient.get(`user-${bggUsername}`);
            if (cachedUserData !== null) {
                console.log(`getUserData: Returning cached user data for ${bggUsername}`);
                return JSON.parse(cachedUserData);
            } else {
                console.log(`getUserData: Cached user data for ${bggUsername} not found in Redis.`);
            }
        } catch (error) {
            console.error(`getUserData: Redis Get Error: ${error.message}`);
            console.error(error);
        }
    } else {
        console.log(`getUserData: Redis client not ready, skipping Redis get for ${bggUsername}`);
    }

    console.log(`getUserData: Fetching user data from BGG API for ${bggUsername}`);
    const [userDataRes, userPlaysData] = await Promise.all([
        GameNightBGGHelperAPI.getUser(bggUsername),
        GameNightBGGHelperAPI.getPlays(bggUsername)
    ]);

    const userDetails = JSON.parse(xml2json(userDataRes, { compact: true, spaces: 2 }));
    const playsResponseObject = JSON.parse(xml2json(userPlaysData, { compact: true, spaces: 2 }));
    const userPlayIDSet = new Set();
    if (playsResponseObject.plays._attributes.total !== "0") {
        playsResponseObject.plays.play.forEach(p => userPlayIDSet.add(p.item._attributes.objectid));
    }
    const userPlayIDs = [...userPlayIDSet].sort((a, b) => a - b);

    const { userGames, userCollectionIDs, userPreviouslyOwnedIDs, userForTradeIDs, userWantIDs, userWantToPlayIDs, userWantToBuyIDs, userPreOrderedIDs, userWishListData } = await getCollectionData(bggUsername, "user", userPlayIDs);

    const userPlays = playsResponseObject.plays;
    userPlays.thumbnailURLs = {};
    if (Array.isArray(userGames)) {
        for (const game of userGames) {
            if (userPlayIDSet.has(game._attributes.id)) {
                userPlays.thumbnailURLs[`${game._attributes.id}`] = game.thumbnail._text || "no image available";
            }
        }
    } else if (userGames !== undefined) {
        if (userPlayIDSet.has(userGames._attributes.id)) {
            userPlays.thumbnailURLs[`${userGames._attributes.id}`] = userGames.thumbnail._text || "no image available";
        }
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

    if (redisClient && redisClient.isReady) {
        try {
            await redisClient.setEx(`user-${bggUsername}`, 3600, JSON.stringify(bggUser));
            console.log(`getUserData: User data set in Redis for ${bggUsername}`);
        } catch (error) {
            console.error(`getUserData: Redis Set Error: ${error.message}`);
            console.error(error);
        }
    } else {
        console.log(`getUserData: Redis client not ready, skipping Redis set for ${bggUsername}`);
    }

    return bggUser;
};

module.exports = getBGGUserData;