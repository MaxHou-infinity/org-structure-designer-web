import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDisplaySettings,
  setDisplaySetting,
  resetDisplaySettingsCache,
} from './displaySettings';

describe('displaySettings（v2.0.7：画布显示岗位/职级开关）', () => {
  beforeEach(() => {
    // 重置模块缓存与 localStorage，保证各用例独立
    resetDisplaySettingsCache();
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('org-designer.display-settings');
    } catch {
      /* ignore */
    }
  });

  it('默认 显示职级=on、显示岗位=on', () => {
    expect(getDisplaySettings()).toEqual({ showLevel: true, showTitle: true });
  });

  it('setDisplaySetting 可关闭单项并持久化到缓存', () => {
    setDisplaySetting('showLevel', false);
    expect(getDisplaySettings().showLevel).toBe(false);
    expect(getDisplaySettings().showTitle).toBe(true);
  });

  it('resetDisplaySettingsCache 回默认', () => {
    setDisplaySetting('showTitle', false);
    resetDisplaySettingsCache();
    expect(getDisplaySettings()).toEqual({ showLevel: true, showTitle: true });
  });
});
