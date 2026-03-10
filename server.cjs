const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
let adminSession = null;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const dataDirectory = process.env.DATA_DIR || process.env.RENDER_DISK_MOUNT_PATH || __dirname;
const databasePath = path.join(dataDirectory, 'users.db');

app.set('trust proxy', 1);

fs.mkdirSync(dataDirectory, { recursive: true });

function isAllowedDevOrigin(origin) {
	if (!origin) return false;
	return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

app.use((req, res, next) => {
	const origin = req.headers.origin;

	if (isAllowedDevOrigin(origin)) {
		res.header('Access-Control-Allow-Origin', origin);
		res.header('Vary', 'Origin');
		res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
	}

	if (req.method === 'OPTIONS') {
		return res.sendStatus(204);
	}

	next();
});

function dbRun(sql, params = []) {
	return new Promise((resolve, reject) => {
		db.run(sql, params, function(err) {
			if (err) return reject(err);
			resolve(this);
		});
	});
}

function dbGet(sql, params = []) {
	return new Promise((resolve, reject) => {
		db.get(sql, params, (err, row) => {
			if (err) return reject(err);
			resolve(row);
		});
	});
}

function getBaseUrl(req) {
	return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

function normalizeEmail(email) {
	return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
	return typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function isPaidCheckoutSession(session) {
	return session && session.payment_status === 'paid';
}

function isPaymentAccessAvailable(payment) {
	return Boolean(payment && payment.payment_status === 'paid' && !payment.entry_consumed_at);
}

function isLocalRequest(req) {
	const host = (req.hostname || '').toLowerCase();
	const forwardedFor = String(req.headers['x-forwarded-for'] || '').toLowerCase();
	const ip = String(req.ip || '').toLowerCase();
	return host === 'localhost'
		|| host === '127.0.0.1'
		|| host === '::1'
		|| ip === '127.0.0.1'
		|| ip === '::1'
		|| ip.endsWith(':127.0.0.1')
		|| forwardedFor.includes('127.0.0.1')
		|| forwardedFor.includes('::1');
}

async function persistChallengePayment(session, accessSource) {
	const customerEmail = normalizeEmail(
		session?.customer_details?.email ||
		session?.customer_email ||
		session?.metadata?.email
	);

	if (!customerEmail) return null;

	const status = session.payment_status || 'unpaid';
	const paidAt = isPaidCheckoutSession(session) ? new Date().toISOString() : null;

	await dbRun(
		`INSERT INTO challenge_payments (
			email,
			payment_status,
			stripe_session_id,
			stripe_payment_intent_id,
			paid_at,
			entry_consumed_at,
			amount_total,
			currency,
			access_source,
			customer_email
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(email) DO UPDATE SET
			payment_status = excluded.payment_status,
			stripe_session_id = excluded.stripe_session_id,
			stripe_payment_intent_id = excluded.stripe_payment_intent_id,
			paid_at = excluded.paid_at,
			entry_consumed_at = CASE
				WHEN challenge_payments.stripe_session_id IS NOT excluded.stripe_session_id THEN NULL
				ELSE challenge_payments.entry_consumed_at
			END,
			amount_total = excluded.amount_total,
			currency = excluded.currency,
			access_source = excluded.access_source,
			customer_email = excluded.customer_email`,
		[
			customerEmail,
			status,
			session.id || null,
			session.payment_intent || null,
			paidAt,
			null,
			session.amount_total || 0,
			session.currency || process.env.STRIPE_CURRENCY || 'aud',
			accessSource || 'stripe-checkout',
			customerEmail
		]
	);

	return {
		email: customerEmail,
		paid: status === 'paid',
		stripeSessionId: session.id || null
	};
}

async function retrieveAndPersistCheckoutSession(sessionId, accessSource) {
	if (!stripe) throw new Error('Stripe is not configured.');
	console.log('Retrieving Stripe Checkout session', sessionId, 'via', accessSource);
	const session = await stripe.checkout.sessions.retrieve(sessionId);
	await persistChallengePayment(session, accessSource);
	return session;
}

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
	if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
		return res.status(503).json({ error: 'Stripe webhook is not configured.' });
	}

	const signature = req.headers['stripe-signature'];
	let event;

	try {
		event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
	} catch (err) {
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}

	try {
		if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
			await persistChallengePayment(event.data.object, 'stripe-webhook');
		}
		res.json({ received: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to process webhook.' });
	}
});

app.use(express.json());

app.get('/app-config.js', (req, res) => {
	const appConfig = {
		videoBaseUrl: process.env.VIDEO_BASE_URL || ''
	};

	res.type('application/javascript');
	res.send(`window.APP_CONFIG = Object.assign({}, window.APP_CONFIG || {}, ${JSON.stringify(appConfig)});`);
});

app.use(express.static(__dirname));

app.get('/health', (req, res) => {
	res.json({ ok: true });
});

function requireAdmin(req, res, next) {
	if (req.headers['x-admin-token'] && req.headers['x-admin-token'] === adminSession) {
		return next();
	}
	return res.status(401).json({ error: 'Unauthorized' });
}
const db = new sqlite3.Database(databasePath);
db.serialize(() => {
	db.run(`CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT UNIQUE,
		name TEXT,
		age INTEGER,
		sex TEXT,
		registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`);
	db.run(`CREATE TABLE IF NOT EXISTS challenge_payments (
		email TEXT PRIMARY KEY,
		payment_status TEXT NOT NULL,
		stripe_session_id TEXT,
		stripe_payment_intent_id TEXT,
		paid_at DATETIME,
		entry_consumed_at DATETIME,
		amount_total INTEGER DEFAULT 0,
		currency TEXT DEFAULT 'aud',
		access_source TEXT,
		customer_email TEXT
	)`);
	db.run('ALTER TABLE challenge_payments ADD COLUMN entry_consumed_at DATETIME', (err) => {
		if (err && !/duplicate column name/i.test(err.message)) {
			console.error('Failed to ensure entry_consumed_at column exists:', err.message);
		}
	});
});
const smtpPort = Number(process.env.SMTP_PORT || 587);
const transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST,
	port: smtpPort,
	secure: smtpPort === 465,
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS
	}
});
app.post('/api/payments/create-checkout-session', async (req, res) => {
	if (!stripe) {
		return res.status(503).json({ error: 'Stripe is not configured on the server.' });
	}

	const { email, name, userId } = req.body;
	const normalizedEmail = normalizeEmail(email);
	const amount = Number(process.env.CHALLENGE_PRICE_CENTS || 5000);
	const currency = (process.env.STRIPE_CURRENCY || 'aud').toLowerCase();

	if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
		return res.status(400).json({ error: 'A valid email address is required.' });
	}

	if (!Number.isInteger(amount) || amount < 50) {
		return res.status(500).json({ error: 'Challenge price configuration is invalid.' });
	}

	try {
		const baseUrl = getBaseUrl(req);
		const session = await stripe.checkout.sessions.create({
			mode: 'payment',
			client_reference_id: userId ? String(userId) : normalizedEmail,
			success_url: `${baseUrl}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${baseUrl}/payment.html?canceled=1`,
			line_items: [
				{
					price_data: {
						currency,
						product_data: {
							name: '50 of 50 One-Time Event Entry',
							description: 'One-time payment for one official 50 of 50 event challenge entry.'
						},
						unit_amount: amount
					},
					quantity: 1
				}
			],
			metadata: {
				email: normalizedEmail,
				name: name || '',
				userId: userId ? String(userId) : ''
			}
		});

		res.json({ url: session.url, id: session.id });
	} catch (err) {
		res.status(500).json({ error: 'Failed to create Stripe Checkout session.' });
	}
});
app.get('/api/stripe/checkout-session-status', async (req, res) => {
	if (!stripe) {
		return res.status(503).json({ error: 'Stripe is not configured on the server.' });
	}

	const sessionId = req.query.session_id;
	if (!sessionId) {
		return res.status(400).json({ error: 'session_id is required.' });
	}

	try {
		const session = await retrieveAndPersistCheckoutSession(sessionId, 'stripe-success-page');
		res.json({
			paid: isPaidCheckoutSession(session),
			status: session.status,
			paymentStatus: session.payment_status,
			customerEmail: normalizeEmail(
				session?.customer_details?.email ||
				session?.customer_email ||
				session?.metadata?.email
			),
			stripeSessionId: session.id
		});
	} catch (err) {
		console.error('Failed to verify checkout session', sessionId, err);
		res.status(500).json({ error: 'Failed to verify checkout session.' });
	}
});
app.get('/api/payments/status', async (req, res) => {
	const email = normalizeEmail(req.query.email);

	if (!email) {
		return res.status(400).json({ error: 'email is required.' });
	}

	try {
		const payment = await dbGet(
			`SELECT email, payment_status, stripe_session_id, paid_at, entry_consumed_at, amount_total, currency, access_source
			 FROM challenge_payments
			 WHERE email = ?`,
			[email]
		);

		res.json({
			paid: Boolean(payment && payment.payment_status === 'paid'),
			accessAvailable: isPaymentAccessAvailable(payment),
			payment: payment
				? {
					email: payment.email,
					status: payment.payment_status,
					stripeSessionId: payment.stripe_session_id,
					paidAt: payment.paid_at,
					consumedAt: payment.entry_consumed_at,
					amountTotal: payment.amount_total,
					currency: payment.currency,
					accessSource: payment.access_source
				}
				: null
		});
	} catch (err) {
		res.status(500).json({ error: 'Failed to check payment status.' });
	}
});
app.post('/api/payments/consume-entry', async (req, res) => {
	const email = normalizeEmail(req.body?.email);

	if (!email) {
		return res.status(400).json({ error: 'email is required.' });
	}

	try {
		const payment = await dbGet(
			`SELECT email, payment_status, stripe_session_id, entry_consumed_at
			 FROM challenge_payments
			 WHERE email = ?`,
			[email]
		);

		if (!payment || payment.payment_status !== 'paid') {
			return res.status(404).json({ error: 'No paid event entry found for this email.' });
		}

		if (payment.entry_consumed_at) {
			return res.json({
				success: true,
				alreadyConsumed: true,
				payment: {
					email: payment.email,
					status: payment.payment_status,
					stripeSessionId: payment.stripe_session_id,
					consumedAt: payment.entry_consumed_at
				}
			});
		}

		const consumedAt = new Date().toISOString();
		await dbRun(
			`UPDATE challenge_payments
			 SET entry_consumed_at = ?
			 WHERE email = ?`,
			[consumedAt, email]
		);

		return res.json({
			success: true,
			payment: {
				email,
				status: 'paid',
				stripeSessionId: payment.stripe_session_id,
				consumedAt
			}
		});
	} catch (err) {
		return res.status(500).json({ error: 'Failed to consume event entry.' });
	}
});
app.post('/api/payments/reset-entry', async (req, res) => {
	if (!isLocalRequest(req)) {
		return res.status(403).json({ error: 'Reset is only available for local testing.' });
	}

	const email = normalizeEmail(req.body?.email);

	if (!email) {
		return res.status(400).json({ error: 'email is required.' });
	}

	try {
		const payment = await dbGet(
			`SELECT email, payment_status, stripe_session_id
			 FROM challenge_payments
			 WHERE email = ?`,
			[email]
		);

		if (!payment || payment.payment_status !== 'paid') {
			return res.status(404).json({ error: 'No paid event entry found for this email.' });
		}

		await dbRun(
			`UPDATE challenge_payments
			 SET entry_consumed_at = NULL
			 WHERE email = ?`,
			[email]
		);

		return res.json({
			success: true,
			payment: {
				email,
				status: 'paid',
				stripeSessionId: payment.stripe_session_id,
				consumedAt: null
			}
		});
	} catch (err) {
		return res.status(500).json({ error: 'Failed to reset event entry.' });
	}
});
app.post('/api/contact', async (req, res) => {
	const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
	const email = normalizeEmail(req.body?.email);
	const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
	const contactRecipient = process.env.CONTACT_TO_EMAIL || process.env.FROM_EMAIL;

	if (!name || !email || !message) {
		return res.status(400).json({ error: 'Name, email, and message are required.' });
	}

	if (name.length < 2) {
		return res.status(400).json({ error: 'Please enter a valid name.' });
	}

	if (!isValidEmail(email)) {
		return res.status(400).json({ error: 'Please enter a valid email address.' });
	}

	if (!contactRecipient) {
		return res.status(503).json({ error: 'Contact email is not configured on the server.' });
	}

	try {
		await transporter.sendMail({
			from: process.env.FROM_EMAIL,
			to: contactRecipient,
			replyTo: email,
			subject: `50 of 50 contact form: ${name}`,
			text: [
				'New message from the 50 of 50 contact form.',
				'',
				`Name: ${name}`,
				`Email: ${email}`,
				'',
				'Message:',
				message
			].join('\n')
		});

		return res.json({ success: true });
	} catch (err) {
		console.error('Failed to send contact form email:', err);
		return res.status(500).json({ error: 'Failed to send contact email.' });
	}
});
app.post('/register', (req, res) => {
	const { email, name, age, sex } = req.body;
	if (!email || !name || !age || !sex) return res.status(400).json({ error: 'All fields required.' });
	if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format.' });
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
	if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format.' });
	if (typeof name !== 'string' || name.length < 2) return res.status(400).json({ error: 'Name too short.' });
	if (typeof finishTime !== 'string' || finishTime.length < 3) return res.status(400).json({ error: 'Invalid finish time.' });
	if (!Number.isInteger(globalRank) || globalRank < 1) return res.status(400).json({ error: 'Invalid global rank.' });
	if (!Number.isInteger(ageSexRank) || ageSexRank < 1) return res.status(400).json({ error: 'Invalid age/sex rank.' });
	try {
		const doc = new PDFDocument({ size: 'A4', margin: 50 });
		const certPath = path.join(__dirname, `certificate-${Date.now()}.pdf`);
		const writeStream = fs.createWriteStream(certPath);
		doc.pipe(writeStream);
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

		writeStream.on('finish', async () => {
			try {
				console.log('Sending certificate email to', email, 'with PDF', certPath);
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
				console.error('Failed to send certificate email:', err);
				if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
				res.status(500).json({ error: 'Failed to send email.' });
			}
		});

		writeStream.on('error', (err) => {
			console.error('Failed to write certificate PDF:', err);
			if (!res.headersSent) {
				res.status(500).json({ error: 'Failed to generate certificate.' });
			}
		});

		doc.end();
	} catch (err) {
		console.error('Failed to generate certificate:', err);
		res.status(500).json({ error: 'Failed to generate certificate.' });
	}
});
app.listen(process.env.PORT || 3001, () => {
	console.log('Backend running on port', process.env.PORT || 3001);
	console.log('Using SQLite database at', databasePath);
});
// Entry point for the backend server (renamed from server.js to server.cjs)
// No code changes needed, just use: node server.cjs
