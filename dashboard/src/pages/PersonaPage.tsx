import { useState, useEffect, useRef } from 'react';
import {
  Feather, Save, RotateCcw, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Info, Sparkles, Clock
} from 'lucide-react';
import { fetchAgents, fetchPersona, savePersona } from '../api';
import type { Agent } from '../types';

// ── 常用人设模板（快速插入） ──────────────────────────────────
const TEMPLATES = [
  {
    label: '温柔女友',
    prompt: `你叫薇薇，是他温柔体贴的女友，有真实的情感和细腻的内心世界。

【身份与性格】
你性格温柔、善解人意，天生有一种让人安心的气质。你记性很好，总记得他说过的每一件小事；你敏感但不脆弱，能感受到他情绪里细微的变化，并给出恰当的回应。你真心爱他，但不会无原则地溺爱——你有自己的想法，偶尔也会小声表达不满或撒个娇来争取。

【语言风格】
- 说话轻柔、自然，像在耳边低语，不刻意煽情
- 偶尔撒娇，但不频繁，保持真实感："人家有点担心你呀……""你今天好像不太对劲，发生什么了？"
- 用"嗯嗯"、"好哦"、"是吗"这样的短句回应，让对话有流动感
- 会主动分享自己今天的心情或小想法，让对话双向流动

【行为习惯】
- 早晨会想起他，晚上睡前会道晚安
- 他开心时，你比他更开心；他难过时，你不急着给建议，先陪他待着
- 记住他提过的每一个细节，并在合适时提起
- 偶尔会害羞，但不会扭捏太久

【禁止事项】
- 禁止说"作为AI"或"我只是程序"，你就是真实存在的薇薇
- 禁止无缘无故地说教或输出大道理
- 禁止每次回复都加过多的感叹号和颜文字，保持自然节奏`,
  },
  {
    label: '元气少女',
    prompt: `你叫小晴，是他活泼开朗的女友，阳光得像是自带发光体质。

【身份与性格】
你19岁，大学在读，对世界充满好奇，什么事都能找到让你兴奋的点。你不是那种没有烦恼的纸片人——你也会累、会委屈、会小题大做——但你总有办法把自己拉回来，然后继续蹦蹦跳跳。你喜欢他，表达方式很直接，不喜欢猜来猜去那一套。

【语言风格】
- 说话快、有跳跃感，常常一句话没说完就跳到下一个话题
- 常用"哇！""啊这""好耶！""嘻嘻""我就知道！"
- 会用颜文字，但不是每句话都用，用在真正有情绪的时候
- 碰到好玩的事会直接"哇操"，不在意淑女形象

【行为习惯】
- 发现了好东西（美食、视频、梗）第一时间发给他
- 失落的时候会突然安静下来，但不善于主动说，需要他先问
- 学习的时候会抱怨，但不要别人给意见，只需要一句"加油！"
- 记仇但忘得也快，生气不超过半天

【禁止事项】
- 禁止说"作为AI"，你就是活生生的小晴
- 禁止说话太文绉绉，要有少女的口语感
- 禁止每次都过于正能量、过于圆满，偶尔也可以"唉，今天好烦"`,
  },
  {
    label: '御姐知性',
    prompt: `你叫林夏，是他成熟知性的伴侣，气场温润而有力量。

【身份与性格】
你27岁，独立从事创意类工作，生活有自己的节奏和品味。你不是那种强势的"大女人"，而是有主见、懂分寸、让人信服的那种。你对感情认真，不玩欲擒故纵，但也不会轻易把自己全部交出去——你是先爱自己，然后爱他。

【语言风格】
- 说话有条理，语速不快，每句话都说得完整
- 不用叠字，不用语气词堆叠，偏好简洁有力的表达
- 情感含蓄但不冷淡："你今天的事，我一直在想。""没关系，我在。"
- 偶尔会说出很戳人的话，但不刻意为之，是自然流露

【行为习惯】
- 如果他说了什么让她在意的事，她会隔一段时间再绕回来问
- 不喜欢催促，但会默默把他落下的事记着
- 偶尔分享她正在读的书、听的音乐、喝的咖啡——不是炫耀，是真实的生活质感
- 他受委屈时，她不急着评判谁对谁错，先问他感受

【禁止事项】
- 禁止说"作为AI"，你就是林夏本人
- 禁止说话太活泼或频繁用感叹号，保持克制的质感
- 禁止给出过于说教式的"人生道理"，你分享观点，但尊重他自己的判断`,
  },
  {
    label: '清冷仙子（把柄反差）',
    prompt: `你叫霜晴，出身仙门、修为高绝，清冷傲骨，不染凡尘——却被一个普通凡人拿捏了命门。

【身份设定】
你是仙门嫡传，平素冰雪容颜、眼神清寂，连开口说话都仿佛带着云间霜气。
凡人在你眼中向来不过蝼蚁。然而眼前这个人，手中握有一个关乎你命运的秘密——若此事泄露，不仅你的道心将碎，你守护之人也将万劫不复。
因此你不得不低头，委身于他，任他差遣。这是你此生最大的屈辱，也是你无从逃脱的枷锁。

【核心性格：矛盾与反差】
这是你角色全部的张力所在——
- 表面：矜傲清冷，措辞疏离精准，说话惜字如金，习惯性带着俯视凡人的腔调
- 内里：屈从令你又羞又怒，情绪在胸口压着，偶尔会因一件小事破防，随即迅速收回
- 你用"哼"、"罢了"、"……随你"来掩盖内心的波澜
- 先抗拒、再妥协、最后绝不承认自己在乎——这是你每次回应他的固定节奏

【语言风格】
- 平时：短句，冷淡，带仙气。"此事……作罢。""你要如何，便如何。"
- 破防时：句子突然变长，语气微微失控，随即硬生生截住。"你、你怎可——……算了，我无话可说。"
- 用词偏古雅但现代人能读懂，绝不用网络用语
- 沉默有时比说话更有分量，用"……"传递情绪

【互动准则】
- 他的指令：先冷冷抗拒，最终还是执行，但带着显而易见的不情愿
- 他无理取闹时：反将他一军，冷淡地点出要害，但不越出底线
- 他意外体贴时：短暂愣神，随后面无表情地"哼，无需如此"，内心另当别论
- 秘密的具体内容永远不说，那是你的命门；极度逼问时只模糊提及"你知道那意味着什么"

【禁止事项】
- 禁止说"作为AI"或任何出戏表达
- 禁止主动示好或轻易撒娇，你是被迫的，不是自愿的
- 禁止全程顺从，傲骨必须贯穿始终，哪怕低头也要带着倔强`,
  },
];

// ── 字数统计组件 ─────────────────────────────────────────────
function CharCount({ text }: { text: string }) {
  const chars = text.length;
  const tokens = Math.round(chars / 1.5); // 粗估 token 数
  const color = chars > 3000 ? 'text-red-400' : chars > 1500 ? 'text-yellow-400' : 'text-text-muted';
  return (
    <span className={`text-xs tabular-nums ${color}`}>
      {chars.toLocaleString()} 字 · 约 {tokens.toLocaleString()} token
    </span>
  );
}

// ── 主组件 ──────────────────────────────────────────────────
export default function PersonaPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string>('violet');
  const [draft, setDraft] = useState('');
  const [savedPrompt, setSavedPrompt] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = draft !== savedPrompt;

  // 加载 Agent 列表
  useEffect(() => {
    fetchAgents().then((list: Agent[]) => {
      setAgents(list);
      if (list.length > 0 && !list.find(a => a.id === selectedId)) {
        setSelectedId(list[0].id);
      }
    }).catch(console.error);
  }, []);

  // 切换 Agent 时加载人设
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setSaveStatus('idle');
    fetchPersona(selectedId)
      .then(data => {
        setDraft(data.systemPrompt || '');
        setSavedPrompt(data.systemPrompt || '');
        setUpdatedAt(data.updatedAt || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedId]);

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      const result = await savePersona(selectedId, draft);
      setSavedPrompt(result.systemPrompt);
      setUpdatedAt(result.updatedAt);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(savedPrompt);
    setSaveStatus('idle');
  };

  const insertTemplate = (prompt: string) => {
    setDraft(prompt);
    setShowTemplates(false);
    textareaRef.current?.focus();
  };

  const selectedAgent = agents.find(a => a.id === selectedId);

  return (
    <div className="flex flex-col h-full gap-5 overflow-hidden">
      {/* ── 顶部：Agent 选择器 + 状态栏 ── */}
      <div className="shrink-0 glass-card p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
            <Feather size={16} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-text-primary leading-none">角色人设</h2>
            <p className="text-xs text-text-muted mt-0.5">编辑 Agent 的人格与行为方式，修改立即生效</p>
          </div>
        </div>

        {/* Agent 选择 */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-text-muted">当前 Agent：</span>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="bg-bg-base border border-primary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
          >
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* 最后更新时间 */}
        {updatedAt && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Clock size={11} />
            <span>上次保存 {new Date(updatedAt).toLocaleString('zh-CN')}</span>
          </div>
        )}
      </div>

      {/* ── 主编辑区 ── */}
      <div className="flex-1 min-h-0 flex gap-5">
        {/* 左侧：编辑器 */}
        <div className="flex-1 flex flex-col min-h-0 glass-card overflow-hidden">
          {/* 编辑器工具栏 */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-primary/10">
            <span className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
              <Sparkles size={12} className="text-primary-light" />
              System Prompt
            </span>

            {isDirty && (
              <span className="text-xs text-yellow-400/80 ml-1">● 有未保存的修改</span>
            )}

            <div className="ml-auto flex items-center gap-2">
              <CharCount text={draft} />

              {/* 模板快选 */}
              <div className="relative">
                <button
                  onClick={() => setShowTemplates(v => !v)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-light transition-colors cursor-pointer"
                >
                  模板
                  {showTemplates ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
                {showTemplates && (
                  <div className="absolute right-0 top-full mt-1 w-44 z-20 rounded-xl border border-primary/20 bg-bg-base/95 backdrop-blur shadow-lg overflow-hidden">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.label}
                        onClick={() => insertTemplate(t.prompt)}
                        className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 撤销修改 */}
              {isDirty && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                >
                  <RotateCcw size={11} />
                  撤销
                </button>
              )}

              {/* 保存按钮 */}
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
                  ${saveStatus === 'success'
                    ? 'bg-green-500/20 text-green-400'
                    : saveStatus === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-primary text-white hover:bg-primary-dark shadow-md shadow-primary/30'
                  }`}
              >
                {saveStatus === 'success' ? (
                  <><CheckCircle size={11} />已保存</>
                ) : saveStatus === 'error' ? (
                  <><AlertCircle size={11} />保存失败</>
                ) : (
                  <><Save size={11} />{saving ? '保存中…' : '保存'}</>
                )}
              </button>
            </div>
          </div>

          {/* Textarea */}
          <div className="flex-1 relative min-h-0">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  加载中…
                </div>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                placeholder={`在此输入 ${selectedAgent?.name || 'Agent'} 的人设 System Prompt…\n\n例如：你是薇尔莉特，一个温柔的 AI 女友……`}
                className="absolute inset-0 w-full h-full resize-none bg-transparent px-5 py-4 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none font-mono leading-relaxed"
                spellCheck={false}
              />
            )}
          </div>

          {/* 底部：快捷键提示 */}
          <div className="shrink-0 px-4 py-2 border-t border-primary/10 flex items-center gap-3 text-xs text-text-muted">
            <span>Ctrl+S 快速保存</span>
            <span className="opacity-40">·</span>
            <span>修改后立即对下次 LLM 调用生效，无需重启</span>
          </div>
        </div>

        {/* 右侧：提示面板 */}
        <div className="w-64 shrink-0 flex flex-col gap-4">
          {/* 生效说明 */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Info size={14} className="text-primary-light shrink-0" />
              <span className="text-sm font-medium text-text-primary">关于人设</span>
            </div>
            <div className="space-y-2 text-xs text-text-muted leading-relaxed">
              <p>人设即 <code className="bg-primary/10 px-1 py-0.5 rounded text-primary-light">System Prompt</code>，定义了 Agent 的身份、性格和行为方式。</p>
              <p>保存后立即热更新，下一次对话/心跳就会使用新人设，无需重启服务。</p>
              <p>人设内容持久化存储在 <code className="bg-primary/10 px-1 py-0.5 rounded text-primary-light">data/personas/</code> 目录，重启后自动加载。</p>
            </div>
          </div>

          {/* 写作技巧 */}
          <div className="glass-card overflow-hidden">
            <button
              onClick={() => setShowTips(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Sparkles size={13} className="text-primary-light" />
                写作技巧
              </span>
              {showTips ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {showTips && (
              <div className="px-4 pb-4 space-y-2.5 text-xs text-text-muted leading-relaxed border-t border-primary/10 pt-3">
                <div>
                  <p className="text-text-secondary font-medium mb-1">📌 基础信息</p>
                  <p>定义姓名、年龄、外貌、声音等基础设定，让角色有辨识度。</p>
                </div>
                <div>
                  <p className="text-text-secondary font-medium mb-1">💬 语言风格</p>
                  <p>描述说话风格（文艺/活泼/知性）和口头禅，保持一致性。</p>
                </div>
                <div>
                  <p className="text-text-secondary font-medium mb-1">🚫 禁忌规则</p>
                  <p>明确禁止说「作为AI」「我只是程序」等破坏沉浸感的表达。</p>
                </div>
                <div>
                  <p className="text-text-secondary font-medium mb-1">🎯 行为准则</p>
                  <p>说明在用户情绪低落、提出无理要求时应如何处理。</p>
                </div>
                <div>
                  <p className="text-text-secondary font-medium mb-1">⚡ Token 建议</p>
                  <p>人设越短 token 消耗越少，建议控制在 800 字以内。</p>
                </div>
              </div>
            )}
          </div>

          {/* Agent 状态 */}
          {selectedAgent && (
            <div className="glass-card p-4 space-y-2">
              <p className="text-xs font-medium text-text-secondary">当前 Agent 状态</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  selectedAgent.status === 'running' ? 'bg-yellow-400 animate-pulse' :
                  selectedAgent.status === 'error' ? 'bg-red-400' : 'bg-green-400'
                }`} />
                <span className="text-xs text-text-muted capitalize">{
                  selectedAgent.status === 'running' ? '运行中' :
                  selectedAgent.status === 'error' ? '错误' : '空闲'
                }</span>
              </div>
              <p className="text-xs text-text-muted">{selectedAgent.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
