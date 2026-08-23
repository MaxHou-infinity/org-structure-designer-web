import { Upload, Download, FileSpreadsheet, Image, Plus, Minus, RefreshCw, Building2, Activity, FileJson, FileText } from 'lucide-react';
import { Department } from '../types';
import { useState } from 'react';
import { useLevelConfigs, fullCode, levelFullLabel } from '../utils/levels';

interface SidebarProps {
  onEmployeeFileUpload: (file: File) => void;
  onOrgTemplateUpload: (file: File) => void;
  onExportPng: () => void;
  onExportExcel: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onLoadTestData: () => void;
  onCreateDepartment: (name: string, level: number, parentId: string | null, leaderId?: string, leaderName?: string) => void;
  onOpenHealth: () => void;
  onOpenReport: () => void;
  onExportProject: () => void;
  departments: Department[];
  zoom: number;
  hasData: boolean;
}

export function Sidebar({
  onEmployeeFileUpload,
  onOrgTemplateUpload,
  onExportPng,
  onExportExcel,
  onZoomIn,
  onZoomOut,
  onReset,
  onLoadTestData,
  onCreateDepartment,
  onOpenHealth,
  onOpenReport,
  onExportProject,
  departments,
  zoom,
  hasData,
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
    <div className="w-80 glass border-r border-white/20 flex flex-col h-full">
      <div className="p-5 border-b border-white/30 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 text-white">
        <h1 className="text-xl font-bold tracking-tight">组织架构设计</h1>
        <p className="text-sm text-white/70 mt-1">Org Structure Designer</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 文件上传区域 */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-500" />
            文件上传
          </h2>

          <div className="space-y-2">
            <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all duration-300 hover:shadow-md group">
              <div className="text-center">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300 mb-2 group-hover:text-indigo-500 transition-colors" />
                <span className="text-sm text-slate-600 font-medium">上传员工信息</span>
                <span className="text-xs text-slate-400 block">(Excel)</span>
              </div>
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

            <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-all duration-300 hover:shadow-md group">
              <div className="text-center">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300 mb-2 group-hover:text-emerald-500 transition-colors" />
                <span className="text-sm text-slate-600 font-medium">上传组织架构</span>
                <span className="text-xs text-slate-400 block">(Excel)</span>
              </div>
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
        </div>

        {/* 操作按钮 */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-500" />
            操作
          </h2>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onZoomIn}
              disabled={zoom >= 200}
              className="flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              放大
            </button>
            <button
              onClick={onZoomOut}
              disabled={zoom <= 50}
              className="flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
            >
              <Minus className="w-4 h-4" />
              缩小
            </button>
          </div>

          <div className="text-center text-sm text-slate-500">
            缩放: <span className="font-semibold text-indigo-600">{zoom}%</span>
          </div>
        </div>

        {/* 导出功能 */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Download className="w-4 h-4 text-indigo-500" />
            导出
          </h2>

          <div className="space-y-2">
            <button
              onClick={onExportPng}
              disabled={!hasData}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Image className="w-4 h-4" />
              导出PNG
            </button>
            <button
              onClick={onExportExcel}
              disabled={!hasData}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              导出Excel
            </button>
          </div>
        </div>

        {/* 分析 & 备份 */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            分析 & 备份
          </h2>
          <div className="space-y-2">
            <button
              onClick={onOpenHealth}
              disabled={!hasData}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-purple-500 text-white rounded-xl hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Activity className="w-4 h-4" />
              组织健康度
            </button>
            <button
              onClick={onOpenReport}
              disabled={!hasData}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FileText className="w-4 h-4" />
              诊断报告
            </button>
            <button
              onClick={onExportProject}
              disabled={!hasData}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FileJson className="w-4 h-4" />
              数据备份 (.orgproj)
            </button>
          </div>
        </div>

        {/* 创建部门 */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-500" />
            创建部门
          </h2>

          {!showCreateDept ? (
            <button
              onClick={() => setShowCreateDept(true)}
              className="w-full px-4 py-2.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              新建部门
            </button>
          ) : (
            <div className="space-y-2 p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <input
                type="text"
                placeholder="部门名称"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus-ring"
              />
              <select
                value={newDeptLevel}
                onChange={(e) => setNewDeptLevel(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus-ring"
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
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus-ring"
              >
                <option value="root">无 (根级别)</option>
                {allDepts.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateDept}
                  className="flex-1 px-3 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors"
                >
                  创建
                </button>
                <button
                  onClick={() => setShowCreateDept(false)}
                  className="flex-1 px-3 py-2 bg-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-300 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 职级颜色说明 */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">职级颜色</h2>
          <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-xl bg-slate-50/80 border border-slate-100 p-3">
            {levelConfigs.map(cfg => (
              <div key={fullCode(cfg)} className="flex items-center gap-2 text-xs">
                <div
                  className="w-4 h-4 rounded-md border border-slate-300 flex-shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="text-slate-600">{levelFullLabel(cfg)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 使用说明 */}
        <div className="space-y-2 text-xs text-slate-500">
          <h3 className="font-semibold text-slate-700">使用说明</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>上传员工Excel和组织架构模板</li>
            <li>拖拽员工到不同部门</li>
            <li>双击编辑部门名称</li>
            <li>点击负责人搜索选择员工</li>
            <li>右键创建/删除虚拟员工</li>
            <li>画布区滚轮缩放 / 按住 Ctrl+滚轮缩放</li>
          </ul>
        </div>
      </div>

      {/* 测试数据按钮 */}
      <div className="p-4 border-t border-white/30 bg-slate-50/70">
        <button
          onClick={onLoadTestData}
          className="w-full px-4 py-2.5 btn-gradient text-white rounded-xl font-medium mb-2 shadow-md"
        >
          加载测试数据
        </button>
        <button
          onClick={onReset}
          className="w-full px-4 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 hover:shadow-md transition-all duration-200"
        >
          重置数据
        </button>
      </div>
    </div>
  );
}
