// 从主 PNG 生成多尺寸 .ico（用于 Windows 应用图标）
//   node scripts/build-icon.cjs assets/icon-master.png assets/icon.ico
//
// 输出包含 16 / 32 / 48 / 64 / 128 / 256 六个尺寸，
// Windows 任务栏、开始菜单、桌面快捷方式等会自动选最合适的尺寸。

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node build-icon.cjs <master.png> <out.ico>');
    process.exit(1);
  }
  const master = path.resolve(args[0]);
  const out = path.resolve(args[1]);
  if (!fs.existsSync(master)) {
    console.error('master not found:', master);
    process.exit(1);
  }

  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const s of sizes) {
    const buf = await sharp(master).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    pngBuffers.push(buf);
    console.log(`  ${s}x${s}: ${(buf.length/1024).toFixed(1)} KB`);
  }
  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(out, ico);
  console.log('wrote', out, '(', (ico.length/1024).toFixed(1), 'KB total)');
}

main().catch(e => { console.error('[err]', e.message); process.exit(1); });
