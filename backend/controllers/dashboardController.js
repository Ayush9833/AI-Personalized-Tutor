const Course = require("../models/Course");
const KnowledgeProfile = require("../models/KnowledgeProfile");
const LearningPath = require("../models/LearningPath");
const QuizAttempt = require("../models/QuizAttempt");

const getDashboard = async (req, res) => {
    try {
        const { courseId } = req.params;
        const studentId = req.user.id;

        // ================================
        // CHECK COURSE
        // ================================

        const course = await Course.findById(courseId);

        if (!course) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        // ================================
        // GET KNOWLEDGE PROFILE
        // ================================

        const profile = await KnowledgeProfile.findOne({
            student: studentId,
            course: courseId
        });

        if (!profile) {
            return res.status(404).json({
                message: "Knowledge profile not found for this course"
            });
        }

        // ================================
        // GET LEARNING PATHS
        // ================================

        const learningPaths = await LearningPath.find({
            student: studentId,
            course: courseId
        }).sort({ createdAt: 1 });

        // ================================
        // GET RECENT QUIZ ATTEMPTS
        // ================================

        const recentAttempts = await QuizAttempt.find({
            student: studentId,
            course: courseId
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .select("quizId course score totalQuestions correctAnswers wrongAnswers createdAt");

        // ================================
        // CALCULATE OVERALL MASTERY
        // ================================

        let overallMastery = 0;

        if (profile.concepts.length > 0) {
            const totalMastery = profile.concepts.reduce(
                (sum, concept) => sum + concept.mastery,
                0
            );

            overallMastery =
                totalMastery / profile.concepts.length;
        }

        overallMastery =
            Number(overallMastery.toFixed(2));

        // ================================
        // FIND WEAKEST CONCEPT
        // ================================

        const weakestConcept =
            profile.concepts.length > 0
                ? [...profile.concepts]
                    .sort((a, b) => a.mastery - b.mastery)[0]
                : null;

        // ================================
        // GENERATE RECOMMENDATION
        // ================================

        let recommendation = "Continue learning";

        if (weakestConcept) {
            if (weakestConcept.status === "weak") {
                recommendation =
                    `Learn fundamentals of ${weakestConcept.concept}`;
            } else if (weakestConcept.status === "learning") {
                recommendation =
                    `Practice ${weakestConcept.concept}`;
            } else {
                recommendation =
                    `Revise ${weakestConcept.concept}`;
            }
        }

        // ================================
        // RESPONSE
        // ================================

        res.json({
            message: "Dashboard fetched successfully",

            course: {
                id: course._id,
                title: course.title,
                subject: course.subject
            },

            overallMastery,

            concepts: profile.concepts,

            learningPaths,

            recommendation,

            recentAttempts
        });

    } catch (error) {
        console.error(
            "Dashboard error:",
            error.message
        );

        res.status(500).json({
            message: "Server error"
        });
    }
};

module.exports = {
    getDashboard
};