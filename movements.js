const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const grid = document.getElementById("grid");
const searchEl = document.getElementById("search");
const filterEl = document.getElementById("filter");
const countEl = document.getElementById("count");

let movements = [];

function categoryFor(name, desc) {
  const t = `${name} ${desc}`.toLowerCase();

  // pull patterns
  if (t.includes("pull") || t.includes("raise") || t.includes("swimmer") || t.includes("snow angel") || t.includes("scap")) return "pull";

  // push patterns
  if (t.includes("push-up") || t.includes("dip") || t.includes("pike push")) return "push";

  // legs patterns
  if (t.includes("squat") || t.includes("lunge") || t.includes("step-up") || t.includes("calf") || t.includes("jump squat") || t.includes("broad jump")) return "legs";

  // glutes patterns
  if (t.includes("glute") || t.includes("hip thrust") || t.includes("hinge") || t.includes("romanian") || t.includes("hamstring")) return "glutes";

  // core patterns
  if (t.includes("plank") || t.includes("sit-up") || t.includes("crunch") || t.includes("leg raise") || t.includes("hollow") || t.includes("flutter") || t.includes("v-up") || t.includes("russian") || t.includes("bicycle")) return "core";

  // full body patterns
  if (t.includes("burpee") || t.includes("bear crawl") || t.includes("bear plank") || t.includes("crab walk") || t.includes("mountain climber")) return "full";

  return "full";
}

function labelFor(cat) {
  return ({
    push: "Push",
    pull: "Pull",
    legs: "Legs",
    glutes: "Glutes",
    core: "Core",
    full: "Full body"
  })[cat] || "Full body";
}

function matches(m, query, cat) {
  const q = query.trim().toLowerCase();
  const hay = `${m.id} ${m.name} ${m.description}`.toLowerCase();
  const qok = !q || hay.includes(q);
  const cok = cat === "all" || m.category === cat;
  return qok && cok;
}

function render() {
  const q = searchEl.value || "";
  const cat = filterEl.value || "all";

  const filtered = movements.filter(m => matches(m, q, cat));
  countEl.textContent = `${filtered.length} movements`;

  grid.innerHTML = filtered.map(m => {
    let videoSrc = '';
    if (m.video) videoSrc = m.video;
    else if (m.id === 6) videoSrc = 'assets/videos/no.6singlearmpushups.mp4';
    else if (m.id === 7) videoSrc = 'assets/videos/no.7proneyraises.mp4';
    else if (m.id === 8) videoSrc = 'assets/videos/no.8stationarylunge.mp4';
    else if (m.id === 9) videoSrc = 'assets/videos/no.9standingcalfraises.mp4';
    else if (m.id === 10) videoSrc = 'assets/videos/no.10mountainclimbers.mp4';
    else if (m.id === 11) videoSrc = 'assets/videos/no.11declinepushups.mp4';
    else if (m.id === 12) videoSrc = 'assets/videos/no.12planktoetouch.mp4';
    else if (m.id === 13) videoSrc = 'assets/videos/no.13stepups.mp4';
    else if (m.id === 14) videoSrc = 'assets/videos/no.14hipthrusts.mp4';
    else if (m.id === 15) videoSrc = 'assets/videos/no.15bicyclecrunches.mp4';
    else if (m.id === 16) videoSrc = 'assets/videos/no.16widepushups.mp4';
    else if (m.id === 17) videoSrc = 'assets/videos/no.17floorswimmers.mp4';
    else if (m.id === 18) videoSrc = 'assets/videos/no.18temposquats.mp4';
    else if (m.id === 19) videoSrc = 'assets/videos/no.19russiantwists.mp4';
    else if (m.id === 20) videoSrc = 'assets/videos/no.20bearcrawlsteps.mp4';
    return `
      <article class="card card--overlay" data-id="${m.id}" onmouseenter="playMovementVideo(this)" onmouseleave="pauseMovementVideo(this)">
        <div class="card__video-bg">
            <video class="card__video" muted loop playsinline${videoSrc ? ` src='${videoSrc}'` : ''}></video>
            <div class="card__overlay-content">
              <div class="card__top">
                <div class="badge">${labelFor(m.category)}</div>
                <div class="num">#${m.id}</div>
              </div>
              <div class="name">${m.name}</div>
              <p class="desc">${m.description || ""}</p>
              <div class="reps"><span>Reps:</span> <strong>${m.reps}</strong></div>
            </div>
        </div>
      </article>
    `;
  }).join("");
}

async function init() {
  const res = await fetch("challenge.json");
  if (!res.ok) throw new Error("Could not load challenge.json");
  const data = await res.json();

  movements = data.map(m => ({
    ...m,
    category: categoryFor(m.name, m.description || "")
  }));

  render();

  searchEl.addEventListener("input", render);
  filterEl.addEventListener("change", render);
}

function playMovementVideo(card) {
  const video = card.querySelector('.card__video');
  if (video && video.src) {
    video.play();
  }
}

function pauseMovementVideo(card) {
  const video = card.querySelector('.card__video');
  if (video) {
    video.pause();
    video.currentTime = 0;
  }
}

init().catch(err => {
  console.error(err);
  countEl.textContent = "Error loading movements.";
  grid.innerHTML = `<div class="muted">${err.message}</div>`;
});
