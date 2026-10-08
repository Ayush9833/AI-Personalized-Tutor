const mongoose = require("mongoose");

const aiQuizSchema = new mongoose.Schema(
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

        concept: {
            type: String,
            required: true
        },

        difficulty: {
            type: String,
            enum: ["easy", "medium", "hard"],
            required: true
        },

        questions: [
            {
                question: {
                    type: String,
                    required: true
                },

                options: {
                    A: {
                        type: String,
                        required: true
                    },

                    B: {
                        type: String,
                        required: true
                    },

                    C: {
                        type: String,
                        required: true
                    },

                    D: {
                        type: String,
                        required: true
                    }
                },

                correctAnswer: {
                    type: String,
                    required: true
                },

                concept: {
                    type: String
                },

                difficulty: {
                    type: String,
                    enum: ["easy", "medium", "hard"]
                },

                explanation: {
                    type: String
                }
            }
        ]
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "AIQuiz",
    aiQuizSchema
);