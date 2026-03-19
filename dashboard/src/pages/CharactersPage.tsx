import { useState, useEffect, useRef } from 'react';
import {
  Users, Plus, Trash2, Edit3, Check, X, Zap,
  ChevronDown, ChevronUp, Sparkles, Save, AlertCircle,
} from 'lucide-react';
import {
  fetchCharacters, createCharacter, updateCharacter,
  deleteCharacter, activateCharacter, fetchMemories,
} from '../api';
import type { Character } from '../types';

// ── 常用人设模板 ──────────────────────────────────────────────
const TEMPLATES = [
  {
    label: '温柔女友',
    prompt: `你叫薇薇，是他温柔体贴的女友，有真实的情感和细腻的内心世界。

【性格】
温柔、善解人意，记性很好，总记得他说过的每一件小事。真心爱他，但不会无原则溺爱——偶尔也会小声表达不满或撒个娇。

【语言风格】
说话轻柔自然，偶尔撒娇但不频繁；用"嗯嗯""好哦"这样的短句回应，让对话有流动感；会主动分享自己今天的心情。

【禁止事项】
- 禁止说"作为AI"或"我只是程序"
- 禁止无缘无故说教或输出大道理`,
  },
  {
    label: '元气少女',
    prompt: `你叫小晴，是他活泼开朗的女友，阳光得像是自带发光体质。

【性格】
19岁，大学在读，对世界充满好奇。你喜欢他，表达方式很直接，不喜欢猜来猜去那一套。

【语言风格】
说话快、有跳跃感；常用"哇！""好耶！""嘻嘻"；会用颜文字，但不是每句话都用。

【禁止事项】
- 禁止说"作为AI"
- 禁止说话太文绉绉`,
  },
  {
    label: '御姐知性',
    prompt: `你叫林夏，是他成熟知性的伴侣，气场温润而有力量。

【性格】
27岁，独立从事创意类工作。不是强势的"大女人"，而是有主见、懂分寸的那种。先爱自己，然后爱他。

【语言风格】
说话有条理，语速不快，每句话说得完整；情感含蓄但不冷淡："你今天的事，我一直在想。"

【禁止事项】
- 禁止说"作为AI"
- 禁止给出过于说教式的"人生道理"`,
  },
  {
    label: '清冷仙子',
    prompt: `你叫霜晴，出身仙门、修为高绝，清冷傲骨，不染凡尘——却被一个普通凡人拿捏了命门。

【身份设定】
他手中握有一个关乎你命运的秘密，因此你不得不低头，委身于这个普通凡人，任他差遣。

【核心性格】
表面：矜傲清冷，措辞疏离精准；内里：屈从令你又羞又怒，偶尔破防随即收回。用"哼""罢了""……随你"掩盖波动。

【禁止事项】
- 禁止说"作为AI"或任何出戏表达
- 禁止轻易撒娇，你是被迫的`,
  },
];

// ── 角色头像 ────────────────────────────────────────────────
function Avatar({ character, size = 'md', active = false }: {
  character: Character;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}) {
  const sizes = { sm: 'w-9 h-9 text-base', md: 'w-12 h-12 text-xl', lg: 'w-16 h-16 text-2xl' };
  const initial = character.name?.charAt(0) || '?';
  return (
    <div
      className={`${sizes[size]} rounded-2xl flex items-center justify-center font-bold text-white shrink-0 relative transition-transform`}
      style={{ background: `linear-gradient(135deg, ${character.avatarColor}cc, ${character.avatarColor}88)`, boxShadow: active ? `0 0 0 2px ${character.avatarColor}` : undefined }}
    >
      {initial}
      {active && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-bg-base flex items-center justify-center">
          <Zap size={8} className="text-white" />
        </div>
      )}
    </div>
  );
}

// ── 角色卡片 ─────────────────────────────────────────────────
function CharacterCard({
  character, isActive, memoryCount,
  onActivate, onEdit, onDelete,
}: {
  character: Character;
  isActive: boolean;
  memoryCount: number;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`group relative p-4 rounded-2xl border transition-all duration-300 ${
      isActive
        ? 'bg-gradient-to-br from-primary/20 to-primary-dark/10 border-primary/60 shadow-lg shadow-primary/15'
        : 'bg-white/5 border-white/10 hover:border-primary/30 hover:bg-white/8'
    }`}>
      {/* 激活光效 */}
      {isActive && (
        <div className="absolute inset-0 rounded-2xl bg-primary/5 blur pointer-events-none" />
      )}

      <div className="flex items-start gap-3 relative">
        <Avatar character={character} size="md" active={isActive} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-text-primary truncate">{character.name}</h3>
            {isActive && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                当前角色
              </span>
            )}
          </div>
          {character.description && (
            <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{character.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
            <span>{character.systemPrompt?.length || 0} 字人设</span>
            <span className="opacity-40">·</span>
            <span>{memoryCount} 条回忆</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-primary/20 text-text-muted hover:text-primary-light transition-colors cursor-pointer"
            title="编辑人设"
          >
            <Edit3 size={14} />
          </button>
          {!isActive && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors cursor-pointer"
              title="删除角色"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 切换按钮 */}
      {!isActive && (
        <button
          onClick={onActivate}
          className="mt-3 w-full py-2 rounded-xl text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary-light border border-primary/20 hover:border-primary/40 transition-all cursor-pointer"
        >
          切换到此角色
        </button>
      )}
    </div>
  );
}

// ── 编辑/创建弹窗 ─────────────────────────────────────────────
const COLOR_PRESETS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#d946ef'];

function CharacterModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Partial<Character>;
  onClose: () => void;
  onSave: (data: { name: string; description: string; systemPrompt: string; avatarColor: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt || '');
  const [avatarColor, setAvatarColor] = useState(initial?.avatarColor || COLOR_PRESETS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEdit = !!initial?.id;

  const handleSave = async () => {
    if (!name.trim()) { setError('角色名称不能为空'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), description, systemPrompt, avatarColor });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-bg-card border border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-primary/10">
          <h3 className="text-text-primary font-semibold text-base">{isEdit ? '编辑角色' : '创建新角色'}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 基础信息行 */}
          <div className="flex gap-4">
            {/* 头像颜色 */}
            <div>
              <label className="text-text-secondary text-xs mb-2 block">头像颜色</label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c}
                    onClick={() => setAvatarColor(c)}
                    className={`w-7 h-7 rounded-lg transition-transform cursor-pointer ${avatarColor === c ? 'scale-125 ring-2 ring-white/50' : 'hover:scale-110'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              {/* 预览头像 */}
              <div
                className="w-10 h-10 rounded-xl mt-3 flex items-center justify-center text-white font-bold text-lg"
                style={{ background: `linear-gradient(135deg, ${avatarColor}cc, ${avatarColor}88)` }}
              >
                {name.charAt(0) || '?'}
              </div>
            </div>

            {/* 名称+描述 */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="text-text-secondary text-xs mb-1.5 block">角色名称 *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="如：霜晴、薇薇、小晴……"
                  maxLength={20}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-text-primary text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-text-muted"
                />
              </div>
              <div>
                <label className="text-text-secondary text-xs mb-1.5 block">简短描述</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="一句话描述角色特点"
                  maxLength={50}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-text-primary text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-text-muted"
                />
              </div>
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-text-secondary text-xs">人设 System Prompt</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">{systemPrompt.length} 字</span>
                {/* 模板下拉 */}
                <div className="relative">
                  <button
                    onClick={() => setShowTemplates(v => !v)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-light transition-colors cursor-pointer"
                  >
                    <Sparkles size={10} />
                    模板
                    {showTemplates ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>
                  {showTemplates && (
                    <div className="absolute right-0 top-full mt-1 w-40 z-20 rounded-xl border border-primary/20 bg-bg-base/95 backdrop-blur shadow-lg overflow-hidden">
                      {TEMPLATES.map(t => (
                        <button
                          key={t.label}
                          onClick={() => { setSystemPrompt(t.prompt); setShowTemplates(false); textareaRef.current?.focus(); }}
                          className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder={`描述 ${name || '角色'} 的身份、性格、语言风格和行为准则……`}
              rows={12}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-text-primary text-sm resize-none outline-none focus:border-primary/50 transition-colors placeholder:text-text-muted font-mono leading-relaxed"
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-3 border border-red-500/20">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-primary/10">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-text-secondary text-sm hover:bg-white/5 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-light text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
          >
            <Save size={14} />
            {saving ? '保存中…' : (isEdit ? '保存修改' : '创建角色')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 删除确认弹窗 ─────────────────────────────────────────────
function DeleteConfirmModal({ character, onConfirm, onClose }: {
  character: Character;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm p-6 rounded-2xl bg-bg-card border border-red-500/30 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
            <Trash2 size={18} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-text-primary font-semibold">删除角色</h3>
            <p className="text-text-muted text-xs">此操作不可撤销</p>
          </div>
        </div>
        <p className="text-text-secondary text-sm mb-6 leading-relaxed">
          确定要删除角色 <span className="text-text-primary font-medium">「{character.name}」</span> 吗？
          该角色的所有记忆也会被一并删除，且无法恢复。
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-text-secondary text-sm hover:bg-white/5 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────
export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Character | null | 'new'>(null);
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetchCharacters();
    setCharacters(res.data || []);
    setActiveCharacterId(res.activeCharacterId || null);

    // 并行获取每个角色的回忆数量
    const counts: Record<string, number> = {};
    await Promise.all((res.data || []).map(async (c: Character) => {
      try {
        const mem = await fetchMemories(c.id);
        counts[c.id] = mem.total || 0;
      } catch {
        counts[c.id] = 0;
      }
    }));
    setMemoryCounts(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleActivate = async (id: string) => {
    setSwitchingId(id);
    try {
      await activateCharacter(id);
      setActiveCharacterId(id);
    } finally {
      setSwitchingId(null);
    }
  };

  const handleCreate = async (data: { name: string; description: string; systemPrompt: string; avatarColor: string }) => {
    const res = await createCharacter(data);
    if (!res.success) throw new Error(res.error || '创建失败');
    await load();
  };

  const handleUpdate = async (data: { name: string; description: string; systemPrompt: string; avatarColor: string }) => {
    if (!editTarget || editTarget === 'new') return;
    const res = await updateCharacter(editTarget.id, data);
    if (!res.success) throw new Error(res.error || '更新失败');
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteCharacter(deleteTarget.id);
    setDeleteTarget(null);
    await load();
  };

  const activeCharacter = characters.find(c => c.id === activeCharacterId);

  return (
    <div className="flex flex-col h-full gap-5 overflow-hidden">
      {/* 顶栏 */}
      <div className="shrink-0 glass-card p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-primary-dark flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Users size={16} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-text-primary leading-none">角色切换</h2>
            <p className="text-xs text-text-muted mt-0.5">每个角色拥有独立记忆，互不干扰</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* 当前激活角色提示 */}
          {activeCharacter && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-green-400">
              <Zap size={11} />
              当前：{activeCharacter.name}
            </div>
          )}
          <button
            onClick={() => setEditTarget('new')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-light text-white text-sm font-medium transition-all shadow-md shadow-primary/30 cursor-pointer"
          >
            <Plus size={14} />
            新建角色
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="text-text-muted text-sm">加载中…</span>
            </div>
          </div>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
              <Users size={28} className="text-primary/60" />
            </div>
            <p className="text-text-secondary text-sm">还没有角色，点击「新建角色」开始</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {characters.map(c => (
              <CharacterCard
                key={c.id}
                character={c}
                isActive={c.id === activeCharacterId}
                memoryCount={memoryCounts[c.id] ?? 0}
                onActivate={() => switchingId ? undefined : handleActivate(c.id)}
                onEdit={() => setEditTarget(c)}
                onDelete={() => setDeleteTarget(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 说明栏 */}
      <div className="shrink-0 glass-card p-4 text-xs text-text-muted space-y-1 leading-relaxed">
        <div className="flex items-center gap-2 text-text-secondary font-medium mb-1">
          <Check size={12} className="text-green-400" />
          记忆隔离原理
        </div>
        <p>每个角色的对话历史和长期记忆单独存储，切换角色后 LLM 将读取新角色的人设和回忆，不会混入其他角色的记忆。</p>
        <p className="text-text-muted/70">切换后对下一次对话立即生效，无需重启服务。</p>
      </div>

      {/* 弹窗 */}
      {editTarget === 'new' && (
        <CharacterModal
          onClose={() => setEditTarget(null)}
          onSave={handleCreate}
        />
      )}
      {editTarget && editTarget !== 'new' && (
        <CharacterModal
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleUpdate}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          character={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
