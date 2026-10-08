const KnowledgeProfile = require("../models/KnowledgeProfile");
const QuizAttempt = require("../models/QuizAttempt");
const Course = require("../models/Course");

const getProgress = async (req, res) => {
    try {
        const { courseId } = req.params;

        const course = await Course.findById(courseId);

        if (!course) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        const profile = await KnowledgeProfile.findOne({
            student: req.user.id,
            course: courseId
        });

        const attempts = await QuizAttempt.find({
            student: req.user.id,
            course: courseId
        }).sort({ createdAt: -1 });

        if (!profile) {
            return res.json({
                course: {
                    id: course._id,
                    title: course.title,
                    subject: course.subject
                },
                overallMastery: 0,
                concepts: [],
                quizAttempts: 0,
                latestScore: null
            });
        }

        const concepts = profile.concepts;

        const overallMastery =
            concepts.length > 0
                ? Math.round(
                    concepts.reduce(
                        (sum, concept) => sum + concept.mastery,
                        0
                    ) / concepts.length
                )
                : 0;

        const latestAttempt = attempts[0];

        res.json({
            course: {
                id: course._id,
                title: course.title,
                subject: course.subject
            },

            overallMastery,

            concepts: concepts.map((concept) => ({
                concept: concept.concept,
                mastery: concept.mastery,
                status: concept.status,
                questionsAttempted:
                    concept.questionsAttempted,
                questionsCorrect:
                    concept.questionsCorrect,
                lastScore: concept.lastScore
            })),

            quizAttempts: attempts.length,

            latestScore: latestAttempt
                ? latestAttempt.score
                : null
        });

    } catch (error) {

        console.error(
            "Progress error:",
            error.message
        );

        res.status(500).json({
            message: "Server error"
        });
    }
};

module.exports = {
    getProgress
}; 