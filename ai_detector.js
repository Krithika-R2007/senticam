/* ai_detector.js
   Client-side "shout" detector for SentiCam.
   - Hooks to #live-video and your sidebar/banner elements.
   - Uses WebAudio to detect sudden loud events (shouts).
   - Cooldown to avoid spam. Inserts alerts using your .alert-item style.
   - Switches video flow: danger1.mp4 -> senticam-sample.mp4 (play order you requested).
*/

(function () {
  if (window.AIDetectorInitialized) return;
  window.AIDetectorInitialized = true;

  const VIDEO_SELECTOR = '#live-video';
  const ALERT_BANNER_SELECTOR = '#alertBanner';
  const ALERT_LIST_SELECTOR = '#alertList';
  const THREAT_COUNT_SELECTOR = '#threatCount';
  const THREAT_LEVEL_SELECTOR = '#threatLevel';
  const CONFIDENCE_SELECTOR = '#confidenceLevel';
  const ANALYSIS_STATUS_SELECTOR = '#analysis-status';
  const SENSITIVITY_SELECT = '#sensitivity';

  const DANGER_VIDEO = 'danger1.mp4';
  const FOLLOWUP_VIDEO = 'senticam-sample.mp4';

  const video = document.querySelector(VIDEO_SELECTOR);
  if (!video) {
    console.warn('AI Detector: video element not found:', VIDEO_SELECTOR);
    return;
  }

  // stop any previous simulation interval if present
  try { if (window.analysisInterval) clearInterval(window.analysisInterval); } catch (e) {}

  // set up video chain as requested: play danger1.mp4 first then followup
  try {
    // Only change src if current src looks like a placeholder (harmless)
    // We'll set to danger video to match requested flow.
    video.src = DANGER_VIDEO;
    video.load();
    // try to autoplay, if blocked we leave it muted (your page already set muted autoplay)
    video.play().catch(()=>{ /* user gesture may be required */ });
  } catch (e) { console.warn('AI Detector: could not set initial src', e); }

  video.addEventListener('ended', () => {
    try {
      // If the danger video just ended switch to followup (only once)
      if (video.currentSrc && video.currentSrc.includes(DANGER_VIDEO)) {
        video.src = FOLLOWUP_VIDEO;
        video.load();
        video.play().catch(()=>{ /* may require user gesture */ });
      }
    } catch (e) {}
  });

  // UI helpers
  function showBanner(confidence, text = 'Screaming and aggressive behavior identified') {
    const banner = document.querySelector(ALERT_BANNER_SELECTOR);
    if (!banner) return;
    try {
      banner.querySelector('h3').textContent = 'DANGER DETECTED!';
      banner.querySelector('p').textContent = text;
    } catch (e) {}
    banner.classList.add('show');
    setTimeout(() => { banner.classList.remove('show'); }, 7000);
  }

  function insertAlert({type = 'DANGER: Screaming Detected', summary = '', confidence = 87, location = 'Camera 12 - Downtown Market Street', timeText = 'Just now'}) {
    const alertList = document.querySelector(ALERT_LIST_SELECTOR);
    if (!alertList) return;
    const el = document.createElement('div');
    el.className = type.startsWith('SAFE') ? 'alert-item safe' : 'alert-item';
    el.innerHTML = `
      <div class="alert-header">
        <span class="alert-time">${timeText}</span>
        <span class="alert-type">${type}</span>
      </div>
      <div class="alert-content">
        <p>${summary}</p>
        <p>Location: ${location}</p>
      </div>
    `;
    alertList.insertBefore(el, alertList.firstChild);

    // Optional: attach phone button for critical incidents (keeps UI style intact)
    if (!type.startsWith('SAFE') && location.toLowerCase().includes('bank')) {
      const extra = document.createElement('div');
      extra.style.marginTop = '8px';
      extra.innerHTML = `<button class="btn contact-police" type="button">Alert nearby police station</button>`;
      el.querySelector('.alert-content').appendChild(extra);
      const contactBtn = el.querySelector('.contact-police');
      if (contactBtn) contactBtn.addEventListener('click', () => { window.location.href = 'tel:100'; });
    }
  }

  // Update dashboard UI elements
  function setDashboard(threatText, confidencePct, statusText) {
    const threatEl = document.querySelector(THREAT_LEVEL_SELECTOR);
    const confEl = document.querySelector(CONFIDENCE_SELECTOR);
    const statusEl = document.querySelector(ANALYSIS_STATUS_SELECTOR);
    if (threatEl) {
      threatEl.textContent = threatText;
      if (threatText === 'HIGH') threatEl.classList.add('threat'); else threatEl.classList.remove('threat');
    }
    if (confEl) confEl.textContent = `${confidencePct}%`;
    if (statusEl) statusEl.textContent = statusText;
  }

  function bumpThreatCounter() {
    const tc = document.querySelector(THREAT_COUNT_SELECTOR);
    if (!tc) return;
    const current = parseInt(tc.textContent || '0', 10);
    tc.textContent = isNaN(current) ? '1' : String(current + 1);
  }

  // AUDIO ANALYSIS - WebAudio (very lightweight)
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    console.warn('AI Detector: Web Audio not available in this browser.');
    return;
  }
  const ctx = new AudioContext();

  let srcNode;
  try {
    srcNode = ctx.createMediaElementSource(video);
  } catch (e) {
    console.warn('AI Detector: could not create media source (CORS or src error)', e);
    // If it fails, still continue (can't analyze) but we won't detect live shout.
    return;
  }

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.75;

  srcNode.connect(analyser);
  analyser.connect(ctx.destination);

  const timeDomain = new Float32Array(analyser.fftSize);
  const freqDomain = new Float32Array(analyser.frequencyBinCount);

  // Adaptive ambient calibration
  let ambientRms = 0;
  let ambientSamples = 0;
  const AMBIENT_CALIBRATION_TIME = 1500; // ms
  const calibrationStart = performance.now();

  // detection state
  let lastTrigger = 0;
  const baseCooldown = 9000; // ms — base cooldown between incidents
  let sensitivityMap = { low: 1.6, medium: 1.3, high: 1.05 }; // lower factor = more sensitive
  let sensitivityFactor = sensitivityMap['medium'];

  // Listen to sensitivity select changes (tie into settings panel)
  const sensSelect = document.querySelector(SENSITIVITY_SELECT);
  if (sensSelect) {
    sensitivityFactor = sensitivityMap[sensSelect.value || 'medium'] || 1.3;
    sensSelect.addEventListener('change', () => {
      sensitivityFactor = sensitivityMap[sensSelect.value] || 1.3;
    });
  }

  // compute RMS helper
  function computeRMS(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { sum += buf[i] * buf[i]; }
    return Math.sqrt(sum / buf.length);
  }

  // simple spectral centroid to prefer voice-like events
  function spectralCentroid(freqBuf, sampleRate) {
    let num = 0, den = 0;
    const binCount = freqBuf.length;
    for (let i = 0; i < binCount; i++) {
      const magnitude = Math.abs(freqBuf[i]);
      const freq = i * sampleRate / (2 * binCount); // approx
      num += freq * magnitude;
      den += magnitude + 1e-9;
    }
    return num / den;
  }

  // detection loop (runs approx every 120ms)
  const POLL_MS = 120;
  const recentRms = [];
  const RECENT_WINDOW = 6;

  function detectionStep() {
    // get time-domain for amplitude estimates
    analyser.getFloatTimeDomainData(timeDomain);
    const rms = computeRMS(timeDomain);

    // collect ambient calibration for first N ms
    const now = performance.now();
    if (now - calibrationStart < AMBIENT_CALIBRATION_TIME) {
      // Update running ambient RMS with smoothing
      ambientRms = ambientRms ? (ambientRms * ambientSamples + rms) / (ambientSamples + 1) : rms;
      ambientSamples++;
      return;
    } else if (!ambientRms) {
      ambientRms = rms || 0.001;
    }

    // compute FFT-based centroid to bias voice-like events
    analyser.getFloatFrequencyData(freqDomain);
    const centroid = spectralCentroid(freqDomain, ctx.sampleRate || 44100);

    // maintain recent RMS window to detect sudden jump
    recentRms.push(rms);
    if (recentRms.length > RECENT_WINDOW) recentRms.shift();
    const avgRecent = recentRms.reduce((a,b)=>a+b,0)/recentRms.length;

    // dynamic threshold: based on ambientRms and sensitivity
    const threshold = Math.max(ambientRms * (sensitivityFactor * 2.0), ambientRms + 0.03);

    // detect sudden loud spike: current RMS significantly above avgRecent & threshold
    const isSpike = (rms > threshold) && (rms > avgRecent * 1.6);
    const centroidVoicey = centroid > 800 && centroid < 4000; // heuristic, human voice range emphasis

    // cooldown prevents spamming
    const cooldown = baseCooldown * (sensSelect && sensSelect.value === 'high' ? 0.8 : (sensSelect && sensSelect.value === 'low' ? 1.4 : 1.0));

    if (isSpike && centroidVoicey && (now - lastTrigger > cooldown)) {
      // Map rms to confidence (70-98%)
      const norm = Math.min(1, (rms - threshold) / (0.5 + threshold));
      const confidence = Math.round(70 + norm * 28);

      // trigger incident UI updates
      lastTrigger = now;
      window.incidentTriggered = true; // keep global flag like your timestamp script uses

      setDashboard('HIGH', confidence, `Screaming detected (${confidence}%)`);
      showBanner(confidence);
      insertAlert({
        type: 'DANGER: Screaming Detected',
        summary: `High-pitched screaming detected with ${confidence}% confidence. Possible distress situation.`,
        confidence,
        location: 'Camera 12 - Downtown Market Street',
        timeText: 'Just now'
      });
      bumpThreatCounter();

      // dispatch custom event
      try { document.dispatchEvent(new CustomEvent('senticam:incident', { detail: { confidence, rms, time: new Date() } })); } catch (e) {}

      // after trigger, keep ambient higher briefly to avoid re-triggering on same event
      ambientRms = Math.max(ambientRms, rms * 0.8);
    }

    // also slowly decay ambientRms to adapt to environment
    ambientRms = ambientRms * 0.995 + rms * 0.005;
  }

  // Start the polling loop once audio context is resumed (user gesture may be required)
  let pollHandle = null;
  function startPolling() {
    if (pollHandle) return;
    // ensure audio context is running
    if (ctx.state === 'suspended') {
      ctx.resume().catch(()=>{ /* user gesture needed */ });
    }
    pollHandle = setInterval(detectionStep, POLL_MS);
  }

  function stopPolling() {
    if (!pollHandle) return;
    clearInterval(pollHandle);
    pollHandle = null;
  }

  // try to auto-start on user gesture or immediately if possible
  startPolling();
  // also add click/touch hook so user gesture resumes audio context if blocked
  const resumeHandler = () => { ctx.resume().then(startPolling).catch(()=>{}); window.removeEventListener('click', resumeHandler); window.removeEventListener('touchstart', resumeHandler); };
  window.addEventListener('click', resumeHandler, { once: true });
  window.addEventListener('touchstart', resumeHandler, { once: true });

  // expose a tiny API for debug or manual triggers
  window.SentiCamAIDetector = {
    start: startPolling,
    stop: stopPolling,
    triggerTest: () => {
      // create a test alert to verify UI wiring
      setDashboard('HIGH', 89, 'Screaming detected (89%)');
      showBanner(89, 'Test: simulated shouting detected');
      insertAlert({
        type: 'DANGER: Test Shout',
        summary: 'This is a manually triggered test alert.',
        confidence: 89,
        location: 'Camera 99 - Test',
        timeText: 'Just now'
      });
      bumpThreatCounter();
    }
  };

  console.log('AI Detector initialized (shout detection).');

})();
