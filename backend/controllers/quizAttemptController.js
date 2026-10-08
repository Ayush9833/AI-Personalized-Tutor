const QuizAttempt = require("../models/QuizAttempt");
const KnowledgeProfile = require("../models/KnowledgeProfile");
const Course = require("../models/Course");

const updateKnowledgeProfile = async (studentId, courseId, answers) => {
    // Find existing knowledge profile
    let profile = await KnowledgeProfile.findOne({
        student: studentId,
        course: courseId
    });

    // Create profile if it doesn't exist
    if (!profile) {
        profile = await KnowledgeProfile.create({
            student: studentId,
            course: courseId,
            concepts: []
        });
    }

    // Group answers by concept
    const conceptStats = {};

    answers.forEach((answer) => {
        const concept = answer.concept || "General";

        if (!conceptStats[concept]) {
            conceptStats[concept] = {
                attempted: 0,
                correct: 0
            };
        }

        conceptStats[concept].attempted++;

        if (answer.isCorrect) {
            conceptStats[concept].correct++;
        }
    });

    // Update each concept
    for (const conceptName of Object.keys(conceptStats)) {
        const stats = conceptStats[conceptName];

        const score = Math.round(
            (stats.correct / stats.attempted) * 100
        );

        let status;

        if (score < 40) {
            status = "weak";
        } else if (score < 80) {
            status = "learning";
        } else {
            status = "mastered";
        }

        // Check whether concept already exists
        const existingConcept = profile.concepts.find(
    (concept) => concept.concept === conceptName
);
        if (existingConcept) {
            existingConcept.questionsAttempted += stats.attempted;
            existingConcept.questionsCorrect += stats.correct;
            existingConcept.lastScore = score;
            existingConcept.mastery = score;
            existingConcept.status = status;
        } else {
            profile.concepts.push({
                 concept: conceptName,
                mastery: score,
                questionsAttempted: stats.attempted,
                questionsCorrect: stats.correct,
                lastScore: score,
                status
            });
        }
    }

    await profile.save();

    return profile;
};


const submitQuizAttempt = async (req, res) => {
    try {
       const { course, quizId, answers } = req.body || {};

        if (!course || !quizId || !answers) {
            return res.status(400).json({
                message: "Course, quizId and answers are required"
            });
        }

        // Check course exists
        const existingCourse = await Course.findById(course);

        if (!existingCourse) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        let correctAnswers = 0;

        answers.forEach((answer) => {
            if (answer.isCorrect) {
                correctAnswers++;
            }
        });

        const totalQuestions = answers.length;

        const wrongAnswers =
            totalQuestions - correctAnswers;

        const score =
            totalQuestions > 0
                ? Math.round(
                    (correctAnswers / totalQuestions) * 100
                )
                : 0;

        // Save quiz attempt
        const attempt = await QuizAttempt.create({
            student: req.user.id,
            course,
            quizId,
            totalQuestions,
            correctAnswers,
            wrongAnswers,
            score,
            answers
        });

        // Update knowledge profile
        const knowledgeProfile = await updateKnowledgeProfile(
            req.user.id,
            course,
            answers
        );

        res.status(201).json({
            message: "Quiz submitted successfully",

            result: {
                totalQuestions,
                correctAnswers,
                wrongAnswers,
                score
            },

            knowledgeProfile,

            attempt
        });

    } catch (error) {
        console.error(
            "Quiz attempt error:",
            error.message
        );

        res.status(500).json({
            message: "Server error"
        });
    }
};


const getQuizAttempts = async (req, res) => {
    try {
        const attempts = await QuizAttempt.find({
            student: req.user.id
        })
            .populate("course", "title subject")
            .sort({ createdAt: -1 });

        res.json({
            attempts
        });

    } catch (error) {
        console.error(
            "Get quiz attempts error:",
            error.message
        );

        res.status(500).json({
            message: "Server error"
        });
    }
};


module.exports = {
    submitQuizAttempt,
    getQuizAttempts
};