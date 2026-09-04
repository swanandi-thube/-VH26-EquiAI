/**
 * Type-Safe REST API Client for ADAPTIVECACHE
 */

import {
  TelemetrySnapshot,
  CacheObjectMetadata,
  DecisionRecord,
  DecisionExplanation,
  ActivityEvent,
  WorkloadConfig,
  WorkloadRun,
  BenchmarkRun,
  WhatIfScenarioInput,
  WhatIfComparison,
  SystemSettings,
  SystemHealthReport,
  ProtectionStats
} from '../types';

const getApiBase = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (!envUrl) return '/api';
  let trimmed = envUrl.replace(/\/+$/, '');
  if (!trimmed.endsWith('/api') && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
    trimmed = `${trimmed}/api`;
  }
  return trimmed;
};

const API_BASE = getApiBase();

export const apiClient = {
  async getDashboardMetrics(): Promise<TelemetrySnapshot> {
    const res = await fetch(`${API_BASE}/dashboard/metrics`);
    const json = await res.json();
    return json.data;
  },

  async getCacheObjects(): Promise<{ objects: CacheObjectMetadata[]; stats: any }> {
    const res = await fetch(`${API_BASE}/cache/objects`);
    const json = await res.json();
    return json.data;
  },

  async flushCache(): Promise<void> {
    await fetch(`${API_BASE}/cache/flush`, { method: 'POST' });
  },

  async executeRequest(objectId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/cache/request/${objectId}`, { method: 'POST' });
    return await res.json();
  },

  async getDecisions(limit = 50): Promise<DecisionRecord[]> {
    const res = await fetch(`${API_BASE}/cache/decisions?limit=${limit}`);
    const json = await res.json();
    return json.data;
  },

  async getDecisionExplanation(decisionId: string): Promise<DecisionExplanation> {
    const res = await fetch(`${API_BASE}/cache/decisions/${decisionId}/explain`);
    const json = await res.json();
    return json.data;
  },

  async getEvents(limit = 100, filter = 'ALL'): Promise<ActivityEvent[]> {
    const url = filter && filter !== 'ALL'
      ? `${API_BASE}/cache/events?limit=${limit}&filter=${filter}`
      : `${API_BASE}/cache/events?limit=${limit}`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data;
  },

  async uploadWorkload(
    formData: FormData,
    onProgress?: (percent: number) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/workloads/upload`);

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && json.success) {
            resolve(json.data);
          } else {
            reject(new Error(json.message || `Upload failed with status ${xhr.status}`));
          }
        } catch (e: any) {
          reject(new Error(`Failed to parse response: ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during workload upload.'));
      };

      xhr.send(formData);
    });
  },

  async getWorkloadRuns(limit = 50): Promise<any[]> {
    const res = await fetch(`${API_BASE}/workloads?limit=${limit}`);
    const json = await res.json();
    return json.data;
  },

  async getWorkloadRunById(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/workloads/${id}`);
    const json = await res.json();
    return json.data;
  },

  async deleteWorkloadRun(id: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/workloads/${id}`, { method: 'DELETE' });
    const json = await res.json();
    return json.success;
  },

  async startWorkload(config: WorkloadConfig): Promise<WorkloadRun> {
    const res = await fetch(`${API_BASE}/workloads/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const json = await res.json();
    return json.data;
  },

  async stopWorkload(): Promise<WorkloadRun | null> {
    const res = await fetch(`${API_BASE}/workloads/stop`, { method: 'POST' });
    const json = await res.json();
    return json.data;
  },

  async getActiveWorkload(): Promise<{ isRunning: boolean; activeRun: WorkloadRun | null }> {
    const res = await fetch(`${API_BASE}/workloads/active`);
    const json = await res.json();
    return json.data;
  },

  async replayWorkload(workloadId: string, options: any = {}): Promise<any> {
    const res = await fetch(`${API_BASE}/workloads/${workloadId}/replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Replay failed');
    return json.data;
  },

  async stopReplay(): Promise<any> {
    const res = await fetch(`${API_BASE}/workloads/replay/stop`, { method: 'POST' });
    const json = await res.json();
    return json.data;
  },

  async getReplayStatus(): Promise<{ isReplaying: boolean; metrics: any | null }> {
    const res = await fetch(`${API_BASE}/workloads/replay/status`);
    const json = await res.json();
    return json.data;
  },

  async getProtectionStats(): Promise<ProtectionStats> {
    const res = await fetch(`${API_BASE}/protection/stats`);
    const json = await res.json();
    return json.data;
  },

  async resetProtection(): Promise<void> {
    await fetch(`${API_BASE}/protection/reset`, { method: 'POST' });
  },

  async runBenchmark(params: { workloadId?: string; requestCount?: number; objectCount?: number; capacityMb?: number; traceName?: string }): Promise<BenchmarkRun> {
    const res = await fetch(`${API_BASE}/benchmark/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Benchmark run failed');
    return json.data;
  },

  async getBenchmarkRuns(): Promise<BenchmarkRun[]> {
    const res = await fetch(`${API_BASE}/benchmark/runs`);
    const json = await res.json();
    return json.data;
  },

  async getBenchmarkRunById(id: string): Promise<BenchmarkRun> {
    const res = await fetch(`${API_BASE}/benchmark/${id}`);
    const json = await res.json();
    return json.data;
  },

  async runWhatIfScenario(scenario: WhatIfScenarioInput): Promise<WhatIfComparison> {
    const res = await fetch(`${API_BASE}/scenarios/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario),
    });
    const json = await res.json();
    return json.data;
  },

  async applyScenario(scenario: WhatIfScenarioInput): Promise<void> {
    await fetch(`${API_BASE}/scenarios/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario),
    });
  },

  async getCost(): Promise<any> {
    const res = await fetch(`${API_BASE}/cost`);
    const json = await res.json();
    return json.data;
  },

  async getSystemHealth(): Promise<SystemHealthReport> {
    const res = await fetch(`${API_BASE}/system/health`);
    const json = await res.json();
    return json.data;
  },

  async getSettings(): Promise<SystemSettings> {
    const res = await fetch(`${API_BASE}/settings`);
    const json = await res.json();
    return json.data;
  },

  async updateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const json = await res.json();
    return json.data;
  },

  // --- Demo Mode Endpoints ---
  async startDemo(scenario: string = 'BASIC_CACHE', options?: { multiplier?: number; cacheCapacityBytes?: number; simulatedLatencyMs?: number; simulatedErrorRate?: number }): Promise<any> {
    const res = await fetch(`${API_BASE}/demo/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, ...options }),
    });
    const json = await res.json();
    return json.data;
  },

  async stopDemo(): Promise<any> {
    const res = await fetch(`${API_BASE}/demo/stop`, { method: 'POST' });
    const json = await res.json();
    return json;
  },

  async resetDemo(): Promise<any> {
    const res = await fetch(`${API_BASE}/demo/reset`, { method: 'POST' });
    const json = await res.json();
    return json.data;
  },

  async getDemoStatus(): Promise<any> {
    const res = await fetch(`${API_BASE}/demo/status`);
    const json = await res.json();
    return json.data;
  },

  async getDemoScenarios(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/demo/scenarios`);
    const json = await res.json();
    return json.data;
  },
};

