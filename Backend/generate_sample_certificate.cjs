// Run this script with: node generate_sample_certificate.cjs
// It will generate a sample certificate as certificate.pdf in the Backend folder.

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const name = 'Sample User';
const finishTime = '1:23:45';
const globalRank = 42;
const ageSexRank = 7;

const doc = new PDFDocument({ size: 'A4', margin: 50 });
const certPath = path.join(__dirname, 'certificate_sample.pdf');
doc.pipe(fs.createWriteStream(certPath));

// Black background
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#111');

// Border
doc.save();
doc.lineWidth(6);
doc.strokeColor('#FFD700');
doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke();
doc.restore();

// Watermark logo: outlined circle with '50' in center, beige color
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

// Move '50 of 50 Challenge' closer to top margin
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

// Signature line
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

console.log('Sample certificate generated as certificate_sample.pdf');
