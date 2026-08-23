// 测试环境下的 electron-store 替身
// 真实的 electron-store 依赖 Electron 的 app.getPath('userData')，在 vitest 里不可用
// 这里用内存 Map 提供同样的 get/set/delete/store API

export default class StoreStub<T extends Record<string, any> = Record<string, any>> {
  private data = new Map<string, any>();
  private defaults: Partial<T>;

  constructor(opts: { defaults?: Partial<T> } = {}) {
    this.defaults = opts.defaults || {};
    for (const [k, v] of Object.entries(this.defaults)) {
      this.data.set(k, v);
    }
  }

  get<K extends keyof T & string>(key: K, fallback?: T[K]): T[K] {
    if (this.data.has(key)) return this.data.get(key);
    if (key in this.defaults) return this.defaults[key] as T[K];
    return fallback as T[K];
  }

  set<K extends keyof T & string>(key: K | Partial<T>, value?: T[K]): void {
    if (typeof key === 'object') {
      for (const [k, v] of Object.entries(key)) this.data.set(k, v);
    } else {
      this.data.set(key, value);
    }
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
    for (const [k, v] of Object.entries(this.defaults)) this.data.set(k, v);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  get store(): T {
    return Object.fromEntries(this.data) as T;
  }

  get path(): string {
    return '/tmp/test-config.json';
  }
}
