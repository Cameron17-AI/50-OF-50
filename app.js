let challenge = [];
let idx = 0;
let startTime = null;
let tick = null;
let movementStartTime = null;
let movementLockTimer = null;
const resolveVideoUrl = window.resolveVideoUrl || ((videoPath) => videoPath || '');
const setVideoElementSource = window.setVideoElementSource || ((videoEl, videoPath) => {
  if (videoEl) {
    videoEl.src = resolveVideoUrl(videoPath);
  }
});

const QUIT_STATE_KEY = '50of50_quit_state';
const QUIT_IDX_KEY = '50of50_quit_idx';
const RESUME_REQUESTED_KEY = '50of50_resume_requested';
const FLAG_LOG_KEY = '50of50_flag_logs';
const FORFEIT_DETAILS_KEY = '50of50_forfeit_details';
const TIMING_SCALE_KEY = '50of50_timing_scale';

const FLAG_THRESHOLDS = {
  severe: { forfeitAt: 5, warnAt: [2, 4] },
  moderate: { forfeitAt: 20, warnAt: [10, 15] },
  light: { forfeitAt: 50, warnAt: [25, 40] }
};

let integrityState = createIntegrityState();

const el = (id) => document.getElementById(id);

function fmt(ms) {
  const d = new Date(ms);
  return d.toISOString().substr(11, 8);
}

function setButtons(state) {
  el("startBtn").disabled = !state.canStart;
  el("doneBtn").disabled  = !state.canDone;
  el("resetBtn").disabled = !state.canReset;
}

function updateMovementLockState() {
  const m = challenge[idx];
  const timingProfile = getMovementTimingProfile(m);
  const lockTimeSeconds = timingProfile.hardLockSeconds || 0;
  
  if (lockTimeSeconds === 0 || !movementStartTime) {
    return;
  }
}

function renderMovement() {
  const m = challenge[idx];
  el("progress").textContent = `Movement ${idx + 1} of ${challenge.length}`;
  el("movementName").textContent = m.name;
  el("movementReps").textContent = `${m.reps} reps`;
  el("movementDesc").textContent = m.description || "";
  el("videoCounter").textContent = `${idx + 1} of ${challenge.length}`;

  // Update the main video section
  const videoEl = el("movementVideo");
  if (m.video) {
    setVideoElementSource(videoEl, m.video);
    videoEl.currentTime = 0;
    videoEl.muted = true;
    videoEl.play();
  } else {
    videoEl.src = "";
  }

  // Initialize movement timer for lock state
  movementStartTime = Date.now();
  if (movementLockTimer) clearInterval(movementLockTimer);
  updateMovementLockState();
  movementLockTimer = setInterval(updateMovementLockState, 100);
}

function startTimer() {
  startTime = Date.now();
  tick = setInterval(() => {
    el("timer").textContent = fmt(Date.now() - startTime);
  }, 250);
}

function stopTimer() {
  if (tick) clearInterval(tick);
  tick = null;
}

function createIntegrityState() {
  return {
    severe: 0,
    moderate: 0,
    light: 0,
    totalFlags: 0
  };
}

function clearForfeitDetails() {
  sessionStorage.removeItem(FORFEIT_DETAILS_KEY);
}

function getFlagLogs() {
  try {
    return JSON.parse(localStorage.getItem(FLAG_LOG_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveFlagLogs(logs) {
  localStorage.setItem(FLAG_LOG_KEY, JSON.stringify(logs.slice(-250)));
}

function appendFlagLog(entry) {
  const logs = getFlagLogs();
  logs.push(entry);
  saveFlagLogs(logs);
}

function setIntegrityMessage(message, type) {
  const noticeEl = el('integrityNotice');
  if (!noticeEl) return;

  noticeEl.textContent = message || '';
  if (!message) {
    noticeEl.style.color = '';
    return;
  }

  noticeEl.style.color = type === 'error' ? '#ff7d7d' : '#ffcc66';
}

function getTimingScale() {
  if (!window.authStore || !window.authStore.shouldShowDeveloperBypass()) {
    return 1;
  }

  const params = new URLSearchParams(window.location.search);
  const rawScale = params.get('timingScale');

  if (rawScale) {
    const parsedScale = Number(rawScale);
    if (Number.isFinite(parsedScale) && parsedScale > 0 && parsedScale <= 1) {
      localStorage.setItem(TIMING_SCALE_KEY, String(parsedScale));
      return parsedScale;
    }
  }

  if (params.get('timingtest') === '1') {
    localStorage.setItem(TIMING_SCALE_KEY, '0.1');
    return 0.1;
  }

  const storedScale = Number(localStorage.getItem(TIMING_SCALE_KEY) || '1');
  if (Number.isFinite(storedScale) && storedScale > 0 && storedScale <= 1) {
    return storedScale;
  }

  return 1;
}

function getMovementTimingProfile(movement) {
  const scale = getTimingScale();
  const fiveRepSeconds = Number(movement?.fiveRepSeconds || 0);
  let hardLockSeconds = Number(movement?.lockTime || 0);
  let minimumTotalSeconds = Number(movement?.totalTime || 0);
  let severeSeconds = Number(movement?.severeTime || 0);
  let moderateSeconds = Number(movement?.moderateTime || 0);
  let lightSeconds = Number(movement?.lightTime || 0);

  if (fiveRepSeconds > 0) {
    if (minimumTotalSeconds <= 0) {
      minimumTotalSeconds = fiveRepSeconds * 10;
    }
    if (hardLockSeconds <= 0) {
      hardLockSeconds = fiveRepSeconds * 6;
    }
  } else if (hardLockSeconds > 0) {
    minimumTotalSeconds = hardLockSeconds / 0.6;
  }

  if (minimumTotalSeconds > 0) {
    if (severeSeconds <= 0) severeSeconds = minimumTotalSeconds * 0.65;
    if (moderateSeconds <= 0) moderateSeconds = minimumTotalSeconds * 0.70;
    if (lightSeconds <= 0) lightSeconds = minimumTotalSeconds * 0.75;
  }

  hardLockSeconds *= scale;
  minimumTotalSeconds *= scale;
  severeSeconds *= scale;
  moderateSeconds *= scale;
  lightSeconds *= scale;

  if (minimumTotalSeconds <= 0) {
    return {
      hardLockSeconds: hardLockSeconds || 0,
      severeSeconds: 0,
      moderateSeconds: 0,
      lightSeconds: 0,
      minimumTotalSeconds: 0
    };
  }

  return {
    hardLockSeconds,
    severeSeconds,
    moderateSeconds,
    lightSeconds,
    minimumTotalSeconds
  };
}

function classifySuspiciousCompletion(elapsedSeconds, timingProfile) {
  if (!timingProfile || timingProfile.minimumTotalSeconds <= 0) return null;
  if (elapsedSeconds < timingProfile.severeSeconds) return 'severe';
  if (elapsedSeconds < timingProfile.moderateSeconds) return 'moderate';
  if (elapsedSeconds < timingProfile.lightSeconds) return 'light';
  return null;
}

function getWarningMessage(bucket, count) {
  if (bucket === 'severe') {
    return count >= 4
      ? 'Final warning: multiple movement completion times are outside expected limits. Another impossible split may forfeit this attempt.'
      : 'Warning: several movement completion times are outside expected limits. Continued impossible pacing may forfeit this attempt.';
  }

  return 'Warning: repeated suspicious movement times are being logged for this attempt.';
}

function storeForfeitDetails(reason, entry) {
  const details = {
    reason,
    entry,
    counts: {
      severe: integrityState.severe,
      moderate: integrityState.moderate,
      light: integrityState.light,
      totalFlags: integrityState.totalFlags
    },
    recentLogs: getFlagLogs().slice(-10),
    createdAt: new Date().toISOString()
  };

  sessionStorage.setItem(FORFEIT_DETAILS_KEY, JSON.stringify(details));
}

async function consumeEntryForForfeit(currentUser, consumedAt) {
  if (window.authStore && typeof window.authStore.consumeChallengeAccess === 'function' && currentUser) {
    window.authStore.consumeChallengeAccess(currentUser.id, {
      source: 'challenge-forfeit-local',
      consumedAt,
      reference: currentUser.paymentReference || null
    });
  }

  if (currentUser?.email && window.authStore && typeof window.authStore.apiUrl === 'function') {
    try {
      await fetch(window.authStore.apiUrl('/api/payments/consume-entry'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email })
      });
    } catch (error) {
      console.error('Could not consume forfeited event entry on the server.', error);
    }
  }
}

async function forfeitChallenge(reason, entry) {
  stopTimer();
  if (movementLockTimer) clearInterval(movementLockTimer);
  clearQuitProgress();
  const currentUser = window.authStore?.getCurrentUser?.() || JSON.parse(localStorage.getItem('50of50_currentUser') || 'null');
  const consumedAt = new Date().toISOString();
  await consumeEntryForForfeit(currentUser, consumedAt);
  storeForfeitDetails(reason, entry);
  window.location.replace('forfeit.html');
}

async function recordSuspiciousCompletion(movement, elapsedSeconds, timingProfile, bucket) {
  integrityState[bucket] += 1;
  integrityState.totalFlags += 1;

  const entry = {
    createdAt: new Date().toISOString(),
    movementId: movement.id,
    movementName: movement.name,
    bucket,
    elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
    hardLockSeconds: Number(timingProfile.hardLockSeconds.toFixed(2)),
    minimumTotalSeconds: Number(timingProfile.minimumTotalSeconds.toFixed(2)),
    ratio: Number((elapsedSeconds / timingProfile.minimumTotalSeconds).toFixed(3))
  };

  appendFlagLog(entry);
  console.warn('Suspicious movement timing logged:', entry);

  const threshold = FLAG_THRESHOLDS[bucket];
  if (threshold.warnAt.includes(integrityState[bucket])) {
    setIntegrityMessage(getWarningMessage(bucket, integrityState[bucket]), 'warning');
  }

  if (integrityState[bucket] >= threshold.forfeitAt) {
    const reason = `Challenge forfeited due to repeated impossible time constraints (${bucket} timing threshold exceeded).`;
    await forfeitChallenge(reason, entry);
    return true;
  }

  return false;
}

function clearQuitProgress() {
  sessionStorage.removeItem(QUIT_STATE_KEY);
  sessionStorage.removeItem(QUIT_IDX_KEY);
  sessionStorage.removeItem(RESUME_REQUESTED_KEY);
}

function resetUI() {
  stopTimer();
  if (movementLockTimer) clearInterval(movementLockTimer);
  clearQuitProgress();
  clearForfeitDetails();
  integrityState = createIntegrityState();
  idx = 0;
  startTime = null;
  movementStartTime = null;
  el("timer").textContent = "00:00:00";
  el("progress").textContent = `Movement 1 of ${challenge.length || 50}`;
  el("movementName").textContent = challenge[0]?.name || "Push-ups";
  el("movementReps").textContent = `${challenge[0]?.reps || 50} reps`;
  el("movementDesc").textContent = challenge[0]?.description || "";
  el("videoCounter").textContent = `1 of ${challenge.length || 50}`;
  const videoEl = el("movementVideo");
  if (challenge[0]?.video) {
    setVideoElementSource(videoEl, challenge[0].video);
    videoEl.pause();
    videoEl.currentTime = 0;
  } else {
    videoEl.src = "";
  }
  el("finish").classList.add("hidden");
  el("finish").textContent = "";
  setIntegrityMessage('');
  setButtons({ canStart: true, canDone: false, canReset: false });
}

async function finish() {
  stopTimer();
  if (movementLockTimer) clearInterval(movementLockTimer);
  clearQuitProgress();
  const total = Date.now() - startTime;
  const currentUser = JSON.parse(localStorage.getItem('50of50_currentUser'));
  const localConsumedAt = new Date().toISOString();

  if (window.authStore && typeof window.authStore.consumeChallengeAccess === 'function' && currentUser) {
    window.authStore.consumeChallengeAccess(currentUser.id, {
      source: 'challenge-complete-local',
      consumedAt: localConsumedAt,
      reference: currentUser.paymentReference || null
    });
  }

  // Save result
  let results = JSON.parse(localStorage.getItem('50of50_results')) || [];
  results.push({
    userId: currentUser.id,
    name: currentUser.name,
    sex: currentUser.sex,
    age: currentUser.age,
    city: currentUser.city,
    finishTime: total,
    completedAt: new Date().toISOString()
  });
  localStorage.setItem('50of50_results', JSON.stringify(results));

  // Attempt to send certificate email
  el("finish").classList.remove("hidden");
  el("finish").textContent = `Finished. Total time: ${fmt(total)}.\nSending certificate...`;
  setButtons({ canStart: false, canDone: false, canReset: false });

  const completeFinishSequence = () => {
    window.location.replace('finished.html');
  };

  // Calculate global rank and ageSexRank (simple: sorted by finishTime)
  const sorted = results.slice().sort((a, b) => a.finishTime - b.finishTime);
  const globalRank = sorted.findIndex(r => r.userId === currentUser.id) + 1;
  const ageSexSorted = sorted.filter(r => r.sex === currentUser.sex && r.age === currentUser.age);
  const ageSexRank = ageSexSorted.findIndex(r => r.userId === currentUser.id) + 1;

  try {
    const consumeRes = await fetch(window.authStore.apiUrl('/api/payments/consume-entry'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email })
    });

    if (consumeRes.ok) {
      const consumeData = await consumeRes.json();
      if (window.authStore && typeof window.authStore.consumeChallengeAccess === 'function') {
        window.authStore.consumeChallengeAccess(currentUser.id, {
          source: 'challenge-complete',
          consumedAt: consumeData.payment?.consumedAt || localConsumedAt,
          reference: consumeData.payment?.stripeSessionId || null
        });
      }
    }
  } catch (err) {
    console.error('Could not consume event entry on the server.', err);
  }

  try {
    const controller = new AbortController();
    const certificateTimeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(window.authStore.apiUrl("/certificate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        email: currentUser.email,
        name: currentUser.name,
        finishTime: fmt(total),
        globalRank: globalRank || 1,
        ageSexRank: ageSexRank || 1
      })
    });
    clearTimeout(certificateTimeout);
    if (res.ok) {
      el("finish").textContent = `Finished. Total time: ${fmt(total)}.\nCertificate sent to your email!`;
    } else {
      el("finish").textContent = `Finished. Total time: ${fmt(total)}.\nCould not send certificate email.`;
    }
  } catch (err) {
    el("finish").textContent = `Finished. Total time: ${fmt(total)}.\nError sending certificate email.`;
  }

  // Redirect to finished page after 2 seconds
  setTimeout(() => {
    completeFinishSequence();
  }, 2000);
}

async function loadChallenge() {
  const res = await fetch("challenge.json");
  if (!res.ok) throw new Error("Could not load challenge.json");
  challenge = await res.json();
}

async function init() {
  await loadChallenge();
  const quitState = sessionStorage.getItem(QUIT_STATE_KEY);
  const resumeRequested = sessionStorage.getItem(RESUME_REQUESTED_KEY) === '1';

  if (quitState && resumeRequested) {
    try {
      const state = JSON.parse(quitState);
      idx = state.idx || 0;
      startTime = state.startTime || Date.now();
      // Resume timer from stored startTime
      stopTimer();
      el("timer").textContent = fmt(Date.now() - startTime);
      tick = setInterval(() => {
        el("timer").textContent = fmt(Date.now() - startTime);
      }, 250);
      renderMovement();
      setButtons({ canStart: false, canDone: true, canReset: true });
      sessionStorage.removeItem(RESUME_REQUESTED_KEY);
    } catch(e) { resetUI(); }
  } else {
    clearQuitProgress();
    resetUI();
  }

  el("startBtn").addEventListener("click", () => {
    clearQuitProgress();
    setButtons({ canStart: false, canDone: true, canReset: true });
    startTimer();
    renderMovement();
  });

  el("doneBtn").addEventListener("click", async () => {
    const movement = challenge[idx];
    const timingProfile = getMovementTimingProfile(movement);
    const elapsedSeconds = movementStartTime ? (Date.now() - movementStartTime) / 1000 : 0;

    if (timingProfile.hardLockSeconds > 0 && elapsedSeconds < timingProfile.hardLockSeconds) {
      return;
    }

    const bucket = classifySuspiciousCompletion(elapsedSeconds, timingProfile);
    if (bucket && await recordSuspiciousCompletion(movement, elapsedSeconds, timingProfile, bucket)) {
      return;
    }

    if (movementLockTimer) clearInterval(movementLockTimer);
    idx += 1;
    if (idx >= challenge.length) return finish();
    renderMovement();
  });

  el("resetBtn").addEventListener("click", resetUI);
  
  el("backBtn").addEventListener("click", () => {
    if (confirm("Are you sure? Your progress will be lost.")) {
      clearQuitProgress();
      window.location.href = 'records.html';
    }
  });

  // Quit button event
  const quitBtn = el("quitBtn");
  if (quitBtn) {
    quitBtn.addEventListener("click", () => {
      // Store current progress and timer in sessionStorage for quit flow
      sessionStorage.setItem(QUIT_IDX_KEY, idx);
      sessionStorage.setItem(QUIT_STATE_KEY, JSON.stringify({ idx, startTime }));
      sessionStorage.removeItem(RESUME_REQUESTED_KEY);
      window.location.href = 'dontquit.html';
    });
  }
}

init().catch((err) => {
  console.error(err);
  alert(err.message);
});
