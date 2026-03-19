import { useEffect, useRef } from 'react';
import type { LogEntry } from '../types';

interface LogStreamProps {
  logs: LogEntry[];
}

const levelColors: Record<string, string> = {
  info: 'text-text-secondary',
  error: 'text-red-400',
  warn: 'text-yellow-400',
};

const agentColors: Record<string, string> = {
  violet: 'text-purple-400',
  assistant: 'text-blue-400',
};

export default function LogStream({ logs }: LogStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="h-full overflow-y-auto font-mono text-xs space-y-0.5 p-1">
      {logs.length === 0 && (
        <div className="text-text-muted text-center py-8">等待日志...</div>
      )}
      {logs.map((log, i) => (
        <div key={i} className="flex gap-2 py-0.5 hover:bg-primary/5 rounded px-1 transition-colors">
          <span className="text-text-muted shrink-0 w-20 text-right">
            {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
          </span>
          <span className={`shrink-0 w-14 ${agentColors[log.agentId || ''] || 'text-text-muted'}`}>
            [{log.agentId || 'sys'}]
          </span>
          <span className={`${levelColors[log.level] || 'text-text-secondary'} break-all`}>
            {log.message}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
