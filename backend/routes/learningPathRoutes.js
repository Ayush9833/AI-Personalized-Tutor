const express = require("express");

const {
    generateLearningPath,
    getLearningPath
} = require("../controllers/learningPathController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
    "/generate/:courseId",
    protect,
    generateLearningPath
);

router.get(
    "/:courseId",
    protect,
    getLearningPath
);

module.exports = router;