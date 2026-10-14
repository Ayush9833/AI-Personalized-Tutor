# LearningHUB — Live frontend integration

This folder keeps the existing LearningHUB visual design and adds `app.js`, which connects the interface to the Express backend APIs.

## Run the frontend
1. Extract this ZIP into a folder.
2. Open the `LearningHUB` folder in VS Code.
3. Start VS Code Live Server from `index.html`.
4. Use `http://127.0.0.1:5500/` (the supplied backend CORS setting allows this origin).

## Run the Node backend
1. Open a terminal in your backend folder.
2. Install dependencies once: `npm install`
3. Create a local `.env` file (do not share it) with:
   - `MONGODB_URI=your_mongodb_connection_string`
   - `JWT_SECRET=your_long_random_secret`
   - `PORT=5000` (optional)
4. Start it with `npm start`.
5. Check `http://localhost:5000/api/health`.

## Features connected
- Register/login and logout through `/api/auth`.
- Browse/search/create courses through `/api/courses`.
- Upload PDF/PPT/PPTX study materials, view the library, and download saved files.
- Ask the AI Tutor and request topic explanations through `/api/ai/ask`.
- Take saved quizzes or request AI quizzes; save results and update mastery.
- View real quiz history, progress, recommendations, and personalized learning paths.
- Schedule, projects, saved lessons, and preferences are saved locally in this browser.

## AI service requirement
The Node backend calls a separate Python AI service at `http://127.0.0.1:8000` for AI questions, AI quiz generation, and material processing. The uploaded backend ZIP does not include that Python service. These AI actions will show a real error when the service is not running; they do not invent responses. Material files can still be saved even if AI processing is unavailable.

## Important
- Keep `.env`, database credentials, and API keys out of ZIP files and source control.
- Use the same Live Server origin `http://127.0.0.1:5500` because the backend CORS configuration is currently set to that origin.
