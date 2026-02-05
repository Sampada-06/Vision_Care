document.addEventListener('DOMContentLoaded', () => {

    // ---------------- PRELOADER ----------------
    const preloader = document.getElementById('preloader');
    window.addEventListener('load', () => {
        if (preloader) setTimeout(() => preloader.classList.add('hidden'), 500);
    });

    // ---------------- PAGE TRANSITIONS ----------------
    document.querySelectorAll('a[href]').forEach(link => {
        try {
            const url = new URL(link.href);
            if (link.target === '_blank' || link.href.startsWith('#') || url.origin !== window.location.origin) return;
        } catch { return; }

        link.addEventListener('click', (e) => {
            e.preventDefault();
            const dest = link.href;
            document.body.classList.add('page-exit');
            setTimeout(() => window.location.href = dest, 400);
        });
    });

    // ---------------- DARK MODE ----------------
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const themeIcons = {
        light: document.getElementById('theme-icon-light'),
        dark: document.getElementById('theme-icon-dark')
    };

    const applyTheme = theme => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            themeIcons.light?.classList.add('hidden');
            themeIcons.dark?.classList.remove('hidden');
        } else {
            document.documentElement.classList.remove('dark');
            themeIcons.light?.classList.remove('hidden');
            themeIcons.dark?.classList.add('hidden');
        }
    };

    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    }
    applyTheme(localStorage.getItem('theme') || 'light');

    // ---------------- NAVBAR LOGIN/LOGOUT UI ----------------
    const loginNavBtn = document.getElementById("loginBtn");
    const logoutNavBtn = document.getElementById("logoutBtn");
    const userDisplay = document.getElementById("userDisplay");

    const token = localStorage.getItem("token");
    const userName = localStorage.getItem("userName");

    if (token) {
        loginNavBtn?.classList.add("hidden");
        logoutNavBtn?.classList.remove("hidden");
        if (userDisplay) {
            userDisplay.classList.remove("hidden");
            userDisplay.textContent = "Hi, " + userName;
        }
    } else {
        loginNavBtn?.classList.remove("hidden");
        logoutNavBtn?.classList.add("hidden");
        userDisplay?.classList.add("hidden");
    }

});

// ---------------- TEST PAGE LOGIC ----------------
document.addEventListener('DOMContentLoaded', () => {

    if (!document.getElementById('test-screen')) return;

    const state = {
        testStep: 'calibration',
        results: {
            date: new Date().toISOString(),
            acuity: { eye: 'right', blurLevel: 0, diopter: 0, leftEyeDiopter: 0, rightEyeDiopter: 0 },
            color: { level: 0, score: 0 },
            amsler: { eye: 'right', distorted: false },
            astigmatism: { eye: 'right', distorted: false },
        },
    };

    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const testSteps = {
        calibration: document.getElementById('calibration-step'),
        acuity: document.getElementById('acuity-test-step'),
        color: document.getElementById('color-test-step'),
        amsler: document.getElementById('amsler-test-step'),
        astigmatism: document.getElementById('astigmatism-test-step'),
    };

    const updateProgress = (value, text) => {
        progressBar.style.width = `${value}%`;
        progressText.textContent = text;
    };

    const runTestStep = () => {
        Object.values(testSteps).forEach(step => step && (step.style.display = 'none'));
        switch (state.testStep) {
            case 'calibration':
                updateProgress(5, "Step 1 of 5: Calibration");
                testSteps.calibration.style.display = 'block';
                break;
            case 'acuity':
                updateProgress(25, `Step 2 of 5: Visual Acuity (${state.results.acuity.eye} eye)`);
                testSteps.acuity.style.display = 'block';
                runAcuityStep();
                break;
            case 'color':
                updateProgress(50, "Step 3 of 5: Color Vision");
                testSteps.color.style.display = 'block';
                runColorStep();
                break;
            case 'amsler':
                updateProgress(70, `Step 4 of 5: Amsler Grid (${state.results.amsler.eye} eye)`);
                testSteps.amsler.style.display = 'block';
                break;
            case 'astigmatism':
                updateProgress(85, `Step 5 of 5: Astigmatism (${state.results.astigmatism.eye} eye)`);
                testSteps.astigmatism.style.display = 'block';
                break;
            case 'results':
                localStorage.setItem('latestVisionResult', JSON.stringify(state.results));
                saveHistoryToBackend(state.results);
                window.location.href = "result.html";
                break;
        }
    };

    // ------------- PYTHON WEBSOCKET CALIBRATION -------------
    const startCalibration = async () => {
        const message = document.getElementById('calibration-message');
        const btn = document.getElementById('start-calibration-btn');

        btn.disabled = true;
        btn.textContent = "Connecting to Python...";

        try {
            const socket = new WebSocket("ws://localhost:8765");

            socket.onopen = () => {
                const screenSize = prompt("Enter screen diagonal in inches:", "15.6") || "15.6";
                socket.send(screenSize);
                message.textContent = "Calibrating using Python...";
            };

            socket.onmessage = (e) => {
                if (e.data === "CALIBRATION_OK") {
                    message.textContent = "Calibration Complete!";
                    btn.textContent = "Done ✓";
                    setTimeout(() => {
                        state.testStep = 'acuity';
                        runTestStep();
                    }, 1000);
                }
            };

            socket.onerror = () => runBrowserCalibration();
        } catch {
            runBrowserCalibration();
        }
    };

    // ------------- BROWSER CALIBRATION FALLBACK -------------
    const runBrowserCalibration = () => {
        const message = document.getElementById('calibration-message');
        message.textContent = "Running browser calibration...";
        setTimeout(() => {
            message.textContent = "Calibration Complete!";
            state.testStep = 'acuity';
            runTestStep();
        }, 2000);
    };

    document.getElementById('start-calibration-btn').addEventListener('click', startCalibration);

    // ---------------- ACUITY LOGIC ----------------
    const runAcuityStep = () => {
        const letters = ["E", "F", "P", "T", "O", "Z", "L", "C", "D"];
        const feedback = document.getElementById('acuity-feedback');
        const letter = document.getElementById('letter-display');

        if (state.results.acuity.blurLevel > 6) {
            if (state.results.acuity.eye === "right") {
                state.results.acuity.rightEyeDiopter = state.results.acuity.diopter;
                state.results.acuity.eye = 'left';
                state.results.acuity.blurLevel = 0;
                state.results.acuity.diopter = 0;
                runTestStep();
            } else {
                state.results.acuity.leftEyeDiopter = state.results.acuity.diopter;
                state.testStep = 'color';
                runTestStep();
            }
            return;
        }

        const char = letters[Math.floor(Math.random() * letters.length)];
        letter.textContent = char;
        letter.style.filter = `blur(${state.results.acuity.blurLevel}px)`;

        feedback.textContent =
            state.results.acuity.diopter > 0 ?
                `Current estimate: -${state.results.acuity.diopter.toFixed(1)}D`
                : "";
    };

    document.getElementById('acuity-yes-btn').addEventListener('click', () => {
        state.results.acuity.blurLevel++;
        runAcuityStep();
    });

    document.getElementById('acuity-no-btn').addEventListener('click', () => {
        state.results.acuity.diopter += 0.5;
        state.results.acuity.blurLevel++;
        runAcuityStep();
    });

    // ---------------- COLOR TEST ----------------
    const colorPlates = [
        { src: "https://i.ibb.co/b316h46/plate-1.png", options: [74, 21, 71, "Nothing"], answer: 74 },
        { src: "https://i.ibb.co/hK5gC11/plate-2.png", options: [6, 8, 5, "Nothing"], answer: 6 },
        { src: "https://i.ibb.co/yq7sF2M/plate-3.png", options: [2, 7, 9, "Nothing"], answer: "Nothing" },
        { src: "https://i.ibb.co/k3nNnQv/plate-4.png", options: [29, 70, 20, "Nothing"], answer: 29 },
        { src: "https://i.ibb.co/Gv9D920/plate-5.png", options: [5, 3, 57, "Nothing"], answer: 57 },
    ];

    const runColorStep = () => {
        const plate = colorPlates[state.results.color.level];
        if (!plate) {
            state.testStep = "amsler";
            runTestStep();
            return;
        }

        const img = document.getElementById("ishihara-plate");
        let container = document.getElementById("color-button-container");

        if (!container) {
            container = document.createElement("div");
            container.id = "color-button-container";
            container.className = "grid grid-cols-2 md:grid-cols-4 gap-4 mt-6";
            img.parentElement.insertAdjacentElement("afterend", container);
        }

        img.src = plate.src;
        container.innerHTML = "";

        plate.options.forEach(opt => {
            const btn = document.createElement("button");
            btn.textContent = opt;
            btn.className = "bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 font-semibold py-3 px-6 rounded-lg";
            btn.onclick = () => handleColorAnswer(opt === plate.answer, btn, container);
            container.appendChild(btn);
        });
    };

    const handleColorAnswer = (isCorrect, btn, container) => {
        [...container.children].forEach(b => b.disabled = true);
        btn.className = isCorrect
            ? "bg-green-500 text-white font-semibold py-3 px-6 rounded-lg"
            : "bg-red-500 text-white font-semibold py-3 px-6 rounded-lg";

        if (isCorrect) state.results.color.score++;

        setTimeout(() => {
            state.results.color.level++;
            runColorStep();
        }, 1200);
    };

    // ---------------- AMSLER ----------------
    document.querySelectorAll('.amsler-answer-btn').forEach(btn =>
        btn.addEventListener('click', e => {
            const dist = e.target.dataset.answer === 'yes';
            if (state.results.amsler.eye === "right") {
                if (dist) state.results.amsler.distorted = true;
                state.results.amsler.eye = "left";
                runTestStep();
            } else {
                if (dist) state.results.amsler.distorted = true;
                state.testStep = "astigmatism";
                runTestStep();
            }
        })
    );

    // ---------------- ASTIGMATISM ----------------
    document.querySelectorAll('.astigmatism-answer-btn').forEach(btn =>
        btn.addEventListener('click', e => {
            const dist = e.target.dataset.answer === 'yes';
            if (state.results.astigmatism.eye === "right") {
                if (dist) state.results.astigmatism.distorted = true;
                state.results.astigmatism.eye = "left";
                runTestStep();
            } else {
                if (dist) state.results.astigmatism.distorted = true;
                state.testStep = "results";
                runTestStep();
            }
        })
    );

    runTestStep();

});

// ---------------- SAVE HISTORY TO BACKEND ----------------
async function saveHistoryToBackend(testResults) {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
        token,
        testName: "Vision Screening",
        result: JSON.stringify(testResults)
    };

    try {
        await fetch("http://localhost:5000/api/history/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Error saving history:", err);
    }
}

// ---------------- RESULTS PAGE ----------------
document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("results-screen")) return;

    const results = JSON.parse(localStorage.getItem("latestVisionResult"));
    if (!results) return;

    const { acuity, color, amsler, astigmatism } = results;

    const maxD = Math.max(acuity.leftEyeDiopter, acuity.rightEyeDiopter);
    const acuityResult =
        maxD <= 1 ? `Normal to near-normal (-${maxD.toFixed(1)}D)`
            : maxD <= 3 ? `Possible mild myopia (-${maxD.toFixed(1)}D)`
                : `Possible significant myopia (-${maxD.toFixed(1)}D)`;

    document.getElementById("acuity-result").textContent = acuityResult;
    document.getElementById("color-result").textContent =
        color.score >= 4 ? "Normal color vision" : "Possible deficiency";
    document.getElementById("amsler-result").textContent =
        amsler.distorted ? "Distortion detected" : "No distortions detected";
    document.getElementById("astigmatism-result").textContent =
        astigmatism.distorted ? "Possible astigmatism" : "Normal";

    // ---------------- GROQ TIPS BUTTON ----------------
    const btn = document.getElementById("get-groq-tips-btn");
    if (btn) {
        btn.addEventListener("click", () => {
            const prompt = `
                Provide helpful general advice for someone with these screening results:
                Acuity: ${acuityResult}
                Color: ${color.score}
                Amsler: ${amsler.distorted}
                Astigmatism: ${astigmatism.distorted}
                (Do NOT give medical diagnosis)
            `;
            callGroqApi(
                document.getElementById("groq-tips-output"),
                document.getElementById("groq-loading"),
                prompt
            );
        });
    }
});

// ---------------- HISTORY PAGE (BACKEND) ----------------
document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("history-screen")) return;

    loadHistoryFromDB();
});

async function loadHistoryFromDB() {
    const token = localStorage.getItem("token");
    const container = document.getElementById("history-container");
    const loader = document.getElementById("loading-spinner");

    if (!token) {
        loader.style.display = "none";
        container.innerHTML = `<p class="text-red-500">Please login to view history.</p>`;
        return;
    }

    try {
        const res = await fetch("http://localhost:5000/api/history/get", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        });

        const data = await res.json();
        loader.style.display = "none";

        if (data.status !== "success") {
            container.innerHTML = `<p class="text-red-500">Error loading history.</p>`;
            return;
        }

        if (data.history.length === 0) {
            container.innerHTML = `<p class="text-slate-500">No previous results found.</p>`;
            return;
        }

        container.innerHTML = data.history
            .map(item => `
                <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow border border-slate-300 dark:border-slate-700">
                    <h3 class="text-xl font-semibold">${item.testName}</h3>
                    <p class="mt-2 text-slate-600 dark:text-slate-400">${item.result}</p>
                    <p class="mt-2 text-sm text-slate-400">🕒 ${new Date(item.createdAt).toLocaleString()}</p>
                </div>
            `)
            .join("");

    } catch (err) {
        loader.style.display = "none";
        container.innerHTML = `<p class="text-red-500">Network error.</p>`;
    }
}

// ---------------- GROQ API ----------------
async function callGroqApi(outputEl, loadingEl, userPrompt) {
    outputEl.style.display = "none";
    loadingEl.style.display = "block";

    try {
        const res = await fetch("http://127.0.0.1:8000/chat/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userPrompt })
        });

        const result = await res.json();
        const text = result.reply;

        if (!text) {
            outputEl.textContent = "No response from server.";
            return;
        }

        // clean markdown ➜ HTML
        let html = text
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/^[\s]*\* (.*?)$/gm, "<li>$1</li>");

        const lines = html.split("\n");
        let processed = "";
        let inList = false;

        for (let line of lines) {
            if (line.startsWith("<li>")) {
                if (!inList) { processed += "<ul>"; inList = true; }
                processed += line;
            } else {
                if (inList) { processed += "</ul>"; inList = false; }
                if (line.trim() !== "") processed += `<p>${line}</p>`;
            }
        }
        if (inList) processed += "</ul>";

        outputEl.innerHTML = processed;

    } catch (err) {
        outputEl.textContent = "Groq API error.";
    } finally {
        loadingEl.style.display = "none";
        outputEl.style.display = "block";
    }
}

// ---------------- LOGOUT FUNCTION ----------------
function logout() {
    localStorage.clear();
    window.location.href = "auth.html";
}
