import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Copy, Trash2, Settings2, Check } from 'lucide-react';
import { Scenario } from '../types';

interface ScenarioSwitcherProps {
  scenarios: Scenario[];
  currentScenarioId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onManage: () => void;
}

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ScenarioSwitcher({
  scenarios,
  currentScenarioId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onDuplicate,
  onManage,
}: ScenarioSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'idle' | 'create' | 'rename'>('idle');
  const [inputValue, setInputValue] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAction('idle');
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const current = scenarios.find((s) => s.id === currentScenarioId) ?? scenarios[0];

  const startCreate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAction('create');
    setInputValue(`场景 ${scenarios.length + 1}`);
    setTargetId(null);
  };

  const startRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setAction('rename');
    setTargetId(id);
    setInputValue(name);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputValue.trim();
    if (!val) return;
    if (action === 'create') onCreate(val);
    else if (action === 'rename' && targetId) onRename(targetId, val);
    setAction('idle');
    setOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={ref} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        setAction('idle');
        ref.current?.querySelector('button')?.focus();
      }
    }}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          setAction('idle');
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200/60 hover:bg-white text-sm text-slate-700 transition-colors"
        title="切换场景"
        aria-expanded={open}
      >
        <span className="text-slate-400">场景:</span>
        <span className="font-semibold text-slate-800 truncate max-w-40">{current?.name ?? '—'}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-white/90 backdrop-blur-xl border border-slate-100 shadow-xl p-2 z-50 animate-fadeInUp">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400">场景</div>
          {scenarios.map((s) => (
            <div
              key={s.id}
              onClick={() => {
                if (action === 'rename' && targetId === s.id) return;
                onSwitch(s.id);
                setOpen(false);
                setAction('idle');
              }}
              className={`group flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-indigo-50 transition-colors cursor-pointer ${
                s.id === currentScenarioId ? 'bg-indigo-50/60' : ''
              }`}
            >
              {action === 'rename' && targetId === s.id ? (
                <form onSubmit={submit} className="flex-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setAction('idle');
                        setTargetId(null);
                      }
                    }}
                    className="w-full px-2 py-1 border border-indigo-300 rounded-lg text-sm focus-ring"
                  />
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm text-slate-700">{s.name}</span>
                  <span className="text-[10px] text-slate-300">{fmtTime(s.updatedAt)}</span>
                  {s.id === currentScenarioId && <Check className="w-4 h-4 text-indigo-500" />}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => startRename(e, s.id, s.name)}
                      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      title="重命名"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(s.id);
                      }}
                      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      title="复制"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(s.id);
                      }}
                      disabled={scenarios.length <= 1}
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          <div className="border-t border-slate-100 my-1.5" />
          {action === 'create' ? (
            <form onSubmit={submit} className="px-2 py-1">
              <input
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setAction('idle');
                }}
                className="w-full px-2 py-1.5 border border-indigo-300 rounded-lg text-sm focus-ring"
              />
            </form>
          ) : (
            <div className="flex gap-1 px-1">
              <button
                onClick={startCreate}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新建场景
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onManage();
                  setOpen(false);
                }}
                className="ml-auto flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                管理场景
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
