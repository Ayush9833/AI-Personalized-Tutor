/* LearningHUB live integration layer
   Uses the existing Express API; no secrets are stored in this file. */
(() => {
  "use strict";
  const API = "http://localhost:5000/api";
  const TOKEN_KEY = "learninghubToken";
  const COURSE_KEY = "learninghubCourseId";
  let courses = [];
  let selectedCourseId = localStorage.getItem(COURSE_KEY) || "";
  let materials = [];
  let activeQuiz = null;
  let activeQuizMode = "";
  let quizIndexLive = 0;
  let quizAnswersLive = [];
  let chatBusy = false;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => typeof window.escapeHtml === "function"
    ? window.escapeHtml(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const token = () => localStorage.getItem(TOKEN_KEY) || "";
  const hasLogin = () => !!token();
  const getCourse = () => courses.find(c => String(c._id) === String(selectedCourseId)) || courses[0] || null;
  const courseId = () => {
    const c = getCourse();
    if (c && selectedCourseId !== String(c._id)) {
      selectedCourseId = String(c._id);
      localStorage.setItem(COURSE_KEY, selectedCourseId);
    }
    return c ? String(c._id) : "";
  };
  const localRead = key => {
    try {
      return JSON.parse(localStorage.getItem("lh_" + key) || "[]");
    } catch {
      return [];
    }
  };
  const localWrite = (key, value) => localStorage.setItem("lh_" + key, JSON.stringify(value));

  function notice(message, kind = "info") {
    let box = $("lhNotice");
    if (!box) {
      box = document.createElement("div");
      box.id = "lhNotice";
      box.style.cssText = "position:fixed;right:22px;bottom:22px;z-index:99999;max-width:420px;padding:13px 17px;border-radius:12px;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--border,#ddd);box-shadow:0 8px 30px #0002;font-size:14px";
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.style.borderColor = kind === "error"
      ? "#dc2626"
      : kind === "success"
        ? "#16a34a"
        : "var(--border,#ddd)";
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.remove(), 4800);
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token()) headers.Authorization = "Bearer " + token();

    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    let response;

    try {
      response = await fetch(API + path, { ...options, headers });
    } catch (e) {
      throw new Error(
        "Cannot reach the backend at http://localhost:5000. Start your Node.js server and try again."
      );
    }

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      const serverError = data.error;
      const message = data.message ||
        (typeof serverError === "string" ? serverError : "") ||
        `Request failed (${response.status})`;

      throw new Error(message);
    }

    return data;
  }

  function courseSelect(id = "lhCourseSelect") {
    if (!courses.length) {
      return `<p class="lh-muted">No courses found. Create a course first or check the backend.</p>`;
    }

    return `<label class="lh-label" for="${id}">Course</label>
      <select id="${id}" class="lh-input" onchange="selectLearningHubCourse(this.value)">
        ${courses.map(c => `<option value="${esc(c._id)}" ${String(c._id) === String(courseId()) ? "selected" : ""}>${esc(c.title)}${c.subject ? " · " + esc(c.subject) : ""}</option>`).join("")}
      </select>`;
  }

  window.selectLearningHubCourse = async value => {
    selectedCourseId = String(value || "");
    localStorage.setItem(COURSE_KEY, selectedCourseId);

    if (current === "library") await renderLibrary();
    else if (current === "progress") await renderProgress();
    else if (current === "home") await renderHome();
    else if (current === "learn") await renderLearn(currentTopic || "");
    else if (current === "quiz") await renderQuizPage();
    else if (current === "tutor") renderTutor(currentTopic || "");
    else if (current === "upload") await renderUpload();
  };

  function addStyles() {
    if ($("lhLiveStyles")) return;

    const style = document.createElement("style");
    style.id = "lhLiveStyles";
    style.textContent = `
      .lh-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0}
      .lh-input,.lh-select,.lh-textarea{width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid var(--border,#ddd);border-radius:11px;background:var(--panel,#fff);color:var(--text,inherit);font:inherit}
      .lh-textarea{min-height:90px;resize:vertical}
      .lh-label{display:block;font-size:12px;font-weight:750;margin:12px 0 6px;color:var(--muted,#666)}
      .lh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:15px}
      .lh-card{border:1px solid var(--border,#e5e7eb);background:var(--panel,#fff);border-radius:16px;padding:18px;min-width:0}
      .lh-card h3{margin:0 0 8px}
      .lh-muted{color:var(--muted,#6b7280);font-size:13px;line-height:1.55}
      .lh-btn{border:1px solid var(--border,#ddd);border-radius:10px;padding:10px 14px;background:var(--panel,#fff);color:var(--text,inherit);font:inherit;font-weight:700;cursor:pointer}
      .lh-btn.primary{background:#6d5ce8;border-color:#6d5ce8;color:white}
      .lh-btn:disabled{opacity:.55;cursor:wait}
      .lh-row{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
      .lh-progress{height:8px;background:var(--border,#e5e7eb);border-radius:99px;overflow:hidden;margin:10px 0}
      .lh-progress span{display:block;height:100%;background:#7c3aed}
      .lh-chat{display:flex;flex-direction:column;gap:12px;max-height:440px;overflow:auto;padding:12px 0}
      .lh-message{padding:12px 14px;border-radius:14px;max-width:92%;white-space:pre-wrap;line-height:1.55}
      .lh-message.user{align-self:flex-end;background:#ede9fe;color:#312e81}
      .lh-message.ai{align-self:flex-start;background:var(--panel,#fff);border:1px solid var(--border,#ddd)}
      .lh-option{display:block;width:100%;text-align:left;margin:8px 0;padding:12px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--panel,#fff);color:var(--text,inherit);cursor:pointer}
      .lh-option:hover{border-color:#7c3aed}
      .lh-empty{padding:18px;border:1px dashed var(--border,#ddd);border-radius:14px;color:var(--muted,#666)}
      @media(max-width:650px){.lh-message{max-width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureCoursesNav() {
    const side = $("side");
    if (!side || side.querySelector('[data-page="courses"]')) return;

    const btn = document.createElement("button");
    btn.className = "navbtn";
    btn.dataset.page = "courses";
    btn.innerHTML = '<span class="nav-icon ic-blue">📚</span><span>Courses</span>';
    btn.onclick = () => window.showWorkspace("courses");

    const learn = side.querySelector('[data-page="learn"]');

    if (learn && learn.nextSibling) {
      side.insertBefore(btn, learn.nextSibling);
    } else {
      side.appendChild(btn);
    }
  }

  function loginModal() {
    const modal = $("loginModal");
    if (!modal) return;

    authMode = "login";

    modal.innerHTML = `<div class="modalbox" style="max-width:430px">
      <button class="close" onclick="closeLogin()">×</button>
      <h2 id="lhAuthTitle">Welcome to LearningHUB</h2>
      <p class="lh-muted">Use your real account to save courses, materials, quizzes and progress.</p>
      <div id="lhRegisterNameWrap" style="display:none">
        <label class="lh-label" for="lhAuthName">Full name</label>
        <input id="lhAuthName" class="lh-input" autocomplete="name" placeholder="Your name">
      </div>
      <label class="lh-label" for="lhAuthEmail">Email</label>
      <input id="lhAuthEmail" class="lh-input" type="email" autocomplete="email" placeholder="you@example.com">
      <label class="lh-label" for="lhAuthPassword">Password</label>
      <input id="lhAuthPassword" class="lh-input" type="password" autocomplete="current-password" placeholder="Password">
      <p id="lhAuthError" style="color:#dc2626;font-size:13px;min-height:16px"></p>
      <button class="primary" id="lhAuthSubmit" style="width:100%" onclick="submitLearningHubAuth()">Log in</button>
      <p style="text-align:center;font-size:13px">New here? <button class="lh-btn" onclick="toggleLearningHubAuth()" id="lhAuthToggle">Create account</button></p>
    </div>`;
  }

  let authMode = "login";

  window.toggleLearningHubAuth = () => {
    authMode = authMode === "login" ? "register" : "login";
    $("lhAuthTitle").textContent = authMode === "login" ? "Welcome back" : "Create your account";
    $("lhRegisterNameWrap").style.display = authMode === "register" ? "block" : "none";
    $("lhAuthSubmit").textContent = authMode === "login" ? "Log in" : "Create account";
    $("lhAuthToggle").textContent = authMode === "login" ? "Create account" : "Back to login";
    $("lhAuthError").textContent = "";
  };

  window.submitLearningHubAuth = async () => {
    const email = $("lhAuthEmail")?.value.trim();
    const password = $("lhAuthPassword")?.value;
    const name = $("lhAuthName")?.value.trim();
    const err = $("lhAuthError");

    if (!email || !password || (authMode === "register" && !name)) {
      err.textContent = "Please fill in all required fields.";
      return;
    }

    const btn = $("lhAuthSubmit");
    btn.disabled = true;
    btn.textContent = "Please wait…";
    err.textContent = "";

    try {
      if (authMode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password })
        });

        const result = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });

        localStorage.setItem(TOKEN_KEY, result.token);
        localStorage.setItem("learninghubUser", JSON.stringify(result.user));
      } else {
        const result = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });

        localStorage.setItem(TOKEN_KEY, result.token);
        localStorage.setItem("learninghubUser", JSON.stringify(result.user));
      }

      logged = true;
      closeLogin();
      updateAccountButton();
      await loadCourses();
      window.showWorkspace("home");
      notice("You are signed in. Your LearningHUB data is now connected.", "success");
    } catch (e) {
      err.textContent = e.message;
    } finally {
      if ($("lhAuthSubmit")) {
        btn.disabled = false;
        btn.textContent = authMode === "login" ? "Log in" : "Create account";
      }
    }
  };

  window.logoutLearningHub = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("learninghubUser");
    logged = false;
    courses = [];
    selectedCourseId = "";
    localStorage.removeItem(COURSE_KEY);
    updateAccountButton();
    notice("You have been logged out.");
    window.showWorkspace("home");
  };

  function updateAccountButton() {
    const btn = $("loginBtn");
    if (!btn) return;

    if (hasLogin()) {
      btn.textContent = "Log out";
      btn.onclick = window.logoutLearningHub;
    } else {
      btn.textContent = "Log in";
      btn.onclick = window.openLogin;
    }
  }

  window.openLogin = () => {
    loginModal();
    $("loginModal").classList.add("show");
  };

  window.closeLogin = () => {
    $("loginModal")?.classList.remove("show");
  };

  async function loadCourses() {
    if (!hasLogin()) {
      courses = [];
      return;
    }

    try {
      const data = await api("/courses");
      courses = Array.isArray(data.courses) ? data.courses : [];

      if (!courses.some(c => String(c._id) === String(selectedCourseId))) {
        selectedCourseId = courses[0] ? String(courses[0]._id) : "";
      }

      if (selectedCourseId) {
        localStorage.setItem(COURSE_KEY, selectedCourseId);
      }
    } catch (e) {
      courses = [];
      notice(e.message, "error");
    }
  }

  function noAuth(what = "this feature") {
    return `<div class="lh-empty">
      <b>Log in to use ${esc(what)}.</b>
      <p class="lh-muted">Your account is needed to save and retrieve your personal learning data.</p>
      <button class="lh-btn primary" onclick="openLogin()">Log in / create account</button>
    </div>`;
  }

  function pageTitle(title, desc) {
    return `<div class="page-title"><h1>${title}</h1><p>${desc}</p></div>`;
  }

  async function renderHome() {
    const user = (() => {
      try {
        return JSON.parse(localStorage.getItem("learninghubUser") || "{}");
      } catch {
        return {};
      }
    })();

    let courseCards = courses.length
      ? courses.slice(0, 3).map(c => `<div class="lh-card">
          <h3>${esc(c.title)}</h3>
          <p class="lh-muted">${esc(c.subject || "General")}</p>
          <p>${esc(c.description || "No description provided.")}</p>
          <button class="lh-btn primary" onclick="selectAndOpenCourse('${esc(c._id)}')">Open course</button>
        </div>`).join("")
      : `<div class="lh-empty">No courses yet. Create the first course below or check that your backend has course records.</div>`;

    setMain(`${pageTitle(`Good to see you${user.name ? ", " + esc(user.name) : ""} 👋`, "Your learning space, connected to your account and backend.")}
      <div class="big-card">
        <div class="lh-row">
          <div>
            <h2 style="margin:0 0 5px">Your courses</h2>
            <p class="lh-muted">Choose a course to upload notes, ask the tutor and track progress.</p>
          </div>
          <button class="lh-btn primary" onclick="showWorkspace('courses')">Browse all courses</button>
        </div>
        <div class="lh-grid">${courseCards}</div>
      </div>
      <div class="lh-grid">
        <div class="lh-card">
          <h3>📄 Study materials</h3>
          <p class="lh-muted">Upload PDF or PowerPoint files to a course and see them in your library.</p>
          <button class="lh-btn" onclick="showWorkspace('upload')">Upload material</button>
        </div>
        <div class="lh-card">
          <h3>🎓 AI Tutor</h3>
          <p class="lh-muted">Ask questions using the selected course as context. Requires the Python AI service.</p>
          <button class="lh-btn" onclick="showWorkspace('tutor',currentTopic)">Ask the tutor</button>
        </div>
        <div class="lh-card">
          <h3>📈 Progress</h3>
          <p class="lh-muted">Review real quiz attempts and concept mastery saved in your account.</p>
          <button class="lh-btn" onclick="showWorkspace('progress')">View progress</button>
        </div>
      </div>`);
  }

  window.selectAndOpenCourse = async id => {
    selectedCourseId = String(id);
    localStorage.setItem(COURSE_KEY, selectedCourseId);
    window.showWorkspace("courseDetail");
  };

  async function renderCourses() {
    if (!hasLogin()) {
      setMain(pageTitle("📚 Courses", "Browse and create courses.") + noAuth("courses"));
      return;
    }

    setMain(`${pageTitle("📚 Courses", "Browse your real course catalogue and open a course to access materials, quizzes and progress.")}
      <div class="big-card">
        <div class="lh-row">
          <input id="lhCourseSearch" class="lh-input" style="max-width:420px" placeholder="Search title, subject or description…" oninput="filterLearningHubCourses(this.value)">
          <button class="lh-btn primary" onclick="toggleCourseCreate()">＋ Create course</button>
        </div>
        <div id="lhCourseCreate" style="display:none;margin-top:14px">
          <h3>Create a course</h3>
          <label class="lh-label">Title *</label>
          <input id="lhNewCourseTitle" class="lh-input" placeholder="e.g. Data Structures">
          <label class="lh-label">Subject *</label>
          <input id="lhNewCourseSubject" class="lh-input" placeholder="e.g. Computer Science">
          <label class="lh-label">Description</label>
          <textarea id="lhNewCourseDescription" class="lh-textarea" placeholder="What will students learn?"></textarea>
          <label class="lh-label">Syllabus</label>
          <textarea id="lhNewCourseSyllabus" class="lh-textarea" placeholder="Topics covered"></textarea>
          <div class="lh-toolbar">
            <button class="lh-btn primary" onclick="createLearningHubCourse()">Save course</button>
            <button class="lh-btn" onclick="toggleCourseCreate()">Cancel</button>
          </div>
          <p class="lh-muted">This calls the backend's authenticated POST /api/courses endpoint.</p>
        </div>
        <div id="lhCourseGrid" class="lh-grid">${courseCardsMarkup(courses)}</div>
      </div>`);
  }

  function courseCardsMarkup(list) {
    if (!list.length) {
      return `<div class="lh-empty">No matching courses. Try another search or create a course.</div>`;
    }

    return list.map(c => `<div class="lh-card">
      <div class="lh-row">
        <span class="badge badge-blue">${esc(c.subject || "General")}</span>
        <span class="lh-muted">${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}</span>
      </div>
      <h3 style="margin-top:12px">${esc(c.title)}</h3>
      <p class="lh-muted">${esc(c.description || "No description added yet.")}</p>
      <div class="lh-toolbar">
        <button class="lh-btn primary" onclick="selectAndOpenCourse('${esc(c._id)}')">Open course</button>
        <button class="lh-btn" onclick="startCourseTutor('${esc(c._id)}')">Ask tutor</button>
      </div>
    </div>`).join("");
  }

  window.filterLearningHubCourses = value => {
    const grid = $("lhCourseGrid");
    if (grid) {
      grid.innerHTML = courseCardsMarkup(
        courses.filter(c => (c.title + " " + (c.subject || "") + " " + (c.description || "")).toLowerCase().includes(String(value).toLowerCase()))
      );
    }
  };

  window.toggleCourseCreate = () => {
    const el = $("lhCourseCreate");
    if (el) el.style.display = el.style.display === "none" ? "block" : "none";
  };

  window.createLearningHubCourse = async () => {
    try {
      const title = $("lhNewCourseTitle").value.trim();
      const subject = $("lhNewCourseSubject").value.trim();

      if (!title || !subject) {
        throw new Error("Course title and subject are required.");
      }

      const data = await api("/courses", {
        method: "POST",
        body: JSON.stringify({
          title,
          subject,
          description: $("lhNewCourseDescription").value.trim(),
          syllabus: $("lhNewCourseSyllabus").value.trim()
        })
      });

      await loadCourses();
      selectedCourseId = String(data.course._id);
      localStorage.setItem(COURSE_KEY, selectedCourseId);
      await renderCourses();
      notice("Course created successfully.", "success");
    } catch (e) {
      notice(e.message, "error");
    }
  };

  window.startCourseTutor = id => {
    selectedCourseId = String(id);
    localStorage.setItem(COURSE_KEY, selectedCourseId);
    const c = getCourse();
    currentTopic = c?.title || "your course";
    window.showWorkspace("tutor", currentTopic);
  };

  window.startCourseLearn = id => {
    selectedCourseId = String(id);
    localStorage.setItem(COURSE_KEY, selectedCourseId);
    const c = getCourse();
    currentTopic = c?.title || "your course";
    window.showWorkspace("learn", currentTopic);
  };

  function setMain(html) {
    const main = $("main");
    if (main) main.innerHTML = html;
  }

  async function renderCourseDetail() {
    const c = getCourse();

    if (!c) {
      setMain(pageTitle("Course details", "Select a course.") +
        `<div class="lh-empty">No course selected. <button class="lh-btn" onclick="showWorkspace('courses')">Browse courses</button></div>`);
      return;
    }

    let mats = [];
    try {
      const d = await api(`/materials/course/${c._id}`);
      mats = d.materials || [];
    } catch {}

    let quizzes = [];
    try {
      const d = await api(`/quizzes/course/${c._id}`);
      quizzes = d.quizzes || [];
    } catch {}

    setMain(`${pageTitle("📘 " + esc(c.title), esc(c.subject || "Course") + " · " + esc(c.description || ""))}
      <div class="lh-toolbar">
        ${courseSelect()}
        <button class="lh-btn" onclick="showWorkspace('library')">Materials</button>
        <button class="lh-btn" onclick="showWorkspace('quiz')">Quizzes</button>
        <button class="lh-btn" onclick="showWorkspace('progress')">Progress</button>
      </div>
      <div class="lh-grid">
        <div class="lh-card">
          <h3>Course information</h3>
          <p class="lh-muted">${esc(c.description || "No description available.")}</p>
          <h4>Syllabus</h4>
          <p class="lh-muted">${esc(c.syllabus || "No syllabus added yet.")}</p>
          <button class="lh-btn primary" onclick="startCourseLearn('${esc(c._id)}')">Start learning</button>
        </div>
        <div class="lh-card">
          <h3>Study materials (${mats.length})</h3>
          ${mats.length ? mats.slice(0, 5).map(m => `<p>📄 ${esc(m.title)} <span class="lh-muted">· ${esc(m.fileName || "file")}</span></p>`).join("") : `<p class="lh-muted">No materials uploaded yet.</p>`}
          <button class="lh-btn" onclick="showWorkspace('upload')">＋ Upload material</button>
        </div>
        <div class="lh-card">
          <h3>Quizzes (${quizzes.length})</h3>
          ${quizzes.length ? quizzes.slice(0, 4).map(q => `<p>📝 ${esc(q.title)}</p>`).join("") : `<p class="lh-muted">No saved quizzes available. You can try AI quiz generation if the Python service is running.</p>`}
          <button class="lh-btn" onclick="showWorkspace('quiz')">Open quizzes</button>
        </div>
      </div>`);
  }

  async function renderLearn(topic) {
    const c = getCourse();
    const t = String(topic || "").trim() || "your selected topic";

    setMain(`${pageTitle("Learn with LearningHUB", `Study a topic using the selected course: ${esc(c ? c.title : "No course selected")}.`)}
      <div class="big-card">
        ${courses.length ? courseSelect() : ""}
        <label class="lh-label">What do you want to learn?</label>
        <input id="lhLearnTopic" class="lh-input" value="${esc(t)}" placeholder="Enter a topic or question">
        <div class="lh-toolbar">
          <button class="lh-btn primary" onclick="explainLearningTopic()">Generate explanation with AI</button>
          <button class="lh-btn" onclick="saveCurrentLesson()">🔖 Save topic</button>
          <button class="lh-btn" onclick="showWorkspace('tutor',document.getElementById('lhLearnTopic').value)">Ask tutor</button>
        </div>
        <div id="lhLearnResult" class="lh-card">
          <p class="lh-muted">Your explanation will appear here when the backend and Python AI service are running.</p>
        </div>
      </div>
      <div class="lh-card" style="margin-top:14px">
        <h3>Available course materials</h3>
        <div id="lhLearnMaterials" class="lh-muted">Loading…</div>
      </div>`);

    if (c) {
      try {
        const d = await api(`/materials/course/${c._id}`);
        const el = $("lhLearnMaterials");
        if (el) {
          el.innerHTML = (d.materials || []).length
            ? (d.materials || []).map(m => `<p>📄 <b>${esc(m.title)}</b> — ${esc(m.fileName || "")}</p>`).join("")
            : "No materials uploaded for this course yet.";
        }
      } catch (e) {
        const el = $("lhLearnMaterials");
        if (el) el.textContent = e.message;
      }
    }
  }

  window.explainLearningTopic = async () => {
    const q = $("lhLearnTopic")?.value.trim();

    if (!q) return notice("Enter a topic first.", "error");
    if (!courseId()) return notice("Create or select a course first.", "error");

    const box = $("lhLearnResult");
    box.innerHTML = "<p>Generating explanation…</p>";

    try {
      const d = await api("/ai/ask", {
        method: "POST",
        body: JSON.stringify({
          question: "Teach me " + q + " from the basics, with a worked example and key points.",
          course_id: courseId()
        })
      });

      box.innerHTML = `<h3>Explanation: ${esc(q)}</h3>
        <p style="white-space:pre-wrap;line-height:1.7">${esc(d.answer || "The AI service returned no answer.")}</p>
        <p class="lh-muted">Generated by the connected AI service.</p>`;
    } catch (e) {
      box.innerHTML = `<p style="color:#dc2626">${esc(e.message)}</p>
        <p class="lh-muted">Check that the Node backend and Python AI service are both running.</p>`;
    }
  };

  window.saveCurrentLesson = () => {
    const topic = $("lhLearnTopic")?.value.trim();
    if (!topic) return;

    const saved = localRead("saved");

    if (!saved.some(x => x.title === topic)) {
      saved.unshift({
        title: topic,
        course: getCourse()?.title || "",
        savedAt: new Date().toISOString()
      });
    }

    localWrite("saved", saved);
    notice("Lesson saved for later.", "success");
  };

  function renderTutor(topic) {
    const c = getCourse();

    setMain(`${pageTitle("🎓 AI Tutor", "Ask questions about your course. Replies are provided by the backend's Python AI service.")}
      <div class="big-card">
        ${courses.length ? courseSelect() : ""}
        <p class="lh-muted">Selected course: <b>${esc(c?.title || "None")}</b></p>
        <div id="lhTutorMessages" class="lh-chat">
          <div class="lh-message ai">Hi! Ask a question about ${esc(topic || c?.title || "your selected topic")}. I'll send it to the connected AI service.</div>
        </div>
        <label class="lh-label" for="lhTutorInput">Your question</label>
        <textarea id="lhTutorInput" class="lh-textarea" placeholder="Explain this topic simply…"></textarea>
        <div class="lh-toolbar">
          <button class="lh-btn primary" id="lhTutorSend" onclick="sendLiveTutorMessage()">Send question</button>
          <button class="lh-btn" onclick="document.getElementById('lhTutorInput').value='Explain '+(currentTopic||'this topic')+' from the basics with an example.'">Explain simply</button>
        </div>
        <p class="lh-muted">If the Python AI service on port 8000 is offline, the request will show a real error rather than a fake answer.</p>
      </div>`);
  }

  window.sendLiveTutorMessage = async () => {
    if (chatBusy) return;

    const input = $("lhTutorInput");
    const q = input?.value.trim();

    if (!q) return;
    if (!courseId()) return notice("Create or select a course first.", "error");

    const box = $("lhTutorMessages");
    box.insertAdjacentHTML("beforeend", `<div class="lh-message user">${esc(q)}</div>`);
    input.value = "";
    chatBusy = true;

    const btn = $("lhTutorSend");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Thinking…";
    }

    const wait = document.createElement("div");
    wait.className = "lh-message ai";
    wait.textContent = "Thinking…";
    box.appendChild(wait);
    box.scrollTop = box.scrollHeight;

    try {
      const d = await api("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: q, course_id: courseId() })
      });

      wait.textContent = d.answer || "The AI service returned an empty answer.";

      if (typeof window.speakTutor === "function") {
        window.speakTutor(wait.textContent);
      }
    } catch (e) {
      wait.textContent = "I couldn't get an AI response: " + e.message;
    } finally {
      chatBusy = false;

      if (btn) {
        btn.disabled = false;
        btn.textContent = "Send question";
      }

      box.scrollTop = box.scrollHeight;
    }
  };

  async function renderUpload() {
    setMain(`${pageTitle("＋ Add study material", "Upload a PDF or PowerPoint file to a course. Files are saved by the backend; AI processing requires the Python service.")}
      <div class="big-card">
        ${hasLogin() ? `${courseSelect()}
          <label class="lh-label" for="lhMaterialTitle">Material title</label>
          <input id="lhMaterialTitle" class="lh-input" placeholder="e.g. Unit 1 lecture notes">
          <label class="lh-label" for="lhMaterialFile">Choose PDF, PPT or PPTX (max 20 MB)</label>
          <input id="lhMaterialFile" class="lh-input" type="file" accept=".pdf,.ppt,.pptx">
          <div id="lhUploadStatus" class="lh-muted" style="margin-top:10px"></div>
          <div class="lh-toolbar">
            <button class="lh-btn primary" onclick="uploadLearningHubMaterial()">Upload material</button>
            <button class="lh-btn" onclick="showWorkspace('library')">View library</button>
          </div>` : noAuth("material uploads")}
      </div>`);
  }

  window.uploadLearningHubMaterial = async () => {
    const file = $("lhMaterialFile")?.files?.[0];
    const title = $("lhMaterialTitle")?.value.trim();
    const box = $("lhUploadStatus");

    try {
      if (!courseId()) throw new Error("Create or select a course first.");
      if (!file || !title) throw new Error("Choose a file and enter a title.");
      if (!/\.(pdf|ppt|pptx)$/i.test(file.name)) throw new Error("The backend only accepts PDF, PPT and PPTX files.");
      if (file.size > 20 * 1024 * 1024) throw new Error("File must be 20 MB or smaller.");

      const form = new FormData();
      form.append("file", file);
      form.append("course", courseId());
      form.append("title", title);

      if (box) box.textContent = "Uploading…";

      const d = await api("/materials", { method: "POST", body: form });

      if (box) {
        box.textContent = (d.message || "Upload completed.") +
          (d.aiProcessingMessage ? " " + d.aiProcessingMessage : "");
      }

      notice("Material uploaded successfully.", "success");
      file.value = "";
      $("lhMaterialTitle").value = title;
    } catch (e) {
      if (box) box.textContent = e.message;
      notice(e.message, "error");
    }
  };

  async function renderLibrary() {
    const c = getCourse();

    if (!hasLogin()) {
      setMain(pageTitle("▣ Library", "Your course materials.") + noAuth("your library"));
      return;
    }

    setMain(`${pageTitle("▣ Library", "Real materials stored for your selected course.")}
      <div class="big-card">
        ${courseSelect()}
        <div id="lhMaterialsList" class="lh-grid"><div class="lh-empty">Loading materials…</div></div>
        <div class="lh-toolbar">
          <button class="lh-btn primary" onclick="showWorkspace('upload')">＋ Upload material</button>
        </div>
      </div>`);

    if (!c) return;

    try {
      const d = await api(`/materials/course/${c._id}`);
      materials = d.materials || [];

      const el = $("lhMaterialsList");

      if (el) {
        el.innerHTML = materials.length
          ? materials.map(m => `<div class="lh-card">
              <h3>📄 ${esc(m.title)}</h3>
              <p class="lh-muted">${esc(m.fileName || "Uploaded file")}</p>
              <p class="lh-muted">${m.createdAt ? new Date(m.createdAt).toLocaleString() : ""} ${m.uploadedBy?.name ? "· by " + esc(m.uploadedBy.name) : ""}</p>
              <span class="badge badge-blue">${esc((m.fileType || "file").split("/").pop())}</span>
              <div class="lh-toolbar">
                <button class="lh-btn primary" onclick="downloadLearningHubMaterial('${esc(m._id)}')">Download file</button>
              </div>
            </div>`).join("")
          : `<div class="lh-empty">No materials for this course yet. Upload a PDF, PPT or PPTX to begin.</div>`;
      }
    } catch (e) {
      const el = $("lhMaterialsList");
      if (el) el.innerHTML = `<div class="lh-empty">${esc(e.message)}</div>`;
    }
  }

  window.downloadLearningHubMaterial = async id => {
    try {
      const response = await fetch(
        `http://localhost:5000/api/materials/${encodeURIComponent(id)}/download`,
        { headers: token() ? { Authorization: "Bearer " + token() } : {} }
      );

      if (!response.ok) {
        let d = {};
        try {
          d = await response.json();
        } catch {}
        throw new Error(d.message || "Download failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      notice(e.message, "error");
    }
  };

  async function renderProgress() {
    if (!hasLogin()) {
      setMain(pageTitle("▥ Your progress", "Real quiz and mastery data.") + noAuth("progress tracking"));
      return;
    }

    if (!courseId()) {
      setMain(pageTitle("▥ Your progress", "Select a course.") +
        `<div class="lh-empty">Create or select a course first.</div>`);
      return;
    }

    setMain(`${pageTitle("▥ Your progress", "Progress below comes from your saved quiz attempts and knowledge profile.")}
      <div class="big-card">
        ${courseSelect()}
        <div id="lhProgressData" class="lh-grid"><div class="lh-empty">Loading your progress…</div></div>
        <div id="lhRecommendation" style="margin-top:14px"></div>
        <div class="lh-toolbar">
          <button class="lh-btn primary" onclick="generateLearningHubPath()">Generate learning path</button>
        </div>
        <div id="lhPath"></div>
      </div>`);

    try {
      const d = await api(`/progress/${courseId()}`);
      const concepts = d.concepts || [];
      const el = $("lhProgressData");

      el.innerHTML = `<div class="lh-card">
          <p class="lh-muted">Overall mastery</p>
          <h2>${Number(d.overallMastery || 0)}%</h2>
          <div class="lh-progress"><span style="width:${Number(d.overallMastery || 0)}%"></span></div>
        </div>
        <div class="lh-card">
          <p class="lh-muted">Quiz attempts</p>
          <h2>${Number(d.quizAttempts || 0)}</h2>
        </div>
        <div class="lh-card">
          <p class="lh-muted">Latest score</p>
          <h2>${d.latestScore == null ? "—" : Math.round(d.latestScore) + "%"}</h2>
        </div>
        <div class="lh-card">
          <h3>Concept mastery</h3>
          ${concepts.length ? concepts.map(x => `<p><b>${esc(x.concept)}</b> · ${Number(x.mastery || 0)}% <span class="lh-muted">(${esc(x.status || "learning")})</span></p><div class="lh-progress"><span style="width:${Number(x.mastery || 0)}%"></span></div>`).join("") : `<p class="lh-muted">No concept data yet. Complete a quiz to start tracking mastery.</p>`}
        </div>`;

      try {
        const r = await api(`/recommendation/${courseId()}`);
        const elr = $("lhRecommendation");

        if (elr) {
          elr.innerHTML = r.recommendation
            ? `<div class="lh-card">
                <h3>Next recommendation</h3>
                <p>Focus on <b>${esc(r.recommendation.concept)}</b> (${Number(r.recommendation.mastery)}% mastery).</p>
                <p class="lh-muted">${esc(r.recommendation.action || "Continue practising.")}</p>
              </div>`
            : `<div class="lh-empty">${esc(r.message || "Complete a quiz for personalized recommendations.")}</div>`;
        }
      } catch (e) {
        const elr = $("lhRecommendation");
        if (elr) elr.innerHTML = `<div class="lh-empty">${esc(e.message)}</div>`;
      }
    } catch (e) {
      const el = $("lhProgressData");
      if (el) el.innerHTML = `<div class="lh-empty">${esc(e.message)}</div>`;
    }

    try {
      const d = await api(`/learning-path/${courseId()}`);
      renderPath(d.learningPath);
    } catch {}
  }

  function renderPath(path) {
    const el = $("lhPath");
    if (!el) return;
    if (!path) {
      el.innerHTML = "";
      return;
    }

    el.innerHTML = `<div class="lh-card" style="margin-top:14px">
      <h3>Personalized learning path · ${esc(path.concept || "")}</h3>
      ${(path.steps || []).map(s => `<p>${s.completed ? "✅" : "◻"} <b>${esc(s.title)}</b> — ${esc(s.description || "")}</p>`).join("")}
    </div>`;
  }

  window.generateLearningHubPath = async () => {
    try {
      const d = await api(`/learning-path/generate/${courseId()}`, { method: "POST" });
      renderPath(d.learningPath);
      notice("Personalized learning path generated.", "success");
    } catch (e) {
      notice(e.message, "error");
    }
  };

  async function renderHistory() {
    if (!hasLogin()) {
      setMain(pageTitle("↺ History", "Your saved quiz attempts.") + noAuth("quiz history"));
      return;
    }

    setMain(`${pageTitle("↺ History", "Quiz attempts saved by your backend account.")}
      <div id="lhHistoryList" class="lh-grid"><div class="lh-empty">Loading history…</div></div>`);

    try {
      const d = await api("/quiz-attempts");
      const arr = d.attempts || [];
      const el = $("lhHistoryList");

      el.innerHTML = arr.length
        ? arr.map(a => `<div class="lh-card">
            <div class="lh-row">
              <h3>${esc(a.course?.title || "Course")}</h3>
              <span class="badge badge-blue">${Math.round(a.score || 0)}%</span>
            </div>
            <p class="lh-muted">${a.createdAt ? new Date(a.createdAt).toLocaleString() : ""} · ${a.correctAnswers || 0}/${a.totalQuestions || 0} correct</p>
            <p class="lh-muted">Quiz ID: ${esc(a.quizId || "")}</p>
          </div>`).join("")
        : `<div class="lh-empty">No quiz attempts yet. Take a quiz to see your history here.</div>`;
    } catch (e) {
      $("lhHistoryList").innerHTML = `<div class="lh-empty">${esc(e.message)}</div>`;
    }
  }

  async function renderQuizPage() {
if (!hasLogin()) {
setMain(pageTitle("📝 Quiz", "Take quizzes and save results.") + noAuth("quizzes"));
return;
}


const c = getCourse();

if (!c) {
  setMain(pageTitle("📝 Quiz", "Choose a course.") +
    `<div class="lh-empty">Create or select a course first.</div>`);
  return;
}

setMain(`${pageTitle("📝 Quiz centre", "Create a personalized quiz or continue a saved quiz.")}

  <div class="big-card">
    ${courseSelect()}

    <div class="lh-card" style="margin-top:16px;padding:24px;">
      <h2 style="margin-top:0;">🎯 Quiz Setup</h2>
      <p class="lh-muted">Customize your practice session before starting.</p>

      <div class="lh-toolbar" style="margin-top:20px;gap:12px;flex-wrap:wrap;">
        <button class="lh-btn primary" onclick="openLearningHubQuizSetup()">
          ✨ Set Up AI Quiz
        </button>
        <button class="lh-btn" onclick="loadSavedLearningHubQuizzes()">
          ↻ Refresh saved quizzes
        </button>
      </div>
    </div>

   
<div id="quizSetupModal">
  <div class="quiz-setup-card">
    <button class="close" onclick="closeLearningHubQuizSetup()" aria-label="Close">×</button>

    <h2>📝 Set up your quiz</h2>
    <p>Choose exactly how you want to practise. Personalize your next learning session.</p>

    <div class="quiz-setting">
      <label>Number of questions</label>
      <div class="quiz-options" id="quizCountOptions">
        <button type="button" class="quiz-option active" data-value="5">5</button>
        <button type="button" class="quiz-option" data-value="10">10</button>
        <button type="button" class="quiz-option" data-value="15">15</button>
        <button type="button" class="quiz-option" data-value="20">20</button>
        <button type="button" class="quiz-option" data-value="custom">Custom</button>
      </div>
      <input id="quizCustomCount" class="quiz-custom" type="number" min="1" max="20" placeholder="Enter 1–20">
      <input id="lhQuizQuestionCount" type="hidden" value="5">
    </div>

    <div class="quiz-setting">
      <label>Difficulty</label>
      <div class="quiz-options" id="quizDifficultyOptions">
        <button type="button" class="quiz-option" data-value="easy">Easy</button>
        <button type="button" class="quiz-option active" data-value="adaptive">Adaptive</button>
        <button type="button" class="quiz-option" data-value="medium">Medium</button>
        <button type="button" class="quiz-option" data-value="hard">Hard</button>
      </div>
      <input id="lhQuizDifficulty" type="hidden" value="adaptive">
    </div>

    <div class="quiz-setting">
      <label>Question type</label>
      <div class="quiz-options">
        <button type="button" class="quiz-option" disabled title="Not implemented yet">Mixed</button>
        <button type="button" class="quiz-option active">MCQ</button>
        <button type="button" class="quiz-option" disabled>Short answer</button>
        <button type="button" class="quiz-option" disabled>Numerical</button>
        <button type="button" class="quiz-option" disabled>Mock exam</button>
      </div>
      <input id="lhQuizType" type="hidden" value="mcq">
    </div>

    <div class="quiz-setting">
      <label>Focus</label>
      <div class="quiz-options" id="quizFocusOptions">
        <button type="button" class="quiz-option active" data-value="all">All topics</button>
        <button type="button" class="quiz-option" data-value="weak">Weak topics</button>
        <button type="button" class="quiz-option" data-value="specific">Specific topic</button>
      </div>
      <div id="specificTopicWrap" class="specific-topic-wrap">
        <input id="lhQuizSpecificTopic" type="text" placeholder="e.g. Data Structures">
      </div>
      <input id="lhQuizTopicFocus" type="hidden" value="all">
    </div>

    <div class="setup-note">
      Adaptive difficulty can use your mastery profile when the backend supports it.
      MCQ is currently the available question format.
    </div>

    <div class="quiz-setup-actions">
      <button class="quiz-cancel-btn" onclick="closeLearningHubQuizSetup()">Cancel</button>
      <button class="quiz-start-btn" onclick="startQuizFromLearningHubSetup()">🚀 Start Quiz</button>
    </div>
  </div>
</div>

    <div id="lhQuizList" class="lh-grid" style="margin-top:18px;">Loading quizzes…</div>
    <div id="lhQuizStage"></div>
  </div>`);

await loadSavedLearningHubQuizzes();


const modal = document.getElementById("quizSetupModal");

if (modal && modal.dataset.bound !== "yes") {
  modal.dataset.bound = "yes";

  const bindOptions = (groupId, inputId, callback) => {
    const group = document.getElementById(groupId);
    const input = document.getElementById(inputId);
    if (!group) return;

    group.querySelectorAll(".quiz-option:not(:disabled)").forEach(button => {
      button.addEventListener("click", () => {
        group.querySelectorAll(".quiz-option").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        if (input) input.value = button.dataset.value;
        if (callback) callback(button.dataset.value);
      });
    });
  };

  bindOptions("quizCountOptions", "lhQuizQuestionCount", value => {
    const custom = document.getElementById("quizCustomCount");
    custom?.classList.toggle("show", value === "custom");
    if (value === "custom") custom?.focus();
  });

  bindOptions("quizDifficultyOptions", "lhQuizDifficulty");

  bindOptions("quizFocusOptions", "lhQuizTopicFocus", value => {
    document.getElementById("specificTopicWrap")
      ?.classList.toggle("show", value === "specific");
  });
}
}

window.openLearningHubQuizSetup = () => {
  const modal = document.getElementById("quizSetupModal");
  if (modal) {
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
  }
};

window.closeLearningHubQuizSetup = () => {
  const modal = document.getElementById("quizSetupModal");
  if (modal) {
    modal.classList.remove("show");
    document.body.style.overflow = "";
  }
};



window.startQuizFromLearningHubSetup = () => {
  const focus =
    document.querySelector("#quizFocusOptions .quiz-option.active")?.dataset.value || "all";

  const topic =
    document.getElementById("lhQuizSpecificTopic")?.value.trim() || "";

  if (focus === "specific" && !topic) {
    notice("Please enter a specific topic first.", "error");
    document.getElementById("lhQuizSpecificTopic")?.focus();
    return;
  }

  window.quizSetupConcept = focus === "specific" ? topic : "";

  closeLearningHubQuizSetup();
  generateLearningHubQuiz();
};


  window.loadSavedLearningHubQuizzes = async () => {
    const el = $("lhQuizList");
    if (!el) return;

    el.innerHTML = "Loading quizzes…";

    try {
      const d = await api(`/quizzes/course/${courseId()}`);
      const qs = d.quizzes || [];

      el.innerHTML = qs.length
        ? qs.map(q => `<div class="lh-card">
            <h3>${esc(q.title)}</h3>
            <p class="lh-muted">${(q.questions || []).length} questions</p>
            <button class="lh-btn primary" onclick="startStandardLearningHubQuiz('${esc(q._id)}')">Start quiz</button>
          </div>`).join("")
        : `<div class="lh-empty">No saved quizzes for this course yet. Try “Generate AI quiz” if your Python AI service is running.</div>`;
    } catch (e) {
      el.innerHTML = `<div class="lh-empty">${esc(e.message)}</div>`;
    }
  };

  // AI QUIZ GENERATION — improved loading and error handling.
  window.generateLearningHubQuiz = async () => {
    if (window.aiQuizGenerating) return;

    if (!hasLogin()) {
      notice("Please log in before generating an AI quiz.", "error");
      return;
    }

    if (!courseId()) {
      notice("Select a course first.", "error");
      return;
    }

const presetConcept = window.quizSetupConcept || "";

window.quizSetupConcept = "";

let concept = presetConcept;

if (!concept) {
  const conceptInput = window.prompt(
    "Which concept should the quiz cover? Leave blank to use your weakest concept.",
    ""
  );

  if (conceptInput === null) return;

  concept = conceptInput.trim();
}

    const button = Array.from(document.querySelectorAll("button"))
      .find(b => b.textContent.includes("Generate AI quiz"));

    const stage = $("lhQuizStage");
    const originalButtonText = button ? button.textContent : "";

    window.aiQuizGenerating = true;

    if (button) {
      button.disabled = true;
      button.textContent = "Generating quiz…";
    }

    if (stage) {
      stage.innerHTML = `<div class="lh-card" role="status" aria-live="polite">
        <p><b>Generating your AI quiz…</b></p>
        <p class="lh-muted">This can take up to a minute while the AI service prepares questions. Please wait.</p>
      </div>`;
    }

    try {
      const payload = {
  course_id: courseId(),
  number_of_questions: Number(
    $("lhQuizQuestionCount")?.value || 5
  ),
  difficulty: $("lhQuizDifficulty")?.value || "medium"
};
      if (concept) payload.concept = concept;

      const d = await api("/ai-quiz/generate", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (!d || !d.quizId || !Array.isArray(d.questions) || d.questions.length === 0) {
        throw new Error(
          d?.message || "The backend returned no questions. Check the Python AI service response."
        );
      }

      activeQuiz = {
        _id: d.quizId,
        title: `AI quiz: ${d.concept || concept || "General"}`,
        questions: d.questions,
        concept: d.concept || concept || "General"
      };

      activeQuizMode = "ai";
      quizIndexLive = 0;
      quizAnswersLive = [];

      renderLiveQuizQuestion();

      notice(`AI quiz generated: ${d.questions.length} questions.`, "success");
    } catch (e) {
      console.error("AI quiz generation failed:", e);

      const message = e?.message || "Unknown error";

      if (stage) {
        stage.innerHTML = `<div class="lh-empty">
          <b>AI quiz could not be generated.</b>
          <p>${esc(message)}</p>
          <p class="lh-muted">Check that Node.js is running on port 5000 and the Python AI service is running on port 8000 with POST /generate-quiz.</p>
          <button class="lh-btn" onclick="generateLearningHubQuiz()">Try again</button>
        </div>`;
      }

      notice("AI quiz could not be generated: " + message, "error");
    } finally {
      window.aiQuizGenerating = false;

      if (button) {
        button.disabled = false;
        button.textContent = originalButtonText || "✨ Generate AI quiz";
      }
    }
  };

  window.startStandardLearningHubQuiz = async id => {
    try {
      const d = await api(`/quizzes/${id}`);
      activeQuiz = d.quiz;
      activeQuizMode = "standard";
      quizIndexLive = 0;
      quizAnswersLive = [];
      renderLiveQuizQuestion();
    } catch (e) {
      notice(e.message, "error");
    }
  };

  function renderLiveQuizQuestion() {
    const el = $("lhQuizStage");
    if (!el || !activeQuiz) return;

    const qs = activeQuiz.questions || [];

    if (!qs.length) {
      el.innerHTML = `<div class="lh-empty">This quiz has no questions.</div>`;
      return;
    }

    if (quizIndexLive >= qs.length) {
      submitLiveQuiz();
      return;
    }

    const q = qs[quizIndexLive];
    let options = [];

    if (activeQuizMode === "ai") {
      const o = q.options || {};
      options = ["A", "B", "C", "D"]
        .filter(k => o[k])
        .map(k => ({ key: k, text: o[k] }));
    } else {
      options = (q.options || []).map((text, i) => ({
        key: String(text),
        text
      }));
    }

    el.innerHTML = `<div class="lh-card" style="margin-top:16px">
      <div class="lh-row">
        <span class="badge badge-blue">Question ${quizIndexLive + 1} / ${qs.length}</span>
        <span class="lh-muted">${esc(q.difficulty || "practice")}</span>
      </div>
      <h3 style="margin-top:14px">${esc(q.question || q.q || "Question")}</h3>
      ${options.map(o => `<button class="lh-option" onclick="answerLiveLearningHubQuiz('${esc(o.key).replace(/'/g, "&#39;")}')">${esc(o.key)}. ${esc(o.text)}</button>`).join("")}
    </div>`;
  }

  window.answerLiveLearningHubQuiz = key => {
    const q = activeQuiz.questions[quizIndexLive];
    const selected = String(key);
    let correct, isCorrect;

    if (activeQuizMode === "ai") {
      correct = String(q.correctAnswer || "").trim().toUpperCase();
      isCorrect = selected.toUpperCase() === correct;
    } else {
      const opts = q.options || [];
      const raw = String(q.correctAnswer || "").trim();
      const letterIndex = "ABCD".indexOf(raw.toUpperCase());

      correct = opts.includes(raw)
        ? raw
        : (letterIndex >= 0 ? String(opts[letterIndex] || raw) : raw);

      isCorrect = selected === correct;
    }

    quizAnswersLive.push({
      selected,
      correct,
      isCorrect,
      questionId: String(q._id || quizIndexLive),
      concept: q.concept || activeQuiz.concept || "General"
    });

    quizIndexLive++;
    renderLiveQuizQuestion();
  };

  async function submitLiveQuiz() {
    const el = $("lhQuizStage");
    if (!el) return;

    el.innerHTML = `<div class="lh-card"><p>Saving your result…</p></div>`;

    try {
      let d;

      if (activeQuizMode === "ai") {
        d = await api(`/ai-quiz/${activeQuiz._id}/submit`, {
          method: "POST",
          body: JSON.stringify({
            answers: quizAnswersLive.map(a => a.selected)
          })
        });
      } else {
        d = await api("/quiz-attempts", {
          method: "POST",
          body: JSON.stringify({
            course: courseId(),
            quizId: String(activeQuiz._id),
            answers: quizAnswersLive.map(a => ({
              questionId: a.questionId,
              selectedAnswer: a.selected,
              correctAnswer: a.correct,
              isCorrect: a.isCorrect,
              concept: a.concept
            }))
          })
        });
      }

      const result = d.result || {
        totalQuestions: quizAnswersLive.length,
        correctAnswers: quizAnswersLive.filter(a => a.isCorrect).length,
        score: Math.round(
          100 * quizAnswersLive.filter(a => a.isCorrect).length /
          Math.max(1, quizAnswersLive.length)
        )
      };

      el.innerHTML = `<div class="lh-card" style="margin-top:16px;text-align:center">
        <h2>Quiz completed!</h2>
        <div style="font-size:44px;font-weight:850;color:#7c3aed">${Math.round(result.score || 0)}%</div>
        <p>${result.correctAnswers || 0} correct out of ${result.totalQuestions || quizAnswersLive.length}</p>
        <p class="lh-muted">Your attempt has been saved.</p>
        <div class="lh-toolbar" style="justify-content:center">
          <button class="lh-btn primary" onclick="showWorkspace('progress')">View progress</button>
          <button class="lh-btn" onclick="showWorkspace('history')">Quiz history</button>
          <button class="lh-btn" onclick="showWorkspace('quiz')">Take another quiz</button>
        </div>
      </div>`;

      notice("Quiz result saved.", "success");
    } catch (e) {
      el.innerHTML = `<div class="lh-empty">
        Could not save your quiz result: ${esc(e.message)}
        <p class="lh-muted">Your answer choices were made, but the backend did not confirm saving.</p>
      </div>`;
    }
  }

  async function renderSettings() {
    const prefs = (() => {
      try {
        return JSON.parse(localStorage.getItem("lh_settings") || "{}");
      } catch {
        return {};
      }
    })();

    setMain(`${pageTitle("⚙ Settings", "Settings are saved in this browser.")}
      <div class="big-card">
        <h3>Appearance</h3>
        <div class="lh-row">
          <div>
            <b>Theme</b>
            <p class="lh-muted">Switch between light and dark mode.</p>
          </div>
          <button class="lh-btn" onclick="toggleTheme()">Toggle theme</button>
        </div>
        <label class="lh-label">Preferred study session (minutes)</label>
        <input id="lhStudyMinutes" class="lh-input" type="number" min="5" max="180" value="${Number(prefs.minutes || 25)}">
        <label class="lh-label">Preferred learning language</label>
        <select id="lhLanguage" class="lh-input">
          <option ${prefs.language === "English" || !prefs.language ? "selected" : ""}>English</option>
          <option ${prefs.language === "Hindi" ? "selected" : ""}>Hindi</option>
        </select>
        <div class="lh-toolbar">
          <button class="lh-btn primary" onclick="saveLearningHubSettings()">Save settings</button>
        </div>
      </div>
      <div class="lh-card" style="margin-top:14px">
        <h3>Account</h3>
        <p class="lh-muted">${hasLogin() ? "You are signed in." : "You are not signed in."}</p>
        <button class="lh-btn" onclick="${hasLogin() ? "logoutLearningHub()" : "openLogin()"}">${hasLogin() ? "Log out" : "Log in"}</button>
      </div>`);
  }

  window.saveLearningHubSettings = () => {
    localWrite("settings", {
      minutes: Math.max(5, Math.min(180, Number($("lhStudyMinutes").value) || 25)),
      language: $("lhLanguage").value
    });
    notice("Settings saved.", "success");
  };

  async function renderSchedule() {
    const entries = localRead("schedule");

    setMain(`${pageTitle("◷ Schedule", "Create and manage your study sessions. Schedule entries are saved in this browser.")}
      <div class="big-card">
        <h3>Add study session</h3>
        <label class="lh-label">Topic</label>
        <input id="lhScheduleTopic" class="lh-input" placeholder="e.g. Fourier Series practice">
        <div class="lh-grid">
          <div>
            <label class="lh-label">Date</label>
            <input id="lhScheduleDate" class="lh-input" type="date" value="${new Date().toISOString().slice(0, 10)}">
          </div>
          <div>
            <label class="lh-label">Time</label>
            <input id="lhScheduleTime" class="lh-input" type="time" value="19:00">
          </div>
          <div>
            <label class="lh-label">Duration (minutes)</label>
            <input id="lhScheduleDuration" class="lh-input" type="number" min="5" max="300" value="25">
          </div>
        </div>
        <button class="lh-btn primary" style="margin-top:12px" onclick="addLearningHubSchedule()">Add session</button>
      </div>
      <div id="lhScheduleList" class="lh-grid">${entriesMarkup(entries, "schedule")}</div>`);
  }

  function entriesMarkup(entries, type) {
    if (!entries.length) {
      return `<div class="lh-empty">Nothing here yet. Add your first ${type === "schedule" ? "study session" : "project"} above.</div>`;
    }

    return entries.map((x, i) => `<div class="lh-card">
      <div class="lh-row">
        <h3>${esc(x.title)}</h3>
        <button class="lh-btn" onclick="deleteLearningHubEntry('${type}',${i})">Delete</button>
      </div>
      <p class="lh-muted">${esc(x.detail || "")}</p>
      ${x.date ? `<p>${esc(x.date)} ${esc(x.time || "")} · ${esc(x.duration || "")} min</p>` : ""}
    </div>`).join("");
  }

  window.addLearningHubSchedule = () => {
    const title = $("lhScheduleTopic").value.trim();
    if (!title) return notice("Enter a topic.", "error");

    const a = localRead("schedule");
    a.push({
      title,
      date: $("lhScheduleDate").value,
      time: $("lhScheduleTime").value,
      duration: $("lhScheduleDuration").value
    });

    a.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
    localWrite("schedule", a);
    renderSchedule();
    notice("Study session added.", "success");
  };

  async function renderProjects() {
    const arr = localRead("projects");

    setMain(`${pageTitle("◆ Projects", "Manage your learning projects. Projects are saved in this browser.")}
      <div class="big-card">
        <h3>Add project</h3>
        <label class="lh-label">Project name</label>
        <input id="lhProjectTitle" class="lh-input" placeholder="e.g. DSA Practice">
        <label class="lh-label">Notes</label>
        <textarea id="lhProjectDetail" class="lh-textarea" placeholder="Goal, next steps, links…"></textarea>
        <button class="lh-btn primary" style="margin-top:12px" onclick="addLearningHubProject()">Add project</button>
      </div>
      <div id="lhProjectList" class="lh-grid">${entriesMarkup(arr, "projects")}</div>`);
  }

  window.addLearningHubProject = () => {
    const title = $("lhProjectTitle").value.trim();
    if (!title) return notice("Enter a project name.", "error");

    const a = localRead("projects");
    a.push({
      title,
      detail: $("lhProjectDetail").value.trim(),
      createdAt: new Date().toISOString()
    });

    localWrite("projects", a);
    renderProjects();
    notice("Project added.", "success");
  };

  window.deleteLearningHubEntry = (type, index) => {
    const a = localRead(type);
    a.splice(index, 1);
    localWrite(type, a);

    if (type === "schedule") renderSchedule();
    else renderProjects();
  };

  async function renderSaved() {
    const a = localRead("saved");

    setMain(`${pageTitle("🔖 Saved lessons", "Topics you save are kept in this browser.")}
      <div class="lh-grid">
        ${a.length ? a.map((x, i) => `<div class="lh-card">
          <div class="lh-row">
            <h3>${esc(x.title)}</h3>
            <button class="lh-btn" onclick="deleteLearningHubSaved(${i})">Remove</button>
          </div>
          <p class="lh-muted">${esc(x.course || "")}</p>
          <button class="lh-btn primary" onclick="studySavedLearningHubLesson(${i})">Study again</button>
        </div>`).join("") : `<div class="lh-empty">No saved lessons yet. Open Learn and click “Save topic”.</div>`}
      </div>`);
  }

  window.deleteLearningHubSaved = i => {
    const a = localRead("saved");
    a.splice(i, 1);
    localWrite("saved", a);
    renderSaved();
  };

  window.studySavedLearningHubLesson = i => {
    const a = localRead("saved");
    const item = a[i];

    if (item) {
      currentTopic = item.title;
      window.showWorkspace("learn", item.title);
    }
  };

  window.startNewChat = () => {
    currentTopic = "your topic";
    window.showWorkspace("tutor", "your topic");
  };

  window.openSource = (name, meta) => {
    currentTopic = String(name || "your topic");
    window.showWorkspace("learn", currentTopic);
  };

  window.openQuizSetup = () => window.showWorkspace("quiz");
  window.openPractice = source => {
    currentTopic = source || "practice";
    window.showWorkspace("quiz");
  };
  window.openMock = source => {
    currentTopic = source || "mock test";
    window.showWorkspace("quiz");
  };

  window.openMindMap = source => {
    const topic = String(source || currentTopic || "your topic");

    setMain(`${pageTitle("🕸️ Mind map", `A simple topic map for ${esc(topic)}.`)}
      <div class="big-card">
        <div class="lh-grid">
          <div class="lh-card">
            <h3>Prerequisites</h3>
            <p class="lh-muted">What you should know first</p>
          </div>
          <div class="lh-card">
            <h3>Core concept</h3>
            <p>${esc(topic)}</p>
          </div>
          <div class="lh-card">
            <h3>Worked examples</h3>
            <p class="lh-muted">Apply the main idea</p>
          </div>
          <div class="lh-card">
            <h3>Practice</h3>
            <p class="lh-muted">Check understanding with a quiz</p>
            <button class="lh-btn primary" onclick="showWorkspace('quiz')">Practice now</button>
          </div>
        </div>
        <p class="lh-muted">This is a structured study map, not an AI-generated diagram.</p>
      </div>`);
  };

  window.showWorkspace = async function(page = "home", promptText = "") {
    try {
      current = page;
      if (page === "learn" && promptText) currentTopic = String(promptText);

      const landing = $("landing");
      const workspace = $("workspace");

      if (landing) landing.style.display = "none";
      if (workspace) workspace.classList.add("show");

      document.querySelectorAll(".navbtn[data-page]").forEach(b => {
        b.classList.toggle("active", b.dataset.page === page);
      });

      $("side")?.classList.remove("open");

      if (page === "home") return await renderHome();
      if (page === "courses") return await renderCourses();
      if (page === "courseDetail") return await renderCourseDetail();
      if (page === "learn") return await renderLearn(promptText || currentTopic);
      if (page === "tutor") return renderTutor(promptText || currentTopic);
      if (page === "upload") return await renderUpload();
      if (page === "library") return await renderLibrary();
      if (page === "progress") return await renderProgress();
      if (page === "history") return await renderHistory();
      if (page === "quiz") return await renderQuizPage();
      if (page === "settings") return await renderSettings();
      if (page === "schedule") return await renderSchedule();
      if (page === "projects") return await renderProjects();
      if (page === "saved") return await renderSaved();
      if (page === "practice" || page === "mock") return await renderQuizPage();

      return await renderHome();
    } catch (e) {
      setMain(`<div class="lh-empty">Something went wrong loading this page: ${esc(e.message)}</div>`);
      console.error("LearningHUB page error:", e);
    }
  };

  window.showVideoMessage = () => notice("Choose a course material or open Learn to study from your uploaded notes.");
  window.sendChat = window.sendLiveTutorMessage;

  window.fileChosen = input => {
    const file = input?.files?.[0];
    if (!file) return;

    if (!/\.(pdf|ppt|pptx)$/i.test(file.name)) {
      notice("The current backend accepts PDF, PPT and PPTX files only.", "error");
      input.value = "";
      return;
    }

    window.showWorkspace("upload");

    setTimeout(() => {
      const f = $("lhMaterialFile");
      const title = $("lhMaterialTitle");

      if (f) {
        const dt = new DataTransfer();
        dt.items.add(file);
        f.files = dt.files;
      }

      if (title) title.value = file.name.replace(/\.[^.]+$/, "");
    }, 100);
  };

  async function bootstrap() {
    addStyles();
    ensureCoursesNav();
    loginModal();
    updateAccountButton();

    try {
      const r = await fetch("http://localhost:5000/api/health");
      if (!r.ok) throw new Error();
    } catch {
      notice("Backend not detected. Start the Node server at http://localhost:5000 before using live features.", "error");
    }

    if (hasLogin()) {
      try {
        const me = await api("/auth/me");
        logged = true;
        await loadCourses();
        updateAccountButton();
      } catch (e) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("learninghubUser");
        logged = false;
        updateAccountButton();
        notice("Your login session expired. Please sign in again.", "error");
      }
    }

    if (current === "home" && $("workspace")?.classList.contains("show")) {
      await renderHome();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();

(function setupQuizModalButtons() {
  const modal = document.getElementById("quizSetupModal");
  if (!modal || modal.dataset.buttonsReady === "yes") return;
  modal.dataset.buttonsReady = "yes";

  function setupGroup(groupId, onSelect) {
    const group = document.getElementById(groupId);
    if (!group) return;

    group.querySelectorAll(".quiz-option:not(:disabled)").forEach(button => {
      button.addEventListener("click", () => {
        group.querySelectorAll(".quiz-option").forEach(item =>
          item.classList.remove("active")
        );
        button.classList.add("active");
        if (onSelect) onSelect(button.dataset.value);
      });
    });
  }

  setupGroup("quizCountOptions", value => {
    const custom = document.getElementById("quizCustomCount");
    if (custom) {
      custom.classList.toggle("show", value === "custom");
      if (value === "custom") custom.focus();
    }
  });

  setupGroup("difficultyOptions");
  setupGroup("typeOptions");

  setupGroup("focusOptions", value => {
    document.getElementById("specificTopicWrap")
      ?.classList.toggle("show", value === "specific");
  });
})();