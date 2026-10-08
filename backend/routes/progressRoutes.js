const express = require("express");

const {
    getProgress
} = require("../controllers/progressController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
    "/:courseId",
    protect,
    getProgress
);

module.exports = router;