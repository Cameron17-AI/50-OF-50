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
  contactForm.addEventListener("submit", (e) => {
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
    // For now, just show a success message (no backend)
    contactStatus.textContent = "Thank you! Your message has been received.";
    contactForm.reset();
  });
}
