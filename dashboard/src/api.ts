const BASE = '/api';

export async function fetchAgents() {
  const res = await fetch(`${BASE}/agents`);
  const json = await res.json();
  return json.data;
}

export async function fetchAgent(id: string) {
  const res = await fetch(`${BASE}/agents/${id}`);
  const json = await res.json();
  return json.data;
}

export async function triggerAgent(id: string) {
  await fetch(`${BASE}/agents/${id}/trigger`, { method: 'POST' });
}

export async function sendAgentMessage(id: string, message: string) {
  await fetch(`${BASE}/agents/${id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

// ── Persona API ──

export async function fetchPersona(agentId: string): Promise<{ systemPrompt: string; updatedAt: string }> {
  const res = await fetch(`${BASE}/agents/${agentId}/persona`);
  const json = await res.json();
  return json.data;
}

export async function savePersona(agentId: string, systemPrompt: string): Promise<{ systemPrompt: string; updatedAt: string }> {
  const res = await fetch(`${BASE}/agents/${agentId}/persona`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Save failed');
  return json.data;
}

export async function fetchTasks() {
  const res = await fetch(`${BASE}/tasks`);
  const json = await res.json();
  return json.data;
}

export async function createTask(task: {
  cronExpr: string;
  action: string;
  description: string;
  content?: string;
  platform?: string;
  agentId?: string;
}) {
  const res = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  return res.json();
}

export async function deleteTask(id: string) {
  await fetch(`${BASE}/tasks/${id}`, { method: 'DELETE' });
}

export async function pauseTask(id: string) {
  await fetch(`${BASE}/tasks/${id}/pause`, { method: 'POST' });
}

export async function resumeTask(id: string) {
  await fetch(`${BASE}/tasks/${id}/resume`, { method: 'POST' });
}

export async function triggerTask(id: string) {
  await fetch(`${BASE}/tasks/${id}/trigger`, { method: 'POST' });
}

// ── Memories API ──

export async function fetchMemories(agentId: string, category?: string, keyword?: string) {
  const params = new URLSearchParams();
  if (category && category !== 'all') params.set('category', category);
  if (keyword) params.set('keyword', keyword);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${BASE}/memories/${agentId}${query}`);
  return res.json();
}

export async function addMemory(agentId: string, memory: {
  category: string;
  content: string;
  importance: number;
  sourceDate?: string;
}) {
  const res = await fetch(`${BASE}/memories/${agentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memory),
  });
  return res.json();
}

export async function deleteMemory(agentId: string, memoryId: string) {
  const res = await fetch(`${BASE}/memories/${agentId}/${memoryId}`, { method: 'DELETE' });
  return res.json();
}

// ── Characters API ──

export async function fetchCharacters(): Promise<{ data: import('./types').Character[], activeCharacterId: string | null }> {
  const res = await fetch(`${BASE}/characters`);
  return res.json();
}

export async function fetchActiveCharacter(): Promise<{ data: import('./types').Character | null }> {
  const res = await fetch(`${BASE}/characters/active`);
  return res.json();
}

export async function createCharacter(data: {
  name: string;
  systemPrompt?: string;
  description?: string;
  avatarColor?: string;
}) {
  const res = await fetch(`${BASE}/characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateCharacter(id: string, patch: {
  name?: string;
  description?: string;
  systemPrompt?: string;
  avatarColor?: string;
}) {
  const res = await fetch(`${BASE}/characters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return res.json();
}

export async function deleteCharacter(id: string) {
  const res = await fetch(`${BASE}/characters/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function activateCharacter(id: string) {
  const res = await fetch(`${BASE}/characters/${id}/activate`, { method: 'POST' });
  return res.json();
}

// ── LLM 模型设置 API ──

export async function fetchLLMSettings(): Promise<{ success: boolean; data: import('./types').LLMSettings }> {
  const res = await fetch(`${BASE}/settings/llm`);
  return res.json();
}

export async function switchLLMProvider(provider: string, opts?: {
  model?: string;
  memoryModel?: string;
}): Promise<{ success: boolean; data?: import('./types').LLMSettings; error?: string }> {
  const res = await fetch(`${BASE}/settings/llm/switch`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, ...opts }),
  });
  return res.json();
}

export async function updateProviderApiKey(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${BASE}/settings/llm/apikey`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey }),
  });
  return res.json();
}



