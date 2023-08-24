// Takes as input a gameList.
// Outputs objects of values, their IDs, and the number of times they appear in the collection for game categories, mechanics, and families.
// Not currently in use.

const parseLinkData = (gameList) => {
    
    // Initialize objects.
    let categories = {};
    let mechanics = {};
    let families = {};

    // Helper function used to add an ID the value for a specific obj[key].
    function increaseValue(obj, key, id) {
        if (obj[key]) {
            obj[key].push(id);
        } else {
            obj[key] = [id];
        }
    }

    // Helper function used to add IDs to corresponding categories/mechanics/families lists.
    function addToArray(link, id) {
        if (link._attributes.type === "boardgamecategory") {
            increaseValue(categories, link._attributes.value, id);
        } else if (link._attributes.type === "boardgamemechanic") {
            increaseValue(mechanics, link._attributes.value, id);
        } else if (link._attributes.type === "boardgamefamily") {
            increaseValue(families, link._attributes.value, id);
        }
    }

    // Iterate through gameList to fill game categories/mechanics/families lists with corresponding IDs.
    for (const g of gameList) {
        const gameID = g._attributes.id;
        for (const l of g.link) {
            addToArray(l, gameID);
        }
    }
    
    return {categories, mechanics, families}
}

module.exports = parseLinkData;