const convert = require("xml-js"); // Library for XML to JSON conversion
const { redisClient } = require("../utils/redis"); // Redis client instance
const GameNightBGGHelperAPI = require("./bgg-api"); // API helper for BGG requests
const { computePlayerCount, computePlayerAge } = require("./gameDataHelpers"); // Helper functions for game data processing

const getHot50 = async () => {
    console.log(`getHot50: Checking redisClient.isReady: ${redisClient && redisClient.isReady}`); // Log Redis client readiness

    // Check if Redis client is ready before attempting to use it
    if (redisClient && redisClient.isReady) {
        try {
            await redisClient.ping(); // Check if Redis connection is active
            console.log(`getHot50: Redis PING successful.`);

            // Attempt to retrieve cached Hot 50 data from Redis
            console.log(`getHot50: Attempting to get Hot 50 data from Redis`);
            const cachedHot50 = await redisClient.get(`hot-50`);

            // If cached data exists, parse and return it
            if (cachedHot50 !== null) {
                console.log(`getHot50: Returning cached data for Hot 50 Games`);
                return JSON.parse(cachedHot50);
            } else {
                console.log(`getHot50: Cached Hot 50 data not found in Redis.`);
            }
        } catch (error) {
            console.error(`getHot50: Redis Get/PING Error: ${error.message}`);
            console.error(error);
        }
    } else {
        console.log(`getHot50: Redis client not ready, skipping Redis get`);
    }

    // Fetch Hot 50 Games data from BGG API if not cached or Redis is not ready
    console.log("getHot50: Fetching Hot 50 Games from BGG API");

    // Initialize data structures for extracted data and IDs
    const hot50ExtractedData = {};
    const hot50IdList = [];

    // Make API call to get Hot 50 games
    const res = await GameNightBGGHelperAPI.getHot50();

    // Convert XML response to JSON
    const parsedRes = JSON.parse(convert.xml2json(res, { compact: true, spaces: 2 }));
    const data = parsedRes.items.item;

    console.debug("getHot50: Extracting data from hot 50 response.");

    // Extract game IDs and ranks from the API response
    Object.values(data).forEach(g => {
        hot50ExtractedData[`${g._attributes.id}`] = g._attributes.rank;
        hot50IdList.push(g._attributes.id);
    });

    // Create a comma-separated string of game IDs for detailed data request
    const hotGamesIdString = hot50IdList.join(",");

    // Make API call to get detailed data for the Hot 50 games
    const gamesRes = await GameNightBGGHelperAPI.getGameData(hotGamesIdString);
    const hot50Games = gamesRes.items.item;

    // Process detailed game data to compute player count and age summaries
    for (const game of hot50Games) {
        game.hotnessRank = hot50ExtractedData[`${game._attributes.id}`];
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
            await redisClient.setEx(`hot-50`, 3600 * 3, JSON.stringify(hot50Games)); // Cache for 3 hours
            console.log(`getHot50: Hot 50 data set in Redis`);
        } catch (error) {
            console.error(`getHot50: Redis Set Error: ${error.message}`);
            console.error(error);
        }
    } else {
        console.log(`getHot50: Redis client not ready, skipping Redis set`);
    }

    return hot50Games; // Return the processed game data
};

module.exports = getHot50;