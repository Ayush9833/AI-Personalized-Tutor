const LearningPath = require("../models/LearningPath");
const KnowledgeProfile = require("../models/KnowledgeProfile");
const Course = require("../models/Course");

// =====================================================
// GENERATE LEARNING PATH
// =====================================================

const generateLearningPath = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { concept } = req.query;

        // Check course
        const course = await Course.findById(courseId);

        if (!course) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        // Get knowledge profile
        const profile = await KnowledgeProfile.findOne({
            student: req.user.id,
            course: courseId
        });

        if (!profile || profile.concepts.length === 0) {
            return res.status(400).json({
                message:
                    "Knowledge profile is empty. Attempt a quiz first."
            });
        }

        // =====================================================
        // SELECT CONCEPT
        // =====================================================

        let selectedConcept;

        // If concept is provided in query parameter,
        // use that specific concept
        if (concept) {
            selectedConcept = profile.concepts.find(
                c => c.concept === concept
            );

            if (!selectedConcept) {
                return res.status(404).json({
                    message:
                        `Concept "${concept}" not found in knowledge profile`
                });
            }
        }

        // Otherwise automatically select weakest concept
        else {
            selectedConcept = [...profile.concepts].sort(
                (a, b) => a.mastery - b.mastery
            )[0];
        }

        console.log(
            "Generating learning path for:",
            selectedConcept.concept
        );

        console.log(
            "Mastery:",
            selectedConcept.mastery
        );

        console.log(
            "Status:",
            selectedConcept.status
        );

        // =====================================================
        // FIND EXISTING PATH FOR THIS SPECIFIC CONCEPT
        // =====================================================

        let learningPath = await LearningPath.findOne({
            student: req.user.id,
            course: courseId,
            concept: selectedConcept.concept
        });

        // =====================================================
        // CREATE PERSONALIZED STEPS
        // =====================================================

        const steps = [
            {
                order: 1,
                title:
                    `Learn ${selectedConcept.concept} Fundamentals`,
                type: "learn",
                description:
                    `Study the fundamental concepts of ${selectedConcept.concept}.`,
                completed: false
            },

            {
                order: 2,
                title:
                    `Practice ${selectedConcept.concept}`,
                type: "practice",
                description:
                    `Solve basic practice questions related to ${selectedConcept.concept}.`,
                completed: false
            },

            {
                order: 3,
                title:
                    `${selectedConcept.concept} Quiz`,
                type: "quiz",
                description:
                    "Attempt a basic quiz to test your understanding.",
                completed: false
            },

            {
                order: 4,
                title:
                    "Review Mistakes",
                type: "review",
                description:
                    "Review incorrect answers and understand your mistakes.",
                completed: false
            },

            {
                order: 5,
                title:
                    `${selectedConcept.concept} Retest`,
                type: "retest",
                description:
                    "Take another quiz to measure improvement in mastery.",
                completed: false
            }
        ];

        // =====================================================
        // UPDATE EXISTING PATH
        // =====================================================

        if (learningPath) {

            learningPath.mastery =
                selectedConcept.mastery;

            learningPath.status =
                selectedConcept.status;

            learningPath.steps =
                steps;

            await learningPath.save();

            console.log(
                "Existing learning path updated:",
                learningPath._id.toString()
            );
        }

        // =====================================================
        // CREATE NEW PATH
        // =====================================================

        else {

            learningPath =
                await LearningPath.create({
                    student:
                        req.user.id,

                    course:
                        courseId,

                    concept:
                        selectedConcept.concept,

                    mastery:
                        selectedConcept.mastery,

                    status:
                        selectedConcept.status,

                    steps:
                        steps
                });

            console.log(
                "New learning path created:",
                learningPath._id.toString()
            );
        }

        // =====================================================
        // RESPONSE
        // =====================================================

        res.status(200).json({
            message:
                "Personalized learning path generated",

            course: {
                id:
                    course._id,

                title:
                    course.title,

                subject:
                    course.subject
            },

            learningPath
        });

    } catch (error) {

        console.error(
            "Learning path error:",
            error.message
        );

        res.status(500).json({
            message:
                "Server error"
        });
    }
};


// =====================================================
// GET LEARNING PATH
// =====================================================

const getLearningPath = async (req, res) => {

    try {

        const { courseId } = req.params;
        const { concept } = req.query;

        // Build query
        const query = {
            student: req.user.id,
            course: courseId
        };

        // If concept is provided,
        // return that specific concept's path
        if (concept) {
            query.concept = concept;
        }

        const learningPath =
            await LearningPath.findOne(query)
                .populate(
                    "course",
                    "title subject"
                );

        if (!learningPath) {

            return res.status(404).json({
                message:
                    "Learning path not found"
            });

        }

        res.json({
            learningPath
        });

    } catch (error) {

        console.error(
            "Get learning path error:",
            error.message
        );

        res.status(500).json({
            message:
                "Server error"
        });
    }
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
    generateLearningPath,
    getLearningPath
};