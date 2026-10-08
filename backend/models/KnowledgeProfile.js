const mongoose = require("mongoose");

const knowledgeProfileSchema = new mongoose.Schema(
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

        concepts: [
            {
                concept: {
                    type: String,
                    required: true
                },

                mastery: {
                    type: Number,
                    default: 0,
                    min: 0,
                    max: 100
                },

                questionsAttempted: {
                    type: Number,
                    default: 0
                },

                questionsCorrect: {
                    type: Number,
                    default: 0
                },

                lastScore: {
                    type: Number,
                    default: 0
                },

                status: {
                    type: String,
                    enum: ["weak", "learning", "mastered"],
                    default: "weak"
                }
            }
        ]
    },
    {
        timestamps: true
    }
);

knowledgeProfileSchema.index(
    { student: 1, course: 1 },
    { unique: true }
);

module.exports = mongoose.model(
    "KnowledgeProfile",
    knowledgeProfileSchema
);