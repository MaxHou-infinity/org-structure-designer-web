import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_LEVELS,
  levelFullLabel,
  validateLevel,
  getLevelColor,
  getLevelLabel,
  fullCode,
} from './levels';
import { validateLevelCode, validateLevelNumber, normalizeLevelNumber, autoColor } from './level';

describe('fullCode / levelFullLabel', () => {
  it('拼接完整职级码 = code + number', () => {
    expect(fullCode({ code: 'L', number: '1.1' })).toBe('L1.1');
    expect(fullCode({ code: 'E', number: '3.2' })).toBe('E3.2');
  });

  it('完整标签 = fullCode + - + label', () => {
    expect(levelFullLabel({ code: 'L', number: '1.1', label: '初级专员' })).toBe('L1.1-初级专员');
  });
});

describe('validateLevelCode / validateLevelNumber', () => {
  it('validateLevelCode：1-2 位字母，忽略大小写', () => {
    expect(validateLevelCode('L')).toBe(true);
    expect(validateLevelCode('E')).toBe(true);
    expect(validateLevelCode('MD')).toBe(true);
    expect(validateLevelCode('l')).toBe(true); // 自动转大写
    expect(validateLevelCode('ABC')).toBe(false); // 3 位
    expect(validateLevelCode('1')).toBe(false);
    expect(validateLevelCode('')).toBe(false);
  });

  it('validateLevelNumber：整数或一位小数', () => {
    expect(validateLevelNumber('1')).toBe(true);
    expect(validateLevelNumber('1.1')).toBe(true);
    expect(validateLevelNumber('2.5')).toBe(true);
    expect(validateLevelNumber('1.1.1')).toBe(false);
    expect(validateLevelNumber('1.00')).toBe(false);
    expect(validateLevelNumber('abc')).toBe(false);
  });

  it('normalizeLevelNumber：去前导 0、去尾随 .0、去尾随点', () => {
    expect(normalizeLevelNumber('001')).toBe('1');
    expect(normalizeLevelNumber('1.0')).toBe('1');
    expect(normalizeLevelNumber('1.')).toBe('1');
    expect(normalizeLevelNumber('2.5')).toBe('2.5');
  });
});

describe('autoColor（v2.0.12 语义化：序列色系 + 级别深浅）', () => {
  const luminance = (hex: string): number => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  it('同一 fullCode 稳定返回同一颜色，且为合法 HEX', () => {
    const c1 = autoColor('L1.1');
    expect(c1).toBe(autoColor('L1.1'));
    expect(c1).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(autoColor('E3.1')).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('不同序列不同色系（L=indigo 系、E=emerald 系互相区分）', () => {
    expect(autoColor('L1.1')).not.toBe(autoColor('E1.1'));
    // L 系列偏蓝紫（b 分量占优），E 系列偏绿（g 分量占优）
    const lRgb = autoColor('L1.1').slice(1);
    const eRgb = autoColor('E1.1').slice(1);
    expect(parseInt(lRgb.slice(4, 6), 16)).toBeGreaterThan(parseInt(lRgb.slice(2, 4), 16));
    expect(parseInt(eRgb.slice(2, 4), 16)).toBeGreaterThan(parseInt(eRgb.slice(4, 6), 16));
  });

  it('同序列内编号越大颜色越深（L1.1 亮于 L3.2）', () => {
    expect(luminance(autoColor('L1.1'))).toBeGreaterThan(luminance(autoColor('L3.2')));
    expect(luminance(autoColor('L0'))).toBeGreaterThan(luminance(autoColor('L1.1')));
  });

  it('未知序列也能获得稳定颜色（MD 系列确定性分配）', () => {
    expect(autoColor('MD2.5')).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(autoColor('MD2.5')).toBe(autoColor('MD2.5'));
  });
});

describe('validateLevel', () => {
  it('合法的序列代码与编号通过', () => {
    expect(validateLevel({ code: 'L', number: '1', label: '实习生' })).toEqual([]);
    expect(validateLevel({ code: 'E', number: '1.1', label: '专家' })).toEqual([]);
    expect(validateLevel({ code: 'MD', number: '2.5', label: '总监' })).toEqual([]);
  });

  it('拒绝非法序列代码 / 编号 / 空标签', () => {
    expect(validateLevel({ code: 'ABC', number: '1', label: 'x' })).not.toEqual([]); // 超过 2 位字母
    expect(validateLevel({ code: 'Ab3', number: '1', label: 'x' })).not.toEqual([]); // 含数字
    expect(validateLevel({ code: 'L', number: '1.1.1', label: 'x' })).not.toEqual([]);
    expect(validateLevel({ code: 'L', number: '1.00', label: 'x' })).not.toEqual([]);
    expect(validateLevel({ code: 'L', number: '1', label: '' })).not.toEqual([]);
  });

  it('接受 1-2 位字母序列码（含小写自动转大写）与整数/一位小数编号', () => {
    expect(validateLevel({ code: 'MD', number: '2.5', label: '总监' })).toEqual([]);
    expect(validateLevel({ code: 'L', number: '0', label: '实习生' })).toEqual([]);
    expect(validateLevel({ code: 'E', number: '5', label: '副总裁' })).toEqual([]);
    expect(validateLevel({ code: 'l', number: '1', label: 'x' })).toEqual([]); // 小写合法
    expect(validateLevel({ code: 'md', number: '1', label: 'x' })).toEqual([]); // 小写两字母合法
  });

  it('拒绝 3 位以上 / 含数字 / 符号 / 空序列码', () => {
    expect(validateLevel({ code: 'ABC', number: '1', label: 'x' })).not.toEqual([]); // 3 位
    expect(validateLevel({ code: 'AB1', number: '1', label: 'x' })).not.toEqual([]); // 含数字
    expect(validateLevel({ code: 'L-', number: '1', label: 'x' })).not.toEqual([]); // 含符号
    expect(validateLevel({ code: '', number: '1', label: 'x' })).not.toEqual([]); // 空
  });

  it('拒绝两位小数 / 尾随点 / 无整数位 / 负数 / 空编号', () => {
    expect(validateLevel({ code: 'L', number: '1.10', label: 'x' })).not.toEqual([]);
    expect(validateLevel({ code: 'L', number: '1.', label: 'x' })).not.toEqual([]);
    expect(validateLevel({ code: 'L', number: '.5', label: 'x' })).not.toEqual([]);
    expect(validateLevel({ code: 'L', number: '-1', label: 'x' })).not.toEqual([]);
    expect(validateLevel({ code: 'L', number: '', label: 'x' })).not.toEqual([]);
  });

  it('拒绝空标签（含纯空格）', () => {
    expect(validateLevel({ code: 'L', number: '1', label: '' })).not.toEqual([]);
    expect(validateLevel({ code: 'L', number: '1', label: '   ' })).not.toEqual([]);
  });
});

describe('getLevelColor / getLevelLabel', () => {
  it('按职级码取颜色与标签，未知码返回兜底', () => {
    expect(getLevelColor(DEFAULT_LEVELS, 'L1.1')).toBe(autoColor('L1.1')); // v2.0.12 语义化默认色
    expect(getLevelColor(DEFAULT_LEVELS, 'ZZ9')).toBe('#CCCCCC');
    expect(getLevelLabel(DEFAULT_LEVELS, 'L1.1')).toBe('L1.1-初级专员');
    expect(getLevelLabel(DEFAULT_LEVELS, 'ZZ9')).toBe('ZZ9');
  });
});

describe('localStorage 持久化', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    // 清空模块缓存，让每个用例拿到 cache 为 null 的全新模块实例
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('更新后写入 localStorage，再次读取得到相同配置', async () => {
    const mod = await import('./levels');
    const next = [
      { code: 'X', number: '1', label: '自定义A', color: '#123456' },
      { code: 'X', number: '2', label: '自定义B', color: '#654321' },
    ];
    mod.updateLevelConfigs(next);
    expect(storage.get('org-designer.level-configs')).toBeTruthy();
    expect(mod.getLevelConfigs()).toEqual(next);
  });

  it('解析非法 localStorage 数据时回退默认职级', async () => {
    storage.set('org-designer.level-configs', '{"not":"an array"}');
    const mod = await import('./levels');
    expect(mod.getLevelConfigs()).toEqual(DEFAULT_LEVELS);
  });

  it('存储中混有非法项时仅保留合法项，全非法则回退默认', async () => {
    const mixed = [
      { code: 'L', number: '1', label: '合法', color: '#111111' },
      { code: 'ABC', number: '1', label: '超过两位', color: '#222222' }, // 序列码 3 位
      { code: 'L', number: '1.11', label: '两位小数', color: '#333333' }, // 编号两位小数
      { code: 'L', number: '', label: '', color: '#444444' }, // 空编号/空标签
      { code: 5 as unknown as string, number: '1', label: '类型非法', color: '#555555' }, // 类型错
    ];
    storage.set('org-designer.level-configs', JSON.stringify(mixed));
    const mod = await import('./levels');
    expect(mod.getLevelConfigs()).toEqual([
      { code: 'L', number: '1', label: '合法', color: '#111111' },
    ]);
  });

  it('全部为非法项时回退默认职级', async () => {
    storage.set(
      'org-designer.level-configs',
      JSON.stringify([{ code: 'l', number: 'x', label: '', color: 'bad' }]),
    );
    const mod = await import('./levels');
    expect(mod.getLevelConfigs()).toEqual(DEFAULT_LEVELS);
  });

  it('resetLevelConfigs 恢复默认职级并持久化', async () => {
    const mod = await import('./levels');
    mod.updateLevelConfigs([{ code: 'X', number: '1', label: '自定义', color: '#111111' }]);
    mod.resetLevelConfigs();
    expect(mod.getLevelConfigs()).toEqual(DEFAULT_LEVELS);
    expect(JSON.parse(storage.get('org-designer.level-configs')!)).toEqual(DEFAULT_LEVELS);
  });

  it('小写序列码在 load 时归一化为大写，并按大写 fullCode 正确取色/取标签', async () => {
    storage.set(
      'org-designer.level-configs',
      JSON.stringify([{ code: 'l', number: '1', label: '初级专员', color: '#123456' }]),
    );
    const mod = await import('./levels');
    const configs = mod.getLevelConfigs();
    // loadFromStorage 归一化防御：code 转大写（'l' → 'L'）
    expect(configs).toEqual([{ code: 'L', number: '1', label: '初级专员', color: '#123456' }]);
    // 归一化后按大写 fullCode 命中
    expect(getLevelColor(configs, 'L1')).toBe('#123456');
    expect(getLevelLabel(configs, 'L1')).toBe('L1-初级专员');
  });

  it('load 时对编号做规范化（1.0 → 1，01 → 1）', async () => {
    storage.set(
      'org-designer.level-configs',
      JSON.stringify([{ code: 'L', number: '1.0', label: '初级专员', color: '#123456' }]),
    );
    const mod = await import('./levels');
    expect(mod.getLevelConfigs()).toEqual([
      { code: 'L', number: '1', label: '初级专员', color: '#123456' },
    ]);
  });

  it('load 时同时归一化 code 大写 + 编号 + 标签（组合防御）', async () => {
    storage.set(
      'org-designer.level-configs',
      JSON.stringify([{ code: 'l', number: '001', label: ' 初级专员 ', color: '#123456' }]),
    );
    const mod = await import('./levels');
    const configs = mod.getLevelConfigs();
    expect(configs).toEqual([
      { code: 'L', number: '1', label: '初级专员', color: '#123456' },
    ]);
    // 归一化后按大写 fullCode 命中
    expect(getLevelColor(configs, 'L1')).toBe('#123456');
    expect(getLevelLabel(configs, 'L1')).toBe('L1-初级专员');
  });
});
