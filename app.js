let challenge = [];
let idx = 0;
let startTime = null;
let tick = null;
let movementStartTime = null;
let movementLockTimer = null;

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

  // Update the main video section
  const videoEl = el("movementVideo");
  if (m.video) {
    videoEl.src = m.video;
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

function resetUI() {
  stopTimer();
  if (movementLockTimer) clearInterval(movementLockTimer);
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
    videoEl.src = challenge[0].video;
    videoEl.pause();
    videoEl.currentTime = 0;
  } else {
    videoEl.src = "";
  }
  el("finish").classList.add("hidden");
  el("finish").textContent = "";
  setButtons({ canStart: true, canDone: false, canReset: false });
}

async function finish() {
  stopTimer();
  if (movementLockTimer) clearInterval(movementLockTimer);
  const total = Date.now() - startTime;
  const currentUser = JSON.parse(localStorage.getItem('50of50_currentUser'));

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

  // Calculate global rank and ageSexRank (simple: sorted by finishTime)
  const sorted = results.slice().sort((a, b) => a.finishTime - b.finishTime);
  const globalRank = sorted.findIndex(r => r.userId === currentUser.id) + 1;
  const ageSexSorted = sorted.filter(r => r.sex === currentUser.sex && r.age === currentUser.age);
  const ageSexRank = ageSexSorted.findIndex(r => r.userId === currentUser.id) + 1;

  try {
    const res = await fetch("http://localhost:3001/certificate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: currentUser.email,
        name: currentUser.name,
        finishTime: fmt(total),
        globalRank: globalRank || 1,
        ageSexRank: ageSexRank || 1
      })
    });
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
    window.location.href = 'finished.html';
  }, 2000);
}

async function loadChallenge() {
  const res = await fetch("challenge.json");
  if (!res.ok) throw new Error("Could not load challenge.json");
  challenge = await res.json();
}

async function init() {
  await loadChallenge();
  // Check if returning from quit page
  const quitState = sessionStorage.getItem('50of50_quit_state');
  if (quitState) {
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
      sessionStorage.removeItem('50of50_quit_state');
    } catch(e) { resetUI(); }
  } else {
    resetUI();
  }

  el("startBtn").addEventListener("click", () => {
    setButtons({ canStart: false, canDone: true, canReset: true });
    startTimer();
    renderMovement();
  });

  el("doneBtn").addEventListener("click", () => {
    if (movementLockTimer) clearInterval(movementLockTimer);
    idx += 1;
    if (idx >= challenge.length) return finish();
    renderMovement();
  });

  el("resetBtn").addEventListener("click", resetUI);
  
  el("backBtn").addEventListener("click", () => {
    if (confirm("Are you sure? Your progress will be lost.")) {
      window.location.href = 'records.html';
    }
  });

  // Quit button event
  const quitBtn = el("quitBtn");
  if (quitBtn) {
    quitBtn.addEventListener("click", () => {
      // Store current progress and timer in sessionStorage for quit flow
      sessionStorage.setItem('50of50_quit_idx', idx);
      sessionStorage.setItem('50of50_quit_state', JSON.stringify({ idx, startTime }));
      window.location.href = 'dontquit.html';
    });
  }
}

init().catch((err) => {
  console.error(err);
  alert(err.message);
});
