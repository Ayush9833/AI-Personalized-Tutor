const selectQuestions = (
    questions,
    concept,
    difficulty,
    numberOfQuestions = 5
) => {

    // Filter by concept and difficulty
    const matchingQuestions = questions.filter(
        (question) =>
            question.concept.toLowerCase() === concept.toLowerCase() &&
            question.difficulty === difficulty
    );

    // Remove duplicate questions
    const uniqueQuestions = Array.from(
        new Map(
            matchingQuestions.map((question) => [
                question._id.toString(),
                question
            ])
        ).values()
    );

    // Return requested number of questions
    return uniqueQuestions.slice(0, numberOfQuestions);
};

module.exports = {
    selectQuestions
};