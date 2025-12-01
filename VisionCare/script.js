document.addEventListener('DOMContentLoaded', () => {

    // --- PRELOADER & PAGE TRANSITION LOGIC ---
    const preloader = document.getElementById('preloader');
    window.addEventListener('load', () => {
        if (preloader) {
            setTimeout(() => { preloader.classList.add('hidden'); }, 500);
        }
    });
    document.querySelectorAll('a[href]').forEach(link => {
        // --- CORRECTION: Replaced brittle .endsWith('.html') check ---
        // This now correctly checks if the link is internal (same origin)
        // and not an external link, a _blank link, or a hash link.
        try {
            const url = new URL(link.href);
            if (link.target === '_blank' || link.href.startsWith('#') || url.origin !== window.location.origin) {
                return;
            }
        } catch (e) {
            // Invalid URL (e.g., mailto:), ignore it
            return;
        }
        // --- END CORRECTION ---

        link.addEventListener('click', (e) => {
            e.preventDefault();
            const destination = link.href;
            document.body.classList.add('page-exit');
            setTimeout(() => { window.location.href = destination; }, 400);
        });
    });

    // --- GLOBAL ELEMENTS & FUNCTIONS (DARK MODE) ---
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const themeIcons = { light: document.getElementById('theme-icon-light'), dark: document.getElementById('theme-icon-dark') };
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            if (themeIcons.light) themeIcons.light.classList.add('hidden');
            if (themeIcons.dark) themeIcons.dark.classList.remove('hidden');
        } else {
            document.documentElement.classList.remove('dark');
            if (themeIcons.light) themeIcons.light.classList.remove('hidden');
            if (themeIcons.dark) themeIcons.dark.classList.add('hidden');
        }
    };
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    }
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    // --- PAGE-SPECIFIC LOGIC ---

    // --- TEST PAGE LOGIC ---
    if (document.getElementById('test-screen')) {
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

        const updateProgress = (percentage, text) => {
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = text;
        };

        const runTestStep = () => {
            Object.values(testSteps).forEach(step => {
                if (step) step.style.display = 'none'
            });
            switch (state.testStep) {
                case 'calibration':
                    updateProgress(5, 'Step 1 of 5: Calibration');
                    testSteps.calibration.style.display = 'block';
                    break;
                case 'acuity':
                    updateProgress(25, `Step 2 of 5: Visual Acuity (${state.results.acuity.eye} eye)`);
                    testSteps.acuity.style.display = 'block';
                    runAcuityStep();
                    break;
                case 'color':
                    updateProgress(50, 'Step 3 of 5: Color Vision');
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
                    const history = JSON.parse(localStorage.getItem('visionCareHistory')) || [];
                    history.push(state.results);
                    localStorage.setItem('visionCareHistory', JSON.stringify(history));
                    window.location.href = 'result.html';
                    break;
            }
        };

        const KNOWN_FACE_WIDTH_CM = 16.0;
        const IDEAL_DISTANCE_CM = 40;
        let focalLength = null;

        const startCalibration = async () => {
            const video = document.getElementById('webcam');
            const placeholder = document.getElementById('webcam-placeholder');
            const messageEl = document.getElementById('calibration-message');
            const calibBtn = document.getElementById('start-calibration-btn');

            calibBtn.disabled = true;
            calibBtn.textContent = 'Connecting to server...';
            placeholder.style.display = 'none'; // Hide video, we don't need it
            
            // Create a WebSocket connection to the Python server
            const socket = new WebSocket('ws://localhost:8765');

            // Handle connection opening
            socket.onopen = () => {
                console.log('Connected to Python server.');
                messageEl.textContent = 'Please follow instructions in the Python window...';
                calibBtn.textContent = 'Calibrating...';
                
                // --- THIS IS THE NEW PART ---
                // We need to ask the user for their screen size
                // We cannot get it automatically in a web browser
                let screenSize = prompt("Please enter your screen size in inches (e.g., 15.6):", "15.6");
                if (!screenSize) {
                    screenSize = "15.6"; // Default if user cancels
                }
                // Send the screen size to the Python server
                socket.send(screenSize);
            };

            // Handle messages received from Python
            socket.onmessage = (event) => {
                if (event.data === 'CALIBRATION_OK') {
                    console.log('Received CALIBRATION_OK from server.');
                    messageEl.textContent = 'Calibration Complete!';
                    messageEl.classList.remove('text-blue-600');
                    messageEl.classList.add('text-green-600');
                    
                    socket.close(); // Close the connection

                    setTimeout(() => {
                        state.testStep = 'acuity';
                        runTestStep();
                    }, 1000);
                }
            };

            // Handle errors
            socket.onerror = (error) => {
                console.error("WebSocket Error:", error);
                messageEl.textContent = 'Connection Error! Is the Python server running?';
                calibBtn.disabled = false;
                calibBtn.textContent = 'Start Calibration';
            };

            // Handle connection closing
            socket.onclose = () => {
                console.log('Disconnected from Python server.');
            };
        };

        // const startCalibration = async () => {
        // ... (Your commented-out code remains unchanged)
        // };

        const runAcuityStep = () => {
            const MAX_BLUR = 6;
            const letters = ["E", "F", "P", "T", "O", "Z", "L", "C", "D"];
            const feedbackEl = document.getElementById('acuity-feedback');
            const letterEl = document.getElementById('letter-display');
            document.getElementById('eye-to-cover').textContent = state.results.acuity.eye === 'right' ? 'left' : 'right';
            if (state.results.acuity.blurLevel > MAX_BLUR) {
                if (state.results.acuity.eye === 'right') {
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
            const currentLetter = letters[Math.floor(Math.random() * letters.length)];
            letterEl.textContent = currentLetter;
            letterEl.style.filter = `blur(${state.results.acuity.blurLevel}px)`;
            feedbackEl.textContent = state.results.acuity.diopter > 0 ? `Current estimate: -${state.results.acuity.diopter.toFixed(1)}D` : '';
        };

        const handleAcuityAnswer = (canSee) => {
            if (!canSee) { state.results.acuity.diopter += 0.5; }
            state.results.acuity.blurLevel++;
            runAcuityStep();
        };

        const colorTestPlates = [
            { src: 'https://i.ibb.co/b316h46/plate-1.png', options: [74, 21, 71, "Nothing"], answer: 74 },
            { src: 'https://i.ibb.co/hK5gC11/plate-2.png', options: [6, 8, 5, "Nothing"], answer: 6 },
            { src: 'https://i.ibb.co/yq7sF2M/plate-3.png', options: [2, 7, 9, "Nothing"], answer: "Nothing" },
            { src: 'https://i.ibb.co/k3nNnQv/plate-4.png', options: [29, 70, 20, "Nothing"], answer: 29 },
            { src: 'https://i.ibb.co/Gv9D920/plate-5.png', options: [5, 3, 57, "Nothing"], answer: 57 },
        ];

        const runColorStep = () => {
            const plate = colorTestPlates[state.results.color.level];
            if (!plate) {
                state.testStep = 'amsler';
                runTestStep();
                return;
            }

            const plateImage = document.getElementById('ishihara-plate');
            
            let buttonContainer = document.getElementById('color-button-container');
            if (!buttonContainer) {
                buttonContainer = document.createElement('div');
                buttonContainer.id = 'color-button-container';
                buttonContainer.className = 'grid grid-cols-2 md:grid-cols-4 gap-4 mt-6';
                plateImage.parentElement.insertAdjacentElement('afterend', buttonContainer);

                document.getElementById('color-answer-input').style.display = 'none';
                document.getElementById('submit-color-answer').style.display = 'none';
            }
            
            plateImage.src = plate.src;
            buttonContainer.innerHTML = '';

            plate.options.forEach(option => {
                const button = document.createElement('button');
                button.textContent = option;
                button.className = "bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 font-semibold py-3 px-6 rounded-lg";
                button.onclick = () => handleColorAnswer(option === plate.answer, button, buttonContainer);
                buttonContainer.appendChild(button);
            });
        };

        const handleColorAnswer = (isCorrect, button, container) => {
            Array.from(container.children).forEach(btn => {
                btn.disabled = true;
                // Dim other buttons
                if (btn !== button) {
                    btn.classList.add('opacity-50');
                }
            });
            
            if (isCorrect) {
                state.results.color.score++;
                button.className = "bg-green-500 text-white font-semibold py-3 px-6 rounded-lg";
            } else {
                button.className = "bg-red-500 text-white font-semibold py-3 px-6 rounded-lg";
            }

            setTimeout(() => {
                state.results.color.level++;
                runColorStep();
            }, 1200);
        };
        
        const handleAmslerAnswer = (isDistorted) => {
            if (state.results.amsler.eye === 'right') {
                if (isDistorted) state.results.amsler.distorted = true;
                state.results.amsler.eye = 'left';
                runTestStep();
            } else {
                if (isDistorted) state.results.amsler.distorted = true;
                state.testStep = 'astigmatism';
                runTestStep();
            }
        };

        const handleAstigmatismAnswer = (isDistorted) => {
            if (state.results.astigmatism.eye === 'right') {
                if (isDistorted) state.results.astigmatism.distorted = true;
                state.results.astigmatism.eye = 'left';
                runTestStep();
            } else {
                if (isDistorted) state.results.astigmatism.distorted = true;
                state.testStep = 'results';
                runTestStep();
            }
        };

        document.getElementById('start-calibration-btn').addEventListener('click', startCalibration);
        document.getElementById('acuity-yes-btn').addEventListener('click', () => handleAcuityAnswer(true));
        document.getElementById('acuity-no-btn').addEventListener('click', () => handleAcuityAnswer(false));
        document.querySelectorAll('.amsler-answer-btn').forEach(btn => btn.addEventListener('click', (e) => handleAmslerAnswer(e.target.dataset.answer === 'yes')));
        document.querySelectorAll('.astigmatism-answer-btn').forEach(btn => btn.addEventListener('click', (e) => handleAstigmatismAnswer(e.target.dataset.answer === 'yes')));

        runTestStep();
    }

    // --- RESULTS PAGE LOGIC ---
    if (document.getElementById('results-screen')) {
        const results = JSON.parse(localStorage.getItem('latestVisionResult'));
        if (results) {
            const { acuity, color, amsler, astigmatism } = results;
            const maxDiopter = Math.max(acuity.leftEyeDiopter, acuity.rightEyeDiopter);
            let acuityText;
            if (maxDiopter <= 1.0) {
                acuityText = `Suggests normal to near-normal vision (Estimated: -${maxDiopter.toFixed(1)}D).`;
            } else if (maxDiopter <= 3.0) {
                acuityText = `Suggests potential mild myopia (Estimated: -${maxDiopter.toFixed(1)}D). Consultation recommended.`;
            } else {
                acuityText = `Suggests potential significant myopia (Estimated: -${maxDiopter.toFixed(1)}D). Strongly advise consulting a professional.`;
            }
            document.getElementById('acuity-result').textContent = acuityText;
            document.getElementById('color-result').textContent = color.score >= 4 ? 'No signs of common color vision deficiency detected.' : 'Indicates a potential red-green color deficiency. Please consult a specialist.';
            document.getElementById('amsler-result').textContent = amsler.distorted ? 'Distortions detected. It is important to consult an eye care professional.' : 'No distortions detected.';
            document.getElementById('astigmatism-result').textContent = astigmatism.distorted ? 'Indicates a potential astigmatism. A professional consultation is recommended.' : 'No signs of astigmatism detected.';
        } else {
            document.getElementById('acuity-result').textContent = "No test data found. Please complete a test first.";
        }
        
        const getTipsBtn = document.getElementById('get-groq-tips-btn');
        if (getTipsBtn) {
            getTipsBtn.addEventListener('click', () => {
                const results = JSON.parse(localStorage.getItem('latestVisionResult'));
                // Create a summary prompt only if results exist
                const prompt = results ? 
                    `Based on these screening results, provide helpful, personalized tips and next steps in a bulleted list. The results are:
                    - Acuity: ${document.getElementById('acuity-result').textContent}
                    - Color Vision: ${document.getElementById('color-result').textContent}
                    - Amsler Grid: ${document.getElementById('amsler-result').textContent}
                    - Astigmatism: ${document.getElementById('astigmatism-result').textContent}
                    
                    Provide general advice, do not provide a diagnosis. Use markdown for formatting.`
                    : "Please provide general tips for maintaining good eye health.";
                
                callGroqApi(document.getElementById('groq-tips-output'), document.getElementById('groq-loading'), prompt);
            });
        }
    }

    // --- HISTORY PAGE LOGIC ---
    if (document.getElementById('history-screen')) {
        const history = JSON.parse(localStorage.getItem('visionCareHistory')) || [];
        const container = document.getElementById('history-container');
        container.innerHTML = '';
        if (history.length === 0) {
            container.innerHTML = '<p class="text-center dark:text-slate-300">No test history found. Complete a test to see your results here.</p>';
        } else {
            history.slice().reverse().forEach(res => {
                const date = new Date(res.date).toLocaleString();
                const maxDiopter = Math.max(res.acuity.leftEyeDiopter, res.acuity.rightEyeDiopter);
                const acuityText = `~${maxDiopter.toFixed(1)}D`;
                const colorText = res.color.score >= 4 ? 'Normal' : 'Check Recommended';
                const amslerText = res.amsler.distorted ? 'Distortion Noted' : 'Normal';
                const astigmatismText = res.astigmatism.distorted ? 'Potential' : 'Normal';

                const item = document.createElement('div');
                item.className = 'bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg';
                item.innerHTML = `<h3 class="font-bold text-lg mb-4 text-blue-600 dark:text-blue-400">${date}</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                        <p class="text-sm font-semibold text-slate-600 dark:text-slate-400">Acuity (Est.)</p>
                        <p class="font-bold text-lg dark:text-white">${acuityText}</p>
                    </div>
                    <div>
                        <p class="text-sm font-semibold text-slate-600 dark:text-slate-400">Color Vision</p>
                        <p class="font-semibold ${colorText === 'Normal' ? 'text-green-600' : 'text-yellow-600'}">${colorText}</p>
                    </div>
                    <div>
                        <p class="text-sm font-semibold text-slate-600 dark:text-slate-400">Amsler Grid</p>
                        <p class="font-semibold ${amslerText === 'Normal' ? 'text-green-600' : 'text-red-600'}">${amslerText}</p>
                    </div>
                    <div>
                        <p class="text-sm font-semibold text-slate-600 dark:text-slate-400">Astigmatism</p>
                        <p class="font-semibold ${astigmatismText === 'Normal' ? 'text-green-600' : 'text-red-600'}">${astigmatismText}</p>
                    </div>
                </div>`;
                container.appendChild(item);
            });
        }
    }

    // --- SYMPTOM CHECKER LOGIC ---
    if (document.getElementById('symptom-checker-screen')) {
        document.getElementById('symptom-submit-btn').addEventListener('click', () => {
            const symptoms = document.getElementById('symptom-input').value;
            if (!symptoms.trim()) { alert("Please describe your symptoms."); return; }
            const prompt = `You are an AI assistant providing general eye health information. You must not provide a medical diagnosis. Your response should be helpful and informative, suggesting when a user should see a professional. Use markdown for formatting. User's symptoms: "${symptoms}"`;
            callGroqApi(document.getElementById('symptom-checker-output'), document.getElementById('symptom-loading'), prompt);
        });
    }

    // --- UNIFIED GROQ API FUNCTION ---
    async function callGroqApi(outputEl, loadingEl, userPrompt) {
        outputEl.style.display = 'none';
        loadingEl.style.display = 'block';
        
        const apiUrl = 'http://127.0.0.1:8000/chat/';

        const payload = {
            message: userPrompt
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const result = await response.json();
            const text = result.reply;
            if (text) {
                // --- CORRECTION: Robust Markdown-to-HTML Conversion ---
                // This logic correctly handles bold, lists, and paragraphs
                // without wrapping the entire text in <ul> or adding <br> inside lists.
                let html = text
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // 1. Handle bold
                    .replace(/^[\s]*\* (.*?)$/gm, '<li>$1</li>');     // 2. Handle list items

                // 3. Split by newlines to process paragraphs and lists separately
                const lines = html.split('\n');
                let inList = false;
                let processedHtml = '';

                for (const line of lines) {
                    if (line.startsWith('<li>')) {
                        if (!inList) {
                            processedHtml += '<ul>'; // Start list
                            inList = true;
                        }
                        processedHtml += line; // Add list item
                    } else {
                        if (inList) {
                            processedHtml += '</ul>'; // End list
                            inList = false;
                        }
                        // Add non-list lines as paragraphs
                        if (line.trim().length > 0) {
                            processedHtml += `<p>${line}</p>`;
                        }
                    }
                }

                // Close any open list
                if (inList) {
                    processedHtml += '</ul>';
                }
                
                outputEl.innerHTML = processedHtml;
                // --- END CORRECTION ---

            } else {
                outputEl.textContent = "Sorry, I couldn't get a valid response.";
            }
        } catch (error) {
            console.error("Groq API Error:", error);
            outputEl.textContent = "An error occurred. Please check your connection or API server.";
        } finally {
            loadingEl.style.display = 'none';
            outputEl.style.display = 'block';
        }
    }
});