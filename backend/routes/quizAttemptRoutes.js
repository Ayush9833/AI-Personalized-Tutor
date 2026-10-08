const express = require("express");

const {
    submitQuizAttempt,
    getQuizAttempts
} = require("../controllers/quizAttemptController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
    "/",
    protect,
    submitQuizAttempt
);

router.get(
    "/",
    protect,
    getQuizAttempts
);

module.exports = router;