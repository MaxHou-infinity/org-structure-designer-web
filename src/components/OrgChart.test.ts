import { describe, it, expect } from 'vitest';
import { calculateTreeLayout, countLeaves } from './OrgChart';
import { buildDepartmentTree } from '../utils/excel';
import type { Department, Employee } from '../types';

function treeOf(): Department[] {
  const E: Employee[] = [
    { id: '1', name: '张三', employeeId: 'E001', level: 'L1.1', dept1: '技术部', dept2: '研发组', dept3: '后端' },
    { id: '2', name: '李四', employeeId: 'E002', level: 'L2.1', dept1: '技术部', dept2: '研发组', dept3: '后端' },
    { id: '3', name: '王五', employeeId: 'E003', level: 'L3.1', dept1: '技术部', dept2: '研发组', dept3: '前端' },
    { id: '4', name: '赵六', employeeId: 'E004', level: 'L1.2', dept1: '技术部', dept2: '测试组', dept3: '功能测试' },
    { id: '5', name: '钱七', employeeId: 'E005', level: 'L2.2', dept1: '技术部', dept2: '测试组', dept3: '自动化测试' },
    { id: '6', name: '孙八', employeeId: 'E006', level: 'L3.2', dept1: '技术部', dept2: '运维组', dept3: '运维' },
    { id: '7', name: '周九', employeeId: 'E007', level: 'E3.1', dept1: '销售部', dept2: '华东区' },
    { id: '8', name: '吴十', employeeId: 'E008', level: 'E3.2', dept1: '销售部', dept2: '华北区' },
    { id: '9', name: '郑十一', employeeId: 'E009', level: 'L4.1', dept1: '销售部', dept2: '华南区' },
    { id: '10', name: '陈十二', employeeId: 'E010', level: 'L5', dept1: '人力资源部', dept2: '招聘组' },
  ];
  return buildDepartmentTree(E, []);
}

const CARD_WIDTH = 220;

function walk(nodes: ReturnType<typeof calculateTreeLayout>, cb: (n: ReturnType<typeof calculateTreeLayout>[number]) => void) {
  for (const n of nodes) { cb(n); walk(n.children, cb); }
}

/** 父卡片中心（其子树带中点） */
function parentCenter(n: ReturnType<typeof calculateTreeLayout>[number]): number {
  return n.x + CARD_WIDTH / 2;
}

describe('calculateTreeLayout（方案A 绝对定位布局）', () => {
  it('坐标合理：不爆炸（回归 v2.0.3 宽度算法 bug）', () => {
    const nodes = calculateTreeLayout(treeOf(), 0, 0, 100);
    let maxRight = 0;
    walk(nodes, (n) => { maxRight = Math.max(maxRight, n.x + n.width); });
    expect(maxRight).toBeGreaterThan(0);
    expect(maxRight).toBeLessThan(5000);
  });

  it('根部门 y=0，子部门 y=240（层级步进正确）', () => {
    const nodes = calculateTreeLayout(treeOf(), 0, 0, 100);
    for (const n of nodes) {
      expect(n.y).toBe(0);
      for (const c of n.children) expect(c.y).toBe(240);
    }
  });

  it('叶子数正确（countLeaves），折叠子部门计为 1', () => {
    const tree = treeOf();
    const tech = tree.find((r) => r.name === '技术部')!;
    expect(countLeaves(tech)).toBe(5);
    const leaf = tech.children[0].children[0]; // 功能测试
    expect(countLeaves(leaf)).toBe(1);
  });

  it('多个根部门水平排列且不重叠', () => {
    const nodes = calculateTreeLayout(treeOf(), 0, 0, 100);
    expect(nodes.length).toBeGreaterThan(1);
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i].x).toBeGreaterThan(nodes[i - 1].x);
    }
  });

  it('父卡片水平居中于其子部门块中点（引导线对齐，视觉层级清晰）', () => {
    const nodes = calculateTreeLayout(treeOf(), 0, 0, 100);
    const check = (list: ReturnType<typeof calculateTreeLayout>) => {
      for (const n of list) {
        if (n.children.length > 0) {
          const pc = parentCenter(n); // 父卡中心 = 子树带左缘 + 带宽/2
          const bandLeft = n.x + CARD_WIDTH / 2 - n.width / 2; // 子树带左缘
          const blockCenter = bandLeft + n.width / 2; // 子部门块（占据整个带）中点 = 子树带中点
          expect(Math.abs(pc - blockCenter)).toBeLessThan(1);
        }
        check(n.children);
      }
    };
    check(nodes);
  });

  it('子部门块恰好填满父的子树带宽，且兄弟间水平间距一致', () => {
    const nodes = calculateTreeLayout(treeOf(), 0, 0, 100);
    const check = (list: ReturnType<typeof calculateTreeLayout>) => {
      for (const n of list) {
        if (n.children.length > 0) {
          // 父的子树带左缘
          const bandLeft = n.x + CARD_WIDTH / 2 - n.width / 2;
          // 子部门块：首个子的带左缘 到 末个子的带右缘
          const firstLeft = n.children[0].x + CARD_WIDTH / 2 - n.children[0].width / 2;
          const lastRight = n.children[n.children.length - 1].x + CARD_WIDTH / 2 + n.children[n.children.length - 1].width / 2;
          const blockWidth = lastRight - firstLeft;
          expect(Math.abs(blockWidth - n.width)).toBeLessThan(1);
          expect(Math.abs(firstLeft - bandLeft)).toBeLessThan(1);
          // 兄弟间水平间距一致（= 80，全局统一）
          for (let i = 1; i < n.children.length; i++) {
            const prevRight = n.children[i - 1].x + CARD_WIDTH / 2 + n.children[i - 1].width / 2;
            const curLeft = n.children[i].x + CARD_WIDTH / 2 - n.children[i].width / 2;
            expect(Math.abs(curLeft - prevRight - 80)).toBeLessThan(1);
          }
        }
        check(n.children);
      }
    };
    check(nodes);
  });
});
