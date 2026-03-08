const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(__dirname));
let adminSession = null;
function requireAdmin(req, res, next) {
	if (req.headers['x-admin-token'] && req.headers['x-admin-token'] === adminSession) {
		return next();
	}
	return res.status(401).json({ error: 'Unauthorized' });
}
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
const transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST,
	port: process.env.SMTP_PORT,
	secure: false,
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS
	}
});
app.post('/register', (req, res) => {
	const { email, name, age, sex } = req.body;
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
app.post('/admin/login', (req, res) => {
	const { username, password } = req.body;
	if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
		adminSession = Math.random().toString(36).substring(2);
		return res.json({ token: adminSession });
	}
	res.status(401).json({ error: 'Invalid credentials' });
});
app.get('/users', requireAdmin, (req, res) => {
	db.all('SELECT id, email, name, age, sex, registered_at FROM users', [], (err, rows) => {
		if (err) return res.status(500).json({ error: 'Failed to fetch users.' });
		res.json({ users: rows });
	});
});
app.get('/certificate/status/:email', requireAdmin, (req, res) => {
	const { email } = req.params;
	db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
		if (err) return res.status(500).json({ error: 'Database error.' });
		if (!row) return res.status(404).json({ error: 'User not found.' });
		res.json({ registered: true, user: row });
	});
});
app.delete('/users/:id', requireAdmin, (req, res) => {
	const { id } = req.params;
	db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
		if (err) return res.status(500).json({ error: 'Failed to delete user.' });
		if (this.changes === 0) return res.status(404).json({ error: 'User not found.' });
		res.json({ success: true });
	});
});
app.post('/certificate', async (req, res) => {
	const { email, name, finishTime, globalRank, ageSexRank } = req.body;
	if (!email || !name || !finishTime || !globalRank || !ageSexRank) return res.status(400).json({ error: 'All fields required.' });
	if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format.' });
	if (typeof name !== 'string' || name.length < 2) return res.status(400).json({ error: 'Name too short.' });
	if (typeof finishTime !== 'string' || finishTime.length < 3) return res.status(400).json({ error: 'Invalid finish time.' });
	if (!Number.isInteger(globalRank) || globalRank < 1) return res.status(400).json({ error: 'Invalid global rank.' });
	if (!Number.isInteger(ageSexRank) || ageSexRank < 1) return res.status(400).json({ error: 'Invalid age/sex rank.' });
	try {
		const doc = new PDFDocument({ size: 'A4', margin: 50 });
		const certPath = path.join(__dirname, 'certificate.pdf');
		doc.pipe(fs.createWriteStream(certPath));
		doc.rect(0, 0, doc.page.width, doc.page.height).fill('#111');
		doc.save();
		doc.lineWidth(6);
		doc.strokeColor('#FFD700');
		doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke();
		doc.restore();
		doc.save();
		const beige = '#E9EECF';
		const darkBeige = '#44453A';
		const logoCenterX = doc.page.width / 2;
		const logoCenterY = doc.page.height / 2 - 40;
		doc.lineWidth(8);
		doc.strokeColor(darkBeige);
		doc.circle(logoCenterX, logoCenterY + 30, 110).stroke();
		doc.font('Helvetica-Bold').fontSize(90).fillColor(beige).opacity(0.18);
		doc.text('50', logoCenterX - 60, logoCenterY + 30, { width: 120, align: 'center', baseline: 'middle' });
		doc.restore();
		const contentStartY = 120;
		doc.font('Helvetica-Bold').fontSize(40).fillColor('#FFD700').opacity(1);
		doc.text('50 of 50 Challenge', 0, contentStartY, { align: 'center', width: doc.page.width });
		doc.moveDown();
		doc.font('Helvetica-Bold').fontSize(24).fillColor('#fff');
		doc.text('Certificate of Completion', 0, doc.y, { align: 'center', width: doc.page.width });
		doc.moveDown(2);
		doc.font('Helvetica').fontSize(18).fillColor('#FFD700');
		doc.text('This certifies that', 0, doc.y, { align: 'center', width: doc.page.width });
		doc.moveDown();
		doc.font('Helvetica-Bold').fontSize(32).fillColor('#fff');
		doc.font('Helvetica-Oblique').fontSize(32).fillColor('#fff');
		doc.text(name, 0, doc.y, { align: 'center', width: doc.page.width, underline: true });
		doc.moveDown();
		doc.font('Helvetica').fontSize(18).fillColor('#FFD700');
		doc.text('has completed the 50 of 50 Challenge', 0, doc.y, { align: 'center', width: doc.page.width });
		doc.moveDown();
		doc.font('Helvetica').fontSize(16).fillColor('#fff');
		doc.text(`Finish Time: ${finishTime}`, 0, doc.y, { align: 'center', width: doc.page.width });
		doc.text(`Global Rank: ${globalRank}`, 0, doc.y, { align: 'center', width: doc.page.width });
		doc.text(`Age/Sex Rank: ${ageSexRank}`, 0, doc.y, { align: 'center', width: doc.page.width });
		doc.moveDown(2);
		doc.font('Helvetica').fontSize(12).fillColor('#FFD700');
		doc.text('Date: ' + new Date().toLocaleDateString(), 0, doc.y, { align: 'center', width: doc.page.width });
		doc.moveDown(2);
		doc.font('Helvetica').fontSize(14).fillColor('#FFD700');
		doc.text('__________________________', logoCenterX - 100, doc.page.height - 140, { width: 200, align: 'center' });
		doc.text('Founder of 50 OF 50', logoCenterX - 100, doc.page.height - 120, { width: 200, align: 'center' });
		doc.font('Times-Italic').fontSize(32).fillColor('#fff');
		doc.text('C Bolt.', logoCenterX - 100, doc.page.height - 175, { width: 200, align: 'center' });
		doc.save();
		doc.circle(doc.page.width - 80, doc.page.height - 80, 30).fill('#FFD700');
		doc.font('Helvetica-Bold').fontSize(28).fillColor('#111').opacity(1);
		doc.text('✔', doc.page.width - 100, doc.page.height - 98, { width: 40, align: 'center' });
		doc.restore();
		doc.end();
		doc.on('finish', async () => {
			try {
				await transporter.sendMail({
					from: process.env.FROM_EMAIL,
					to: email,
					subject: 'Your 50 of 50 Challenge Certificate',
					text: `Congratulations, ${name}!\n\nYou completed the 50 of 50 Challenge.\nFinish Time: ${finishTime}\nGlobal Rank: ${globalRank}\nAge/Sex Rank: ${ageSexRank}`,
					attachments: [{ filename: 'certificate.pdf', path: certPath }]
				});
				fs.unlinkSync(certPath);
				res.json({ success: true });
			} catch (err) {
				res.status(500).json({ error: 'Failed to send email.' });
			}
		});
	} catch (err) {
		res.status(500).json({ error: 'Failed to generate certificate.' });
	}
});
app.listen(process.env.PORT || 3001, () => {
	console.log('Backend running on port', process.env.PORT || 3001);
});
// Entry point for the backend server (renamed from server.js to server.cjs)
// No code changes needed, just use: node server.cjs
