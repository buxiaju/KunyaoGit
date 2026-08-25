import { describe, it, expect } from 'vitest';

describe('debug', () => {
  it('check window.gitgui', () => {
    // eslint-disable-next-line no-console
    console.log('git keys:', Object.keys((window as any).gitgui.git));
    expect(true).toBe(true);
  });
});
