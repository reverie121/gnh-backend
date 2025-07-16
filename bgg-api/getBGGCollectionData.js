const getCollectionData = require("./getGameData");
const { redisClient, redisAvailable, inMemoryCache } = require("../utils/redis");

const getBGGCollectionData = async (bggUsername) => {
    console.log(`getBGGCollectionData: Checking redisAvailable: ${redisAvailable}`);

    if (redisAvailable) {
            try {
            console.log(`getBGGCollectionData: Attempting to get collection data from Redis for ${bggUsername}`);
            const cachedCollectionData = redisAvailable ? await redisClient.get(`collection-${bggUsername}`) : inMemoryCache.get(`collection-${bggUsername}`);
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

    if (redisAvailable) {
        try {
            redisAvailable ? await redisClient.setEx(`collection-${bggUsername}`, 3600, JSON.stringify(userGames)) : inMemoryCache.set(`collection-${bggUsername}`, userGames, 3600);
            console.log(`getBGGCollectionData: Collection data set in Redis for ${bggUsername}`);
        } catch (error) {
            console.error(`getBGGCollectionData: Cache Set Error: ${error.message}`);
            console.error(error);
        }
    } else {
        console.log(`getBGGCollectionData: Using in-memory cache for ${bggUsername}`);
        inMemoryCache.set(`collection-${bggUsername}`, userGames, 3600);
    }

    return userGames;
};

module.exports = getBGGCollectionData;