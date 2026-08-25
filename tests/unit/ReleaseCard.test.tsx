// v0.6+ ReleaseCard 组件测试
// 覆盖：基本渲染、状态徽标、回调、draft 才显示发布按钮

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../src/i18n';
import ReleaseCard from '../../src/components/repo/ReleaseCard';
import type { ReleaseInfo } from '../../shared/types';

const makeRelease = (over: Partial<ReleaseInfo> = {}): ReleaseInfo => ({
  tag: 'v1.0.0',
  name: 'Release v1.0.0',
  body: 'Initial release',
  draft: false,
  prerelease: false,
  createdAt: new Date().toISOString(),
  publishedAt: new Date().toISOString(),
  assets: [],
  platform: 'github',
  ...over,
});

const wrap = (ui: React.ReactNode) => (
  <I18nProvider lang="zh" setLang={() => {}}>{ui}</I18nProvider>
);

describe('ReleaseCard', () => {
  it('显示 name / tag / 平台', () => {
    render(
      wrap(
        <ReleaseCard
          release={makeRelease({ name: 'My Release', tag: 'v2.0.0', platform: 'github' })}
          onOpenDetail={() => {}}
          onPublish={() => {}}
          onDelete={() => {}}
        />
      )
    );
    expect(screen.getByText('My Release')).toBeTruthy();
    expect(screen.getByText('v2.0.0')).toBeTruthy();
    expect(screen.getByText('github')).toBeTruthy();
  });

  it('draft=true 时显示「草稿」徽标', () => {
    render(
      wrap(
        <ReleaseCard
          release={makeRelease({ draft: true })}
          onOpenDetail={() => {}}
          onPublish={() => {}}
          onDelete={() => {}}
        />
      )
    );
    expect(screen.getByText('草稿')).toBeTruthy();
  });

  it('prerelease=true 时显示「预发布」徽标', () => {
    render(
      wrap(
        <ReleaseCard
          release={makeRelease({ prerelease: true })}
          onOpenDetail={() => {}}
          onPublish={() => {}}
          onDelete={() => {}}
        />
      )
    );
    expect(screen.getByText('预发布')).toBeTruthy();
  });

  it('draft=true 时显示发布按钮；否则不显示', () => {
    const onPublish = vi.fn();
    // draft=true
    const { rerender } = render(
      wrap(
        <ReleaseCard
          release={makeRelease({ draft: true })}
          onOpenDetail={() => {}}
          onPublish={onPublish}
          onDelete={() => {}}
        />
      )
    );
    const publishBtn = screen.getByTitle('发布草稿');
    expect(publishBtn).toBeTruthy();
    fireEvent.click(publishBtn);
    expect(onPublish).toHaveBeenCalledTimes(1);

    // draft=false（已发布）
    rerender(
      wrap(
        <ReleaseCard
          release={makeRelease({ draft: false })}
          onOpenDetail={() => {}}
          onPublish={() => {}}
          onDelete={() => {}}
        />
      )
    );
    expect(screen.queryByTitle('发布草稿')).toBeNull();
  });

  it('assets 数量 > 0 时显示附件计数', () => {
    const assets = [
      { id: 1, name: 'app.zip', size: 1024, downloadCount: 5, downloadUrl: 'https://x' },
      { id: 2, name: 'app.exe', size: 2048, downloadCount: 3, downloadUrl: 'https://y' },
    ];
    render(
      wrap(
        <ReleaseCard
          release={makeRelease({ assets })}
          onOpenDetail={() => {}}
          onPublish={() => {}}
          onDelete={() => {}}
        />
      )
    );
    expect(screen.getByText(/2\s*个附件|2\s*assets/)).toBeTruthy();
  });

  it('点击详情按钮触发 onOpenDetail', () => {
    const onOpen = vi.fn();
    render(
      wrap(
        <ReleaseCard
          release={makeRelease()}
          onOpenDetail={onOpen}
          onPublish={() => {}}
          onDelete={() => {}}
        />
      )
    );
    fireEvent.click(screen.getByTitle('详情'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('点击删除按钮触发 onDelete', () => {
    const onDel = vi.fn();
    render(
      wrap(
        <ReleaseCard
          release={makeRelease()}
          onOpenDetail={() => {}}
          onPublish={() => {}}
          onDelete={onDel}
        />
      )
    );
    fireEvent.click(screen.getByTitle('删除'));
    expect(onDel).toHaveBeenCalledTimes(1);
  });
});
