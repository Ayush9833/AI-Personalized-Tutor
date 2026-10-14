const express = require("express");
const axios = require("axios");

const AIQuiz = require("../models/AIQuiz");
const QuizAttempt = require("../models/QuizAttempt");
const KnowledgeProfile = require("../models/KnowledgeProfile");
const LearningPath = require("../models/LearningPath");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();


// =====================================================
// GENERATE AI QUIZ
// =====================================================

router.post("/generate", authMiddleware, async (req, res) => {
    try {

        const { course_id, concept } = req.body;

        // ---------------------------------------------
        // Validate course ID
        // ---------------------------------------------

        if (!course_id) {
            return res.status(400).json({
                message: "Course ID is required"
            });
        }


        // ---------------------------------------------
        // Find student's knowledge profile
        // ---------------------------------------------

        const profile = await KnowledgeProfile.findOne({
            student: req.user.id,
            course: course_id
        });


        let selectedConcept = concept;
        let mastery = 0;


        // ---------------------------------------------
        // Automatically select weakest concept
        // ---------------------------------------------

        if (!selectedConcept) {

            if (
                profile &&
                profile.concepts &&
                profile.concepts.length > 0
            ) {

                const weakestConcept = [...profile.concepts].sort(
                    (a, b) => a.mastery - b.mastery
                )[0];

                selectedConcept = weakestConcept.concept;
                mastery = weakestConcept.mastery;

            } else {

                selectedConcept = "General";
                mastery = 0;

            }

        } else {

            // -----------------------------------------
            // If concept is manually provided
            // -----------------------------------------

            if (profile) {

                const conceptData = profile.concepts.find(
                    c => c.concept === selectedConcept
                );

                if (conceptData) {
                    mastery = conceptData.mastery;
                }

            }

        }


        // ---------------------------------------------
        // Determine difficulty from mastery
        // ---------------------------------------------

        let difficulty;

        if (mastery < 50) {

            difficulty = "easy";

        } else if (mastery < 80) {

            difficulty = "medium";

        } else {

            difficulty = "hard";

        }


        console.log("Generating AI Quiz...");
        console.log("Concept:", selectedConcept);
        console.log("Mastery:", mastery);
        console.log("Difficulty:", difficulty);


        // ---------------------------------------------
        // Call Python AI service
        // ---------------------------------------------



const response = await axios.post(
    "http://127.0.0.1:8000/generate-quiz",
    {
        course_id: String(course_id),
        concept: String(selectedConcept),
        difficulty: String(difficulty),
        number_of_questions: 5
    }
);

        const generatedQuiz = response.data;
if (
    !generatedQuiz ||
    generatedQuiz.error ||
    !Array.isArray(generatedQuiz.questions) ||
    generatedQuiz.questions.length === 0
) {
    return res.status(502).json({
        message: "AI quiz generation failed",
        error:
            generatedQuiz?.error ||
            "AI service returned no quiz questions",
        details:
            generatedQuiz?.details || null
    });
}

        console.log("PYTHON QUIZ RESPONSE:");

        console.log(
            JSON.stringify(
                generatedQuiz,
                null,
                2
            )
        );


        // ---------------------------------------------
        // Save quiz in MongoDB
        // ---------------------------------------------


        // ---------------------------------------------
        // Normalize and shuffle quiz options
        // ---------------------------------------------

        const generatedQuestions = generatedQuiz.questions;

        const normalizedQuestions = generatedQuestions.map((q) => {
            const rawOptions = Array.isArray(q.options)
                ? q.options
                : [
                    q.options?.A,
                    q.options?.B,
                    q.options?.C,
                    q.options?.D
                ];

            const sourceAnswer = String(
                q.correct_answer ?? q.correctAnswer ?? ""
            ).trim();

            const sourceLetter = ["A", "B", "C", "D"].find(
                letter =>
                    letter.toLowerCase() === sourceAnswer.toLowerCase()
            );

            // Identify the correct answer text BEFORE shuffling.
            const correctText = sourceLetter
                ? rawOptions["ABCD".indexOf(sourceLetter)]
                : sourceAnswer;

            // Fisher-Yates shuffle.
            const shuffledOptions = [...rawOptions];

            for (let i = shuffledOptions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));

                [
                    shuffledOptions[i],
                    shuffledOptions[j]
                ] = [
                    shuffledOptions[j],
                    shuffledOptions[i]
                ];
            }

            const options = {
                A: shuffledOptions[0],
                B: shuffledOptions[1],
                C: shuffledOptions[2],
                D: shuffledOptions[3]
            };

            // Recalculate the answer letter after shuffling.
            const correctAnswer = ["A", "B", "C", "D"].find(
                letter =>
                    typeof options[letter] === "string" &&
                    options[letter].trim().toLowerCase() ===
                    String(correctText).trim().toLowerCase()
            );

            return {
                question: String(q.question ?? "").trim(),
                options,
                correctAnswer: correctAnswer || "",
                concept: q.concept || selectedConcept,
                difficulty: q.difficulty || difficulty,
                explanation: String(q.explanation ?? "")
            };
        });

        // Validate normalized questions before saving.
        const invalidQuestion = normalizedQuestions.some(q =>
            !q.question ||
            !["A", "B", "C", "D"].every(
                letter =>
                    typeof q.options[letter] === "string" &&
                    q.options[letter].trim().length > 0
            ) ||
            !["A", "B", "C", "D"].includes(q.correctAnswer) ||
            new Set(
                Object.values(q.options).map(
                    option => option.trim().toLowerCase()
                )
            ).size !== 4
        );

        if (invalidQuestion) {
            return res.status(502).json({
                message: "AI generated an invalid quiz question",
                error: "Each question must have four distinct options and a valid correct answer."
            });
        }

        console.log(
            "SHUFFLED QUESTIONS:",
            JSON.stringify(normalizedQuestions, null, 2)
        );

        // ---------------------------------------------
        // Save quiz in MongoDB
        // ---------------------------------------------

        const quiz = await AIQuiz.create({
            student: req.user.id,
            course: course_id,
            concept: selectedConcept,
            difficulty: difficulty,
            questions: normalizedQuestions
        });
        // ---------------------------------------------
        // Send response
        // ---------------------------------------------

        res.json({

            message: "AI quiz generated successfully",

            quizId: quiz._id,

            courseId: course_id,

            concept: selectedConcept,

            mastery: mastery,

            difficulty: difficulty,

            questions: quiz.questions

        });


    } catch (error) {


console.error(
    "AI Quiz Generation Error:",
    JSON.stringify(
        error.response?.data ?? error.message,
        null,
        2
    )
);

        res.status(500).json({

            message: "AI quiz generation failed",

            error:
                error.response?.data ||
                error.message

        });

    }

});



// =====================================================
// SUBMIT AI QUIZ
// =====================================================

router.post(
    "/:quizId/submit",
    authMiddleware,
    async (req, res) => {

        try {

            const { quizId } = req.params;

            const { answers } = req.body;


            // -----------------------------------------
            // Find quiz
            // -----------------------------------------

            const quiz = await AIQuiz.findOne({

                _id: quizId,

                student: req.user.id

            });


            if (!quiz) {

                return res.status(404).json({

                    message: "Quiz not found"

                });

            }


            // -----------------------------------------
            // Validate answers
            // -----------------------------------------

            if (!Array.isArray(answers)) {

                return res.status(400).json({

                    message: "Answers must be an array"

                });

            }


            // -----------------------------------------
            // Calculate score
            // -----------------------------------------

            let correct = 0;

            const attemptAnswers = [];


            quiz.questions.forEach(
                (question, index) => {

                    const studentAnswer =
                        answers[index];

                    const correctAnswer =
                        question.correctAnswer;


                    const isCorrect =
                        studentAnswer ===
                        correctAnswer;


                    if (isCorrect) {
                        correct++;
                    }


                    attemptAnswers.push({

                        questionIndex: index,

                        selectedAnswer:
                            studentAnswer,

                        correctAnswer:
                            correctAnswer,

                        isCorrect:
                            isCorrect

                    });

                }
            );


            const totalQuestions =
                quiz.questions.length;


            const percentage =
                totalQuestions > 0
                    ? (correct / totalQuestions) * 100
                    : 0;


            console.log(
                "QUIZ SCORE:",
                percentage
            );


            // -----------------------------------------
            // Save quiz attempt
            // -----------------------------------------

            const attempt =
                await QuizAttempt.create({

                    student:
                        req.user.id,

                    course:
                        quiz.course,

                    quizId:
                        quiz._id,

                    totalQuestions:
                        totalQuestions,

                    correctAnswers:
                        correct,

                    wrongAnswers:
                        totalQuestions -
                        correct,

                    score:
                        percentage,

                    answers:
                        attemptAnswers

                });


            // -----------------------------------------
            // Find knowledge profile
            // -----------------------------------------

            let profile =
                await KnowledgeProfile.findOne({

                    student:
                        req.user.id,

                    course:
                        quiz.course

                });


            // -----------------------------------------
            // Create profile if missing
            // -----------------------------------------

            if (!profile) {

                profile =
                    await KnowledgeProfile.create({

                        student:
                            req.user.id,

                        course:
                            quiz.course,

                        concepts:
                            []

                    });

            }


            // -----------------------------------------
            // Find concept
            // -----------------------------------------

            let conceptData =
                profile.concepts.find(
                    c =>
                        c.concept ===
                        quiz.concept
                );


            // -----------------------------------------
            // Create concept if missing
            // -----------------------------------------

            if (!conceptData) {

                profile.concepts.push({

                    concept:
                        quiz.concept,

                    mastery:
                        0,

                    questionsAttempted:
                        0,

                    questionsCorrect:
                        0,

                    lastScore:
                        0,

                    status:
                        "weak"

                });


                conceptData =
                    profile.concepts[
                        profile.concepts.length - 1
                    ];

            }


            // -----------------------------------------
            // Update statistics
            // -----------------------------------------

            conceptData.questionsAttempted +=
                totalQuestions;


            conceptData.questionsCorrect +=
                correct;


            conceptData.lastScore =
                percentage;


            // -----------------------------------------
            // Calculate mastery
            // -----------------------------------------

            if (
                conceptData.questionsAttempted >
                0
            ) {

                conceptData.mastery =
                    (
                        conceptData.questionsCorrect /
                        conceptData.questionsAttempted
                    ) * 100;

            } else {

                conceptData.mastery = 0;

            }


            // -----------------------------------------
            // Update mastery status
            // -----------------------------------------

            if (
                conceptData.mastery >= 80
            ) {

                conceptData.status =
                    "mastered";

            } else if (
                conceptData.mastery >= 40
            ) {

                conceptData.status =
                    "learning";

            } else {

                conceptData.status =
                    "weak";

            }


            // -----------------------------------------
            // Save knowledge profile
            // -----------------------------------------

            await profile.save();


            console.log(
                "KNOWLEDGE PROFILE UPDATED"
            );

            console.log(
                "Concept:",
                quiz.concept
            );

            console.log(
                "Mastery:",
                conceptData.mastery
            );

            console.log(
                "Status:",
                conceptData.status
            );


            // =================================================
            // UPDATE LEARNING PATH
            // =================================================
const learningPath =
    await LearningPath.findOne({

        student:
            req.user.id,

        course:
            quiz.course,

        concept:
            quiz.concept

    });

            if (learningPath) {

                console.log(
                    "LEARNING PATH FOUND:",
                    learningPath._id.toString()
                );


                // -----------------------------------------
                // Update mastery and status
                // -----------------------------------------

                learningPath.mastery =
                    conceptData.mastery;


                learningPath.status =
                    conceptData.status;


                // =================================================
                // ADAPTIVE LEARNING LOGIC
                // =================================================

                learningPath.steps.forEach(
                    step => {


                        // -------------------------------------
                        // LEARN STEP
                        // -------------------------------------

                        if (
                            step.type === "learn"
                        ) {

                            if (
                                percentage >= 40
                            ) {

                                step.completed =
                                    true;

                            }

                        }


                        // -------------------------------------
                        // PRACTICE STEP
                        // -------------------------------------

                        if (
                            step.type === "practice"
                        ) {

                            if (
                                percentage >= 40
                            ) {

                                step.completed =
                                    true;

                            }

                        }


                        // -------------------------------------
                        // QUIZ STEP
                        // -------------------------------------

                        if (
                            step.type === "quiz"
                        ) {

                            if (
                                percentage >= 80
                            ) {

                                step.completed =
                                    true;

                            } else {

                                step.completed =
                                    false;

                            }

                        }


                        // -------------------------------------
                        // REVIEW STEP
                        // -------------------------------------

                        if (
                            step.type === "review"
                        ) {

                            if (
                                percentage < 80
                            ) {

                                step.completed =
                                    false;

                            } else {

                                step.completed =
                                    true;

                            }

                        }


                        // -------------------------------------
                        // RETEST STEP
                        // -------------------------------------

                        if (
                            step.type === "retest"
                        ) {

                            if (
                                percentage < 80
                            ) {

                                step.completed =
                                    false;

                            } else {

                                step.completed =
                                    true;

                            }

                        }

                    }
                );


                // -----------------------------------------
                // Save Learning Path
                // -----------------------------------------

                await learningPath.save();


                console.log(
                    "LEARNING PATH UPDATED:",
                    learningPath._id.toString()
                );


                console.log(
                    "LEARNING PATH MASTERY:",
                    learningPath.mastery
                );


                console.log(
                    "LEARNING PATH STATUS:",
                    learningPath.status
                );


                console.log(
                    "LEARNING PATH QUIZ SCORE:",
                    percentage
                );

            } else {

                console.log(
                    "NO LEARNING PATH FOUND"
                );

            }


            // =================================================
            // FINAL RESPONSE
            // =================================================

            res.json({

                message:
                    "Quiz submitted successfully",

                attemptId:
                    attempt._id,

                concept:
                    quiz.concept,

                totalQuestions:
                    totalQuestions,

                correctAnswers:
                    correct,

                wrongAnswers:
                    totalQuestions -
                    correct,

                score:
                    percentage,

                mastery:
                    conceptData.mastery,

                status:
                    conceptData.status,

                answers:
                    attemptAnswers

            });


        } catch (error) {

            console.error(
                "AI Quiz Submission Error:",
                error
            );


            res.status(500).json({

                message:
                    "Quiz submission failed",

                error:
                    error.message

            });

        }

    }
);


module.exports = router;