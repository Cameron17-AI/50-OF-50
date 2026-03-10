const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();


const contactForm = document.getElementById("contactForm");
const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const contactMsg = document.getElementById("contactMsg");
const contactStatus = document.getElementById("contactStatus");


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
