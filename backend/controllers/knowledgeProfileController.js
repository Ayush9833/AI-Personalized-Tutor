const KnowledgeProfile = require("../models/KnowledgeProfile");
const Course = require("../models/Course");

const getKnowledgeProfile = async (req, res) => {
    try {
        const { courseId } = req.params;

        const course = await Course.findById(courseId);

        if (!course) {
            return res.status(404).json({
                message: "Course not found"
            });
        }

        let profile = await KnowledgeProfile.findOne({
            student: req.user.id,
            course: courseId
        });

        if (!profile) {
            profile = await KnowledgeProfile.create({
                student: req.user.id,
                course: courseId,
                concepts: []
            });
        }

        res.json({
            profile
        });

    } catch (error) {
        console.error("Get knowledge profile error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
};

module.exports = {
    getKnowledgeProfile
};