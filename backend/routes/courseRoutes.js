const express = require("express");

const {
    createCourse,
    getCourses,
    getCourseById,
    updateCourse,
    deleteCourse
} = require("../controllers/courseController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

// Create a course
router.post("/", protect, createCourse);

// Get all courses
router.get("/", protect, getCourses);

// Get one course
router.get("/:id", protect, getCourseById);

// Update course
router.put("/:id", protect, updateCourse);

// Delete course
router.delete("/:id", protect, deleteCourse);

module.exports = router;