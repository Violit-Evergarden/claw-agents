import { useState } from 'react';
import { Play, Pause, Trash2, Zap, ChevronDown, ChevronUp, Clock, Bot } from 'lucide-react';
import type { Task } from '../types';
import { pauseTask, resumeTask, deleteTask, triggerTask } from '../api';

interface TaskCardProps {
  task: Task;
  onRefresh: () => void;
}

const platformEmoji: Record<string, string> = {
  qq: 'QQ',
  wechat: 'WeChat',
  console: 'Console',
};

export default function TaskCard({ task, onRefresh }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePause = async () => {
    setLoading(true);
    await pauseTask(task.id);
    onRefresh();
    setLoading(false);
  };

  const handleResume = async () => {
    setLoading(true);
    await resumeTask(task.id);
    onRefresh();
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm(`确认删除任务"${task.description}"？`)) return;
    setLoading(true);
    await deleteTask(task.id);
    onRefresh();
    setLoading(false);
  };

  const handleTrigger = async () => {
    setLoading(true);
    await triggerTask(task.id);
    setLoading(false);
  };

  const isActive = task.status === 'active';

  return (
    <div className={`glass-card p-4 transition-all duration-300 ${isActive ? 'glow-border' : 'opacity-70'} animate-fade-in`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${isActive ? 'bg-green-400 animate-pulse' : 'bg-text-muted'}`} />
          <div className="min-w-0">
            <p className="text-text-primary font-medium truncate">{task.description}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-primary-light bg-primary/10 px-2 py-0.5 rounded font-mono">
                {task.cronExpr}
              </span>
              <span className="text-xs text-text-muted bg-bg-elevated px-2 py-0.5 rounded flex items-center gap-1">
                <Bot size={10} />
                {task.agentId}
              </span>
              <span className="text-xs text-text-muted bg-bg-elevated px-2 py-0.5 rounded">
                {platformEmoji[task.platform] || task.platform}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                isActive ? 'text-green-400 bg-green-400/10' : 'text-text-muted bg-text-muted/10'
              }`}>
                {isActive ? '运行中' : '已暂停'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleTrigger}
            disabled={loading}
            className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="立即触发"
          >
            <Zap size={14} />
          </button>
          {isActive ? (
            <button
              onClick={handlePause}
              disabled={loading}
              className="p-1.5 text-text-secondary hover:bg-primary/10 hover:text-primary-light rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="暂停"
            >
              <Pause size={14} />
            </button>
          ) : (
            <button
              onClick={handleResume}
              disabled={loading}
              className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="恢复"
            >
              <Play size={14} />
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={loading}
            className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-text-muted hover:text-text-secondary rounded-lg transition-colors cursor-pointer"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Last run */}
      {task.lastRun && (
        <div className="flex items-center gap-1 mt-2 text-xs text-text-muted">
          <Clock size={10} />
          <span>上次执行：{new Date(task.lastRun).toLocaleString('zh-CN')}</span>
        </div>
      )}

      {/* Expanded history */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-primary/10 animate-slide-up">
          <p className="text-xs text-text-muted mb-2 font-medium">最近执行记录</p>
          {task.history && task.history.length > 0 ? (
            <div className="space-y-1.5">
              {task.history.slice().reverse().map((h, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-text-muted shrink-0">
                    {new Date(h.timestamp).toLocaleString('zh-CN')}
                  </span>
                  <span className="text-text-secondary truncate">{h.result}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">暂无执行记录</p>
          )}
        </div>
      )}
    </div>
  );
}
