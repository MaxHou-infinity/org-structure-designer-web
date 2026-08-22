import { describe, it, expect } from 'vitest';
import { accumZoomWheel, applyZoomSteps } from './zoom';

describe('accumZoomWheel（增量累积 + 阈值衰减）', () => {
  it('低于阈值时不触发缩放（吸收小幅 delta）', () => {
    // 小幅 +30 累积，未达 120 阈值
    expect(accumZoomWheel(0, 30)).toEqual({ accumulated: 30, steps: 0 });
    expect(accumZoomWheel(50, 20)).toEqual({ accumulated: 70, steps: 0 });
  });

  it('达到阈值时折算为一步缩放，并保留超出部分', () => {
    // -120 = 一步放大
    const r1 = accumZoomWheel(0, -120);
    expect(r1.steps).toBe(-1);
    expect(r1.accumulated).toBe(0);

    // -150 = 一步放大 + 剩余 -30
    const r2 = accumZoomWheel(0, -150);
    expect(r2.steps).toBe(-1);
    expect(r2.accumulated).toBe(-30);
  });

  it('多次小幅 delta 会累积到阈值才触发（触控板高频场景）', () => {
    // 模拟触控板：6 次 -25（累计 -150）。第 4 次累积 -100 未触发；
    // 第 5 次累积 -125 触发 1 步（剩余 -5）；第 6 次累积 -30 未触发。
    let accum = 0;
    let totalSteps = 0;
    for (let i = 0; i < 6; i++) {
      const r = accumZoomWheel(accum, -25);
      accum = r.accumulated;
      totalSteps += r.steps;
      if (i < 4) expect(r.steps).toBe(0); // 前 4 次未达阈值
    }
    expect(totalSteps).toBe(-1); // 累计 -150 只触发 1 步（而非 6 步）
    expect(accum).toBe(-30);
  });

  it('向下滚（正 delta）折算为放大前的缩小步数', () => {
    const r = accumZoomWheel(0, 240);
    expect(r.steps).toBe(2); // 240/120 = 2 步缩小
    expect(r.accumulated).toBe(0);
  });
});

describe('applyZoomSteps（步数 → 缩放值）', () => {
  it('steps=0 返回原值', () => {
    expect(applyZoomSteps(100, 0)).toBe(100);
  });

  it('放大一步约 +8%，缩小一步约 -7%', () => {
    const zoomUp = applyZoomSteps(100, -1); // 放大
    expect(zoomUp).toBeGreaterThan(100);
    expect(zoomUp).toBeCloseTo(108, 0);

    const zoomDown = applyZoomSteps(100, 1); // 缩小
    expect(zoomDown).toBeLessThan(100);
    expect(zoomDown).toBeCloseTo(92.6, 0);
  });

  it('多步复用固定步长，避免连乘误差', () => {
    // 3 步放大应接近 108^3，而不是线性叠加
    const zoom3 = applyZoomSteps(100, -3);
    expect(zoom3).toBeGreaterThan(120);
    expect(zoom3).toBeCloseTo(100 * Math.pow(1.08, 3), 0);
  });

  it('钳制在 50-200 范围', () => {
    expect(applyZoomSteps(195, -2)).toBe(200); // 放大超上限 → 200
    expect(applyZoomSteps(55, 2)).toBe(50);    // 缩小超下限 → 50
  });
});
