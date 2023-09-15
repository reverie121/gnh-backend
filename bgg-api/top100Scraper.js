const axios = require("axios");
const cheerio = require("cheerio");

async function getTopIDs() {
    const page = await axios.get("https://boardgamegeek.com/browse/boardgame?sort=rank&sortdir=asc");

    const $ = cheerio.load(page.data);
    const idArray = [];
    $("a.primary").each((i, element) => {
        const url = element.attribs.href;
        const id = url.replace("/boardgame/", "").split("/")[0];
        idArray.push(id);
    })
    return idArray;
}

async function getTopIdString() {
    const idArray = await getTopIDs();
    const idString = idArray.join(",");
    return idString;
}

module.exports =  getTopIdString;