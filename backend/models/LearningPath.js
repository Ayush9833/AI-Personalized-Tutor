const mongoose = require("mongoose");

const learningPathSchema = new mongoose.Schema(
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

        mastery: {
            type: Number,
            default: 0
        },

        status: {
            type: String,
            enum: ["weak", "learning", "mastered"],
            default: "weak"
        },

        steps: [
            {
                order: Number,

                title: String,

                type: {
                    type: String,
                    enum: [
                        "learn",
                        "practice",
                        "quiz",
                        "review",
                        "retest"
                    ]
                },

                description: String,

                completed: {
                    type: Boolean,
                    default: false
                }
            }
        ]
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "LearningPath",
    learningPathSchema
);