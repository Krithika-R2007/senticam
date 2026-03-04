/**
 * SentiCam Intelligence Engine v2.5
 */

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const liveFeed = document.getElementById('liveFeed');
    const threatValue = document.getElementById('threatValue');
    const confidenceValue = document.getElementById('confidenceValue');
    const detectionType = document.getElementById('detectionType');
    const responseTime = document.getElementById('responseTime');
    const alertList = document.getElementById('alertList');
    const emergencyPopup = document.getElementById('emergencyPopup');
    const emergencyDetails = document.getElementById('emergencyDetails');
    const clock = document.getElementById('clock');
    const dailyIncidents = document.getElementById('dailyIncidents');

    let incidentCount = 3;

    // --- System Clock ---
    function updateClock() {
        const now = new Date();
        clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
    setInterval(updateClock, 1000);
    updateClock();

    // --- Intelligence Logic ---
    function processFrame() {
        // Intelligence weighted by current video context (simulation)
        const videoSrc = liveFeed.src.toLowerCase();
        let probThreat = 0.2;

        if (videoSrc.includes('danger')) probThreat = 0.8;
        if (videoSrc.includes('safe')) probThreat = 0.05;

        const dice = Math.random();
        const conf = Math.floor(Math.random() * 15) + 82;
        const lat = Math.floor(Math.random() * 30) + 110;

        if (dice < probThreat) {
            // Determine type of threat
            const isVisual = Math.random() > 0.5;
            if (isVisual) {
                triggerVisualThreat("WEAPON_DETECTED", "Warning: Gun visual or illegal item identified in frame.", conf, lat);
            } else {
                triggerAudioThreat("GUNSHOT_DETECTED", "CRITICAL: Ballistic acoustic signature identified! Multiple shots logged.", conf, lat);
            }
        } else {
            // Check for "Safe" audio anomalies (Party/Chill stuff)
            const isParty = Math.random() > 0.7;
            if (isParty) {
                triggerSafe("SAFE: SOCIAL_ACTIVITY", "Acoustic analysis: Laughter/Party sounds detected. Socially safe environment.", conf, lat);
            } else {
                triggerSafe("SAFE: NOMINAL", "Routine monitoring active. No behavioral anomalies.", conf, lat);
            }
        }
    }

    // Run AI analysis every 5 seconds
    const mainAISloop = setInterval(processFrame, 5000);

    function triggerSafe(type, details, conf, lat) {
        threatValue.textContent = 'NOMINAL';
        threatValue.className = 'data-value threat-low';
        confidenceValue.textContent = `${conf}%`;
        detectionType.textContent = type;
        responseTime.textContent = `${lat} ms`;
        addAlert(type, details, 'success');
    }

    function triggerVisualThreat(type, details, conf, lat) {
        threatValue.textContent = 'WARNING';
        threatValue.className = 'data-value threat-high';
        threatValue.style.color = 'var(--warning)';
        confidenceValue.textContent = `${conf}%`;
        detectionType.textContent = type;
        responseTime.textContent = `${lat} ms`;

        emergencyDetails.textContent = details;
        emergencyPopup.classList.add('active');
        addAlert(`WARNING: ${type}`, details, 'danger');
    }

    function triggerAudioThreat(type, details, conf, lat) {
        threatValue.textContent = 'CRITICAL';
        threatValue.className = 'data-value threat-high';
        threatValue.style.color = 'var(--danger)';
        confidenceValue.textContent = `${conf}%`;
        detectionType.textContent = type;
        responseTime.textContent = `${lat} ms`;

        // Continuous alerts for audio threats (simulating rapid identification)
        addAlert(`ALERT: ${type}`, details, 'danger');
        setTimeout(() => addAlert(`UPDATE: Continuous ${type}`, "Authorities dispatched. Persistent audio verification active.", 'danger'), 1500);

        emergencyDetails.textContent = details;
        emergencyPopup.classList.add('active');

        incidentCount++;
        dailyIncidents.textContent = incidentCount.toString().padStart(2, '0');
    }

    function addAlert(title, message, type) {
        const item = document.createElement('div');
        item.className = `alert-item ${type}`;

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
            <div class="alert-meta">
                <span>${timestamp}</span>
                <span>ID: ${Math.random().toString(36).substr(2, 5).toUpperCase()}</span>
            </div>
            <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 4px;">${title}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); display: none;" class="alert-details">${message}</div>
        `;

        // Clicking expands detail (as requested: serious threats expand)
        item.onclick = () => {
            const details = item.querySelector('.alert-details');
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
        };

        alertList.insertBefore(item, alertList.firstChild);

        // Limit list size
        if (alertList.childElementCount > 20) {
            alertList.removeChild(alertList.lastChild);
        }
    }

    // --- Public UI Functions ---
    window.acknowledgeAlert = () => {
        emergencyPopup.classList.remove('active');
        // Reset analysis text but keep log
        threatValue.textContent = 'NOMINAL';
        threatValue.className = 'data-value threat-low';
        detectionType.textContent = 'RECOVERING...';
    };

    window.switchFeed = (src) => {
        liveFeed.src = src;
        liveFeed.play();
        addAlert('FEED_CHANGE', `System switching surveillance focus to asset: ${src}`, 'success');
    };

    // Initial State
    triggerSafe(96, 142);
    addAlert('SentiCam Security Boot', 'AI core initialized. All 128 nodes operational.', 'success');
});
