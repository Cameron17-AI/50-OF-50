const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();


const app = express();
app.use(express.json());

// Serve static files from the Backend directory
app.use(express.static(__dirname));

// Simple in-memory admin session (for demonstration)
let adminSession = null;

// Middleware for admin authentication
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] && req.headers['x-admin-token'] === adminSession) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// SQLite setup
const db = new sqlite3.Database('./users.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    name TEXT,
    age INTEGER,
    sex TEXT,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Registration endpoint
app.post('/register', (req, res) => {
  const { email, name, age, sex } = req.body;
  // Basic validation
  if (!email || !name || !age || !sex) return res.status(400).json({ error: 'All fields required.' });
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format.' });
  if (typeof name !== 'string' || name.length < 2) return res.status(400).json({ error: 'Name too short.' });
  if (!Number.isInteger(age) || age < 0 || age > 120) return res.status(400).json({ error: 'Invalid age.' });
  if (!['male', 'female', 'other'].includes(sex)) return res.status(400).json({ error: 'Invalid sex value.' });
  db.run('INSERT INTO users (email, name, age, sex) VALUES (?, ?, ?, ?)', [email, name, age, sex], function(err) {
    if (err) return res.status(400).json({ error: 'Email already registered or invalid.' });
    res.json({ success: true, id: this.lastID });
  });
});

// Admin login endpoint
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  // For demonstration, use hardcoded credentials (replace with env/config in production)
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    // Generate a simple session token
    adminSession = Math.random().toString(36).substring(2);
    return res.json({ token: adminSession });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// User list endpoint (admin only)
app.get('/users', requireAdmin, (req, res) => {
  db.all('SELECT id, email, name, age, sex, registered_at FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch users.' });
    res.json({ users: rows });
  });
});

// Certificate status endpoint (admin only)
// For demonstration, just checks if user exists
app.get('/certificate/status/:email', requireAdmin, (req, res) => {
  const { email } = req.params;
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!row) return res.status(404).json({ error: 'User not found.' });
    res.json({ registered: true, user: row });
  });
});

// Delete user endpoint (admin only)
app.delete('/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to delete user.' });
    if (this.changes === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true });
  });
});

// Certificate generation and email endpoint
app.post('/certificate', async (req, res) => {
  const { email, name, finishTime, globalRank, ageSexRank } = req.body;
  console.log('Received /certificate request:', req.body);
  // Basic validation
  if (!email || !name || !finishTime || !globalRank || !ageSexRank) {
    console.error('Missing required fields:', req.body);
    return res.status(400).json({ error: 'All fields required.' });
  }
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Invalid email format:', email);
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  if (typeof name !== 'string' || name.length < 2) {
    console.error('Name too short:', name);
    return res.status(400).json({ error: 'Name too short.' });
  }
  if (typeof finishTime !== 'string' || finishTime.length < 3) {
    console.error('Invalid finish time:', finishTime);
    return res.status(400).json({ error: 'Invalid finish time.' });
  }
  if (!Number.isInteger(globalRank) || globalRank < 1) {
    console.error('Invalid global rank:', globalRank);
    return res.status(400).json({ error: 'Invalid global rank.' });
  }
  if (!Number.isInteger(ageSexRank) || ageSexRank < 1) {
    console.error('Invalid age/sex rank:', ageSexRank);
    return res.status(400).json({ error: 'Invalid age/sex rank.' });
  }

  try {
    // Generate certificate PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const certPath = path.join(__dirname, 'certificate.pdf');
    doc.pipe(fs.createWriteStream(certPath));

    // ...existing code...

    doc.end();

    doc.on('finish', async () => {
      try {
        console.log('Attempting to send email to', email);
        await transporter.sendMail({
          from: process.env.FROM_EMAIL,
          to: email,
          subject: 'Your 50 of 50 Challenge Certificate',
          text: `Congratulations, ${name}!\n\nYou completed the 50 of 50 Challenge.\nFinish Time: ${finishTime}\nGlobal Rank: ${globalRank}\nAge/Sex Rank: ${ageSexRank}`,
          attachments: [{ filename: 'certificate.pdf', path: certPath }]
        });
        console.log('Email sent successfully to', email);
        fs.unlinkSync(certPath);
        res.json({ success: true });
      } catch (err) {
        console.error('Failed to send email:', err);
        res.status(500).json({ error: 'Failed to send email.', details: err.message });
      }
    });
  } catch (err) {
    console.error('Failed to generate certificate:', err);
    res.status(500).json({ error: 'Failed to generate certificate.', details: err.message });
  }
});

app.listen(process.env.PORT || 3001, () => {
  const port = process.env.PORT || 3001;
  console.log(`Backend running on port ${port}`);
});
