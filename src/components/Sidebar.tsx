import { Upload, Download, FileSpreadsheet, Image, Plus, Building2, Activity, FileJson, FileText, RefreshCw } from 'lucide-react';
import { Department } from '../types';
import { useState } from 'react';
import { useLevelConfigs, fullCode, levelFullLabel } from '../utils/levels';

interface SidebarProps {
  onEmployeeFileUpload: (file: File) => void;
  onOrgTemplateUpload: (file: File) => void;
  onExportPng: () => void;
  onExportExcel: () => void;
  onReset: () => void;
  onLoadTestData: () => void;
  onCreateDepartment: (name: string, level: number, parentId: string | null, leaderId?: string, leaderName?: string) => void;
  onOpenHealth: () => void;
  onOpenReport: () => void;
  onExportProject: () => void;
  onRefreshCanvas: () => void;
  departments: Department[];
  hasData: boolean;
  /** 是否已成功上传员工信息 / 组织架构（用于显示 已上传/未上传 状态条） */
  hasEmployees: boolean;
  hasOrgTemplate: boolean;
}

export function Sidebar({
  onEmployeeFileUpload,
  onOrgTemplateUpload,
  onExportPng,
  onExportExcel,
  onReset,
  onLoadTestData,
  onCreateDepartment,
  onOpenHealth,
  onOpenReport,
  onExportProject,
  onRefreshCanvas,
  departments,
  hasData,
  hasEmployees,
  hasOrgTemplate,
}: SidebarProps) {
  const [showCreateDept, setShowCreateDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptLevel, setNewDeptLevel] = useState(1);
  const [newDeptParent, setNewDeptParent] = useState<string | null>('root');
  const levelConfigs = useLevelConfigs();

  const handleCreateDept = () => {
    if (!newDeptName.trim()) return;
    onCreateDepartment(newDeptName, newDeptLevel, newDeptParent);
    setNewDeptName('');
    setNewDeptLevel(1);
    setNewDeptParent('root');
    setShowCreateDept(false);
  };

  // 收集所有部门用于选择父部门
  const flattenDepts = (depts: Department[], prefix = ''): { id: string; name: string }[] => {
    let result: { id: string; name: string }[] = [];
    depts.forEach(dept => {
      result.push({ id: dept.id, name: prefix + dept.name });
      if (dept.children.length > 0) {
        result = result.concat(flattenDepts(dept.children, prefix + '  '));
      }
    });
    return result;
  };
  const allDepts = flattenDepts(departments);
  return (
    <div className="w-64 glass border-r border-white/20 flex flex-col h-full">
      <div className="p-4 border-b border-white/30 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 text-white">
        <h1 className="text-base font-bold tracking-tight">组织罗盘</h1>
        <p className="text-xs text-white/70 mt-0.5">OrgCompass</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* 文件上传：两行状态条（已上传 / 未上传），点击即触发上传 */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-indigo-500" />
            文件上传
          </h2>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 px-2.5 py-1.5 bg-white/70 border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group">
              <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${hasEmployees ? 'text-emerald-500' : 'text-slate-300 group-hover:text-indigo-500'}`} />
              <span className="flex-1 min-w-0 text-xs text-slate-600">员工信息</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${hasEmployees ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {hasEmployees ? '已上传' : '未上传'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onEmployeeFileUpload(file);
                }}
              />
            </label>

            <label className="flex items-center gap-2 px-2.5 py-1.5 bg-white/70 border border-slate-200 rounded-lg cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50 transition-all group">
              <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${hasOrgTemplate ? 'text-emerald-500' : 'text-slate-300 group-hover:text-emerald-500'}`} />
              <span className="flex-1 min-w-0 text-xs text-slate-600">组织架构</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${hasOrgTemplate ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {hasOrgTemplate ? '已上传' : '未上传'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onOrgTemplateUpload(file);
                }}
              />
            </label>
          </div>

          <button
            onClick={onRefreshCanvas}
            disabled={!hasData}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新画布（重新生成）
          </button>
        </div>

        {/* 导出功能 */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-indigo-500" />
            导出
          </h2>

          <div className="space-y-1.5">
            <button
              onClick={onExportPng}
              disabled={!hasData}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Image className="w-3.5 h-3.5" />
              导出PNG
            </button>
            <button
              onClick={onExportExcel}
              disabled={!hasData}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              导出Excel
            </button>
          </div>
        </div>

        {/* 分析 & 备份 */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-500" />
            分析 & 备份
          </h2>
          <div className="space-y-1.5">
            <button
              onClick={onOpenHealth}
              disabled={!hasData}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Activity className="w-3.5 h-3.5" />
              组织健康度
            </button>
            <button
              onClick={onOpenReport}
              disabled={!hasData}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              诊断报告
            </button>
            <button
              onClick={onExportProject}
              disabled={!hasData}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FileJson className="w-3.5 h-3.5" />
              数据备份 (.orgproj)
            </button>
          </div>
        </div>

        {/* 创建部门 */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-500" />
            创建部门
          </h2>

          {!showCreateDept ? (
            <button
              onClick={() => setShowCreateDept(true)}
              className="w-full px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              新建部门
            </button>
          ) : (
            <div className="space-y-1.5 p-2 bg-slate-50 rounded-lg border border-slate-100">
              <input
                type="text"
                placeholder="部门名称"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus-ring"
              />
              <select
                value={newDeptLevel}
                onChange={(e) => setNewDeptLevel(Number(e.target.value))}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus-ring"
              >
                <option value={1}>L1 (一级部门)</option>
                <option value={2}>L2 (二级部门)</option>
                <option value={3}>L3 (三级部门)</option>
                <option value={4}>L4 (四级部门)</option>
                <option value={5}>L5 (五级部门)</option>
                <option value={6}>L6 (六级部门)</option>
              </select>
              <select
                value={newDeptParent || 'root'}
                onChange={(e) => setNewDeptParent(e.target.value === 'root' ? null : e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus-ring"
              >
                <option value="root">无 (根级别)</option>
                {allDepts.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <button
                  onClick={handleCreateDept}
                  className="flex-1 px-2 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-medium hover:bg-indigo-600 transition-colors"
                >
                  创建
                </button>
                <button
                  onClick={() => setShowCreateDept(false)}
                  className="flex-1 px-2 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-300 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 职级颜色说明 */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-slate-700">职级颜色</h2>
          <div className="space-y-1 max-h-56 overflow-y-auto rounded-lg bg-slate-50/80 border border-slate-100 p-2">
            {levelConfigs.map(cfg => (
              <div key={fullCode(cfg)} className="flex items-center gap-1.5 text-[11px]">
                <div
                  className="w-3 h-3 rounded-md border border-slate-300 flex-shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="text-slate-600">{levelFullLabel(cfg)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 使用说明 */}
        <div className="space-y-1.5 text-[11px] text-slate-500">
          <h3 className="font-semibold text-slate-700">使用说明</h3>
          <ul className="list-disc list-inside space-y-0.5">
            <li>上传员工Excel和组织架构模板</li>
            <li>拖拽员工到不同部门</li>
            <li>双击编辑部门名称</li>
            <li>点击负责人搜索选择员工</li>
            <li>右键创建/删除虚拟员工</li>
            <li>捏合 / Ctrl+滚轮缩放 · 双指滑动或拖拽空白区平移</li>
          </ul>
        </div>
      </div>

      {/* 测试数据按钮 */}
      <div className="p-3 border-t border-white/30 bg-slate-50/70">
        <button
          onClick={onLoadTestData}
          className="w-full px-3 py-1.5 btn-gradient text-white rounded-lg text-xs font-medium mb-1.5 shadow-md"
        >
          加载测试数据
        </button>
        <button
          onClick={onReset}
          className="w-full px-3 py-1.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 hover:shadow-md transition-all duration-200"
        >
          重置数据
        </button>
      </div>
    </div>
  );
}
