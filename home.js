const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();


const contactForm = document.getElementById("contactForm");
const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const contactMsg = document.getElementById("contactMsg");
const contactStatus = document.getElementById("contactStatus");

function formatLeaderboardTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "--:--:--";
  return new Date(ms).toISOString().substr(11, 8);
}

async function loadHomeLeaderboard() {
  const portraitCard = document.getElementById("homePortraitLeaderboard");
  const landscapeCard = document.getElementById("homeLandscapeLeaderboard");
  const desktopMiniCard = document.getElementById("homeDesktopMiniLeaderboard");
  const desktopCard = document.getElementById("homeDesktopLeaderboard");

  if (!portraitCard && !landscapeCard && !desktopMiniCard && !desktopCard) return;

  try {
    const leaderboardUrl = window.authStore && typeof window.authStore.apiUrl === "function"
      ? window.authStore.apiUrl("/api/results")
      : "/api/results";

    const response = await fetch(leaderboardUrl);
    if (!response.ok) return;

    const data = await response.json().catch(() => ({}));
    const results = Array.isArray(data.results) ? data.results : [];
    const finishers = results
      .filter((result) => typeof result.lastIdx !== "number" || result.lastIdx >= 49)
      .sort((a, b) => {
        if (a.finishTime !== b.finishTime) return a.finishTime - b.finishTime;
        return String(a.completedAt || "").localeCompare(String(b.completedAt || ""));
      })
      .slice(0, 3);

    if (finishers.length === 0) return;

    if (portraitCard) {
      const rows = portraitCard.querySelectorAll(".home-mobile-mini__row");
      if (rows.length >= 3) {
        rows.forEach((row, index) => {
          const result = finishers[index];
          if (!result) return;
          const nameEl = row.querySelector("span");
          const timeEl = row.querySelector("strong");
          if (nameEl) nameEl.textContent = `#${index + 1} ${String(result.name || "").trim().split(/\s+/)[0] || "Competitor"}`;
          if (timeEl) timeEl.textContent = formatLeaderboardTime(result.finishTime);
        });
      }
    }

    if (landscapeCard) {
      const rows = landscapeCard.querySelectorAll(".home-mobile-panel__row");
      rows.forEach((row, index) => {
        const result = finishers[index];
        if (!result) return;
        const nameEl = row.querySelector("span");
        const timeEl = row.querySelector("strong");
        if (nameEl) nameEl.textContent = `#${index + 1} ${result.name || "Competitor"}`;
        if (timeEl) timeEl.textContent = formatLeaderboardTime(result.finishTime);
      });
    }

    if (desktopMiniCard) {
      const rows = desktopMiniCard.querySelectorAll(".homeproof-mini__row");
      rows.forEach((row, index) => {
        const result = finishers[index];
        if (!result) return;
        const nameEl = row.querySelector("span");
        const timeEl = row.querySelector("strong");
        if (nameEl) nameEl.textContent = `#${index + 1} ${String(result.name || "").trim().split(/\s+/)[0] || "Competitor"}`;
        if (timeEl) timeEl.textContent = formatLeaderboardTime(result.finishTime);
      });
    }

    if (desktopCard) {
      const rows = desktopCard.querySelectorAll(".homeproof__row");
      rows.forEach((row, index) => {
        const result = finishers[index];
        if (!result) return;
        const nameEl = row.querySelector("span");
        const timeEl = row.querySelector("strong");
        if (nameEl) nameEl.textContent = `#${index + 1} ${result.name || "Competitor"}`;
        if (timeEl) timeEl.textContent = formatLeaderboardTime(result.finishTime);
      });
    }
  } catch (error) {
    // Keep the static fallback content if the shared leaderboard cannot be loaded.
  }
}


function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (contactName?.value || "").trim();
    const email = (contactEmail?.value || "").trim();
    const message = (contactMsg?.value || "").trim();
    if (!name) {
      contactStatus.textContent = "Please enter your name.";
      return;
    }
    if (!isValidEmail(email)) {
      contactStatus.textContent = "Please enter a valid email address.";
      return;
    }
    if (!message) {
      contactStatus.textContent = "Please enter a message.";
      return;
    }

    const submitButton = contactForm.querySelector('button[type="submit"]');

    try {
      if (submitButton) submitButton.disabled = true;
      contactStatus.textContent = "Sending message...";

      const contactUrl = window.authStore && typeof window.authStore.apiUrl === 'function'
        ? window.authStore.apiUrl('/api/contact')
        : '/api/contact';

      const response = await fetch(contactUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        contactStatus.textContent = data.error || 'Could not send your message right now.';
        return;
      }

      contactStatus.textContent = "Thank you! Your message has been sent.";
      contactForm.reset();
    } catch (error) {
      contactStatus.textContent = 'Could not send your message right now.';
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

loadHomeLeaderboard();
