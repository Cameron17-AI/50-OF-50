import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'assets', 'videos');
const targetDir = path.join(rootDir, 'assets', 'video-stills');

if (!ffmpegPath) {
  throw new Error('ffmpeg-static did not provide a binary path.');
}

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Source directory not found: ${sourceDir}`);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.toLowerCase().endsWith('.jpg')) {
    fs.unlinkSync(path.join(targetDir, entry.name));
  }
}

const videoFiles = fs.readdirSync(sourceDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

for (const fileName of videoFiles) {
  const sourcePath = path.join(sourceDir, fileName);
  const lowerCaseName = fileName.toLowerCase();
  const baseName = lowerCaseName.endsWith('.mp4') ? fileName.slice(0, -4) : fileName;
  const outputName = `${baseName}.jpg`;
  const outputPath = path.join(targetDir, outputName);

  const result = spawnSync(ffmpegPath, [
    '-y',
    '-ss', '00:00:00.5',
    '-i', sourcePath,
    '-frames:v', '1',
    '-vf', 'scale=360:-2',
    '-q:v', '6',
    outputPath
  ], { stdio: 'pipe' });

  if (result.status !== 0) {
    const errorText = (result.stderr || result.stdout || '').toString().trim();
    throw new Error(`Failed to generate still for ${fileName}: ${errorText}`);
  }

  console.log(`Created ${path.relative(rootDir, outputPath)}`);
}

console.log(`Generated ${videoFiles.length} still images in ${path.relative(rootDir, targetDir)}`);