import { createContext, useContext } from 'react';

/**
 * 搜索高亮上下文（v2.0.3 P0-2）。
 * 用 Context 将「命中部门 id 集合」与「命中员工 id 集合」传给深嵌套的
 * DepartmentCard / DraggableEmployee，避免逐层 prop drilling，同时保持 React 响应式。
 */
export interface SearchHighlight {
  /** 命中的部门 id（卡片高亮环） */
  deptIds: Set<string>;
  /** 命中的员工 id（员工标签高亮环） */
  empIds: Set<string>;
}

const EMPTY: SearchHighlight = { deptIds: new Set(), empIds: new Set() };

export const SearchHighlightContext = createContext<SearchHighlight>(EMPTY);

export function useSearchHighlight(): SearchHighlight {
  return useContext(SearchHighlightContext);
}
