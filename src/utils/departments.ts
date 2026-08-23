import { Department, Employee } from '../types';

/**
 * 纯函数：将一组员工（empIds）从各自所在部门移除，一次性加入目标部门（toDeptId）。
 * 与单员工移动口径一致：移动记录走历史（调用方负责 setDepartments）。
 *
 * 约定：
 * - 若目标部门不存在或查找失败，返回原引用（避免产生空历史/破坏树）。
 * - 递归遍历整棵树，找到所有匹配 empIds 的员工并移除；其余位置结构保持。
 */
export function moveEmployeesBetween(
  depts: Department[],
  empIds: string[],
  toDeptId: string,
): Department[] {
  const empSet = new Set(empIds);
  if (empSet.size === 0 || !toDeptId) return depts;

  const collected: Employee[] = [];
  let targetFound = false;

  /** 移除所有匹配员工（先遍历树，收集被移员工） */
  const removeFromAll = (list: Department[]): Department[] => {
    return list.map((dept) => {
      const kept: Employee[] = [];
      for (const e of dept.employees) {
        if (empSet.has(e.id)) collected.push(e);
        else kept.push(e);
      }
      const children = dept.children.length > 0 ? removeFromAll(dept.children) : dept.children;
      if (dept.id === toDeptId) targetFound = true;
      return children === dept.children && kept.length === dept.employees.length
        ? dept
        : { ...dept, employees: kept, children };
    });
  };

  let newDepts = removeFromAll(depts);
  if (collected.length === 0 || !targetFound) return depts;

  /** 一次性加入目标部门 */
  const addAll = (list: Department[]): Department[] => {
    return list.map((dept) => {
      if (dept.id === toDeptId) return { ...dept, employees: [...dept.employees, ...collected] };
      if (dept.children.length > 0) return { ...dept, children: addAll(dept.children) };
      return dept;
    });
  };
  newDepts = addAll(newDepts);

  return newDepts;
}
