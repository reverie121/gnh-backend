// Returns an array of player count ratings from BGG game data ('Best', 'Recommended', 'Not Recommended') where index+1 = player count.
const computePlayerCount = (g) => {
    // Get rating with highest vote count for a player count value (arr contains results for each rating for that value).
    function getPlayerCountRating(arr) {
        let highestCount = 0;
        let rating = "";
        arr.map(d => {
            if (Number(d._attributes.numvotes) > highestCount) {
                highestCount = Number(d._attributes.numvotes);
                rating = d._attributes.value.replace(" ", "");
            } return ''
        })
        return rating;
    }
    // Initialize output array.
    let playerCountArr = [];
    // Get rating for each player count value and push to output array, or log error.
    try {
        g.poll[0].results.map(r => playerCountArr.push(getPlayerCountRating(r.result)))
    }
    catch(err) {
        console.log(err)
    }
    return playerCountArr;
}

// Returns average minimum age from user poll results in BGG game data.
const computePlayerAge = (g) => {
    let ageSum = 0;
    g.poll[1].results.result.map(r => ageSum = ageSum + (parseInt(r._attributes.value) * parseInt(r._attributes.numvotes)));
    return (ageSum / g.poll[1]._attributes.totalvotes).toFixed(0);
}

module.exports = { computePlayerCount, computePlayerAge }