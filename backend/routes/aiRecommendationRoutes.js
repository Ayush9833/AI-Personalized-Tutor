const express = require("express");

const {
    getAIRecommendation
} = require("../controllers/aiRecommendationController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
    "/:courseId",
    authMiddleware,
    getAIRecommendation
);

module.exports = router;