import { useState, useRef, useEffect } from 'react';
import { ChevronDown, FileSpreadsheet, Building2, Settings2, Minus, Plus, Undo2, Redo2, Activity, Search, LayoutTemplate } from 'lucide-react';
import { Scenario } from '../types';
import { SaveState } from '../utils/useOrgWorkspace';
import { ScenarioSwitcher } from './ScenarioSwitcher';
import { INDUSTRY_TEMPLATES } from '../utils/industryTemplates';

interface TopBarProps {
  projectName: string;
  scenarios: Scenario[];
  currentScenarioId: string;
  onSwitchScenario: (id: string) => void;
  onCreateScenario: (name: string) => void;
  onRenameScenario: (id: string, name: string) => void;
  onDeleteScenario: (id: string) => void;
  onDuplicateScenario: (id: string) => void;
  onManageScenarios: () => void;
  saveState: SaveState;
  lastSavedAt: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHealth: () => void;
  hasData: boolean;
  onDownloadEmployeeTemplate: () => void;
  onDownloadOrgTemplate: () => void;
  onManageLevels: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenSearch: () => void;
  onLoadIndustryTemplate: (id: string) => void;
}

function SaveIndicator({ saveState, lastSavedAt }: { saveState: SaveState; lastSavedAt: string | null }) {
  switch (saveState) {
    case 'unsaved':
      return <span className="inline-flex items-center gap-1 text-[10px] text-amber-600"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />未保存更改</span>;
    case 'saving':
      return <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />保存中…</span>;
    case 'failed':
      return <span className="inline-flex items-center gap-1 text-[10px] text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />保存失败</span>;
    case 'saved':
    default:
      return <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />已保存{lastSavedAt ? ` ${lastSavedAt}` : ''}</span>;
  }
}

export function TopBar({
  projectName,
  scenarios,
  currentScenarioId,
  onSwitchScenario,
  onCreateScenario,
  onRenameScenario,
  onDeleteScenario,
  onDuplicateScenario,
  onManageScenarios,
  saveState,
  lastSavedAt,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenHealth,
  hasData,
  onDownloadEmployeeTemplate,
  onDownloadOrgTemplate,
  onManageLevels,
  zoom,
  onZoomIn,
  onZoomOut,
  onOpenSearch,
  onLoadIndustryTemplate,
}: TopBarProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setTemplatesOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-white/40 bg-white/70 backdrop-blur-xl shadow-soft z-20">
      {/* 左区：品牌 + 项目名 + 场景切换 + 保存状态 */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-slate-900 tracking-tight">组织架构设计</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">v2.0.3</span>
            </div>
            <div className="text-[10px] text-slate-500 tracking-wide">Org Structure Designer</div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-slate-800 truncate max-w-[160px]" title={projectName}>
            {projectName}
          </span>
          <SaveIndicator saveState={saveState} lastSavedAt={lastSavedAt} />
        </div>

        <ScenarioSwitcher
          scenarios={scenarios}
          currentScenarioId={currentScenarioId}
          onSwitch={onSwitchScenario}
          onCreate={onCreateScenario}
          onRename={onRenameScenario}
          onDelete={onDeleteScenario}
          onDuplicate={onDuplicateScenario}
          onManage={onManageScenarios}
        />

        {/* 工具模板 子菜单 */}
        <div className="relative" ref={toolsRef}>
          <button
            onClick={() => setToolsOpen((v) => !v)}
            className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            工具模板
            <ChevronDown className={`w-4 h-4 transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
          </button>

          {toolsOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-white/90 backdrop-blur-xl border border-slate-100 shadow-xl p-2 z-50 animate-fadeInUp">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400">
                下载 Excel 模板
              </div>
              <button
                onClick={() => {
                  setToolsOpen(false);
                  onDownloadEmployeeTemplate();
                }}
                className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors text-left"
              >
                <span className="w-9 h-9 rounded-lg grid place-items-center bg-indigo-50 text-indigo-500 shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-800">员工信息模板</span>
                  <span className="block text-xs text-slate-400 mt-0.5 leading-snug">含姓名/工号/职级/一~六级部门</span>
                </span>
              </button>
              <button
                onClick={() => {
                  setToolsOpen(false);
                  onDownloadOrgTemplate();
                }}
                className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-50 transition-colors text-left"
              >
                <span className="w-9 h-9 rounded-lg grid place-items-center bg-emerald-50 text-emerald-500 shrink-0">
                  <Building2 className="w-4 h-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-800">组织架构模板</span>
                  <span className="block text-xs text-slate-400 mt-0.5 leading-snug">含部门/级别/负责人列</span>
                </span>
              </button>
            </div>
          )}
        </div>

        {/* 行业模板 下拉 */}
        <div className="relative" ref={templatesRef}>
          <button
            onClick={() => setTemplatesOpen((v) => !v)}
            className="hidden xl:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <LayoutTemplate className="w-4 h-4" />
            行业模板
            <ChevronDown className={`w-4 h-4 transition-transform ${templatesOpen ? 'rotate-180' : ''}`} />
          </button>
          {templatesOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white/90 backdrop-blur-xl border border-slate-100 shadow-xl p-2 z-50 animate-fadeInUp">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400">
                一键载入示例组织
              </div>
              {INDUSTRY_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTemplatesOpen(false);
                    onLoadIndustryTemplate(t.id);
                  }}
                  className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors text-left"
                >
                  <span
                    className="w-9 h-9 rounded-lg grid place-items-center shrink-0 text-white"
                    style={{ backgroundColor: t.accent }}
                  >
                    <LayoutTemplate className="w-4 h-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{t.name}</span>
                    <span className="block text-xs text-slate-400 mt-0.5 leading-snug">{t.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右区：缩放 + 撤销/重做 + 健康度 + 职级管理 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          title="搜索 (Ctrl+F)"
        >
          <Search className="w-4 h-4" />
          搜索
        </button>

        <button
          onClick={onOpenHealth}
          disabled={!hasData}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="组织健康度"
        >
          <Activity className="w-4 h-4" />
          健康度
        </button>

        <div className="flex items-center gap-1 px-1.5 py-1 rounded-xl bg-slate-100/80 border border-slate-200/60">
          <button
            onClick={onZoomOut}
            disabled={zoom <= 50}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="缩小"
            title="缩小"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-700 w-14 text-center tabular-nums">
            {zoom}%
          </span>
          <button
            onClick={onZoomIn}
            disabled={zoom >= 200}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="放大"
            title="放大"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="撤销"
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="重做"
          title="重做 (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onManageLevels}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          职级管理
        </button>
      </div>
    </header>
  );
}
