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

function playVideoWhenReady(videoEl) {
  if (!videoEl) return;

  const playbackToken = String(Date.now()) + Math.random().toString(16).slice(2);
  videoEl.dataset.playbackToken = playbackToken;

  const attemptPlayback = () => {
    if (videoEl.dataset.playbackToken !== playbackToken) {
      return;
    }

    videoEl.play().catch(() => {});
  };

  if (videoEl.readyState >= 2) {
    attemptPlayback();
    return;
  }

  videoEl.addEventListener('loadeddata', attemptPlayback, { once: true });
}

function updateMovementLockState() {
  const m = challenge[idx];
  const lockTimeSeconds = m.lockTime || 0;
  
  if (lockTimeSeconds === 0 || !movementStartTime) {
    el("doneBtn").disabled = false;
    el("doneBtn").title = "";
    return;
  }

  const elapsedMs = Date.now() - movementStartTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const remainingSeconds = Math.max(0, lockTimeSeconds - elapsedSeconds);

  if (remainingSeconds > 0) {
    el("doneBtn").disabled = true;
    el("doneBtn").title = `Wait ${remainingSeconds}s before completing`;
  } else {
    el("doneBtn").disabled = false;
    el("doneBtn").title = "";
  }
}

function renderMovement() {
  const m = challenge[idx];
  el("progress").textContent = `Movement ${idx + 1} of ${challenge.length}`;
  el("movementName").textContent = m.name;
  el("movementReps").textContent = `${m.reps} reps`;
  el("movementDesc").textContent = m.description || "";
  el("videoCounter").textContent = `${idx + 1} of ${challenge.length}`;

  const media = [];
  if (m.image) media.push(`<img src="${m.image}" alt="${m.name}">`);
  // No video in the right-hand column
  el("media").innerHTML = media.join("");

  // Update the main video section
  const videoEl = el("movementVideo");
  if (m.video) {
    setVideoElementSource(videoEl, m.video);
    videoEl.loop = true;
    videoEl.muted = true;
    playVideoWhenReady(videoEl);
  } else {
    videoEl.src = "";
  }

  // Initialize movement timer for lock state
  movementStartTime = Date.now();
  
  // Clear old lock timer if exists
  if (movementLockTimer) clearInterval(movementLockTimer);
  
  // Update lock state immediately and every 100ms
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

function resetUI() {
  stopTimer();
  if (movementLockTimer) clearInterval(movementLockTimer);
  idx = 0;
  startTime = null;
  movementStartTime = null;
  el("timer").textContent = "00:00:00";
  el("progress").textContent = "Ready";
  el("movementName").textContent = "Press Start";
  el("movementReps").textContent = "";
  el("movementDesc").textContent = "";
  el("media").innerHTML = "";
  el("videoCounter").textContent = "1 of 3";
  const videoEl = el("movementVideo");
  if (challenge[0]?.video) {
    setVideoElementSource(videoEl, challenge[0].video);
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.pause();
    videoEl.currentTime = 0;
  } else {
    videoEl.src = "";
  }
  el("finish").classList.add("hidden");
  el("finish").textContent = "";
  el("register-prompt").classList.add("hidden");
  setButtons({ canStart: true, canDone: false, canReset: false });
}

function finish() {
  stopTimer();
  if (movementLockTimer) clearInterval(movementLockTimer);
  const total = Date.now() - startTime;
  
  // Show finish message and redirect to register prompt
  el("finish").classList.remove("hidden");
  el("finish").textContent = `Demo completed! Total time: ${fmt(total)}.`;
  setButtons({ canStart: false, canDone: false, canReset: false });
  
  // Show register prompt after 2 seconds
  setTimeout(() => {
    el("finish").classList.add("hidden");
    el("register-prompt").classList.remove("hidden");
  }, 2000);
}

async function loadChallenge() {
  const res = await fetch("demo-challenge.json");
  if (!res.ok) throw new Error("Could not load demo-challenge.json");
  challenge = await res.json();
  // Always limit to 3 movements for demo
  if (challenge.length > 3) challenge = challenge.slice(0, 3);
}

async function init() {
  await loadChallenge();
  resetUI();

  el("startBtn").addEventListener("click", () => {
    setButtons({ canStart: false, canDone: true, canReset: true });
    startTimer();
    renderMovement();
  });

  el("doneBtn").addEventListener("click", () => {
    if (movementLockTimer) clearInterval(movementLockTimer);
    idx += 1;
    // Always stop after 3 movements, even if challenge has more
    if (idx >= 3) return finish();
    renderMovement();
  });

  el("resetBtn").addEventListener("click", resetUI);
}

init().catch((err) => {
  console.error(err);
  alert(err.message);
});
