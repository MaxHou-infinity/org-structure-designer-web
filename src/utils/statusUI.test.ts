import { describe, it, expect } from 'vitest';
import { COMPETENCY_STYLE, COMPETENCY_LABEL, CompetencyStatus } from './statusUI';

/** v2.2.0 胜任度灯契约（design §8.1 = visual §3.2 原样；statusUI.test.ts 可选，见 design §10） */
describe('COMPETENCY_STYLE / COMPETENCY_LABEL', () => {
  it('四态齐备：healthy / warn / danger / unrated', () => {
    const keys = Object.keys(COMPETENCY_STYLE) as CompetencyStatus[];
    expect(keys.sort()).toEqual(['danger', 'healthy', 'unrated', 'warn']);
    expect(COMPETENCY_LABEL).toMatchObject({
      healthy: '胜任',
      warn: '待提升',
      danger: '不胜任',
      unrated: '未评分',
    });
  });

  it('每态具备 ring / glyph / text / bg 四个字段', () => {
    for (const st of Object.keys(COMPETENCY_STYLE) as CompetencyStatus[]) {
      const s = COMPETENCY_STYLE[st];
      expect(s.ring).toBeTruthy();
      expect(s.glyph).toBeTruthy();
      expect(s.text).toBeTruthy();
      expect(s.bg).toBeTruthy();
    }
  });

  it('精确色值/图标 = visual §3.2 原样（防视觉漂移）', () => {
    expect(COMPETENCY_STYLE.healthy).toEqual({
      ring: 'border-emerald-500 bg-emerald-50/70',
      glyph: '✓',
      text: 'text-emerald-700',
      bg: 'bg-emerald-50',
    });
    expect(COMPETENCY_STYLE.warn).toEqual({
      ring: 'border-amber-500 bg-amber-50/70',
      glyph: '!',
      text: 'text-amber-700',
      bg: 'bg-amber-50',
    });
    expect(COMPETENCY_STYLE.danger).toEqual({
      ring: 'border-red-500 bg-red-50/70',
      glyph: '×',
      text: 'text-red-700',
      bg: 'bg-red-50',
    });
    expect(COMPETENCY_STYLE.unrated).toEqual({
      ring: 'border-slate-300 bg-white/70',
      glyph: '–',
      text: 'text-slate-500',
      bg: 'bg-slate-50',
    });
  });

  it('unrated 存在且为中性灰（未评 = 显式状态，不伪装绿/红）', () => {
    expect(COMPETENCY_STYLE.unrated.ring).toContain('slate');
    expect(COMPETENCY_STYLE.unrated.text).toContain('slate');
    expect(COMPETENCY_LABEL.unrated).toBe('未评分');
  });

  it('text 均用 -700（正文状态文字对比要求，visual §6.2；-600 仅留给 14px+ 大数字）', () => {
    for (const st of ['healthy', 'warn', 'danger'] as CompetencyStatus[]) {
      expect(COMPETENCY_STYLE[st].text).toMatch(/-700$/);
    }
  });
});
