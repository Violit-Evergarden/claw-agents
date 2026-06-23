import { useEffect, useRef, useState } from 'react';
import type { LogEntry, SSEEvent } from '../types';

export function useSSE() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onStatusChangeRef = useRef<((agentId: string, status: string) => void) | null>(null);
  const onTaskEventRef = useRef<((type: string, data: unknown) => void) | null>(null);

  useEffect(() => {
    const es = new EventSource('/events');
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      const event: SSEEvent = JSON.parse(e.data);
      if (event.type === 'connected') return;

      if (event.type === 'agent:log') {
        const entry = event.data as LogEntry;
        setLogs(prev => [...prev.slice(-199), entry]);
      }

      if (event.type === 'agent:status' && onStatusChangeRef.current) {
        const d = event.data as { id: string; status: string };
        onStatusChangeRef.current(d.id, d.status);
      }

      if (event.type === 'agent:turn:complete' && onStatusChangeRef.current) {
        const d = event.data as { id: string; success: boolean };
        onStatusChangeRef.current(d.id, d.success ? 'idle' : 'error');
      }

      if (['task:added', 'task:removed', 'task:paused', 'task:executed', 'task:resumed'].includes(event.type)) {
        if (onTaskEventRef.current) {
          onTaskEventRef.current(event.type, event.data);
        }
      }
    };

    return () => es.close();
  }, []);

  const onStatusChange = (fn: (agentId: string, status: string) => void) => {
    onStatusChangeRef.current = fn;
  };

  const onTaskEvent = (fn: (type: string, data: unknown) => void) => {
    onTaskEventRef.current = fn;
  };

  const clearLogs = () => setLogs([]);

  return { logs, connected, onStatusChange, onTaskEvent, clearLogs };
}
