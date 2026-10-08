const express = require("express");

const {
    createMaterial,
    getCourseMaterials
} = require("../controllers/materialController");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

// Upload material
router.post(
    "/",
    protect,
    upload.single("file"),
    createMaterial
);

// Get materials of a course
router.get(
    "/course/:courseId",
    protect,
    getCourseMaterials
);

module.exports = router;