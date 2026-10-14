const express = require("express");
const axios = require("axios");

const KnowledgeProfile = require("../models/KnowledgeProfile");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();


// =====================================================
// AI TUTOR - ASK QUESTION
// =====================================================

router.post("/ask", authMiddleware, async (req, res) => {

    try {

        const { question, course_id } = req.body;


        // -------------------------------------------------
        // Validate question
        // -------------------------------------------------

        if (!question) {

            return res.status(400).json({
                message: "Question is required"
            });

        }


        // -------------------------------------------------
        // Validate course
        // -------------------------------------------------

        if (!course_id) {

            return res.status(400).json({
                message: "Course ID is required"
            });

        }


        // -------------------------------------------------
        // Get student's knowledge profile
        // -------------------------------------------------

        const profile = await KnowledgeProfile.findOne({

            student: req.user.id,

            course: course_id

        });


        // -------------------------------------------------
        // Find weakest concept
        // -------------------------------------------------

        let weakestConcept = null;


        if (
            profile &&
            profile.concepts &&
            profile.concepts.length > 0
        ) {

            weakestConcept = [...profile.concepts].sort(

                (a, b) => a.mastery - b.mastery

            )[0];

        }


        // -------------------------------------------------
        // Prepare student profile
        // -------------------------------------------------

        const studentProfile = {

            weakest_concept:
                weakestConcept
                    ? weakestConcept.concept
                    : null,

            mastery:
                weakestConcept
                    ? weakestConcept.mastery
                    : null,

            status:
                weakestConcept
                    ? weakestConcept.status
                    : null

        };


        // -------------------------------------------------
        // Send question to Python AI service
        //
        // Python /ask expects:
        // query
        // course_id
        //
        // as QUERY PARAMETERS.
        // -------------------------------------------------

        const response = await axios.get(

            "http://127.0.0.1:8000/ask",

            {
                params: {

                    query: question,

                    course_id: course_id

                }

            }

        );


        // -------------------------------------------------
        // Return AI response
        // -------------------------------------------------

        res.json({

            message: "AI response generated successfully",

            question: question,

            course_id: course_id,

            student_profile: studentProfile,

            answer: response.data.answer

        });


    } catch (error) {

        console.error(

            "AI Service Error:",

            error.response?.data ||
            error.message

        );


        res.status(500).json({

            message: "AI service failed",

            error:
                error.response?.data ||
                error.message

        });

    }

});


module.exports = router;




