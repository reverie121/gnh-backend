const getCollectionData = require("./getGameData");
const { redisClient } = require("../utils/redis"); // Correct Import

const getBGGCollectionData = async (bggUsername) => {
    console.log(`getBGGCollectionData: Checking redisClient.isReady: ${redisClient && redisClient.isReady}`); // Log redisClient.isReady

    if (redisClient && redisClient.isReady) {
        try {
            await redisClient.ping();
            console.log(`getBGGCollectionData: Redis PING successful.`);
            console.log(`getBGGCollectionData: Attempting to get collection data from Redis for ${bggUsername}`);
            const cachedCollectionData = await redisClient.get(`collection-${bggUsername}`);
            if (cachedCollectionData !== null) {
                console.log(`getBGGCollectionData: Returning cached collection data for ${bggUsername}`);
                return JSON.parse(cachedCollectionData);
            } else {
                console.log(`getBGGCollectionData: Cached collection data for ${bggUsername} not found in Redis.`);
            }
        } catch (error) {
            console.error(`getBGGCollectionData: Redis Get Error: ${error.message}`);
            console.error(error);
        }
    } else {
        console.log(`getBGGCollectionData: Redis client not ready, skipping Redis get for ${bggUsername}`);
    }

    console.log(`getBGGCollectionData: Fetching collection data from BGG API for ${bggUsername}`);
    const userGames = await getCollectionData(bggUsername);

    if (redisClient && redisClient.isReady) {
        try {
            await redisClient.setEx(`collection-${bggUsername}`, 3600, JSON.stringify(userGames));
            console.log(`getBGGCollectionData: Collection data set in Redis for ${bggUsername}`);
        } catch (error) {
            console.error(`getBGGCollectionData: Redis Set Error: ${error.message}`);
            console.error(error);
        }
    } else {
        console.log(`getBGGCollectionData: Redis client not ready, skipping Redis set for ${bggUsername}`);
    }

    return userGames;
};

module.exports = getBGGCollectionData;