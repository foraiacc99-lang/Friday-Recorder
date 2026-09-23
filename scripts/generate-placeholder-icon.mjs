import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.resolve(rootDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

function create32x32Ico() {
  const width = 32;
  const height = 32;
  const headerSize = 6;
  const dirEntrySize = 16;
  const bmiHeaderSize = 40;
  const xorSize = width * height * 4; // 32-bit BGRA
  const andSize = (width * height) / 8; // 1-bit mask
  const imageSize = bmiHeaderSize + xorSize + andSize;
  const totalFileSize = headerSize + dirEntrySize + imageSize;

  const buf = Buffer.alloc(totalFileSize);

  // ICONDIR header
  buf.writeUInt16LE(0, 0); // Reserved
  buf.writeUInt16LE(1, 2); // ICO type
  buf.writeUInt16LE(1, 4); // 1 image

  // ICONDIRENTRY
  buf.writeUInt8(width, 6);
  buf.writeUInt8(height, 7);
  buf.writeUInt8(0, 8); // Colors
  buf.writeUInt8(0, 9); // Reserved
  buf.writeUInt16LE(1, 10); // Color planes
  buf.writeUInt16LE(32, 12); // Bits per pixel
  buf.writeUInt32LE(imageSize, 14); // Image size in bytes
  buf.writeUInt32LE(headerSize + dirEntrySize, 18); // Offset to image data (22)

  // BITMAPINFOHEADER
  const imgOffset = 22;
  buf.writeUInt32LE(bmiHeaderSize, imgOffset);
  buf.writeInt32LE(width, imgOffset + 4);
  buf.writeInt32LE(height * 2, imgOffset + 8); // Height * 2 for XOR + AND
  buf.writeUInt16LE(1, imgOffset + 12); // Planes
  buf.writeUInt16LE(32, imgOffset + 14); // Bit count
  buf.writeUInt32LE(0, imgOffset + 16); // Compression (BI_RGB)
  buf.writeUInt32LE(xorSize + andSize, imgOffset + 20); // Size of image
  buf.writeInt32LE(0, imgOffset + 24);
  buf.writeInt32LE(0, imgOffset + 28);
  buf.writeUInt32LE(0, imgOffset + 32);
  buf.writeUInt32LE(0, imgOffset + 36);

  // XOR mask (BGRA, bottom-up)
  // Fill with Friday Recorder brand color: Vibrant Cyan #38bdf8 (B: 248, G: 189, R: 56, A: 255)
  const xorOffset = imgOffset + bmiHeaderSize;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = xorOffset + (y * width + x) * 4;
      // Draw a subtle border
      const isBorder = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      if (isBorder) {
        buf.writeUInt8(200, idx); // B
        buf.writeUInt8(100, idx + 1); // G
        buf.writeUInt8(30, idx + 2); // R
        buf.writeUInt8(255, idx + 3); // A
      } else {
        buf.writeUInt8(248, idx); // B
        buf.writeUInt8(189, idx + 1); // G
        buf.writeUInt8(56, idx + 2); // R
        buf.writeUInt8(255, idx + 3); // A
      }
    }
  }

  // AND mask (all zeros for fully opaque)
  const andOffset = xorOffset + xorSize;
  buf.fill(0, andOffset, andOffset + andSize);

  return buf;
}

const icoBuffer = create32x32Ico();
fs.writeFileSync(path.resolve(assetsDir, 'icon.ico'), icoBuffer);
console.log('Generated assets/icon.ico successfully.');
