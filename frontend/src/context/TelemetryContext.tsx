/**
 * Telemetry Context & Live WebSocket Stream Provider
 * Manages real-time 4Hz telemetry frames, WebSocket reconnection,
 * system health polling, explainability modal selection, and rolling charts buffer.
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  TelemetrySnapshot,
  SystemHealthReport,
  DecisionRecord,
  DecisionExplanation,
  WorkloadRun,
} from '../types';
import { apiClient } from '../api/client';

interface TelemetryHistoryPoint {
  time: string;
  timestamp: number;
  hitRate: number;
  rps: number;
  backendLoad: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  memoryMb: number;
}

interface TelemetryContextType {
  telemetry: TelemetrySnapshot | null;
  history: TelemetryHistoryPoint[];
  isConnected: boolean;
  health: SystemHealthReport | null;
  selectedDecisionId: string | null;
  selectedExplanation: DecisionExplanation | null;
  isExplainDrawerOpen: boolean;
  activeWorkload: WorkloadRun | null;
  isWorkloadRunning: boolean;
  isDemoMode: boolean;
  openExplainDrawer: (decisionId: string) => Promise<void>;
  closeExplainDrawer: () => void;
  setDemoMode: (enabled: boolean) => void;
  refreshHealth: () => Promise<void>;
  checkWorkloadStatus: () => Promise<void>;
}

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export const TelemetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [history, setHistory] = useState<TelemetryHistoryPoint[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [health, setHealth] = useState<SystemHealthReport | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [selectedExplanation, setSelectedExplanation] = useState<DecisionExplanation | null>(null);
  const [isExplainDrawerOpen, setIsExplainDrawerOpen] = useState<boolean>(false);
  const [activeWorkload, setActiveWorkload] = useState<WorkloadRun | null>(null);
  const [isWorkloadRunning, setIsWorkloadRunning] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);

  const refreshHealth = async () => {
    try {
      const data = await apiClient.getSystemHealth();
      setHealth(data);
    } catch (err) {
      console.warn('[TelemetryContext] Health check error:', err);
    }
  };

  const checkWorkloadStatus = async () => {
    try {
      const data = await apiClient.getActiveWorkload();
      setIsWorkloadRunning(data.isRunning);
      setActiveWorkload(data.activeRun);
    } catch (err) {
      console.warn('[TelemetryContext] Workload status check error:', err);
    }
  };

  const openExplainDrawer = async (decisionId: string) => {
    try {
      setSelectedDecisionId(decisionId);
      setIsExplainDrawerOpen(true);
      const explanation = await apiClient.getDecisionExplanation(decisionId);
      setSelectedExplanation(explanation);
    } catch (err) {
      console.error('[TelemetryContext] Error loading explanation:', err);
    }
  };

  const closeExplainDrawer = () => {
    setIsExplainDrawerOpen(false);
    setSelectedExplanation(null);
    setSelectedDecisionId(null);
  };

  // Connect WebSocket
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connectWs = () => {
      const envWsUrl = (import.meta as any).env?.VITE_WS_URL;
      const envApiUrl = (import.meta as any).env?.VITE_API_URL;
      let wsUrl: string;

      if (envWsUrl) {
        wsUrl = envWsUrl;
      } else if (envApiUrl && (envApiUrl.startsWith('http://') || envApiUrl.startsWith('https://'))) {
        try {
          const parsed = new URL(envApiUrl);
          const proto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${proto}//${parsed.host}/ws`;
        } catch {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${protocol}//${window.location.host}/ws`;
        }
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws`;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[WebSocket] Connected to AdaptiveCache live stream');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'TELEMETRY_SNAPSHOT') {
            const snap: TelemetrySnapshot = message.data;
            setTelemetry(snap);

            // Append to rolling history
            const timeStr = new Date(snap.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setHistory((prev) => {
              const newPoint: TelemetryHistoryPoint = {
                time: timeStr,
                timestamp: snap.timestamp,
                hitRate: Math.round(snap.cacheHitRate * 100),
                rps: snap.requestsPerSecond,
                backendLoad: Math.round(snap.backendLoadRatio * 100),
                avgLatency: snap.averageLatencyMs,
                p95Latency: snap.p95LatencyMs,
                p99Latency: snap.p99LatencyMs,
                memoryMb: Math.round((snap.memoryUsedBytes / (1024 * 1024)) * 10) / 10,
              };
              const updated = [...prev, newPoint];
              return updated.length > 50 ? updated.slice(updated.length - 50) : updated;
            });
          }
        } catch (err) {
          console.warn('[WebSocket] Error parsing message:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('[WebSocket] Disconnected. Reconnecting in 2s...');
        reconnectTimeout = setTimeout(connectWs, 2000);
      };

      ws.onerror = (err) => {
        console.warn('[WebSocket] Error:', err);
        ws.close();
      };
    };

    connectWs();
    refreshHealth();
    checkWorkloadStatus();

    const pollInterval = setInterval(() => {
      refreshHealth();
      checkWorkloadStatus();
    }, 5000);

    return () => {
      clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <TelemetryContext.Provider
      value={{
        telemetry,
        history,
        isConnected,
        health,
        selectedDecisionId,
        selectedExplanation,
        isExplainDrawerOpen,
        activeWorkload,
        isWorkloadRunning,
        isDemoMode,
        openExplainDrawer,
        closeExplainDrawer,
        setDemoMode: setIsDemoMode,
        refreshHealth,
        checkWorkloadStatus,
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetryContext = () => {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetryContext must be used within a TelemetryProvider');
  }
  return context;
};
