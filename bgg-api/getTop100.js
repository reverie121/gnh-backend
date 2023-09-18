const convert = require("xml-js");
const redis = require("redis");

const GameNightBGGHelperAPI = require("./bgg-api");
const { computePlayerCount, computePlayerAge } = require("./gameDataHelpers");

const getTop100 = async () => {

    // Set up and connect to redis client.
    const redisClient = redis.createClient();
    const defaultExp = (3600*12);
    redisClient.on("error", (error) => console.error(`Error : ${error}`));
    await redisClient.connect();

    // If user data is stored in redis then return it without making external API calls.
    const cachedTop100 = await redisClient.get(`top-100`)
    if (cachedTop100 !== null) {
        console.log(`Returning cached data for Top 100 Games`)
        return JSON.parse(cachedTop100)
    }

    const res = await GameNightBGGHelperAPI.getTop100();
    const data = JSON.parse(
      convert.xml2json(res, { compact: true, spaces: 2 })
    )
    const top100Games = data.items.item;
    for (const game of top100Games) {
        // Add poll result summary data to games.
        if (Array.isArray(game.poll) && Number(game.poll[0]._attributes.totalvotes) > 0) game.poll[0].resultSummary = computePlayerCount(game);
        if (Array.isArray(game.poll) && Number(game.poll[1]._attributes.totalvotes) > 0) game.poll[1].resultSummary = computePlayerAge(game);
    }

    // Store Top 100 game data in redis.
    redisClient.setEx(`top-100`, defaultExp, JSON.stringify(top100Games));

    return top100Games;
}

module.exports =  getTop100;