// Generates the app icon + splash source images used by @capacitor/assets.
// Run with: node scripts/generate-assets.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const NAVY = '#16233A';
const NAVY_SOFT = '#1D2C47';
const GREEN = '#217056';
const PAPER = '#FCFBF7';

// Shared logo: microphone on a navy tile (same motif as the app's MicIcon).
function tileSVG(size, radius, circleR, scale) {
  const c = size / 2;
  const mic = `
    <g transform="translate(${c} ${c}) scale(${scale})">
      <path d="M0 -112c-47 0-85 38-85 85v128c0 47 38 85 85 85s85-38 85-85v-128c0-47-38-85-85-85Z" fill="${GREEN}"/>
      <path d="M0 60v85" stroke="${PAPER}" stroke-width="38" stroke-linecap="round"/>
      <path d="M-120 -16a120 120 0 0 0 240 0" stroke="${PAPER}" stroke-width="38" stroke-linecap="round"/>
    </g>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${NAVY}"/>
    <circle cx="${c}" cy="${c}" r="${circleR}" fill="${NAVY_SOFT}"/>
    ${mic}
  </svg>`;
}

async function render(name, svg, size) {
  const file = path.join(OUT, name);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}

async function main() {
  // 1024x1024 opaque full icon (iOS + Android legacy icons).
  await render('icon-only.png', tileSVG(1024, 224, 340, 1), 1024);

  // Transparent foreground kept inside the adaptive-icon safe zone (center 66%).
  await render('icon-foreground.png', tileSVG(1024, 224, 210, 0.62), 1024);

  // Solid background for Android adaptive icons + iOS.
  const bg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="${NAVY}"/></svg>`;
  await render('icon-background.png', bg, 1024);

  // 2732x2732 launch splash: navy field with centered logo.
  const splash = `<svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
    <rect width="2732" height="2732" fill="${NAVY}"/>
    <circle cx="1366" cy="1366" r="560" fill="${NAVY_SOFT}"/>
    <g transform="translate(1366 1366) scale(1.7)">
      <path d="M0 -112c-47 0-85 38-85 85v128c0 47 38 85 85 85s85-38 85-85v-128c0-47-38-85-85-85Z" fill="${GREEN}"/>
      <path d="M0 60v85" stroke="${PAPER}" stroke-width="38" stroke-linecap="round"/>
      <path d="M-120 -16a120 120 0 0 0 240 0" stroke="${PAPER}" stroke-width="38" stroke-linecap="round"/>
    </g>
  </svg>`;
  await render('splash.png', splash, 2732);
  await render('splash-dark.png', splash, 2732);

  // PWA icons (manifest) into public/icons.
  const iconDir = path.join(__dirname, '..', 'public', 'icons');
  fs.mkdirSync(iconDir, { recursive: true });
  const fullIcon = path.join(OUT, 'icon-only.png');
  const writePwa = (name, size) =>
    sharp(fullIcon).resize(size, size).png().toFile(path.join(iconDir, name)).then(() => {
      console.log('wrote', path.join(iconDir, name));
    });

  // Maskable icon needs padding so the logo stays inside the safe zone.
  const maskable = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="${NAVY}"/>
    <g transform="translate(256 256) scale(0.5)">
      ${tileSVG(1024, 224, 340, 1).replace(/^.*<circle/, '<circle')}
    </g>
  </svg>`;
  await sharp(Buffer.from(maskable)).png().toFile(path.join(iconDir, 'maskable-512.png'));

  await writePwa('icon-192.png', 192);
  await writePwa('icon-512.png', 512);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});