const Material = require("../models/Material");
const Course = require("../models/Course");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

// CREATE MATERIAL
const createMaterial = async (req, res) => {
    try {
        const { course, title } = req.body;

        if (!course || !title) {
            return res.status(400).json({
                message: "Course and title are required"
            });
        }

        // Check whether course exists
        const existingCourse = await Course.findById(course);

        if (!existingCourse) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        // Check whether a file was uploaded
        if (!req.file) {
            return res.status(400).json({
                message: "Please upload a file"
            });
        }

        const material = await Material.create({
            course,
            title,
            fileName: req.file.originalname,
            filePath: req.file.path,
            fileType: req.file.mimetype,
            uploadedBy: req.user.id
        });
        // Send PDF to AI service for processing
const formData = new FormData();

formData.append(
    "file",
    fs.createReadStream(req.file.path)
);

formData.append(
    "course_id",
    course.toString()
);
formData.append(
    "concept",
    title
);

const aiResponse = await axios.post(
    "http://127.0.0.1:8000/process-pdf",
    formData,
    {
        headers: formData.getHeaders()
    }
);

console.log("AI processing:", aiResponse.data);

        res.status(201).json({
            message: "Material uploaded successfully",
            material
        });

    } catch (error) {
        console.error("Upload material error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


// GET MATERIALS OF A COURSE
const getCourseMaterials = async (req, res) => {
    try {
        const { courseId } = req.params;

        const materials = await Material.find({
            course: courseId
        })
            .populate("uploadedBy", "name email")
            .sort({ createdAt: -1 });

        res.json({
            materials
        });

    } catch (error) {
        console.error("Get materials error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};


module.exports = {
    createMaterial,
    getCourseMaterials
};