import { describe, it, expect } from 'vitest';
import { computeMatchStates } from './match';
import type { Employee, Position } from '../types';

function pos(id: string, headcount: number, status: Position['status'] = 'active', name = '岗位'): Position {
  return { id, departmentId: 'd1', name, headcount, status, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
}
function emp(id: string, positionId?: string, isVirtual = false): Employee {
  return { id, name: `员工${id}`, employeeId: `E${id}`, level: 'L1.1', positionId, isVirtual };
}

describe('computeMatchStates（人岗匹配状态机 v2.1.1）', () => {
  it('满编：岗位 headcount=2，2 人套岗 → 全部 placed', () => {
    const positions = [pos('p1', 2)];
    const emps = [emp('a', 'p1'), emp('b', 'p1')];
    const r = computeMatchStates(emps, positions);
    expect(r.map((x) => x.status)).toEqual(['placed', 'placed']);
    expect(r.every((x) => x.positionId === 'p1')).toBe(true);
  });

  it('超编：headcount=2，3 人 → 后进者 overstaffed', () => {
    const positions = [pos('p1', 2)];
    const emps = [emp('a', 'p1'), emp('b', 'p1'), emp('c', 'p1')];
    const r = computeMatchStates(emps, positions);
    expect(r.find((x) => x.employeeId === 'c')?.status).toBe('overstaffed');
    expect(r.find((x) => x.employeeId === 'a')?.status).toBe('placed');
  });

  it('编制 0 / 未配置：套岗仍 placed，不判超编', () => {
    const positions = [pos('p1', 0)];
    const emps = [emp('a', 'p1'), emp('b', 'p1')];
    const r = computeMatchStates(emps, positions);
    expect(r.map((x) => x.status)).toEqual(['placed', 'placed']); // headcount<=0 不判超编
  });

  it('无 positionId → unassigned(no_position)；archived 岗位 → unassigned', () => {
    const positions = [pos('p1', 2, 'archived')];
    const emps = [emp('a'), emp('b', 'p1')];
    const r = computeMatchStates(emps, positions);
    expect(r.find((x) => x.employeeId === 'a')).toMatchObject({ status: 'unassigned', reason: 'no_position' });
    expect(r.find((x) => x.employeeId === 'b')?.status).toBe('unassigned'); // archived 不计占用
  });

  it('虚拟兼岗不参与判定（跟随主岗，不单独产出）', () => {
    const positions = [pos('p1', 2)];
    const emps = [emp('a', 'p1'), emp('v', 'p1', true)];
    const r = computeMatchStates(emps, positions);
    expect(r.map((x) => x.employeeId)).toEqual(['a']); // 虚拟被跳过
  });

  it('冻结编制（frozen）→ 视为未配置，不判超编、不占缺口', () => {
    const positions = [pos('p1', 3, 'frozen')];
    const emps = [emp('a', 'p1'), emp('b', 'p1')];
    const r = computeMatchStates(emps, positions);
    expect(r.map((x) => x.status)).toEqual(['placed', 'placed']);
  });
});
