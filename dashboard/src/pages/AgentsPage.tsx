import { useEffect, useState } from 'react';
import { Play, MessageSquare, Activity, Cpu, Bot } from 'lucide-react';
import type { Agent, LogEntry } from '../types';
import { fetchAgents, triggerAgent, sendAgentMessage } from '../api';
import LogStream from '../components/LogStream';

interface AgentsPageProps {
  logs: LogEntry[];
  onStatusChange: (fn: (id: string, status: string) => void) => void;
}

const statusConfig = {
  idle: { label: '空闲', dot: 'status-idle', bg: 'text-text-muted' },
  running: { label: '运行中', dot: 'status-running', bg: 'text-yellow-400' },
  error: { label: '错误', dot: 'status-error', bg: 'text-red-400' },
};

const platformIcon: Record<string, string> = {
  qq: '🐧',
  wechat: '💬',
  console: '💻',
};

export default function AgentsPage({ logs, onStatusChange }: AgentsPageProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messageInput, setMessageInput] = useState<Record<string, string>>({});
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);

  const loadAgents = () => {
    fetchAgents().then(setAgents).catch(console.error);
  };

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 5000);
    onStatusChange((id, status) => {
      setAgents(prev => prev.map(a => a.id === id ? { ...a, status: status as Agent['status'] } : a));
    });
    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async (id: string) => {
    setTriggering(id);
    await triggerAgent(id);
    setTimeout(() => setTriggering(null), 1000);
  };

  const handleSendMessage = async (id: string) => {
    const msg = messageInput[id]?.trim();
    if (!msg) return;
    setSendingTo(id);
    await sendAgentMessage(id, msg);
    setMessageInput(prev => ({ ...prev, [id]: '' }));
    setSendingTo(null);
  };

  const runningCount = agents.filter(a => a.status === 'running').length;

  return (
    <div className="flex flex-col h-full gap-6 overflow-hidden">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 shrink-0">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Bot size={20} className="text-primary-light" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">{agents.length}</p>
            <p className="text-xs text-text-muted">总 Agent</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
            <Activity size={20} className="text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">{runningCount}</p>
            <p className="text-xs text-text-muted">运行中</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Cpu size={20} className="text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">{logs.length}</p>
            <p className="text-xs text-text-muted">日志条数</p>
          </div>
        </div>
      </div>

      {/* Agent cards + Logs */}
      <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
        {/* Left: Agent cards */}
        <div className="space-y-4 overflow-y-auto pr-1">
          {agents.length === 0 && (
            <div className="glass-card p-8 text-center text-text-muted">
              <Bot size={32} className="mx-auto mb-3 opacity-30" />
              <p>后端服务未连接或无 Agent</p>
            </div>
          )}
          {agents.map(agent => {
            const sc = statusConfig[agent.status] || statusConfig.idle;
            return (
              <div key={agent.id} className="glass-card p-5 animate-fade-in hover:glow-border transition-all duration-300">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-bold">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">{agent.name}</h3>
                      <p className="text-xs text-text-muted">{agent.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={sc.dot} />
                    <span className={`text-xs font-medium ${sc.bg}`}>{sc.label}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 text-xs text-text-muted">
                  <span>{platformIcon[agent.platform] || '📡'} {agent.platform}</span>
                  {agent.lastActive && (
                    <span className="ml-auto">最后活跃 {new Date(agent.lastActive).toLocaleTimeString('zh-CN')}</span>
                  )}
                </div>

                {/* Message input */}
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={messageInput[agent.id] || ''}
                    onChange={e => setMessageInput(prev => ({ ...prev, [agent.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage(agent.id)}
                    placeholder="发送消息给 Agent..."
                    className="flex-1 bg-bg-base border border-primary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                  />
                  <button
                    onClick={() => handleSendMessage(agent.id)}
                    disabled={sendingTo === agent.id}
                    className="p-1.5 bg-primary/20 hover:bg-primary/30 text-primary-light rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <MessageSquare size={16} />
                  </button>
                </div>

                <button
                  onClick={() => handleTrigger(agent.id)}
                  disabled={triggering === agent.id || agent.status === 'running'}
                  className="w-full btn-ghost text-sm flex items-center justify-center gap-2 border border-primary/20 hover:border-primary/40 disabled:opacity-50"
                >
                  <Play size={14} />
                  {triggering === agent.id ? '触发中...' : '手动触发一轮'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Right: Live logs */}
        <div className="glass-card flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/10 shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-medium text-text-secondary">实时日志流</span>
            <span className="ml-auto text-xs text-text-muted">{logs.length} 条</span>
          </div>
          <div className="flex-1 min-h-0">
            <LogStream logs={logs} />
          </div>
        </div>
      </div>
    </div>
  );
}
