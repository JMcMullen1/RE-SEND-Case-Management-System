import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe } from '../api/client';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
export interface PresenceUser {
  userId: string;
  displayName: string;
}

interface RealtimeContextValue {
  status: ConnectionStatus;
  presence: Record<string, PresenceUser[]>;
  joinCase: (caseId: string) => void;
  leaveCase: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const MAX_BACKOFF = 30_000;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [presence, setPresence] = useState<Record<string, PresenceUser[]>>({});

  const socketRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const currentCaseRef = useRef<string | undefined>(undefined);
  const meRef = useRef<PresenceUser | null>(null);
  meRef.current = me.data
    ? { userId: me.data.id, displayName: me.data.displayName }
    : null;

  const sendJoin = useCallback(() => {
    const socket = socketRef.current;
    const user = meRef.current;
    if (
      socket?.readyState === WebSocket.OPEN &&
      currentCaseRef.current &&
      user
    ) {
      socket.send(
        JSON.stringify({
          type: 'presence:join',
          caseId: currentCaseRef.current,
          userId: user.userId,
          displayName: user.displayName,
        }),
      );
    }
  }, []);

  useEffect(() => {
    let closed = false;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus('connected');
        // On a reconnect, do not trust the cache: refetch active queries.
        if (attemptsRef.current > 0) void qc.invalidateQueries();
        attemptsRef.current = 0;
        sendJoin();
      };

      socket.onmessage = (event) => {
        let msg: {
          type?: string;
          queryKeys?: (string | number)[][];
          caseId?: string;
          users?: PresenceUser[];
        };
        try {
          msg = JSON.parse(event.data as string) as typeof msg;
        } catch {
          return;
        }
        if (msg.type === 'invalidate' && msg.queryKeys) {
          for (const queryKey of msg.queryKeys)
            void qc.invalidateQueries({ queryKey });
        } else if (msg.type === 'presence' && msg.caseId) {
          const caseId = msg.caseId;
          setPresence((prev) => ({ ...prev, [caseId]: msg.users ?? [] }));
        }
      };

      socket.onclose = () => {
        if (closed) return;
        setStatus('disconnected');
        const delay = Math.min(1000 * 2 ** attemptsRef.current, MAX_BACKOFF);
        attemptsRef.current += 1;
        timerRef.current = window.setTimeout(connect, delay);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      closed = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      socketRef.current?.close();
    };
  }, [qc, sendJoin]);

  // Re-announce presence once the current user loads.
  useEffect(() => {
    if (me.data) sendJoin();
  }, [me.data, sendJoin]);

  const joinCase = useCallback(
    (caseId: string) => {
      currentCaseRef.current = caseId;
      sendJoin();
    },
    [sendJoin],
  );

  const leaveCase = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN && currentCaseRef.current) {
      socket.send(
        JSON.stringify({
          type: 'presence:leave',
          caseId: currentCaseRef.current,
        }),
      );
    }
    currentCaseRef.current = undefined;
  }, []);

  const value = useMemo(
    () => ({ status, presence, joinCase, leaveCase }),
    [status, presence, joinCase, leaveCase],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}

export function useConnectionStatus(): ConnectionStatus {
  return useRealtime().status;
}

/** Announce this user's presence on a case and read who else has it open. */
export function usePresence(caseId: string): PresenceUser[] {
  const { joinCase, leaveCase, presence } = useRealtime();
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  useEffect(() => {
    joinCase(caseId);
    return () => leaveCase();
  }, [caseId, joinCase, leaveCase]);
  return (presence[caseId] ?? []).filter((u) => u.userId !== me.data?.id);
}
