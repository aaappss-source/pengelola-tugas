// Membuat SEMUA ikon dan splash screen dari satu sumber logo (Tahap 10, Poin 7).
// Logo terpilih (user, 21 Nov 2026): pilihan A "Kalender centang" — kotak kuning #FFD43B (gradasi tipis) + kartu kalender
// gelap + centang kuning. Ciri lama tetap: kuning, sudut bulat, centang.
//
// Jalankan dari root repo:  node icons/buat-ikon.js
// Butuh Playwright + Chromium (sama dengan tes E2E) dan font Roboto terpasang di sistem (untuk tulisan di splash).
// Hasil:
//   icons/logo.svg                     sumber logo (dipakai juga sebagai favicon SVG)
//   icons/icon-192.png, icon-512.png   ikon "any" (sudut bulat, latar transparan) — manifest, favicon, splash Android
//   icons/maskable-192.png, -512.png   ikon "maskable" (kotak penuh, gambar di zona aman) — ikon adaptif Android
//   icons/apple-touch-icon.png         180×180 kotak penuh (iOS membulatkan sendiri)
//   icons/favicon-32.png               favicon PNG untuk browser yang tidak memakai SVG
//   icons/splash/splash-WxH.png        layar pembuka iOS (apple-touch-startup-image) untuk tiap ukuran iPhone/iPad
// Tag <link rel="apple-touch-startup-image"> di index.html harus sama dengan daftar SPLASH di bawah
// (dicek tests/icons.test.js). Skrip mencetak tag-tag itu untuk ditempel di <head>.
// Splash di repo sudah dikecilkan sekali (palet 96 warna, ±2 MB → ±340 KB) dengan Python PIL:
//   Image.open(f).convert('RGB').quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True)
// Kalau skrip ini dijalankan lagi, splash kembali berukuran penuh (tetap benar, hanya lebih besar) sampai dikecilkan lagi.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = __dirname;
const YEL = '#FFD43B', INK = '#1E1E1E', BG = '#1b1b1b';

// gambar logo di kotak 512×512 (latar kotak dibuat terpisah)
const ART =
  `<rect x="112" y="142" width="288" height="262" rx="56" fill="${INK}"/>` +
  `<rect x="112" y="204" width="288" height="14" fill="url(#ptg)"/>` +
  `<rect x="174" y="98" width="44" height="88" rx="22" fill="${INK}" stroke="url(#ptg)" stroke-width="16"/>` +
  `<rect x="294" y="98" width="44" height="88" rx="22" fill="${INK}" stroke="url(#ptg)" stroke-width="16"/>` +
  `<path d="M188 308 L238 356 L326 262" fill="none" stroke="${YEL}" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>`;

/** shape 'round' = kotak bersudut bulat di atas transparan; 'full' = kotak penuh (OS yang memotong). scale = ukuran gambar. */
function logoSvg(shape, scale) {
  scale = scale || 1;
  const t = (256 * (1 - scale)).toFixed(2);
  const art = scale === 1 ? ART : `<g transform="translate(${t} ${t}) scale(${scale})">${ART}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<defs><linearGradient id="ptg" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#FFDD57"/><stop offset="1" stop-color="#FFC928"/></linearGradient></defs>` +
    `<rect width="512" height="512"${shape === 'round' ? ' rx="116"' : ''} fill="url(#ptg)"/>${art}</svg>`;
}

// iPhone & iPad potret: [lebar CSS, tinggi CSS, kepadatan layar] → gambar lebar×kepadatan × tinggi×kepadatan
const SPLASH = [
  [320, 568, 2],   // iPhone SE (1st)
  [375, 667, 2],   // iPhone SE 2/3, 6/7/8
  [414, 736, 3],   // iPhone 6/7/8 Plus
  [375, 812, 3],   // iPhone X, XS, 11 Pro
  [414, 896, 2],   // iPhone XR, 11
  [414, 896, 3],   // iPhone XS Max, 11 Pro Max
  [360, 780, 3],   // iPhone 12 mini, 13 mini
  [390, 844, 3],   // iPhone 12, 13, 14 (+ Pro 12/13)
  [428, 926, 3],   // iPhone 12/13 Pro Max, 14 Plus
  [393, 852, 3],   // iPhone 14 Pro, 15, 15 Pro, 16
  [430, 932, 3],   // iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  [402, 874, 3],   // iPhone 16 Pro, 17, 17 Pro
  [420, 912, 3],   // iPhone Air
  [440, 956, 3],   // iPhone 16 Pro Max, 17 Pro Max
  [744, 1133, 2],  // iPad mini 6/7
  [768, 1024, 2],  // iPad 9.7" / mini 5
  [810, 1080, 2],  // iPad 10.2"
  [820, 1180, 2],  // iPad Air 4/5, iPad 10
  [834, 1112, 2],  // iPad Pro 10.5"
  [834, 1194, 2],  // iPad Pro 11"
  [1024, 1366, 2]  // iPad Pro 12.9"
];

function splashHtml(w, h) {
  const logo = Math.round(w * 0.3), font = Math.round(w * 0.064);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${w}px;height:${h}px;background:${BG};overflow:hidden}
  .c{position:absolute;left:0;right:0;top:46%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:${Math.round(w * 0.05)}px}
  .l{width:${logo}px;height:${logo}px}.l svg{width:100%;height:100%;display:block}
  .w{font:500 ${font}px Roboto,sans-serif;color:#f2f2f0;letter-spacing:-.2px;white-space:nowrap}.w b{font-weight:700;color:${YEL}}
  </style></head><body><div class="c"><div class="l">${logoSvg('round')}</div><div class="w">Pengelola <b>Tugas</b></div></div></body></html>`;
}

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* lanjut */ }
  return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'));
}

async function main() {
  const { chromium } = loadPlaywright();
  fs.writeFileSync(path.join(DIR, 'logo.svg'), logoSvg('round') + '\n');
  const br = await chromium.launch();
  const page = await br.newPage({ deviceScaleFactor: 1 });
  async function icon(file, size, shape, scale) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${logoSvg(shape, scale)}`);
    await page.screenshot({ path: path.join(DIR, file), omitBackground: shape === 'round' });
  }
  await icon('icon-192.png', 192, 'round');
  await icon('icon-512.png', 512, 'round');
  await icon('maskable-192.png', 192, 'full', 0.88);
  await icon('maskable-512.png', 512, 'full', 0.88);
  await icon('apple-touch-icon.png', 180, 'full');
  await icon('favicon-32.png', 32, 'round');
  fs.mkdirSync(path.join(DIR, 'splash'), { recursive: true });
  const links = [];
  for (const [w, h, d] of SPLASH) {
    const W = w * d, H = h * d, name = `splash-${W}x${H}.png`;
    await page.setViewportSize({ width: W, height: H });
    await page.setContent(splashHtml(W, H));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(DIR, 'splash', name) });
    links.push(`<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)" href="icons/splash/${name}">`);
  }
  await br.close();
  console.log(links.join('\n'));
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { SPLASH, logoSvg };
