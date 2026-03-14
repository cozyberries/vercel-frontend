// One-time script to generate PWA icons from apple-touch-icon.png
// Run: node scripts/generate-icons.mjs
import sharp from 'sharp';

const source = './public/apple-touch-icon.png';

await sharp(source).resize(192, 192).toFile('./public/android-chrome-192x192.png');
await sharp(source).resize(512, 512).toFile('./public/android-chrome-512x512.png');

// Maskable: logo padded with 20% white border so it stays inside Android's safe zone
// Safe zone = center 80% of 512px = ~409px logo on 512px canvas
await sharp(source)
  .resize(409, 409)
  .extend({ top: 52, bottom: 51, left: 52, right: 51,
            background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .toFile('./public/icon-maskable-512x512.png');

console.log('Icons generated: android-chrome-192x192.png, android-chrome-512x512.png, icon-maskable-512x512.png');
