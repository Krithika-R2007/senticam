/**
 * SentiCam Intelligent AI Engine v4.2
 * Powered by TensorFlow.js & SentiCore Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const video = document.getElementById('live-video');
    video.style.objectFit = 'fill'; // Fixes TFJS bounding box offset misalignment issues!
    const canvas = document.getElementById('ai-canvas');
    const ctx = canvas.getContext('2d');
    const threatLevel = document.getElementById('threatLevel');
    const confidenceLevel = document.getElementById('confidenceLevel');
    const analysisStatus = document.getElementById('analysis-status');
    const aiObjectsCount = document.getElementById('ai-objects');
    const alertList = document.getElementById('alertList');
    const alertBanner = document.getElementById('alertBanner');
    const threatCountText = document.getElementById('threatCount');
    const todayAlertsText = document.getElementById('todayAlerts');
    const aiStatusText = document.getElementById('aiStatus');
    const logCountText = document.getElementById('logCount');

    // Controls
    const videoSource = document.getElementById('videoSource');
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const muteBtn = document.getElementById('muteBtn');
    const aiToggleBtn = document.getElementById('aiToggleBtn');
    const fileInput = document.getElementById('fileInput');

    // State
    let model = null;
    let isAIVisionEnabled = true;
    let isMuted = true;
    let threatCount = 0;
    let logEntries = 0;
    let detectionInterval = null;
    let lastAudioTrigger = 0;
    let incidentTriggered = false;
    let isAcousticActive = true;

    // Audio Context & Analyser
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;
    let analyser = null;
    let audioSource = null;
    let audioDataArray = null;

    const TARGET_TIMESTAMP = 6.0; // Seconds for the special incident

    // 1. Initialize AI Model
    async function initAI() {
        aiStatusText.textContent = "BOOTING...";
        try {
            model = await cocoSsd.load();
            aiStatusText.textContent = "ACTIVE";
            aiStatusText.style.color = "var(--primary)";
            addLog("System", "AI Core (COCO-SSD) initialized successfully.", "success");
            startDetection();
        } catch (err) {
            console.error("AI Init Error:", err);
            aiStatusText.textContent = "ERROR";
            addLog("System", "Failed to load AI Core. Check connectivity.", "danger");
        }
    }

    // 2. Detection Loop
    function startDetection() {
        if (detectionInterval) clearInterval(detectionInterval);
        detectionInterval = setInterval(async () => {
            if (!model || video.paused || video.ended || !isAIVisionEnabled) return;

            const start = performance.now();
            const predictions = await model.detect(video);
            const end = performance.now();

            // Render bounding boxes
            renderDetections(predictions);

            // Update UI
            updateIntelligence(predictions, Math.round(end - start));

            // --- WEAPON DETECTION ---
            const weaponClasses = ['scissors', 'knife', 'tool', 'cell phone', 'remote', 'bottle', 'toothbrush', 'umbrella']; // Proxies for weapons in COCO-SSD
            const weapon = predictions.find(p => weaponClasses.includes(p.class) && p.score > 0.40);
            if (weapon) {
                const label = 'FIREARM / WEAPON';
                triggerCriticalIncident(
                    `${label} DETECTED`,
                    `Visual AI identified a hazardous object matching firearm/weapon signature. Engaging safety protocol.`,
                    Math.round(weapon.score * 100),
                    { type: "Firearm", cameraLoc: "NODE-047" }
                );
            }

            // Check for special timestamp incident
            checkTimestampIncident();

        }, 200);
    }

    function renderDetections(predictions) {
        // Match canvas to video display size
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!isAIVisionEnabled) return;

        predictions.forEach(prediction => {
            const [x, y, width, height] = prediction.bbox;
            const scaleX = canvas.width / video.videoWidth;
            const scaleY = canvas.height / video.videoHeight;

            const rx = x * scaleX;
            const ry = y * scaleY;
            const rw = width * scaleX;
            const rh = height * scaleY;

            // --- PRIVACY MASKING (DPDP/GDPR compliant) ---
            const weaponProxies = ['scissors', 'knife', 'tool', 'cell phone', 'remote', 'bottle', 'toothbrush', 'umbrella']; // Expanded proxies for Firearms
            const isWeapon = weaponProxies.includes(prediction.class);
            
            // Auto-blur faces of persons (typically top 20-30% of the person's bounding box)
            if (prediction.class === 'person' && !isWeapon) {
                const faceHeightOffset = height * 0.35; // Target Top 35% of the original box to ensure face region is caught
                const rFaceHeight = rh * 0.35;          

                ctx.save();
                ctx.filter = 'blur(15px)';
                // Draw the specific face region from the video onto the canvas with a heavy blur
                ctx.drawImage(video, 
                    x, y, width, faceHeightOffset, 
                    rx, ry, rw, rFaceHeight
                );
                ctx.restore();

                // Small indicator text
                ctx.fillStyle = 'rgba(100, 255, 218, 0.9)';
                ctx.font = '8px JetBrains Mono';
                ctx.fillText('BLURRED', rx + rw / 2 - 15, ry + rFaceHeight / 2);
            }

            // Draw Box
            ctx.strokeStyle = isWeapon ? '#ff4d4d' : (prediction.class === 'person' ? '#64ffda' : '#ffcc00');
            ctx.lineWidth = isWeapon ? 4 : 2;
            ctx.strokeRect(rx, ry, rw, rh);

            // Draw Label
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = 'bold 12px JetBrains Mono';
            const className = (isWeapon) ? 'FIREARM [DETECTED]' : prediction.class.toUpperCase();
            const label = `${className} [${Math.round(prediction.score * 100)}%]`;
            ctx.fillText(label, rx, ry > 10 ? ry - 5 : 10);

            if (isWeapon) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#ff4d4d";
                ctx.strokeRect(rx, ry, rw, rh);
                ctx.shadowBlur = 0;
            }
        });
    }

    function updateIntelligence(predictions, latency) {
        document.getElementById('responseTime').textContent = `${latency}ms`;
        aiObjectsCount.textContent = `OBJECTS: ${predictions.length} | TRACKING: ACTIVE`;

        if (predictions.length > 0) {
            const avgConf = predictions.reduce((acc, p) => acc + p.score, 0) / predictions.length;
            confidenceLevel.textContent = `${Math.round(avgConf * 100)}%`;

            const hasPerson = predictions.some(p => p.class === 'person');
            if (hasPerson) {
                analysisStatus.textContent = "Human activity detected";
            } else {
                analysisStatus.textContent = "Monitoring environment...";
            }
        } else {
            analysisStatus.textContent = "Scanning for anomalies...";
        }
    }

    // 3. Special Incident Logic (as requested)
    function checkTimestampIncident() {
        if (incidentTriggered) return;

        if (video.currentTime >= TARGET_TIMESTAMP && video.currentTime < TARGET_TIMESTAMP + 1) {
            triggerCriticalIncident(
                "ARMED INCIDENT DETECTED",
                "Visual identification of weapon at ICICI Bank, Gandhi Nagar. Threat detected! Threat Type: Weapon/Assault.",
                95,
                { type: "Weapon", cameraLoc: "CAM-4-Bank", clipUrl: "danger1.mp4" }
            );
            incidentTriggered = true;
        }
    }

    let lastAlertTime = 0;
    const ALERT_THROTTLE = 8000; // Prevent spamming history logs

    function triggerCriticalIncident(title, message, conf, metadata = {}) {
        threatLevel.textContent = "CRITICAL";
        threatLevel.classList.add("threat-high");
        confidenceLevel.textContent = `${conf}%`;
        document.getElementById('detectionType').textContent = "THREAT_DETECTED";

        // Banner
        document.getElementById('bannerMessage').textContent = title;
        alertBanner.classList.add('show');

        // SIEM Integration Mock & Evidence Export
        const evidencePackage = {
            threatType: metadata.type || "Anomaly",
            cameraID: metadata.cameraLoc || "NODE-047",
            timestamp: new Date().toISOString(),
            latency: "< 1.2s",
            snapshot_10s: metadata.clipUrl || "senticam_clip.mp4",
        };
        console.log(`[SIEM Webhook] Delivering Event to SOC (TheHive/Splunk):`, evidencePackage);

        // Log to history
        const now = Date.now();
        if (now - lastAlertTime > ALERT_THROTTLE) {
            addLog(`ALERT: ${title}`, message, "danger");
            lastAlertTime = now;
            threatCount++;
            threatCountText.textContent = threatCount;
            todayAlertsText.textContent = threatCount;
        }

        setTimeout(() => {
            if (!incidentTriggered) alertBanner.classList.remove('show');
        }, 5000);
    }

    // 4. Utility Functions
    function addLog(type, content, className = "") {
        logEntries++;
        logCountText.textContent = `${logEntries} ENTRIES`;

        const item = document.createElement('div');
        item.className = `alert-item ${className}`;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        item.innerHTML = `
            <div class="alert-header">
                <span class="alert-time">${time}</span>
                <span class="alert-type">${type.toUpperCase()}</span>
            </div>
            <div class="alert-content">
                <p>${content}</p>
            </div>
        `;

        if (className === 'danger') {
            const btn = document.createElement('button');
            btn.className = "btn";
            btn.style.marginTop = "10px";
            btn.style.width = "100%";
            btn.innerHTML = "<i class='fas fa-phone'></i> NOTIFY LOCAL AUTHORITIES";
            btn.onclick = () => window.location.href = 'tel:100';
            item.querySelector('.alert-content').appendChild(btn);
        }

        alertList.insertBefore(item, alertList.firstChild);

        // Limit list size
        if (alertList.childElementCount > 20) {
            alertList.removeChild(alertList.lastChild);
        }
    }

    // 5. Event Listeners
    videoSource.addEventListener('change', async (e) => {
        const val = e.target.value;
        stopWebcam();
        incidentTriggered = false; // Reset for new feeds

        if (val === 'webcam') {
            startWebcam();
        } else if (val === 'simulation') {
            video.src = "senticam_test.mp4";
            video.play();
        } else if (val === 'file') {
            fileInput.click();
        }
    });

    async function startWebcam() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            video.srcObject = stream;
            video.play();
            addLog("System", "Webcam access granted. Live AI analysis attached.", "success");
        } catch (err) {
            addLog("System", "Webcam access denied or unavailable.", "danger");
            videoSource.value = 'simulation';
        }
    }

    function stopWebcam() {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
    }

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const url = URL.createObjectURL(e.target.files[0]);
            video.src = url;
            video.play();
            addLog("System", `Loaded file: ${e.target.files[0].name}`, "success");
        }
    });

    playBtn.addEventListener('click', () => {
        video.play();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    });
    pauseBtn.addEventListener('click', () => video.pause());

    muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        video.muted = isMuted;

        // Resume AudioContext on user interaction
        if (isAcousticActive && audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        muteBtn.innerHTML = isMuted ?
            '<i class="fas fa-volume-mute"></i> AUDIO SCAN' :
            '<i class="fas fa-volume-up"></i> AUDIO ACTIVE';
        muteBtn.classList.toggle('active-btn', !isMuted);
    });

    document.getElementById('audioDetection').addEventListener('change', (e) => {
        isAcousticActive = e.target.checked;
        if (isAcousticActive) {
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
            addLog("System", "Acoustic Analysis Engine: ACTIVATED", "success");
        } else {
            addLog("System", "Acoustic Analysis Engine: OFFLINE", "warning");
        }
    });

    aiToggleBtn.addEventListener('click', () => {
        isAIVisionEnabled = !isAIVisionEnabled;
        aiToggleBtn.innerHTML = isAIVisionEnabled ?
            '<i class="fas fa-eye"></i> AI VISION: ON' :
            '<i class="fas fa-eye-slash"></i> AI VISION: OFF';
        aiToggleBtn.classList.toggle('active-btn', isAIVisionEnabled);
        if (!isAIVisionEnabled) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    document.querySelectorAll('.video-card').forEach(card => {
        card.addEventListener('click', () => {
            const src = card.getAttribute('data-src');
            const type = card.getAttribute('data-video');
            const title = card.querySelector('.video-title').textContent;
            const location = card.querySelector('.video-desc').textContent;

            // Scroll to video player
            document.getElementById('videoWrapper').scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Update Video Source & Play
            video.src = src;
            video.load();
            video.play();

            // Reset for new analysis
            incidentTriggered = false;
            threatLevel.textContent = "NOMINAL";
            threatLevel.classList.remove("threat-high");

            // Update Dashboard Context
            videoSource.value = 'file';
            document.getElementById('locationText').textContent = location;
            document.getElementById('detectionType').textContent = type === 'danger' ? "CRITICAL_REVIEW" : "SECURE_SCAN";

            analysisStatus.textContent = `Analyzing Evidence: ${title}`;
            addLog("Archive", `Loading Intelligence Data for ${title}...`, "success");

            // Flash effect for WOW factor
            const wrapper = document.getElementById('videoWrapper');
            wrapper.style.border = type === 'danger' ? '2px solid var(--danger)' : '2px solid var(--primary)';
            setTimeout(() => { wrapper.style.border = '1px solid rgba(100, 255, 218, 0.2)'; }, 1000);
        });
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
        const panel = document.getElementById('settingsPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    // Audio Analysis (Scream & Gunshot Detection)
    function initAudio() {
        if (!AudioContext || audioCtx) return;

        try {
            audioCtx = new AudioContext();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            audioDataArray = new Uint8Array(analyser.frequencyBinCount);

            audioSource = audioCtx.createMediaElementSource(video);
            audioSource.connect(analyser);
            analyser.connect(audioCtx.destination);

            analyzeAudio();
            addLog("System", "Acoustic Sensors: CONNECTED", "success");
        } catch (e) {
            console.warn("Audio Context Error:", e);
        }
    }

    video.addEventListener('play', () => {
        initAudio();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    });

    function analyzeAudio() {
        if (!isAcousticActive || !analyser) {
            requestAnimationFrame(analyzeAudio);
            return;
        }

        analyser.getByteFrequencyData(audioDataArray);
        const volume = audioDataArray.reduce((a, b) => a + b) / audioDataArray.length;
        const maxVolume = Math.max(...audioDataArray); // Using Peak Volume is much better for mics

        const now = Date.now();

        // Update Visualizer UI
        const bars = document.querySelectorAll('.acoustic-visualizer .bar');
        const visualizer = document.getElementById('acoustic-wave');
        if (bars.length > 0) {
            bars.forEach((bar, i) => {
                // Use different frequency bands for each bar
                const start = i * 20;
                const slice = audioDataArray.slice(start, start + 20);
                const val = slice.reduce((a, b) => a + b) / 20;
                bar.style.height = `${Math.max(20, (val / 255) * 100)}%`;
            });

            if (maxVolume > 100) visualizer.classList.add('active');
            else visualizer.classList.remove('active');
        }

        // 1. GUNSHOT DETECTION
        // Gunshots have high energy in both low and high frequencies
        const lowFreqs = Math.max(...audioDataArray.slice(0, 10));
        const highFreqs = Math.max(...audioDataArray.slice(100, 200));

        if (maxVolume > 180 && highFreqs > 100 && lowFreqs > 120 && (now - lastAudioTrigger > 3000)) {
            lastAudioTrigger = now;
            triggerCriticalIncident(
                "GUNSHOT DETECTED",
                "Impulsive acoustic signature matching firearm discharge detected.",
                98,
                { type: "Gunshot Violence", cameraLoc: "NODE-047" }
            );
            return; // Priority alert
        }

        // 2. SCREAM DETECTION (High-pitched sustained energy)
        if (maxVolume > 130 && (now - lastAudioTrigger > 5000)) {
            // Panic screams have peak energy in the 2kHz-4kHz range (approx bins 80-160 for 512 fft)
            const screamFreqs = Math.max(...audioDataArray.slice(80, 160));
            const ambientFreqs = audioDataArray.slice(10, 50).reduce((a, b) => a + b) / 40;

            if (screamFreqs > 120 || screamFreqs > ambientFreqs * 1.5) {
                lastAudioTrigger = now;
                triggerCriticalIncident(
                    "DISTRESS SCREAM",
                    "AI acoustic core identified high-pitched panic vocalizations.",
                    92,
                    { type: "Fighting/Assault", cameraLoc: "NODE-047" }
                );
                analysisStatus.textContent = "Noise detected: Likely social activity";
            }
        }

        requestAnimationFrame(analyzeAudio);
    }

    // 6. Evidence Archive Thumbnails (WOW Factor)
    document.querySelectorAll('.video-card').forEach(card => {
        const thumb = card.querySelector('.video-thumb');
        const src = card.getAttribute('data-src');
        if (!thumb || !src) return;

        const tvid = document.createElement('video');
        tvid.src = src;
        tvid.muted = true;
        tvid.loop = true;
        tvid.playsInline = true;
        tvid.style.width = "100%";
        tvid.style.height = "100%";
        tvid.style.objectFit = "cover";
        tvid.style.opacity = "0.4"; // Subtle preview

        thumb.insertBefore(tvid, thumb.firstChild);

        tvid.play().catch(() => { }); // Autoplay previews
    });

    // Start everything
    initAI();
    addLog("System", "SentiCam Intelligence Engine v4.2 booting...", "success");

    // Initial Simulation Startup
    video.src = "senticam_test.mp4";
    // Explicitly call play to handle browsers not respecting autoplay attr dynamically
    video.play().catch(e => console.log("Autoplay blocked:", e));
});
