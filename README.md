# 50 of 50 Backend

This backend provides email registration, certificate generation, and email automation for the 50 of 50 challenge.

## Features
- Express.js server
- SQLite database for user registration
- Nodemailer for sending emails
- PDFKit for generating certificates

## Setup
1. Run `npm install` to install dependencies.
2. Start the server with `node server.js`.

## Endpoints
- `POST /register` — Register a user (email, name, age, sex)
- `POST /certificate` — Generate and email a certificate (admin/automation only)

## Configuration
- Set your SMTP/email credentials in `.env` (see `.env.example`).

---

This backend is designed to be connected to your frontend registration form. See server.js for API details.
