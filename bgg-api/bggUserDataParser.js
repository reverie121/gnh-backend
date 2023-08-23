// Takes as input a gameList.
// Outputs arrays of values, their IDs, and the number of times they appear in the collection for game categories, mechanics, and families.
// Not currently in use.

const parseLinkData = (gameList) => {
    let categories = [];
    let mechanics = [];
    let families = [];

    function increaseValue(arr, key, id) {
        if (arr[key]) {
            arr[key].push(id);
        } else {
            arr[key] = [id];
        }
    }

    function addToArray(link, id) {
        if (link._attributes.type === "boardgamecategory") {
            increaseValue(categories, link._attributes.value, id);
        } else if (link._attributes.type === "boardgamemechanic") {
            increaseValue(mechanics, link._attributes.value, id);
        } else if (link._attributes.type === "boardgamefamily") {
            increaseValue(families, link._attributes.value, id);
        }
    }

    for (const g of gameList) {
        const gameID = g._attributes.id;
        for (const l of g.link) {
            addToArray(l, gameID);
        }
    }
    
    return {categories, mechanics, families}
}

module.exports = parseLinkData;