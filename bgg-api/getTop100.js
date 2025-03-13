const { redisClient } = require("../utils/redis");
const GameNightBGGHelperAPI = require("./bgg-api");
const { computePlayerCount, computePlayerAge } = require("./gameDataHelpers");

const getTop100 = async () => {
    console.log(`getTop100: Checking redisClient.isReady: ${redisClient && redisClient.isReady}`);

    // Check if Redis client is ready before attempting to use it
    if (redisClient && redisClient.isReady) {
        try {
            await redisClient.ping(); // Verify Redis connection
            console.log(`getTop100: Redis PING successful.`);

            // Attempt to retrieve cached Top 100 data from Redis
            console.log(`getTop100: Attempting to get Top 100 data from Redis`);
            const cachedTop100 = await redisClient.get(`top-100`);

            // If cached data exists, parse and return it
            if (cachedTop100 !== null) {
                console.log(`getTop100: Returning cached data for Top 100 Games`);
                return JSON.parse(cachedTop100);
            } else {
                console.log(`getTop100: Cached Top 100 data not found in Redis.`);
            }
        } catch (error) {
            console.error(`getTop100: Redis Get/PING Error: ${error.message}`);
            console.error(error);
        }
    } else {
        console.log(`getTop100: Redis client not ready, skipping Redis get`);
    }

    // Fetch Top 100 Games from BGG API if not cached or Redis is not ready
    console.log("getTop100: Fetching Top 100 Games from BGG API");
    try {
        const res = await GameNightBGGHelperAPI.getTop100();
        const top100Games = res.items.item; // Extract game items from the API response

        // Process game data to compute player count and age summaries
        for (const game of top100Games) {
            if (Array.isArray(game.poll) && Number(game.poll[0]._attributes.totalvotes) > 0) {
                game.poll[0].resultSummary = computePlayerCount(game);
            }
            if (Array.isArray(game.poll) && Number(game.poll[1]._attributes.totalvotes) > 0) {
                game.poll[1].resultSummary = computePlayerAge(game);
            }
        }

        // Cache the fetched data in Redis if Redis client is ready
        if (redisClient && redisClient.isReady) {
            try {
                await redisClient.setEx(`top-100`, 3600 * 12, JSON.stringify(top100Games)); // Cache for 12 hours
                console.log(`getTop100: Top 100 data set in Redis`);
            } catch (error) {
                console.error(`getTop100: Redis Set Error: ${error.message}`);
                console.error(error);
            }
        } else {
            console.log(`getTop100: Redis client not ready, skipping Redis set`);
        }

        return top100Games; // Return the processed data
    } catch (error) {
        console.error("getTop100: Error fetching or processing BGG API data:", error);
        return { error: error.message }; // Return error object
    }
};

module.exports = getTop100;