// v0.4+ GitService 单元测试（mock simple-git）
// 重点覆盖 v0.4 新增方法的解析逻辑与错误处理

import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock simple-git：必须在 import GitService 之前
const mockRaw = vi.fn();
const mockStash = vi.fn();
const mockStatus = vi.fn();
const mockLog = vi.fn();

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    raw: mockRaw,
    stash: mockStash,
    status: mockStatus,
    log: mockLog,
  })),
}));

const { GitService } = await import('../../electron/services/git');

describe('GitService (v0.4+ 方法)', () => {
  let svc: InstanceType<typeof GitService>;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new GitService('C:/fake/repo');
  });

  // ============ stashList ============
  describe('stashList', () => {
    it('空输出返回空数组', async () => {
      mockRaw.mockResolvedValue('');
      const r = await svc.stashList();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toEqual([]);
    });

    it('只有空白的输出返回空数组', async () => {
      mockRaw.mockResolvedValue('   \n  \n');
      const r = await svc.stashList();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toEqual([]);
    });

    it('解析单条 stash（WIP on 格式）', async () => {
      mockRaw.mockResolvedValue(
        'stash@{0}|9c9a1b4|2026-08-23T10:00:00+08:00|WIP on main: abc1234 上一次提交说明'
      );
      const r = await svc.stashList();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
      expect(r.data[0]).toMatchObject({
        index: 0,
        ref: 'stash@{0}',
        hash: '9c9a1b4',
        branch: 'main',
        date: '2026-08-23T10:00:00+08:00',
      });
      // 剥离了 "WIP on main: abc1234 " 前缀
      expect(r.data[0].message).toBe('上一次提交说明');
    });

    it('解析多条 stash 并正确编号', async () => {
      mockRaw.mockResolvedValue(
        [
          'stash@{0}|aaa1111|2026-08-23T10:00:00+08:00|WIP on feature: abc1234 最新',
          'stash@{1}|bbb2222|2026-08-22T10:00:00+08:00|WIP on main: def5678 较旧',
          'stash@{2}|ccc3333|2026-08-21T10:00:00+08:00|On hotfix: 999aaaa 最旧',
        ].join('\n')
      );
      const r = await svc.stashList();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(3);
      expect(r.data.map((e) => e.index)).toEqual([0, 1, 2]);
      expect(r.data.map((e) => e.branch)).toEqual(['feature', 'main', 'hotfix']);
      expect(r.data.map((e) => e.message)).toEqual(['最新', '较旧', '最旧']);
    });

    it('解析自定义 message（git stash push -m 的场景）', async () => {
      // 用户自己写的 message 没有 "WIP on" 前缀
      mockRaw.mockResolvedValue('stash@{0}|aaa1111|2026-08-23T10:00:00+08:00|修复登录 bug');
      const r = await svc.stashList();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data[0].message).toBe('修复登录 bug');
      // 没有 branch 信息时为空字符串
      expect(r.data[0].branch).toBe('');
    });

    it('message 中含 | 分隔符时不被截断', async () => {
      mockRaw.mockResolvedValue(
        'stash@{0}|aaa1111|2026-08-23T10:00:00+08:00|feat: a | b | c'
      );
      const r = await svc.stashList();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // msgParts.join('|') 应该把后续的 | 还原
      expect(r.data[0].message).toBe('feat: a | b | c');
    });

    it('字段不足 4 段的行被跳过', async () => {
      mockRaw.mockResolvedValue(
        [
          'stash@{0}|aaa1111|2026-08-23T10:00:00+08:00|正常',
          'broken-line-without-pipes',
          'stash@{1}|bbb|only-two',
        ].join('\n')
      );
      const r = await svc.stashList();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // 只有第一行合法
      expect(r.data).toHaveLength(1);
      expect(r.data[0].message).toBe('正常');
    });

    it('git 抛错时返回 ok:false', async () => {
      mockRaw.mockRejectedValue(new Error('not a git repository'));
      const r = await svc.stashList();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('not a git repository');
    });

    it('调用时传入正确的 git 参数', async () => {
      mockRaw.mockResolvedValue('');
      await svc.stashList();
      expect(mockRaw).toHaveBeenCalledWith(['stash', 'list', '--format=%gd|%h|%cI|%s']);
    });
  });

  // ============ stashApply / stashDrop ============
  describe('stashApply', () => {
    it('成功时返回 ok:true', async () => {
      mockStash.mockResolvedValue('');
      const r = await svc.stashApply('stash@{1}');
      expect(r.ok).toBe(true);
      expect(mockStash).toHaveBeenCalledWith(['apply', 'stash@{1}']);
    });

    it('冲突时返回错误信息', async () => {
      mockStash.mockRejectedValue(new Error('CONFLICT (content): Merge conflict in foo.ts'));
      const r = await svc.stashApply('stash@{0}');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('CONFLICT');
    });
  });

  describe('stashDrop', () => {
    it('成功时返回 ok:true 并传入 ref', async () => {
      mockStash.mockResolvedValue('');
      const r = await svc.stashDrop('stash@{2}');
      expect(r.ok).toBe(true);
      expect(mockStash).toHaveBeenCalledWith(['drop', 'stash@{2}']);
    });
  });

  describe('stashShow', () => {
    it('解析 diff 输出', async () => {
      mockRaw.mockResolvedValue(`diff --git a/foo.ts b/foo.ts
index 111..222 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1 +1 @@
-old
+new
`);
      const r = await svc.stashShow('stash@{0}');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
      expect(r.data[0].path).toBe('foo.ts');
    });

    it('传入正确的 git 参数', async () => {
      mockRaw.mockResolvedValue('');
      await svc.stashShow('stash@{3}');
      expect(mockRaw).toHaveBeenCalledWith(['stash', 'show', '-p', '--no-color', 'stash@{3}']);
    });
  });

  // ============ cherryPick ============
  describe('cherryPick', () => {
    it('成功时解析出新 commit hash', async () => {
      mockRaw.mockResolvedValue('[main 1a2b3c4] feat: 新功能\n 1 file changed, 2 insertions(+)');
      const r = await svc.cherryPick('abc1234');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.hash).toBe('1a2b3c4');
    });

    it('解析带分支追踪信息的输出', async () => {
      mockRaw.mockResolvedValue('[feature/foo (root-commit) 9f8e7d6] fix: 修复\n');
      const r = await svc.cherryPick('abc1234');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.hash).toBe('9f8e7d6');
    });

    it('无法解析 hash 时 data.hash 为 undefined 但仍 ok', async () => {
      mockRaw.mockResolvedValue('some unexpected output');
      const r = await svc.cherryPick('abc1234');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.hash).toBeUndefined();
    });

    it('传入基础参数', async () => {
      mockRaw.mockResolvedValue('');
      await svc.cherryPick('abc1234');
      expect(mockRaw).toHaveBeenCalledWith(['cherry-pick', 'abc1234']);
    });

    it('mainline 参数生成 -m 标志', async () => {
      mockRaw.mockResolvedValue('');
      await svc.cherryPick('abc1234', { mainline: 1 });
      expect(mockRaw).toHaveBeenCalledWith(['cherry-pick', '-m', '1', 'abc1234']);
    });

    it('noCommit 参数生成 --no-commit 标志', async () => {
      mockRaw.mockResolvedValue('');
      await svc.cherryPick('abc1234', { noCommit: true });
      expect(mockRaw).toHaveBeenCalledWith(['cherry-pick', '--no-commit', 'abc1234']);
    });

    it('冲突时返回错误', async () => {
      mockRaw.mockRejectedValue(
        new Error('error: could not apply abc1234... CONFLICT (content)')
      );
      const r = await svc.cherryPick('abc1234');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('CONFLICT');
    });
  });

  // ============ revert ============
  describe('revert', () => {
    it('成功时解析出新 commit hash', async () => {
      mockRaw.mockResolvedValue('[main 5f4e3d2] Revert "feat: 旧功能"\n 1 file changed');
      const r = await svc.revert('abc1234');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.hash).toBe('5f4e3d2');
    });

    it('传入基础参数', async () => {
      mockRaw.mockResolvedValue('');
      await svc.revert('abc1234');
      expect(mockRaw).toHaveBeenCalledWith(['revert', 'abc1234']);
    });

    it('mainline 参数用于回退合并提交', async () => {
      mockRaw.mockResolvedValue('');
      await svc.revert('mergehash', { mainline: 1 });
      expect(mockRaw).toHaveBeenCalledWith(['revert', '-m', '1', 'mergehash']);
    });

    it('回退合并提交未指定 -m 时的错误被传递', async () => {
      mockRaw.mockRejectedValue(
        new Error('error: commit abc1234 is a merge but no -m option was given')
      );
      const r = await svc.revert('abc1234');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('is a merge but no -m option');
    });
  });

  // ============ status（v0.3.7 的 staged 判定回归测试）============
  describe('status（staged 判定）', () => {
    /** status() 会读 s.files 和 s.conflicted，两个都要给 */
    const statusResult = (files: any[], conflicted: string[] = []) => ({ files, conflicted });

    it('index=M workdir=空 → 已暂存的修改', async () => {
      mockStatus.mockResolvedValue(statusResult([{ path: 'a.ts', index: 'M', working_dir: ' ' }]));
      const r = await svc.status();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
      expect(r.data[0]).toMatchObject({ path: 'a.ts', status: 'modified', staged: true });
    });

    it('index=空 workdir=M → 未暂存的修改', async () => {
      mockStatus.mockResolvedValue(statusResult([{ path: 'b.ts', index: ' ', working_dir: 'M' }]));
      const r = await svc.status();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data[0]).toMatchObject({ path: 'b.ts', status: 'modified', staged: false });
    });

    it('index=? → 未跟踪', async () => {
      mockStatus.mockResolvedValue(statusResult([{ path: 'new.ts', index: '?', working_dir: '?' }]));
      const r = await svc.status();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data[0]).toMatchObject({ path: 'new.ts', status: 'untracked', staged: false });
    });

    it('index=A → 已暂存的新增', async () => {
      mockStatus.mockResolvedValue(statusResult([{ path: 'added.ts', index: 'A', working_dir: ' ' }]));
      const r = await svc.status();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data[0]).toMatchObject({ status: 'added', staged: true });
    });

    it('index=D → 已暂存的删除', async () => {
      mockStatus.mockResolvedValue(statusResult([{ path: 'gone.ts', index: 'D', working_dir: ' ' }]));
      const r = await svc.status();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data[0]).toMatchObject({ status: 'deleted', staged: true });
    });

    it('index=R → 已暂存的重命名（含 oldPath）', async () => {
      mockStatus.mockResolvedValue(
        statusResult([{ path: 'new-name.ts', index: 'R', working_dir: ' ', from: 'old-name.ts' }])
      );
      const r = await svc.status();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data[0]).toMatchObject({
        path: 'new-name.ts',
        oldPath: 'old-name.ts',
        status: 'renamed',
        staged: true,
      });
    });

    it('index=M workdir=M → 同一文件产生两条记录（部分暂存）', async () => {
      mockStatus.mockResolvedValue(
        statusResult([{ path: 'partial.ts', index: 'M', working_dir: 'M' }])
      );
      const r = await svc.status();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // 一条已暂存 + 一条未暂存
      expect(r.data).toHaveLength(2);
      expect(r.data.filter((f) => f.staged)).toHaveLength(1);
      expect(r.data.filter((f) => !f.staged)).toHaveLength(1);
    });

    it('conflicted 文件被单独标记', async () => {
      mockStatus.mockResolvedValue(statusResult([], ['conflict.ts']));
      const r = await svc.status();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
      expect(r.data[0]).toMatchObject({
        path: 'conflict.ts',
        status: 'conflicted',
        staged: false,
      });
    });

    it('空 files 数组返回空结果', async () => {
      mockStatus.mockResolvedValue(statusResult([]));
      const r = await svc.status();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toEqual([]);
    });

    it('git 抛错时返回 ok:false', async () => {
      mockStatus.mockRejectedValue(new Error('fatal: not a git repository'));
      const r = await svc.status();
      expect(r.ok).toBe(false);
    });
  });
});
