// Create / Update Gitee Release: body + installer asset upload
// Usage: node scripts/publish/update-gitee-body.cjs
//   或 GT_TOKEN=xxx node scripts/publish/update-gitee-body.cjs
// 日志: 同步写入项目根目录 publish-log.txt

const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..', '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const GT_TOKEN = process.env.GT_TOKEN || 'a0d56558c30d9a083fe33282b946cf95';
const GT_OWNER = 'buxiaju';
const REPO = 'KunyaoGit';
const LOG_FILE = path.join(ROOT, 'publish-log.txt');

// 安装包路径
const INSTALLER = path.join(ROOT, '.release-assets', `KunyaoGit-Setup-${VERSION}-x64.exe`);
const PORTABLE  = path.join(ROOT, '.release-assets', `KunyaoGit-portable-v${VERSION}.zip`);

// ─── 日志 ───
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

const RELEASE_BODY = `# KunyaoGit v${VERSION}

## v0.3.4 新特性
- 🔍 **云端仓库搜索** — 在 GitHub / Gitee 仓库页顶部栏新增搜索框：
  - 输入即搜（防抖 300ms），**GitHub** 走官方 Search API 全平台搜索任意仓库
  - **Gitee** 官方仓库搜索 API 已失效（恒返回空），自动降级为「我的仓库」本地过滤（按名称/描述匹配），保证功能可用
  - 搜索结果显示数量、空结果提示，点 ✕ 或清空恢复「我的仓库」列表；结果卡片支持打开浏览 / 克隆 / 删除

## v0.3.3 修复（应用内更新下载容错）
- 🔧 **下载失败自动重试** — 实测国内网络对 gitee.com 的连接**高度间歇**（DNS 被劫持到百度云节点，同一分钟内可能连续超时又连续正常）：
  - 每个下载源探活最多尝试 **2 次**（8s 超时快速失败）
  - 两个源全部失败后**自动整轮重试最多 6 轮**（约 2 分钟），轮间显示「网络波动，第 N/6 轮重试…」提示
  - 下载中断自动**同源重试 2 次**，不再一次失败就放弃
  - 之前：单次探活失败直接报「所有下载源都失败」，撞上网络坏窗口必失败

## v0.3.2 优化
- 📂 **文件树默认全部折叠** — 进入仓库「文件」页时所有目录默认收起，界面更清爽，点击箭头展开；此前默认展开前两层。

## v0.3.1 修复
- 🔧 **修复应用内更新下载失败**（"所有下载源都失败"）：
  - Gitee 下载源从 \`raw/\` 直链改为 **Gitee Release 附件下载**（\`releases/download/vX.Y.Z/...\`）——Gitee raw 对 >50MB 大文件直接返回 403，导致 86MB 安装包永远下载失败；Release 附件走官方 CDN（foruda.gitee.com），实测 2MB/s 完整下载且 SHA256 校验一致
  - **新增连接建立阶段超时**——之前 \`req.setTimeout\` 只对已连接 socket 的空闲计时，若 TCP 握手卡死（如 github.com 被墙）会无限挂起；现在 15s（探活）/ 30s（下载）内连不上立即切换下一个源
  - 注：本版修复自 v0.3.1 起生效。v0.2.6 / v0.3.0 用户请**手动下载安装 v0.3.1**（应用内更新用的还是旧下载地址），安装后后续版本可正常应用内升级。

## v0.3.0 新特性
- 📁 **本地文件管理** — 仓库「文件」页支持对本地仓库直接增删改：
  - 文件树工具栏一键**新建文件 / 新建文件夹**，右键菜单可**新建 / 重命名 / 删除 / 打开编辑**
  - 新建文件自动在 Monaco 中打开；操作后自动刷新 git 状态，「变更」页立即可见
  - 删除 / 重命名自动同步 git status，正在编辑的文件随重命名跟随新路径
- 🚀 **多远程推送（GitHub / Gitee）** — 顶部 **Push 按钮下拉选择要推送的远程**（github / gitee / origin…），一键推送到指定平台并自动建立 upstream；「提交并推送」同样支持选择远程
- 🏠 **仓库入口优化** — 打开 / 克隆仓库后**自动进入仓库页**；首页新增「当前已打开仓库」入口卡片，侧边栏仓库卡片也可点击随时返回仓库
- 🔄 **保存即刷新** — 编辑器保存文件后自动刷新工作区状态，改完立刻能在「变更」页暂存提交
- 🔧 **构建修复** — 移除 package.json 的 UTF-8 BOM，修复 Vite/PostCSS 构建失败问题

## v0.2.6 修复（沿用）
- 🔧 **应用内更新器探活改用 GET 替代 HEAD** —— 很多 CDN / 防火墙对 HEAD 请求更敏感（直接 403 / 超时），改成 \`Range: bytes=0-0\` 的 GET 兼容性远好。206 响应里 \`Content-Range: bytes 0-0/{total}\` 直接给到总大小。
- ⏱ **探活超时从 8s 提到 15s** —— 慢网络更稳。
- 📋 **错误信息汇总所有源失败原因** —— 不再只显示最后一个错的源，所有源（gitee / github）的失败原因并列出来。

## v0.2.5 特性（沿用）
- 🎨 **三主题切换**（暗色 / 深蓝 / 亮色）— 设置页一键切换，整套 UI 实时跟随，包括 Monaco 代码编辑器：
  - **暗色**（默认）—— 原汁原味的 KunyaoGit 暗灰，emerald 品牌色
  - **深蓝** —— 深海 navy 背景，blue 系 primary，沉稳又有色彩
  - **亮色** —— 浅白底，emerald 品牌色，适合白天 / 投影
- 🔧 **零业务代码迁移实现** —— 通过 CSS 变量 + 选择器覆盖，所有现有 \`bg-gray-XXX\` / \`text-gray-XXX\` 等 Tailwind class 不动一行，自动随主题切换。
- 💾 **主题自动持久化** —— 跟语言设置一样存到 electron-store，下次启动保留。

## v0.2.4 新特性（沿用）
- ⚡ **下载速度大幅提升（3~6 倍）** — 应用内更新下载器重构：
  - 多源 HEAD 并行探活，直接跳过 Gitee raw 对大文件返 HTML 的死路，省掉 8s 等超时
  - HTTP Range 多连接分段下载（4 路并发），单连接瓶颈消失
  - keep-alive Agent 复用 TLS / TCP 句柄，免重复握手
  - 进度事件 100ms 节流，避免 IPC 通道被刷爆
  - 单 chunk 失败自动重试（指数退避），网络抖动不再崩整个下载
- 📊 **下载进度条新增实时速率显示**（MB/s）— 让用户直观看到下载是否真在跑、有多快。

## v0.2.3 特性（沿用）
- 🌐 **多语言支持（中/英切换）** — 设置页或侧边栏底部一键切换界面语言，设置自动持久化。
- 📝 **项目文档完善** — 架构文档、API 参考、功能说明、安装指南、用户指南、开发指南、贡献指南等完整体系。
- 🏗 **工程结构优化** — scripts/ 按职责分组（build/publish/debug），release2/ 合并回 release/ 单一输出目录。

## v0.2.2 特性（沿用）
- ✨ **应用内自动更新** — 发现新版本时自动弹窗询问"立即下载并安装"，应用内多源下载（Gitee 优先、GitHub 兜底）带实时进度条，下载完成自动启动安装包并退出应用完成更新。

## 下载
- **KunyaoGit-Setup-${VERSION}-x64.exe** — NSIS 安装包（推荐），可直接从本 Release 下载，也可在仓库根目录 \`.release-assets/\` 下获取
- **KunyaoGit-portable-v${VERSION}.zip** — 便携版，仓库根目录 \`.release-assets/\` 下

## 升级
- **v0.2.0 ~ v0.2.6 用户**：启动应用后会自动检查更新并弹窗，点"立即下载并安装"即可一键更新到 v${VERSION}。也可手动下载安装包覆盖安装。
- 应用内更新会优先从 Gitee 下载（国内快），失败时自动切换 GitHub 兜底。
- 本版本（v0.2.4）开始，下载过程从单连接改为 4 路并发，实测提速 3~6 倍。

## 安装
下载 Setup .exe → 双击运行 → 选择安装目录 → 安装完成。

## 系统要求
- Windows 10 / 11（x64）
- 已安装 Git（应用通过本地 Git 命令行调用，需要 \`git\` 在 PATH 中）

## 特性
- 基础 Git 操作（克隆、提交、推送、拉取、分支、合并、冲突解决）
- GitHub / Gitee 双平台集成（API + PAT 鉴权）
- **本地文件管理（新建 / 重命名 / 删除 / Monaco 编辑）**
- **多远程推送（Push 下拉选择 GitHub / Gitee）**
- 远程仓库文件浏览 / 编辑（Monaco Editor）
- 拖拽上传
- 仓库创建 / 删除
- Release 管理
- 内容搜索
- 自动 CHANGELOG 生成
- **应用内自动更新**（启动后静默检测，发现新版本弹窗 → 应用内下载 → 自动安装）
- **多语言切换**（中文 / English）
- **三主题切换**（暗色 / 深蓝 / 亮色）

## 仓库
- GitHub: https://github.com/buxiaju/KunyaoGit
- Gitee:  https://gitee.com/buxiaju/KunyaoGit
`;

// ─── HTTP 请求（缓冲模式，用于 JSON API 调用）───
function req(opts, body, contentType) {
  return new Promise((resolve, reject) => {
    const headers = { ...opts.headers };
    if (contentType) headers['Content-Type'] = contentType;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const r = https.request({ ...opts, headers }, (res) => {
      const cs = [];
      res.on('data', (c) => cs.push(c));
      res.on('end', () => {
        const text = Buffer.concat(cs).toString('utf-8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    r.on('error', reject);
    r.setTimeout(120000, () => { r.destroy(new Error('Request timeout (2min)')); });
    if (body) r.write(body);
    r.end();
  });
}

// ─── multipart/form-data 构造（用于 Gitee attach_files 上传）───
function buildMultipartFile(filePath, fieldName) {
  const boundary = '----KunyaoGitBoundary' + Math.random().toString(16).slice(2);
  const fileName = path.basename(filePath);
  const fileBuf = fs.readFileSync(filePath);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n`));
  parts.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
  parts.push(fileBuf);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// ─── 流式上传（大文件用，避免内存峰值）───
function streamUploadMultipart(opts, filePath, fieldName) {
  return new Promise((resolve, reject) => {
    const boundary = '----KunyaoGitBoundary' + Math.random().toString(16).slice(2);
    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;

    // 构造 multipart body 各部分
    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const totalSize = head.length + fileSize + tail.length;

    const r = https.request({
      hostname: opts.hostname, method: 'POST', path: opts.path,
      headers: {
        ...opts.headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalSize,
      },
    }, (res) => {
      const cs = [];
      res.on('data', (c) => cs.push(c));
      res.on('end', () => {
        const text = Buffer.concat(cs).toString('utf-8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    r.on('error', reject);
    r.setTimeout(600000, () => { r.destroy(new Error('Upload timeout (10min)')); });

    // 先写 head，再 pipe 文件流，最后写 tail
    r.write(head);
    const stream = fs.createReadStream(filePath);
    stream.on('end', () => { r.write(tail); r.end(); });
    stream.on('error', reject);
    stream.pipe(r, { end: false });
  });
}

async function main() {
  log('========== Gitee Release 发布开始 ==========');
  log(`版本: ${VERSION}  Tag: ${TAG}`);

  // 1. 查找 release（per_page=100 避免被默认 20 截断找不到之前的 release）
  const list = await req({
    hostname: 'gitee.com', method: 'GET',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}&per_page=100`,
    headers: { 'User-Agent': 'KunyaoGit-publish' },
  });
  let r = (list.json || []).find(x => x.tag_name === TAG);
  // 兜底：分页再查一次
  if (!r) {
    const list2 = await req({
      hostname: 'gitee.com', method: 'GET',
      path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}&per_page=100&page=2`,
      headers: { 'User-Agent': 'KunyaoGit-publish' },
    });
    r = (list2.json || []).find(x => x.tag_name === TAG);
  }

  if (!r) {
    // 创建 release
    log('创建 Gitee release ' + TAG);
    const body = JSON.stringify({
      tag_name: TAG,
      name: `KunyaoGit v${VERSION}`,
      body: RELEASE_BODY,
      target_commitish: 'master',
    });
    const c = await req({
      hostname: 'gitee.com', method: 'POST',
      path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}`,
      headers: { 'User-Agent': 'KunyaoGit-publish' },
    }, body, 'application/json');
    if (c.status !== 201) throw new Error('Create failed: ' + c.status + ' ' + c.text);
    r = c.json;
    log('✅ Release 创建 ' + (r.html_url || '(id:' + r.id + ')'));
  } else {
    log('找到 release id ' + r.id);
  }

  // 2. PATCH body
  const body = JSON.stringify({
    tag_name: r.tag_name,
    name: r.name,
    body: RELEASE_BODY,
  });
  const u = await req({
    hostname: 'gitee.com', method: 'PATCH',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases/${r.id}?access_token=${GT_TOKEN}`,
    headers: { 'User-Agent': 'KunyaoGit-publish' },
  }, body, 'application/json');
  if (u.status !== 200) throw new Error('PATCH failed: ' + u.status + ' ' + u.text);
  log('✅ body 已更新');

  // 3. 上传 assets（安装包 + 便携版）
  const attachList = await req({
    hostname: 'gitee.com', method: 'GET',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases/${r.id}/attach_files?access_token=${GT_TOKEN}`,
    headers: { 'User-Agent': 'KunyaoGit-publish' },
  });
  const existingNames = new Set((attachList.json || []).map(a => a.name));
  log('已有 attach files: ' + ([...existingNames].join(', ') || '(空)'));

  for (const f of [INSTALLER, PORTABLE].filter(p => fs.existsSync(p))) {
    const fileName = path.basename(f);
    if (existingNames.has(fileName)) {
      log('跳过（已存在）: ' + fileName);
      continue;
    }
    const fileSize = fs.statSync(f).size;
    log(`流式上传 ${fileName} (${(fileSize/1024/1024).toFixed(2)} MB) 到 Gitee`);
    const up = await streamUploadMultipart({
      hostname: 'gitee.com',
      path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases/${r.id}/attach_files?access_token=${GT_TOKEN}`,
      headers: { 'User-Agent': 'KunyaoGit-publish' },
    }, f, 'file');
    if (up.status !== 201 && up.status !== 200) {
      log('⚠️ 上传失败: ' + up.status + ' ' + up.text);
      continue;
    }
    log('✅ 上传成功: ' + fileName);
  }

  log('🎉 Gitee 发布完成 (release id: ' + r.id + ')');
  log('========== Gitee Release 发布结束 ==========\n');
}

main().catch(e => { log('[err] ' + e.message); process.exit(1); });
