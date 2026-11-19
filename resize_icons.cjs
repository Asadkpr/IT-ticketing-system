const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, 'public', 'ChatGPT Image Sep 4, 2026, 04_32_59 PM.png');
const output192 = path.join(__dirname, 'public', 'pwa-192x192.png');
const output512 = path.join(__dirname, 'public', 'pwa-512x512.png');

async function processImage() {
  try {
    await sharp(inputPath)
      .resize({
        width: 154,
        height: 154,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .extend({
        top: 19,
        bottom: 19,
        left: 19,
        right: 19,
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .toFile(output192);

    await sharp(inputPath)
      .resize({
        width: 410,
        height: 410,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .extend({
        top: 51,
        bottom: 51,
        left: 51,
        right: 51,
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .toFile(output512);

    console.log('Icons generated successfully!');
  } catch (err) {
    console.error('Error generating icons:', err);
  }
}

processImage();
