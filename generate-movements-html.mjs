// Node.js script (ESM) to generate static HTML for all movement cards with embedded video tags from challenge.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const challengePath = path.join(__dirname, 'challenge.json');
const outputPath = path.join(__dirname, 'generated-movements.html');

const challenge = JSON.parse(fs.readFileSync(challengePath, 'utf8'));

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const html = challenge.map(m => `
  <div class=\"movement-card\">
    <h3 class=\"movement-card__name\">${m.name}</h3>
    <div class=\"movement-card__reps\">${m.reps} reps</div>
    <div class=\"movement-card__details\">${m.description}</div>
    <video controls width=\"320\" height=\"180\" poster=\"assets/video-stills/${slugify(m.name)}.jpg\">
      <source src=\"${m.video}\" type=\"video/mp4\">
      Your browser does not support the video tag.
    </video>
  </div>
`).join('\n');

fs.writeFileSync(outputPath, html, 'utf8');
console.log('Static HTML for all movement cards with videos generated in generated-movements.html');
