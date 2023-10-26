const convert = require("xml-js");
const redis = require("redis");

const GameNightBGGHelperAPI = require("./bgg-api");
const { computePlayerCount, computePlayerAge } = require("./gameDataHelpers");
const { REDIS_URL } = require("../config");

const getHot50 = async () => {

    const hot50ExtractedData = {};
    const hot50IdList = [];

    // Set up and connect to redis client.
    const redisClient = redis.createClient({url: REDIS_URL});
    const defaultExp = (3600*3);
    redisClient.on("error", (error) => console.error(`Error : ${error}`));
    await redisClient.connect();

    // If user data is stored in redis then return it without making external API calls.
    const cachedHot50 = await redisClient.get(`hot-50`)
    if (cachedHot50 !== null) {
        console.log(`Returning cached data for Hot 50 Games`)
        return JSON.parse(cachedHot50)
    }

    // Get Hot 50 data from BGG.
    const res = await GameNightBGGHelperAPI.getHot50();
    const parsedRes = JSON.parse(
      convert.xml2json(res, { compact: true, spaces: 2 })
    )
    const data = parsedRes.items.item;
    // Match hotness rank (value) to game id (key) in extracted data object.
    // Push ids to a second array for use in the following game request.
    console.debug("Extracting data from hot 50 response.")            
    Object.values(data).map(g => {
        hot50ExtractedData[`${g._attributes.id}`] = g._attributes.rank;
        hot50IdList.push(g._attributes.id)
    });
    // Get game data for the Hot 50 games from BGG.
    const hotGamesIdString = hot50IdList.join(",");
    const gamesRes = await GameNightBGGHelperAPI.getGameData(hotGamesIdString)
    const parsedGamesRes = JSON.parse(
        convert.xml2json(gamesRes, { compact: true, spaces: 2 })
    );
    const hot50Games = parsedGamesRes.items.item;

    for (const game of hot50Games) {
        // Add Hotness rank to game data.
        game['hotnessRank'] = hot50ExtractedData[`${game._attributes.id}`];
        // Add poll result summary data to games.
        if (Array.isArray(game.poll) && Number(game.poll[0]._attributes.totalvotes) > 0) game.poll[0].resultSummary = computePlayerCount(game);
        if (Array.isArray(game.poll) && Number(game.poll[1]._attributes.totalvotes) > 0) game.poll[1].resultSummary = computePlayerAge(game);
    }

    // Store Top 100 game data in redis.
    redisClient.setEx(`hot-50`, defaultExp, JSON.stringify(hot50Games));

    return hot50Games;
}

module.exports =  getHot50;