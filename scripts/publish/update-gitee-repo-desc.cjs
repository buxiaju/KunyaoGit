// Update Gitee repository description
// Usage: node scripts/publish/update-gitee-repo-desc.cjs
//   或 GT_TOKEN=xxx node scripts/publish/update-gitee-repo-desc.cjs

const https = require('node:https');
const path = require('node:path');

const GT_TOKEN = process.env.GT_TOKEN || 'a0d56558c30d9a083fe33282b946cf95';
const GT_OWNER = 'buxiaju';
const REPO = 'KunyaoGit';

const DESCRIPTION = `🚀 KunyaoGit v0.5.0 已发布！一个基于 Electron + React + TypeScript 的 Git 桌面客户端，深度集成 GitHub 和 Gitee。

⭐ v0.5.0 核心特性：
• Ctrl+P 跳转文件 — VS Code 式模糊搜索（5 千文件 < 200ms）
• 文件历史 + Blame — 编辑器内一键查看 commit 列表 / diff / 单行 blame
• 268 例自动化测试（3 秒跑完）

🎁 历史特性：
• 基础 Git 操作：本地仓库、提交、推送、分支、合并、冲突解决
• Stash 队列 / Cherry-pick / Revert / 创建 PR·MR
• 双平台集成：云端仓库搜索、Contents API 在线浏览 / 编辑
• Monaco Editor 代码查看 / 编辑（VS Code 同款）
• 命令面板（Ctrl+Shift+P）+ 全局快捷键
• 底部状态栏（仓库/分支/同步/暂存计数/版本号）
• 三主题切换（暗色 / 深蓝 / 亮色）+ 中英双语
• 应用内自动更新

📦 跨平台支持：Windows 10/11 (x64)
📝 完整中文文档：docs/ 目录 6 个 markdown
🧪 测试覆盖：268 例（v0.4 218 + v0.5 50），Vitest 4 + happy-dom + Testing Library 16

💻 仓库：
• GitHub: https://github.com/buxiaju/KunyaoGit
• Gitee:  https://gitee.com/buxiaju/KunyaoGit

📥 v0.5.0 下载：
• GitHub: https://github.com/buxiaju/KunyaoGit/releases/tag/v0.5.0
• Gitee:  https://gitee.com/buxiaju/KunyaoGit/releases/tag/v0.5.0`;

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
    r.setTimeout(60000, () => r.destroy(new Error('Request timeout')));
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  const body = JSON.stringify({ name: REPO, description: DESCRIPTION });
  const r = await req({
    hostname: 'gitee.com', method: 'PATCH',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}?access_token=${GT_TOKEN}`,
    headers: { 'User-Agent': 'KunyaoGit-publish' },
  }, body, 'application/json');
  if (r.status !== 200) throw new Error('PATCH failed: ' + r.status + ' ' + r.text);
  console.log('✅ Gitee 仓库简介已更新（' + DESCRIPTION.length + ' 字符）');
  console.log('查看: https://gitee.com/buxiaju/KunyaoGit');
}

main().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
