const KnowledgeProfile = require("../models/KnowledgeProfile");
const Course = require("../models/Course");

const getRecommendation = async (req, res) => {
    try {
        const { courseId } = req.params;

        // Check course
        const course = await Course.findById(courseId);

        if (!course) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        // Get student's knowledge profile
        const profile = await KnowledgeProfile.findOne({
            student: req.user.id,
            course: courseId
        });

        if (!profile || profile.concepts.length === 0) {
            return res.json({
                message: "No learning data available yet",
                recommendation: null
            });
        }

        // Find weakest concept
        const weakestConcept = [...profile.concepts].sort(
            (a, b) => a.mastery - b.mastery
        )[0];

        let priority;

        if (weakestConcept.mastery < 40) {
            priority = "high";
        } else if (weakestConcept.mastery < 80) {
            priority = "medium";
        } else {
            priority = "low";
        }

        let action;

        if (weakestConcept.status === "weak") {
            action = "Review the concept and attempt a basic practice quiz";
        } else if (weakestConcept.status === "learning") {
            action = "Practice more questions and attempt an intermediate quiz";
        } else {
            action = "Continue with advanced questions or move to the next concept";
        }

        res.json({
            course: {
                id: course._id,
                title: course.title,
                subject: course.subject
            },

            recommendation: {
                concept: weakestConcept.concept,
                mastery: weakestConcept.mastery,
                status: weakestConcept.status,
                priority,
                action
            }
        });

    } catch (error) {
        console.error(
            "Recommendation error:",
            error.message
        );

        res.status(500).json({
            message: "Server error"
        });
    }
};

module.exports = {
    getRecommendation
};