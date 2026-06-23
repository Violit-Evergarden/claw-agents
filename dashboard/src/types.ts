export interface Agent {
  id: string;
  name: string;
  description: string;
  status: 'idle' | 'running' | 'error';
  lastActive: string | null;
  platform: string;
  logs: LogEntry[];
}

export interface Task {
  id: string;
  cronExpr: string;
  action: 'send_message' | 'run_loop';
  description: string;
  content: string;
  platform: string;
  agentId: string;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
  lastRun: string | null;
  history: TaskHistory[];
}

export interface TaskHistory {
  timestamp: string;
  result: string;
}

export interface LogEntry {
  level: 'info' | 'error' | 'warn';
  message: string;
  timestamp: string;
  agentId?: string;
}

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

export type MemoryCategory = 'profile' | 'preference' | 'event' | 'emotion' | 'milestone';

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: 1 | 2 | 3;
  sourceDate: string;
  createdAt: number;
}

export interface MemoriesResponse {
  agentId: string;
  total: number;
  categories: Record<MemoryCategory, string>;
  grouped: Partial<Record<MemoryCategory, Memory[]>>;
  flat: Memory[];
}

// ── 角色（Character）──
export interface Character {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  avatarColor: string;
  imageBasePrompt?: string;
  personaEssence?: string;
  appearanceKeywords?: string[];
  createdAt: number;
  updatedAt: string;
}

export interface StoryState {
  relationshipStage: string;
  tensionLevel: number;
  activeScenario: {
    scenarioType: string;
    context: string;
    goal: string;
    startedAt: string;
  } | null;
  scenarioHistory: Array<{
    scenarioType: string;
    context: string;
    goal: string;
    startedAt: string;
  }>;
  lastUpdated: string | null;
}

// ── LLM 模型设置 ──
export interface LLMProvider {
  id: string;
  name: string;
  baseURL: string;
  models: string[];
  defaultModel: string;
  memoryModel: string;
  hasApiKey: boolean;
}

export interface LLMSettings {
  activeProvider: string;
  activeModel: string;
  activeMemoryModel: string;
  providers: LLMProvider[];
}
