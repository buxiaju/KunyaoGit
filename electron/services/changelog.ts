import type { CommitInfo, ChangelogGroup } from '../../shared/types';

const TYPE_PATTERNS: Array<[ChangelogGroup['type'], RegExp]> = [
  ['feat', /^feat(\(.+\))?:\s/i],
  ['fix', /^fix(\(.+\))?:\s/i],
  ['docs', /^docs(\(.+\))?:\s/i],
  ['refactor', /^refactor(\(.+\))?:\s/i],
  ['perf', /^perf(\(.+\))?:\s/i],
  ['chore', /^chore(\(.+\))?:\s/i],
];

const TYPE_LABELS: Record<ChangelogGroup['type'], string> = {
  feat: '🚀 新功能',
  fix: '🐛 Bug 修复',
  docs: '📝 文档',
  refactor: '♻️ 重构',
  perf: '⚡ 性能',
  chore: '🔧 杂项',
  other: '📦 其他',
};

export function classifyCommit(message: string): ChangelogGroup['type'] {
  const firstLine = message.split('\n')[0];
  for (const [type, re] of TYPE_PATTERNS) {
    if (re.test(firstLine)) return type;
  }
  return 'other';
}

export function stripPrefix(message: string): string {
  return message
    .split('\n')[0]
    .replace(/^(feat|fix|docs|refactor|perf|chore)(\(.+\))?:\s*/i, '')
    .trim();
}

export function generateChangelog(commits: CommitInfo[]): string {
  const groups = new Map<ChangelogGroup['type'], CommitInfo[]>();
  for (const c of commits) {
    const t = classifyCommit(c.message);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t)!.push(c);
  }

  const order: ChangelogGroup['type'][] = ['feat', 'fix', 'perf', 'refactor', 'docs', 'chore', 'other'];
  const lines: string[] = ['# Changelog', ''];

  for (const t of order) {
    const list = groups.get(t);
    if (!list || list.length === 0) continue;
    lines.push(`## ${TYPE_LABELS[t]}`);
    lines.push('');
    for (const c of list) {
      lines.push(`- ${stripPrefix(c.message)} (${c.shortHash})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
