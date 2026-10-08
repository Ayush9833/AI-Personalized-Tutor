const getDifficulty = (mastery) => {
    if (mastery < 50) {
        return "easy";
    }

    if (mastery < 80) {
        return "medium";
    }

    return "hard";
};

module.exports = {
    getDifficulty
};