const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const iconDir = path.join(root, 'build');
const sourceSvg = path.join(iconDir, 'icon.svg');
const pngPath = path.join(iconDir, 'icon.png');
const icoPath = path.join(iconDir, 'icon.ico');
const faviconPath = path.join(root, 'src', 'app', 'favicon.ico');

const sizes = [16, 24, 32, 48, 64, 128, 256];

function writeUInt16(buffer, value, offset) {
  buffer.writeUInt16LE(value, offset);
}

function writeUInt32(buffer, value, offset) {
  buffer.writeUInt32LE(value, offset);
}

async function buildIco(pngBuffers) {
  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + entrySize * pngBuffers.length;
  const entries = Buffer.alloc(dirSize);

  writeUInt16(entries, 0, 0);
  writeUInt16(entries, 1, 2);
  writeUInt16(entries, pngBuffers.length, 4);

  let imageOffset = dirSize;

  pngBuffers.forEach(({ size, buffer }, index) => {
    const entryOffset = headerSize + index * entrySize;
    entries[entryOffset] = size >= 256 ? 0 : size;
    entries[entryOffset + 1] = size >= 256 ? 0 : size;
    entries[entryOffset + 2] = 0;
    entries[entryOffset + 3] = 0;
    writeUInt16(entries, 1, entryOffset + 4);
    writeUInt16(entries, 32, entryOffset + 6);
    writeUInt32(entries, buffer.length, entryOffset + 8);
    writeUInt32(entries, imageOffset, entryOffset + 12);
    imageOffset += buffer.length;
  });

  return Buffer.concat([entries, ...pngBuffers.map(({ buffer }) => buffer)]);
}

async function main() {
  await fs.mkdir(iconDir, { recursive: true });

  const svg = await fs.readFile(sourceSvg);
  await sharp(svg).resize(1024, 1024).png().toFile(pngPath);

  const pngBuffers = await Promise.all(
    sizes.map(async (size) => ({
      size,
      buffer: await sharp(svg).resize(size, size).png().toBuffer(),
    }))
  );

  const ico = await buildIco(pngBuffers);
  await fs.writeFile(icoPath, ico);
  await fs.writeFile(faviconPath, ico);

  console.log(`Wrote ${path.relative(root, pngPath)}`);
  console.log(`Wrote ${path.relative(root, icoPath)}`);
  console.log(`Wrote ${path.relative(root, faviconPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
