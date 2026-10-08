const mongoose = require("mongoose");

const quizAttemptSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true
        },

        quizId: {
            type: String,
            required: true
        },

        totalQuestions: {
            type: Number,
            required: true
        },

        correctAnswers: {
            type: Number,
            required: true
        },

        wrongAnswers: {
            type: Number,
            required: true
        },

        score: {
            type: Number,
            required: true
        },

        answers: [
            {
                questionId: String,
                selectedAnswer: String,
                correctAnswer: String,
                isCorrect: Boolean,
                concept: String
            }
        ]
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);