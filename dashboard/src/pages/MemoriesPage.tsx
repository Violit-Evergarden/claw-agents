import { useState, useEffect, useCallback } from 'react';
import {
  User, Heart, Calendar, Smile, Star, Sparkles,
  Search, RefreshCw, Trash2, Plus, X, BookOpen, Zap
} from 'lucide-react';
import { Memory, MemoryCategory, MemoriesResponse, Character } from '../types';
import { fetchMemories, deleteMemory, addMemory, fetchCharacters, activateCharacter } from '../api';

const CATEGORY_META: Record<MemoryCategory | 'all', { label: string; icon: React.ElementType; color: string; bg: string }> = {
  all:        { label: '全部回忆',   icon: BookOpen,  color: 'text-purple-300',  bg: 'bg-purple-500/20' },
  profile:    { label: '关于你',     icon: User,      color: 'text-blue-300',    bg: 'bg-blue-500/20' },
  preference: { label: '偏好喜好',   icon: Heart,     color: 'text-pink-300',    bg: 'bg-pink-500/20' },
  event:      { label: '重要事件',   icon: Calendar,  color: 'text-amber-300',   bg: 'bg-amber-500/20' },
  emotion:    { label: '情感片段',   icon: Smile,     color: 'text-green-300',   bg: 'bg-green-500/20' },
  milestone:  { label: '关系里程碑', icon: Star,      color: 'text-yellow-300',  bg: 'bg-yellow-500/20' },
};

const CATEGORY_ORDER: MemoryCategory[] = ['profile', 'preference', 'event', 'emotion', 'milestone'];

function ImportanceStars({ level }: { level: 1 | 2 | 3 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map(i => (
        <Sparkles
          key={i}
          size={10}
          className={i <= level ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}
        />
      ))}
    </div>
  );
}

function MemoryCard({ memory, onDelete }: { memory: Memory; onDelete: (id: string) => void }) {
  const meta = CATEGORY_META[memory.category];
  const Icon = meta.icon;
  const isHighImportance = memory.importance === 3;

  return (
    <div className={`group relative p-4 rounded-xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-lg
      ${isHighImportance
        ? 'bg-gradient-to-br from-primary/15 to-primary-dark/10 border-primary/40 shadow-primary/10 shadow-md'
        : 'bg-white/5 border-white/10 hover:border-primary/30'
      }`}>
      {isHighImportance && (
        <div className="absolute inset-0 rounded-xl bg-primary/5 blur-sm pointer-events-none" />
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
          <Icon size={11} />
          <span>{meta.label}</span>
        </div>
        <button
          onClick={() => onDelete(memory.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-red-400 p-1 rounded hover:bg-red-500/10 cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Content */}
      <p className="text-text-primary text-sm leading-relaxed mb-3">{memory.content}</p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-text-muted text-xs">{memory.sourceDate}</span>
        <ImportanceStars level={memory.importance} />
      </div>
    </div>
  );
}

function AddMemoryModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (m: { category: string; content: string; importance: number; sourceDate: string }) => void;
}) {
  const [category, setCategory] = useState<MemoryCategory>('preference');
  const [content, setContent] = useState('');
  const [importance, setImportance] = useState(2);
  const [sourceDate, setSourceDate] = useState(new Date().toISOString().slice(0, 10));

  const handleSave = () => {
    if (!content.trim()) return;
    onSave({ category, content: content.trim(), importance, sourceDate });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 p-6 rounded-2xl bg-bg-card border border-primary/20 shadow-2xl shadow-primary/10">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-text-primary font-semibold text-base">手动添加回忆</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Category */}
          <div>
            <label className="text-text-secondary text-xs mb-2 block">分类</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_ORDER.map(cat => {
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                      ${category === cat ? `${meta.bg} ${meta.color} border border-current/30` : 'bg-white/5 text-text-muted hover:bg-white/10'}`}
                  >
                    <Icon size={12} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="text-text-secondary text-xs mb-2 block">内容</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="描述这条回忆……"
              maxLength={200}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-text-primary text-sm resize-none outline-none focus:border-primary/50 transition-colors placeholder:text-text-muted"
            />
            <div className="text-right text-text-muted text-xs mt-1">{content.length}/200</div>
          </div>

          {/* Importance + Date */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-text-secondary text-xs mb-2 block">重要程度</label>
              <div className="flex gap-2">
                {[1, 2, 3].map(v => (
                  <button
                    key={v}
                    onClick={() => setImportance(v)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                      ${importance === v ? 'bg-primary text-white' : 'bg-white/5 text-text-muted hover:bg-white/10'}`}
                  >
                    {'★'.repeat(v)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="text-text-secondary text-xs mb-2 block">日期</label>
              <input
                type="date"
                value={sourceDate}
                onChange={e => setSourceDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-text-primary text-xs outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-text-secondary text-sm hover:bg-white/5 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-light text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            保存回忆
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MemoriesPage() {
  const [data, setData] = useState<MemoriesResponse | null>(null);
  const [activeCategory, setActiveCategory] = useState<MemoryCategory | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // 角色选择
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [activeCharId, setActiveCharId] = useState<string>('');

  // 加载角色列表
  useEffect(() => {
    fetchCharacters().then(res => {
      setCharacters(res.data || []);
      const aid = res.activeCharacterId || res.data?.[0]?.id || 'violet';
      setActiveCharId(aid);
      setSelectedCharId(aid);
    }).catch(() => {
      // 降级使用 violet
      setSelectedCharId('violet');
      setActiveCharId('violet');
    });
  }, []);

  const loadMemories = useCallback(async () => {
    if (!selectedCharId) return;
    setLoading(true);
    const result = await fetchMemories(selectedCharId, activeCategory !== 'all' ? activeCategory : undefined, keyword || undefined);
    setData(result);
    setLoading(false);
  }, [selectedCharId, activeCategory, keyword]);

  useEffect(() => {
    if (selectedCharId) loadMemories();
  }, [loadMemories, selectedCharId]);

  const handleDelete = async (memoryId: string) => {
    await deleteMemory(selectedCharId, memoryId);
    loadMemories();
  };

  const handleAdd = async (m: { category: string; content: string; importance: number; sourceDate: string }) => {
    await addMemory(selectedCharId, m);
    loadMemories();
  };

  const handleSwitchChar = async (charId: string) => {
    setSelectedCharId(charId);
  };

  const handleActivateChar = async (charId: string) => {
    await activateCharacter(charId);
    setActiveCharId(charId);
  };

  const selectedChar = characters.find(c => c.id === selectedCharId);
  const displayMemories: Memory[] = data?.flat || [];

  const categoryCounts: Partial<Record<MemoryCategory | 'all', number>> = {
    all: data?.total || 0,
  };
  if (data?.grouped) {
    for (const [cat, items] of Object.entries(data.grouped)) {
      categoryCounts[cat as MemoryCategory] = items.length;
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-start justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500/30 to-primary/30 flex items-center justify-center border border-pink-400/20">
              <Star size={18} className="text-pink-300 fill-pink-300" />
            </div>
            {selectedChar ? `${selectedChar.name}的回忆` : '角色回忆'}
          </h1>
          <p className="text-text-muted text-sm mt-1 ml-12">她记住了这些关于你的事</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadMemories}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all text-sm cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:bg-primary-light text-white transition-all text-sm font-medium cursor-pointer"
          >
            <Plus size={14} />
            添加回忆
          </button>
        </div>
      </div>

      {/* 角色切换栏 */}
      {characters.length > 0 && (
        <div className="flex gap-2 mb-4 flex-shrink-0 overflow-x-auto pb-1">
          {characters.map(c => {
            const isSelected = c.id === selectedCharId;
            const isActive = c.id === activeCharId;
            return (
              <button
                key={c.id}
                onClick={() => handleSwitchChar(c.id)}
                className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer flex-shrink-0 border ${
                  isSelected
                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                    : 'bg-white/5 text-text-secondary border-white/10 hover:bg-white/10 hover:text-text-primary'
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold"
                  style={{ background: c.avatarColor, fontSize: '9px' }}
                >
                  {c.name.charAt(0)}
                </div>
                {c.name}
                {isActive && (
                  <span className="flex items-center gap-0.5 text-green-400">
                    <Zap size={9} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4 flex-shrink-0">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="搜索回忆……"
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-text-primary text-sm outline-none focus:border-primary/40 transition-colors placeholder:text-text-muted"
        />
        {keyword && (
          <button onClick={() => setKeyword('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto flex-shrink-0 pb-1">
        {(['all', ...CATEGORY_ORDER] as const).map(cat => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const count = categoryCounts[cat] ?? 0;
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer flex-shrink-0
                ${isActive
                  ? `bg-primary text-white shadow-md shadow-primary/30`
                  : `bg-white/5 ${meta.color} hover:bg-white/10 border border-white/5`
                }`}
            >
              <Icon size={13} />
              {meta.label}
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs leading-none ${isActive ? 'bg-white/20' : 'bg-white/10'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Memories grid */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="text-text-muted text-sm">{selectedChar?.name || '她'}在回想……</span>
            </div>
          </div>
        ) : displayMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
              <Star size={28} className="text-primary/60" />
            </div>
            <p className="text-text-secondary text-sm leading-relaxed max-w-xs">
              ……{keyword ? `没有找到关于"${keyword}"的回忆。` : '我们刚认识，还没有很多故事。但我会记住每一个你告诉我的细节。'}
            </p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {displayMemories.map(memory => (
              <div key={memory.id} className="break-inside-avoid">
                <MemoryCard memory={memory} onDelete={handleDelete} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {data && data.total > 0 && (
        <div className="mt-4 pt-3 border-t border-white/5 flex-shrink-0">
          <p className="text-text-muted text-xs text-center">
            {CATEGORY_ORDER.map(cat => {
              const count = categoryCounts[cat] ?? 0;
              if (count === 0) return null;
              return `${CATEGORY_META[cat].label} ${count}`;
            }).filter(Boolean).join('  ·  ')}
          </p>
        </div>
      )}

      {showAddModal && (
        <AddMemoryModal onClose={() => setShowAddModal(false)} onSave={handleAdd} />
      )}
    </div>
  );
}
