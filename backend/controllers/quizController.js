const Quiz = require("../models/Quiz");
const Course = require("../models/Course");
const KnowledgeProfile = require("../models/KnowledgeProfile");

const { getDifficulty } = require("../utils/adaptiveDifficulty");
const { selectQuestions } = require("../utils/questionSelector");


// ==========================================
// CREATE QUIZ
// ==========================================

const createQuiz = async (req, res) => {
    try {
        const { title, course, questions } = req.body;

        if (!title || !course || !questions) {
            return res.status(400).json({
                message: "Title, course and questions are required"
            });
        }

        const existingCourse = await Course.findById(course);

        if (!existingCourse) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        const quiz = await Quiz.create({
            title,
            course,
            questions,
            createdBy: req.user.id
        });

        res.status(201).json({
            message: "Quiz created successfully",
            quiz
        });

    } catch (error) {
        console.error("Create quiz error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


// ==========================================
// GET QUIZZES FOR A COURSE
// ==========================================

const getCourseQuizzes = async (req, res) => {
    try {
        const { courseId } = req.params;

        const quizzes = await Quiz.find({
            course: courseId
        })
            .populate("course", "title subject")
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        res.json({
            quizzes
        });

    } catch (error) {
        console.error("Get quizzes error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


// ==========================================
// GET SINGLE QUIZ
// ==========================================

const getQuizById = async (req, res) => {
    try {
        const { id } = req.params;

        const quiz = await Quiz.findById(id)
            .populate("course", "title subject")
            .populate("createdBy", "name email");

        if (!quiz) {
            return res.status(404).json({
                message: "Quiz not found"
            });
        }

        res.json({
            quiz
        });

    } catch (error) {
        console.error("Get quiz error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


// ==========================================
// GET ADAPTIVE QUESTIONS
// ==========================================

const getAdaptiveQuestions = async (req, res) => {
    try {
        const { courseId, concept } = req.query;

        // Check required fields
        if (!courseId || !concept) {
            return res.status(400).json({
                message: "courseId and concept are required"
            });
        }

        // ==========================================
        // FIND STUDENT KNOWLEDGE PROFILE
        // ==========================================

        const profile = await KnowledgeProfile.findOne({
            student: req.user.id,
            course: courseId
        });

        if (!profile) {
            return res.status(404).json({
                message: "Knowledge profile not found for this course"
            });
        }

        // ==========================================
        // FIND CONCEPT
        // ==========================================

        const conceptData = profile.concepts.find(
            (item) =>
                item.concept.toLowerCase() === concept.toLowerCase()
        );

        if (!conceptData) {
            return res.status(404).json({
                message: "Concept not found in knowledge profile"
            });
        }

        // ==========================================
        // DETERMINE DIFFICULTY
        // ==========================================

        const recommendedDifficulty = getDifficulty(
            conceptData.mastery
        );

        // ==========================================
        // FIND ALL QUIZZES FOR THIS COURSE
        // ==========================================

        const quizzes = await Quiz.find({
            course: courseId
        });

        if (!quizzes || quizzes.length === 0) {
            return res.status(404).json({
                message: "No quizzes found for this course"
            });
        }

        // ==========================================
        // COMBINE QUESTIONS FROM ALL QUIZZES
        // ==========================================

        const allQuestions = quizzes.flatMap(
            (quiz) => quiz.questions
        );

        // ==========================================
        // SELECT ADAPTIVE QUESTIONS
        // ==========================================

        const questions = selectQuestions(
            allQuestions,
            concept,
            recommendedDifficulty,
            5
        );

        if (questions.length === 0) {
            return res.status(404).json({
                message: "No questions found for this concept"
            });
        }

        // ==========================================
        // REMOVE CORRECT ANSWER
        // ==========================================

        const safeQuestions = questions.map((question) => ({
            _id: question._id,
            question: question.question,
            options: question.options,
            concept: question.concept,
            difficulty: question.difficulty,
            marks: question.marks
        }));

        // ==========================================
        // RESPONSE
        // ==========================================

        res.json({
            message: "Adaptive questions generated successfully",
            concept: conceptData.concept,
            mastery: conceptData.mastery,
            status: conceptData.status,
            recommendedDifficulty,
            questions: safeQuestions
        });

    } catch (error) {
        console.error(
            "Adaptive question error:",
            error.message
        );

        res.status(500).json({
            message: "Server error"
        });
    }
};


// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    createQuiz,
    getCourseQuizzes,
    getQuizById,
    getAdaptiveQuestions
};