const express = require("express");

const {
    getKnowledgeProfile
} = require("../controllers/knowledgeProfileController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/:courseId", protect, getKnowledgeProfile);

module.exports = router;