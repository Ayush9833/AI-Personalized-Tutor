


require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8"]);
const aiRoutes = require("./routes/aiRoutes");
const aiQuizRoutes = require("./routes/aiQuizRoutes");
const express = require("express");
const connectDB = require("./config/db");

const learningPathRoutes = require("./routes/learningPathRoutes");
const authRoutes = require("./routes/authRoutes");
const courseRoutes = require("./routes/courseRoutes");
const materialRoutes = require("./routes/materialRoutes");
const quizRoutes = require("./routes/quizRoutes");
const quizAttemptRoutes = require("./routes/quizAttemptRoutes");
const knowledgeProfileRoutes = require("./routes/knowledgeProfileRoutes");
const progressRoutes = require("./routes/progressRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const aiRecommendationRoutes = require("./routes/aiRecommendationRoutes");
const app = express();

const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Connect MongoDB
connectDB();

// Routes

app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/ai-quiz", aiQuizRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/quiz-attempts", quizAttemptRoutes);
app.use("/api/knowledge-profile", knowledgeProfileRoutes);
app.use("/api/learning-path", learningPathRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/recommendation", recommendationRoutes);
app.use("/api/ai-recommendation", aiRecommendationRoutes);



app.get("/", (req, res) => {
    res.json({
        message: "AI Personalized Tutor Backend is running"
    });
});
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "Backend is healthy"
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});