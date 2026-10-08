const axios = require("axios");

const KnowledgeProfile = require("../models/KnowledgeProfile");
const Course = require("../models/Course");

const getAIRecommendation = async (req, res) => {
    try {
        const { courseId } = req.params;

        // 1. Check course
        const course = await Course.findById(courseId);

        if (!course) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        // 2. Get student's knowledge profile
        const profile = await KnowledgeProfile.findOne({
            student: req.user.id,
            course: courseId
        });

        if (!profile) {
            return res.status(404).json({
                message: "Knowledge profile not found"
            });
        }

        // 3. Find weakest concept
        const weakestConcept = [...profile.concepts].sort(
            (a, b) => a.mastery - b.mastery
        )[0];

        if (!weakestConcept) {
            return res.status(404).json({
                message: "No concepts available for recommendation"
            });
        }

        // 4. Send weakest concept to Python AI service
        const response = await axios.post(
            "http://localhost:8000/recommend",
            {
        course_id: courseId,
        concept: weakestConcept.concept,
        mastery: weakestConcept.mastery,
        status: weakestConcept.status
            }
        );

        // 5. Return AI recommendation
        res.json({
            message: "AI recommendation generated successfully",

            studentProfile: {
                weakestConcept: weakestConcept.concept,
                mastery: weakestConcept.mastery,
                status: weakestConcept.status
            },

            recommendation: response.data
        });

    } catch (error) {

        console.error(
            "AI recommendation error:",
            error.response?.data || error.message
        );

        res.status(500).json({
            message: "Failed to generate AI recommendation",
            error: error.response?.data || error.message
        });
    }
};

module.exports = {
    getAIRecommendation
};