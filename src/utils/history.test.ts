import { describe, it, expect } from 'vitest';
import { HistoryStore } from './history';

describe('HistoryStore（撤销/重做快照栈）', () => {
  it('初始无历史，不可撤销/重做', () => {
    const h = new HistoryStore<number>(0, 5);
    expect(h.getSnapshot()).toBe(0);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    h.undo();
    expect(h.getSnapshot()).toBe(0);
  });

  it('set 提交新快照，记录过去', () => {
    const h = new HistoryStore<number>(0, 5);
    h.set(1);
    h.set(2);
    expect(h.getSnapshot()).toBe(2);
    expect(h.canUndo()).toBe(true);
    expect(h.undoDepth).toBe(2);
  });

  it('撤销回退，重做前进', () => {
    const h = new HistoryStore<number>(0, 5);
    h.set(1);
    h.set(2);
    h.undo();
    expect(h.getSnapshot()).toBe(1);
    h.undo();
    expect(h.getSnapshot()).toBe(0);
    expect(h.canUndo()).toBe(false);
    h.redo();
    expect(h.getSnapshot()).toBe(1);
    h.redo();
    expect(h.getSnapshot()).toBe(2);
    expect(h.canRedo()).toBe(false);
  });

  it('新动作清空 redo 栈（标准行为）', () => {
    const h = new HistoryStore<number>(0, 5);
    h.set(1);
    h.set(2);
    h.undo(); // present = 1, future = [2]
    expect(h.canRedo()).toBe(true);
    h.set(99); // 新动作 → redo 清空
    expect(h.canRedo()).toBe(false);
    expect(h.getSnapshot()).toBe(99);
  });

  it('栈深超限裁剪最旧条目', () => {
    const h = new HistoryStore<number>(0, 3);
    h.set(1);
    h.set(2);
    h.set(3);
    h.set(4); // past = [1,2,3] 被裁剪为 [2,3]
    expect(h.undoDepth).toBe(3);
    h.undo(); // present = 3
    h.undo(); // present = 2
    h.undo(); // present = 1 已经不在栈（被裁剪）
    h.undo(); // no-op
    expect(h.getSnapshot()).toBe(1);
  });

  it('set 相同引用不重复入栈', () => {
    const h = new HistoryStore<number>(0, 5);
    const same = h.getSnapshot();
    h.set(same);
    expect(h.undoDepth).toBe(0);
  });

  it('replace 替换并清空历史', () => {
    const h = new HistoryStore<number>(0, 5);
    h.set(1);
    h.set(2);
    h.replace(50);
    expect(h.getSnapshot()).toBe(50);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('clearRedo 清空重做栈并保留撤销栈', () => {
    const h = new HistoryStore<number>(0, 5);
    h.set(1);
    h.set(2);
    h.undo(); // present=1, undo=1, redo=1
    expect(h.canRedo()).toBe(true);
    h.clearRedo();
    expect(h.canRedo()).toBe(false);
    expect(h.redoDepth).toBe(0);
    expect(h.canUndo()).toBe(true); // 撤销栈不受影响
    expect(h.undoDepth).toBe(1);
    h.redo(); // no-op（已清空）
    expect(h.getSnapshot()).toBe(1);
  });

  it('undo 后 set 新值清空 redo（组合行为）', () => {
    const h = new HistoryStore<number>(0, 5);
    h.set(1);
    h.set(2);
    h.undo(); // present=1, redo=[2]
    h.set(9); // 新 value-in-present 提交 → redo 清空
    expect(h.getSnapshot()).toBe(9);
    expect(h.canRedo()).toBe(false);
    expect(h.undoDepth).toBe(2); // past=[0,1]
  });

  it('empty future → redo no-op 且不改变 present', () => {
    const h = new HistoryStore<number>(5, 5);
    h.redo();
    expect(h.getSnapshot()).toBe(5);
    expect(h.canRedo()).toBe(false);
  });
});
