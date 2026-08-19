// 从主 PNG 生成多尺寸 .ico（用于 Windows 应用图标）
//   node scripts/build/build-icon.cjs assets/icon-master.png assets/icon.ico
//
// 输出包含 16 / 32 / 48 / 64 / 128 / 256 六个尺寸，
// Windows 任务栏、开始菜单、桌面快捷方式等会自动选最合适的尺寸。
//
// 重要：源 icon-master.png 的背景是白+灰交替的"棋盘格"图案
// （图像编辑器中表示透明的符号被错误地烧进了位图）。
// 本脚本会把这种棋盘格背景像素识别出来并设为真透明，
// 这样图标在任何颜色的任务栏/桌面上都只显示中间的 Jade 绿 logo，
// 不再出现"一圈格子"。logo 边缘的锯齿在 1024→目标尺寸 的缩放过程中
// 由 sharp 自带的双线性插值自然产生半透明过渡，保持平滑。

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

// 判定一个像素是否属于"棋盘格背景"：
//   - 三个通道都偏亮（> BG_THRESHOLD）
//   - 且三个通道接近灰色（max - min < BG_TOLERANCE）
// 这匹配白格 (255,255,255) 和灰格 (~221,221,221) 以及它们的抗锯齿过渡。
// 中间的 Jade 绿 logo (R<100, G~160, B~110, max≈160) 和深色描边 (max<80)
// 都不会越过 BG_THRESHOLD=200，所以提高容差是安全的。
const BG_THRESHOLD = 200;
const BG_TOLERANCE = 40;

async function masterToTransparentRgba(master) {
  // 拿到原始尺寸（不做 resize，保留 1024x1024 全分辨率以便缩放时自然抗锯齿）
  const raw = await sharp(master).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const { width, height, channels } = info;
  if (channels < 3) throw new Error('icon-master.png channels < 3, unexpected');

  // 构造 RGBA 缓冲
  const rgba = Buffer.alloc(width * height * 4);
  let bgCount = 0;
  for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isBg = max > BG_THRESHOLD && (max - min) < BG_TOLERANCE;
    rgba[j] = r;
    rgba[j + 1] = g;
    rgba[j + 2] = b;
    rgba[j + 3] = isBg ? 0 : 255;
    if (isBg) bgCount++;
  }
  console.log(`  背景透明化: ${bgCount}/${width * height} 像素设为透明 (${(100 * bgCount / (width * height)).toFixed(1)}%)`);
  return { rgba, width, height };
}

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

  console.log('读取 master 并抹除棋盘格背景...');
  const { rgba, width, height } = await masterToTransparentRgba(master);
  // 用 raw RGBA 作为 sharp 输入，后续 resize 会自然产生边缘半透明

  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const s of sizes) {
    const buf = await sharp(rgba, { raw: { width, height, channels: 4 } })
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push(buf);
    console.log(`  ${s}x${s}: ${(buf.length / 1024).toFixed(1)} KB`);
  }
  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(out, ico);
  console.log('wrote', out, '(', (ico.length / 1024).toFixed(1), 'KB total)');
}

main().catch(e => { console.error('[err]', e.message); process.exit(1); });
