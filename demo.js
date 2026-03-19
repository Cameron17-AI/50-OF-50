let challenge = [];
let idx = 0;
let startTime = null;
let tick = null;
let movementStartTime = null;
let movementLockTimer = null;
let demoBackgroundAudio = null;
let activeDemoTrackIndex = -1;
let isDemoMusicMuted = false;
let isDemoMusicPrimed = false;
let isDemoMusicBlocked = false;
const resolveVideoUrl = window.resolveVideoUrl || ((videoPath) => videoPath || '');
const resolveDemoAudioUrl = (audioPath) => String(audioPath || '').trim();
const setVideoElementSource = window.setVideoElementSource || ((videoEl, videoPath) => {
  if (videoEl) {
    videoEl.src = resolveVideoUrl(videoPath);
  }
});

const DEMO_MUSIC_TRACKS = [
  "assets/audio/demo-movement-1.mp3",
  "assets/audio/demo-movement-2.mp3",
  "assets/audio/demo-movement-3.mp3"
];

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

function scrollActiveDemoIntoView() {
  if (!window.matchMedia('(max-width: 900px)').matches) {
    return;
  }

  const activeDemo = document.querySelector('.main-content');
  if (!activeDemo) {
    return;
  }

  requestAnimationFrame(() => {
    const top = activeDemo.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  });
}

function scrollDemoCompletionIntoView() {
  const registerPrompt = el('register-prompt');
  const registerPromptButton = el('registerPromptBtn');
  const scrollTarget = registerPromptButton || registerPrompt;

  if (!registerPrompt || !scrollTarget) {
    return;
  }

  requestAnimationFrame(() => {
    scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
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

function ensureDemoAudioElement() {
  if (demoBackgroundAudio) return demoBackgroundAudio;

  demoBackgroundAudio = el("demoBackgroundAudio") || new Audio();
  demoBackgroundAudio.setAttribute('playsinline', '');
  demoBackgroundAudio.setAttribute('webkit-playsinline', '');
  demoBackgroundAudio.playsInline = true;
  demoBackgroundAudio.loop = true;
  demoBackgroundAudio.preload = 'auto';
  demoBackgroundAudio.volume = 0.5;
  demoBackgroundAudio.muted = isDemoMusicMuted;
  return demoBackgroundAudio;
}

function attemptDemoAudioPlay(audio) {
  const playPromise = audio.play();
  if (!playPromise || typeof playPromise.catch !== 'function') {
    isDemoMusicBlocked = false;
    updateMusicToggleButton();
    return;
  }

  playPromise.then(() => {
    isDemoMusicBlocked = false;
    updateMusicToggleButton();
  });

  playPromise.catch(() => {
    isDemoMusicBlocked = true;
    updateMusicToggleButton();

    const retryPlay = () => {
      audio.play().then(() => {
        isDemoMusicBlocked = false;
        updateMusicToggleButton();
      }).catch(() => {});
    };

    audio.addEventListener('canplay', retryPlay, { once: true });
    audio.addEventListener('canplaythrough', retryPlay, { once: true });
  });
}

async function primeDemoMusicPlayback() {
  const audio = ensureDemoAudioElement();
  if (isDemoMusicPrimed) return;

  if (!audio.src) {
    audio.src = resolveDemoAudioUrl(DEMO_MUSIC_TRACKS[0]);
  }

  const previousMuted = audio.muted;
  const previousVolume = audio.volume;

  audio.muted = true;
  audio.volume = 0;

  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    isDemoMusicPrimed = true;
  } catch (_) {
    isDemoMusicBlocked = true;
  } finally {
    audio.muted = isDemoMusicMuted || previousMuted;
    audio.volume = previousVolume;
    updateMusicToggleButton();
  }
}

function updateMusicToggleButton() {
  const musicToggleBtn = el("musicToggleBtn");
  if (!musicToggleBtn) return;
  if (isDemoMusicBlocked && !isDemoMusicMuted) {
    musicToggleBtn.textContent = "Music: Tap to Start";
    return;
  }
  musicToggleBtn.textContent = isDemoMusicMuted ? "Music: Off" : "Music: On";
}

function toggleDemoMusic() {
  if (isDemoMusicBlocked && !isDemoMusicMuted) {
    const movementIndex = Math.min(idx, DEMO_MUSIC_TRACKS.length - 1);
    playDemoMusicForMovement(Math.max(0, movementIndex));
    return;
  }

  isDemoMusicMuted = !isDemoMusicMuted;

  if (demoBackgroundAudio) {
    demoBackgroundAudio.muted = isDemoMusicMuted;
    if (!isDemoMusicMuted && startTime && idx < 3) {
      attemptDemoAudioPlay(demoBackgroundAudio);
    }
  }

  updateMusicToggleButton();
}

function stopDemoMusic() {
  if (!demoBackgroundAudio) {
    activeDemoTrackIndex = -1;
    return;
  }

  demoBackgroundAudio.pause();
  demoBackgroundAudio.currentTime = 0;
  activeDemoTrackIndex = -1;
}

function playDemoMusicForMovement(movementIndex) {
  const trackIndex = movementIndex % DEMO_MUSIC_TRACKS.length;
  const nextTrackSrc = DEMO_MUSIC_TRACKS[trackIndex];
  const audio = ensureDemoAudioElement();
  const resolvedTrackSrc = resolveDemoAudioUrl(nextTrackSrc);

  if (activeDemoTrackIndex !== trackIndex || !audio.src.includes(nextTrackSrc)) {
    audio.pause();
    audio.src = resolvedTrackSrc;
    audio.currentTime = 0;
    activeDemoTrackIndex = trackIndex;
  }

  audio.muted = isDemoMusicMuted;
  audio.loop = true;
  attemptDemoAudioPlay(audio);
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

  playDemoMusicForMovement(idx);

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
  stopDemoMusic();
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

async function getDemoCompletionCta() {
  if (!window.authStore) {
    return {
      href: 'signin.html',
      label: 'Enter Challenge',
      copy: 'Ready to compete and earn your right?'
    };
  }

  const currentUser = await window.authStore.syncChallengeAccessFromServer(window.authStore.getCurrentUser());
  const hasAccess = window.authStore.hasChallengeAccess(currentUser);

  if (currentUser && hasAccess) {
    return {
      href: 'challenge.html',
      label: 'Start Challenge',
      copy: 'Your event entry is active. Go straight into the official challenge.'
    };
  }

  return {
    href: currentUser ? window.authStore.getChallengeEntryPath(currentUser) : 'signin.html',
    label: 'Enter Challenge',
    copy: 'Ready to compete and earn your right?'
  };
}

async function updateDemoCompletionPrompt() {
  const promptButton = el('registerPromptBtn');
  const promptCopy = el('registerPromptCopy');

  if (!promptButton || !promptCopy) return;

  const cta = await getDemoCompletionCta();
  promptButton.href = cta.href;
  promptButton.textContent = cta.label;
  promptCopy.textContent = cta.copy;
}

function finish() {
  stopTimer();
  if (movementLockTimer) clearInterval(movementLockTimer);
  stopDemoMusic();
  const total = Date.now() - startTime;
  
  // Show finish message and redirect to register prompt
  el("finish").classList.remove("hidden");
  el("finish").textContent = `Demo completed! Total time: ${fmt(total)}.`;
  setButtons({ canStart: false, canDone: false, canReset: false });
  
  // Show register prompt after 2 seconds
  setTimeout(() => {
    el("finish").classList.add("hidden");
    el("register-prompt").classList.remove("hidden");
    updateDemoCompletionPrompt().catch(() => {});
    scrollDemoCompletionIntoView();
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
  updateMusicToggleButton();
  await updateDemoCompletionPrompt();

  el("startBtn").addEventListener("click", () => {
    primeDemoMusicPlayback().catch(() => {});
    setButtons({ canStart: false, canDone: true, canReset: true });
    startTimer();
    renderMovement();
    scrollActiveDemoIntoView();
  });

  el("doneBtn").addEventListener("click", () => {
    if (movementLockTimer) clearInterval(movementLockTimer);
    idx += 1;
    // Always stop after 3 movements, even if challenge has more
    if (idx >= 3) return finish();
    renderMovement();
  });

  el("resetBtn").addEventListener("click", resetUI);

  const musicToggleBtn = el("musicToggleBtn");
  if (musicToggleBtn) {
    musicToggleBtn.addEventListener("click", toggleDemoMusic);
  }

  document.addEventListener("touchstart", () => {
    primeDemoMusicPlayback().catch(() => {});
  }, { once: true, passive: true });
}

init().catch((err) => {
  console.error(err);
  alert(err.message);
});
