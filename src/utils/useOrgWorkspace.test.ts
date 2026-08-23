// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrgWorkspace } from './useOrgWorkspace';
import * as projectModule from './project';

// React 18 的 act 需要在 jsdom 下显式声明
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT_STORAGE_KEY = 'org-designer.project.v2';

/**
 * useOrgWorkspace SaveState 状态机单测（v2.0.3 P2）。
 *
 * 验证自动保存状态机：saved →(编辑) unsaved →(800ms debounce) saving → saved。
 * - saving 在 800ms 回调内同步被 saved 覆盖，实际渲染不可见，故断言 saved/unsaved/failed。
 * - fake timers 控制 800ms 窗口，验证 debounce 未满 800ms 不落盘。
 * - 用 Map-backed localStorage stub，避免 Node 实验性 localStorage 在该环境不可用的问题。
 */
describe('useOrgWorkspace SaveState 状态机', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('初始状态为 saved', () => {
    const { result } = renderHook(() => useOrgWorkspace());
    expect(result.current.saveState).toBe('saved');
  });

  it('编辑变更 → 立即 unsaved，未满 800ms 不落盘，满 800ms 落盘为 saved', () => {
    const { result } = renderHook(() => useOrgWorkspace());

    // 变更 zoom 触发自动保存依赖
    act(() => {
      result.current.setZoom(150);
    });
    expect(result.current.saveState).toBe('unsaved');

    // 未满 800ms 仍保持 unsaved（debounce 未触发）
    act(() => {
      vi.advanceTimersByTime(799);
    });
    expect(result.current.saveState).toBe('unsaved');

    // 满 800ms → 触发保存并落盘
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.saveState).toBe('saved');
    expect(storage.get(PROJECT_STORAGE_KEY)).toBeTruthy();
  });

  it('连续变更重置 debounce：距最后一次变更满 800ms 才落盘', () => {
    const { result } = renderHook(() => useOrgWorkspace());

    act(() => {
      result.current.setZoom(110); // 起点 A
    });
    act(() => {
      vi.advanceTimersByTime(500); // 距 A 500ms
    });
    expect(result.current.saveState).toBe('unsaved');

    act(() => {
      result.current.setZoom(120); // 再次变更，重置计时为起点 B
    });
    act(() => {
      vi.advanceTimersByTime(799); // 距 B 799ms
    });
    expect(result.current.saveState).toBe('unsaved'); // 计时被重置，仍未触发

    act(() => {
      vi.advanceTimersByTime(1); // 距 B 800ms
    });
    expect(result.current.saveState).toBe('saved');
  });

  it('persistProject 失败 → saveState 变为 failed', () => {
    const spy = vi.spyOn(projectModule, 'persistProject').mockReturnValue(false);
    const { result } = renderHook(() => useOrgWorkspace());

    act(() => {
      result.current.setZoom(150);
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.saveState).toBe('failed');
    spy.mockRestore();
  });
});
