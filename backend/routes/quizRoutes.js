const express = require("express");

const {
    createQuiz,
    getCourseQuizzes,
    getQuizById,
    getAdaptiveQuestions
} = require("../controllers/quizController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Create a quiz
router.post("/", authMiddleware, createQuiz);

// Get all quizzes of a course
router.get(
    "/course/:courseId",
    authMiddleware,
    getCourseQuizzes
);

// Get adaptive questions
router.get(
    "/adaptive/questions",
    authMiddleware,
    getAdaptiveQuestions
);

// Get one quiz
router.get(
    "/:id",
    authMiddleware,
    getQuizById
);

module.exports = router;