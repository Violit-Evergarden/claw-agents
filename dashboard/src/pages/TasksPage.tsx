import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Filter, Clock } from 'lucide-react';
import type { Task } from '../types';
import { fetchTasks, createTask } from '../api';
import TaskCard from '../components/TaskCard';

interface TasksPageProps {
  onTaskEvent: (fn: (type: string, data: unknown) => void) => void;
}

const CRON_PRESETS = [
  { label: '每天 8:00', value: '0 8 * * *' },
  { label: '每天 12:00', value: '0 12 * * *' },
  { label: '每天 22:30', value: '30 22 * * *' },
  { label: '每周一 9:00', value: '0 9 * * 1' },
  { label: '每小时', value: '0 * * * *' },
];

export default function TasksPage({ onTaskEvent }: TasksPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    cronExpr: '0 8 * * *',
    action: 'send_message',
    description: '',
    content: '',
    platform: 'console',
    agentId: 'violet',
  });

  const loadTasks = () => {
    fetchTasks().then(setTasks).catch(console.error);
  };

  useEffect(() => {
    loadTasks();
    onTaskEvent((type) => {
      if (['task:added', 'task:removed', 'task:paused', 'task:resumed', 'task:executed'].includes(type)) {
        loadTasks();
      }
    });
  }, []);

  const handleCreate = async () => {
    if (!form.description.trim() || !form.cronExpr.trim()) return;
    setCreating(true);
    await createTask(form);
    setShowCreate(false);
    setForm({ cronExpr: '0 8 * * *', action: 'send_message', description: '', content: '', platform: 'console', agentId: 'violet' });
    loadTasks();
    setCreating(false);
  };

  const agents = ['all', ...Array.from(new Set(tasks.map(t => t.agentId)))];
  const filtered = tasks.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (agentFilter !== 'all' && t.agentId !== agentFilter) return false;
    return true;
  });

  const activeCount = tasks.filter(t => t.status === 'active').length;
  const pausedCount = tasks.filter(t => t.status === 'paused').length;

  return (
    <div className="flex flex-col h-full gap-5 overflow-hidden">
      {/* Header stats */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="glass-card px-5 py-3 flex items-center gap-3">
          <Clock size={16} className="text-primary-light" />
          <span className="text-text-primary font-semibold">{tasks.length}</span>
          <span className="text-text-muted text-sm">总任务</span>
        </div>
        <div className="glass-card px-5 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-400 font-semibold">{activeCount}</span>
          <span className="text-text-muted text-sm">运行中</span>
        </div>
        <div className="glass-card px-5 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-text-muted" />
          <span className="text-text-muted font-semibold">{pausedCount}</span>
          <span className="text-text-muted text-sm">已暂停</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={loadTasks} className="btn-ghost flex items-center gap-2">
            <RefreshCw size={14} />
            刷新
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} />
            新增任务
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 shrink-0">
        <Filter size={14} className="text-text-muted" />
        <div className="flex gap-1">
          {(['all', 'active', 'paused'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors cursor-pointer ${
                filter === s ? 'bg-primary text-white' : 'text-text-muted hover:text-text-secondary hover:bg-primary/10'
              }`}
            >
              {s === 'all' ? '全部' : s === 'active' ? '运行中' : '已暂停'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-4">
          {agents.map(a => (
            <button
              key={a}
              onClick={() => setAgentFilter(a)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors cursor-pointer ${
                agentFilter === a ? 'bg-primary/40 text-primary-light' : 'text-text-muted hover:text-text-secondary hover:bg-primary/10'
              }`}
            >
              {a === 'all' ? '所有 Agent' : a}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filtered.length === 0 && (
          <div className="glass-card p-12 text-center text-text-muted">
            <Clock size={40} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium">暂无定时任务</p>
            <p className="text-sm mt-1">等待 Violet 自主添加，或手动点击"新增任务"</p>
          </div>
        )}
        {filtered.map(task => (
          <TaskCard key={task.id} task={task} onRefresh={loadTasks} />
        ))}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card-elevated p-6 w-full max-w-md animate-slide-up">
            <h3 className="text-lg font-semibold text-text-primary mb-5">新增定时任务</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">任务描述</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="如：每天早安问候"
                  className="w-full bg-bg-base border border-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Cron 表达式</label>
                <input
                  type="text"
                  value={form.cronExpr}
                  onChange={e => setForm(f => ({ ...f, cronExpr: e.target.value }))}
                  placeholder="0 8 * * *"
                  className="w-full bg-bg-base border border-primary/20 rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {CRON_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setForm(f => ({ ...f, cronExpr: p.value }))}
                      className="text-xs px-2 py-0.5 bg-primary/10 hover:bg-primary/20 text-primary-light rounded cursor-pointer transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">动作类型</label>
                  <select
                    value={form.action}
                    onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
                    className="w-full bg-bg-base border border-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 cursor-pointer"
                  >
                    <option value="send_message">发送消息</option>
                    <option value="run_loop">触发 Agent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">平台</label>
                  <select
                    value={form.platform}
                    onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                    className="w-full bg-bg-base border border-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 cursor-pointer"
                  >
                    <option value="console">Console</option>
                    <option value="qq">QQ</option>
                    <option value="wechat">微信</option>
                  </select>
                </div>
              </div>
              {form.action === 'send_message' && (
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">消息内容</label>
                  <textarea
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="消息内容（支持 {time} {date} 变量）"
                    rows={3}
                    className="w-full bg-bg-base border border-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 resize-none transition-colors"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">所属 Agent</label>
                <select
                  value={form.agentId}
                  onChange={e => setForm(f => ({ ...f, agentId: e.target.value }))}
                  className="w-full bg-bg-base border border-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 cursor-pointer"
                >
                  <option value="violet">violet</option>
                  <option value="assistant">assistant</option>
                  <option value="manual">manual</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost border border-primary/20">取消</button>
              <button onClick={handleCreate} disabled={creating} className="flex-1 btn-primary disabled:opacity-50">
                {creating ? '创建中...' : '创建任务'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
