import { useState, useEffect, useCallback } from 'react';
import { Check, Key, RefreshCw, ChevronDown, AlertCircle, Zap } from 'lucide-react';
import { fetchLLMSettings, switchLLMProvider, updateProviderApiKey } from '../api';
import type { LLMSettings, LLMProvider } from '../types';

// Provider 图标/颜色映射
const PROVIDER_STYLES: Record<string, { color: string; bg: string; dot: string }> = {
  deepseek: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400' },
  grok:     { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  openai:   { color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-400' },
  custom:   { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400' },
};

function getStyle(id: string) {
  return PROVIDER_STYLES[id] ?? PROVIDER_STYLES.custom;
}

export default function ModelSettingsPage() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 每个 provider 的 API Key 编辑状态
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // 模型选择下拉
  const [modelSelects, setModelSelects] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchLLMSettings();
      if (res.success) {
        setSettings(res.data);
        // 初始化每个 provider 当前选择的模型
        const selects: Record<string, string> = {};
        res.data.providers.forEach(p => {
          selects[p.id] = p.defaultModel;
        });
        setModelSelects(selects);
      }
    } catch {
      setError('加载模型配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleSwitch = async (provider: LLMProvider) => {
    if (settings?.activeProvider === provider.id) return;
    setSaving(true);
    setError('');
    try {
      const res = await switchLLMProvider(provider.id, {
        model: modelSelects[provider.id] || provider.defaultModel,
        memoryModel: provider.memoryModel,
      });
      if (res.success && res.data) {
        setSettings(prev => prev ? { ...prev, ...res.data } : res.data!);
        showSuccess(`已切换到 ${provider.name}`);
      } else {
        setError(res.error || '切换失败');
      }
    } catch {
      setError('切换模型时发生错误');
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (providerId: string, model: string) => {
    setModelSelects(prev => ({ ...prev, [providerId]: model }));
    // 如果修改的是当前激活的 provider，立即应用
    if (settings?.activeProvider === providerId) {
      setSaving(true);
      try {
        const res = await switchLLMProvider(providerId, { model });
        if (res.success && res.data) {
          setSettings(prev => prev ? { ...prev, ...res.data } : res.data!);
          showSuccess(`模型已更新为 ${model}`);
        }
      } catch {
        setError('更新模型失败');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSaveApiKey = async (providerId: string) => {
    const key = apiKeys[providerId];
    if (!key?.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await updateProviderApiKey(providerId, key.trim());
      if (res.success) {
        showSuccess('API Key 已保存');
        setEditingKey(null);
        await load(); // 刷新状态
      } else {
        setError(res.error || '保存失败');
      }
    } catch {
      setError('保存 API Key 时发生错误');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center gap-2 text-red-400 p-4">
        <AlertCircle size={18} />
        <span>{error || '无法加载配置'}</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Zap size={22} className="text-primary" />
          模型设置
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          切换 AI 模型 Provider，配置 API Key 和默认模型。
        </p>
      </div>

      {/* 状态提示 */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 text-sm">
          <Check size={16} />
          {successMsg}
        </div>
      )}

      {/* 当前状态卡片 */}
      <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 flex items-center gap-4">
        <div className={`w-2.5 h-2.5 rounded-full ${getStyle(settings.activeProvider).dot} shadow-lg`} />
        <div>
          <div className="text-text-primary font-medium text-sm">
            当前使用：
            <span className={`font-bold ml-1 ${getStyle(settings.activeProvider).color}`}>
              {settings.providers.find(p => p.id === settings.activeProvider)?.name ?? settings.activeProvider}
            </span>
          </div>
          <div className="text-text-muted text-xs mt-0.5">
            对话模型：<code className="text-text-secondary">{settings.activeModel}</code>
            <span className="mx-2 opacity-40">·</span>
            记忆模型：<code className="text-text-secondary">{settings.activeMemoryModel}</code>
          </div>
        </div>
        <button
          onClick={load}
          className="ml-auto text-text-muted hover:text-primary transition-colors cursor-pointer"
          title="刷新"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Provider 列表 */}
      <div className="space-y-3">
        {settings.providers.map(provider => {
          const isActive = settings.activeProvider === provider.id;
          const style = getStyle(provider.id);
          const isEditingThisKey = editingKey === provider.id;

          return (
            <div
              key={provider.id}
              className={`rounded-xl border p-4 transition-all duration-200 ${
                isActive
                  ? `${style.bg} shadow-md`
                  : 'bg-bg-surface border-border-subtle hover:border-primary/20'
              }`}
            >
              {/* Provider 头部 */}
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${style.dot} ${isActive ? 'shadow-md' : 'opacity-40'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${isActive ? style.color : 'text-text-primary'}`}>
                      {provider.name}
                    </span>
                    {isActive && (
                      <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
                        当前使用
                      </span>
                    )}
                    {!provider.hasApiKey && (
                      <span className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Key size={10} />
                        未配置 Key
                      </span>
                    )}
                  </div>
                  <div className="text-text-muted text-xs mt-0.5">{provider.baseURL}</div>
                </div>

                {/* 切换按钮 */}
                {!isActive && (
                  <button
                    onClick={() => handleSwitch(provider)}
                    disabled={saving || !provider.hasApiKey}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                      ${provider.hasApiKey
                        ? 'bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50'
                        : 'bg-bg-subtle text-text-muted cursor-not-allowed opacity-50'
                      }`}
                    title={!provider.hasApiKey ? '请先配置 API Key' : ''}
                  >
                    {saving ? '切换中…' : '切换'}
                  </button>
                )}
                {isActive && (
                  <div className="flex items-center gap-1 text-xs text-primary">
                    <Check size={14} />
                    <span>使用中</span>
                  </div>
                )}
              </div>

              {/* 模型选择 */}
              {provider.models.length > 0 && (
                <div className="mt-3 flex items-center gap-3 pl-5">
                  <label className="text-text-muted text-xs w-16 shrink-0">对话模型</label>
                  <div className="relative">
                    <select
                      value={modelSelects[provider.id] || provider.defaultModel}
                      onChange={e => handleModelChange(provider.id, e.target.value)}
                      className="appearance-none bg-bg-surface border border-border-subtle text-text-primary text-xs rounded-lg px-3 py-1.5 pr-7 cursor-pointer focus:outline-none focus:border-primary/40 hover:border-primary/30 transition-colors"
                    >
                      {provider.models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  </div>
                </div>
              )}

              {/* API Key 配置 */}
              <div className="mt-2 pl-5">
                {isEditingThisKey ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder={`输入 ${provider.name} API Key`}
                      value={apiKeys[provider.id] || ''}
                      onChange={e => setApiKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveApiKey(provider.id)}
                      className="flex-1 bg-bg-surface border border-border-subtle text-text-primary text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/40 placeholder:text-text-muted"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveApiKey(provider.id)}
                      disabled={saving || !apiKeys[provider.id]?.trim()}
                      className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg disabled:opacity-50 hover:bg-primary-dark transition-colors cursor-pointer"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => { setEditingKey(null); setApiKeys(prev => ({ ...prev, [provider.id]: '' })); }}
                      className="text-text-muted hover:text-text-secondary text-xs px-2 py-1.5 cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingKey(provider.id)}
                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors cursor-pointer"
                  >
                    <Key size={12} />
                    {provider.hasApiKey ? '更新 API Key' : '配置 API Key'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 提示信息 */}
      <div className="text-text-muted text-xs bg-bg-subtle rounded-lg p-3 border border-border-subtle">
        <div className="font-medium text-text-secondary mb-1">使用说明</div>
        <ul className="space-y-1 list-disc list-inside">
          <li>切换 Provider 后立即生效，无需重启服务</li>
          <li>Grok API Key 可在 <a href="https://console.x.ai" target="_blank" rel="noreferrer" className="text-primary hover:underline">console.x.ai</a> 申请</li>
          <li>生产环境请通过环境变量配置密钥（见项目根目录 <code className="text-text-secondary">.env.example</code>）</li>
          <li>面板保存的 Key 仅当前进程有效，重启后需配置 <code className="text-text-secondary">LLM_API_KEY_*</code></li>
          <li>记忆提炼模型建议选择轻量版（节省 token）</li>
        </ul>
      </div>
    </div>
  );
}
