const express = require("express");

const {
    getRecommendation
} = require("../controllers/recommendationController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
    "/:courseId",
    protect,
    getRecommendation
);

module.exports = router;