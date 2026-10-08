const Course = require("../models/Course");

// CREATE COURSE
const createCourse = async (req, res) => {
    try {
        const { title, description, subject, syllabus, instructor } = req.body;

        if (!title || !subject) {
            return res.status(400).json({
                message: "Title and subject are required"
            });
        }

        const course = await Course.create({
            title,
            description,
            subject,
            syllabus,
            instructor,
            createdBy: req.user.id
        });

        res.status(201).json({
            message: "Course created successfully",
            course
        });

    } catch (error) {
        console.error("Create course error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


// GET ALL COURSES
const getCourses = async (req, res) => {
    try {
        const courses = await Course.find()
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        res.json({
            courses
        });

    } catch (error) {
        console.error("Get courses error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


// GET SINGLE COURSE
const getCourseById = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id)
            .populate("createdBy", "name email");

        if (!course) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        res.json({
            course
        });

    } catch (error) {
        console.error("Get course error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


// UPDATE COURSE
const updateCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);

        if (!course) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        course.title = req.body.title ?? course.title;
        course.description = req.body.description ?? course.description;
        course.subject = req.body.subject ?? course.subject;
        course.syllabus = req.body.syllabus ?? course.syllabus;
        course.instructor = req.body.instructor ?? course.instructor;

        const updatedCourse = await course.save();

        res.json({
            message: "Course updated successfully",
            course: updatedCourse
        });

    } catch (error) {
        console.error("Update course error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


// DELETE COURSE
const deleteCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);

        if (!course) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        await course.deleteOne();

        res.json({
            message: "Course deleted successfully"
        });

    } catch (error) {
        console.error("Delete course error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


module.exports = {
    createCourse,
    getCourses,
    getCourseById,
    updateCourse,
    deleteCourse
};