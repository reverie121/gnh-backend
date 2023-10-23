// Gets comprehensive data for a BGG collection from BGG.

const redis = require("redis");

const getCollectionData = require("./getGameData");
const { REDIS_HOST, REDIS_PORT } = require("../config");

const getBGGCollectionData = async (bggUsername) => {

    // Set up and connect to redis client.
    const redisClient = redis.createClient({
        host: REDIS_HOST,
        port: REDIS_PORT
    });
    const defaultExp = 3600;
    redisClient.on("error", (error) => console.error(`Error : ${error}`));
    await redisClient.connect();

    // If collection data is stored in redis then return it without making external API calls.
    const cachedCollectionData = await redisClient.get(`collection-${bggUsername}`)
    if (cachedCollectionData !== null) {
        console.log(`Returning cached collection data for ${bggUsername}`)
        return JSON.parse(cachedCollectionData)
    }

    const userGames = await getCollectionData(bggUsername);
    
    // Store user data in redis.
    redisClient.setEx(`user_${bggUsername}`, defaultExp, JSON.stringify(userGames));

    return(userGames);
};

module.exports =  getBGGCollectionData;