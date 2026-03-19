import { useState } from 'react';
import { Bot, Clock, Wifi, WifiOff, Sparkles, Star, Feather, Users, Zap } from 'lucide-react';
import AgentsPage from './pages/AgentsPage';
import TasksPage from './pages/TasksPage';
import MemoriesPage from './pages/MemoriesPage';
import PersonaPage from './pages/PersonaPage';
import CharactersPage from './pages/CharactersPage';
import ModelSettingsPage from './pages/ModelSettingsPage';
import { useSSE } from './hooks/useSSE';
import './index.css';

type Tab = 'agents' | 'tasks' | 'memories' | 'persona' | 'characters' | 'models';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('agents');
  const { logs, connected, onStatusChange, onTaskEvent, clearLogs } = useSSE();

  const tabs = [
    { id: 'agents' as Tab,     label: 'Agent 总览', icon: Bot },
    { id: 'tasks' as Tab,      label: '定时任务',   icon: Clock },
    { id: 'characters' as Tab, label: '角色切换',   icon: Users },
    { id: 'memories' as Tab,   label: '角色回忆',   icon: Star },
    { id: 'persona' as Tab,    label: '人设编辑',   icon: Feather },
    { id: 'models' as Tab,     label: '模型设置',   icon: Zap },
  ];

  return (
    <div className="flex flex-col h-screen bg-bg-base overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-primary-dark/10 rounded-full blur-3xl translate-y-1/2" />
        {activeTab === 'memories' && (
          <div className="absolute top-1/3 right-10 w-80 h-80 bg-pink-500/5 rounded-full blur-3xl" />
        )}
        {(activeTab === 'persona' || activeTab === 'characters') && (
          <div className="absolute top-1/4 left-10 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
        )}
        {activeTab === 'models' && (
          <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />
        )}
      </div>

      {/* Top navigation */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 flex items-center px-6 border-b border-primary/10 bg-bg-base/80 backdrop-blur-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mr-8">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="font-bold text-lg gradient-text">Claw Agents</span>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                activeTab === id
                  ? id === 'memories'
                    ? 'bg-gradient-to-r from-pink-500/80 to-primary text-white shadow-md shadow-pink-500/20'
                    : id === 'persona' || id === 'characters'
                    ? 'bg-gradient-to-r from-violet-500/80 to-primary text-white shadow-md shadow-violet-500/20'
                    : id === 'models'
                    ? 'bg-gradient-to-r from-emerald-500/80 to-primary text-white shadow-md shadow-emerald-500/20'
                    : 'bg-primary text-white shadow-md shadow-primary/30'
                  : 'text-text-secondary hover:text-text-primary hover:bg-primary/10'
              }`}
            >
              <Icon size={15} className={activeTab === id && (id === 'memories' || id === 'persona' || id === 'characters') ? 'fill-white' : ''} />
              {label}
            </button>
          ))}
        </nav>

        {/* Connection status */}
        <div className="ml-auto flex items-center gap-2">
          {connected ? (
            <div className="flex items-center gap-1.5 text-green-400 text-xs">
              <Wifi size={14} />
              <span>实时连接</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-red-400 text-xs">
              <WifiOff size={14} />
              <span>未连接</span>
            </div>
          )}
          {activeTab === 'agents' && logs.length > 0 && (
            <button
              onClick={clearLogs}
              className="text-xs text-text-muted hover:text-text-secondary px-2 py-1 rounded hover:bg-primary/10 transition-colors cursor-pointer ml-2"
            >
              清空日志
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pt-16 overflow-hidden">
        <div className="h-full p-6 overflow-y-auto">
          {activeTab === 'agents' && (
            <AgentsPage logs={logs} onStatusChange={onStatusChange} />
          )}
          {activeTab === 'tasks' && (
            <TasksPage onTaskEvent={onTaskEvent} />
          )}
          {activeTab === 'characters' && (
            <CharactersPage />
          )}
          {activeTab === 'memories' && (
            <MemoriesPage />
          )}
          {activeTab === 'persona' && (
            <PersonaPage />
          )}
          {activeTab === 'models' && (
            <ModelSettingsPage />
          )}
        </div>
      </main>
    </div>
  );
}
