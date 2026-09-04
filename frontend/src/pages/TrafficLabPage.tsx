/**
 * Traffic Lab & Real Workload Controller Page (Warm Tech Theme)
 * Executes real reproducible traffic scenarios and ingests custom CSV/JSON workload traces.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  FlaskConical,
  Play,
  Square,
  Sliders,
  UploadCloud,
  FileText,
  FileCode,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  HardDrive,
  Trash2,
  Layers,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { useTelemetryContext } from '../context/TelemetryContext';
import { apiClient } from '../api/client';
import { WorkloadConfig, WorkloadType, WorkloadUploadSummary } from '../types';

export const TrafficLabPage: React.FC = () => {
  const {
    telemetry,
    history,
    isWorkloadRunning,
    activeWorkload,
    checkWorkloadStatus
  } = useTelemetryContext();

  // Navigation mode: Preset traffic generator or Custom workload ingestion
  const [activeTab, setActiveTab] = useState<'GENERATOR' | 'UPLOAD'>('GENERATOR');

  // Preset Scenario State
  const [selectedType, setSelectedType] = useState<WorkloadType>('STEADY_LOAD');
  const [rps, setRps] = useState<number>(100);
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [duration, setDuration] = useState<number>(45);
  const [objectCount, setObjectCount] = useState<number>(120);
  const [cacheCapacityMb, setCacheCapacityMb] = useState<number>(64);
  const [backendLatencyMs, setBackendLatencyMs] = useState<number>(80);
  const [backendErrorRate, setBackendErrorRate] = useState<number>(0.0);
  const [isStarting, setIsStarting] = useState(false);

  // Upload Workload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadResult, setUploadResult] = useState<WorkloadUploadSummary | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState<boolean>(false);
  const [historicalRuns, setHistoricalRuns] = useState<WorkloadUploadSummary[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  const scenarioPresets: {
    type: WorkloadType;
    name: string;
    description: string;
    iconColor: string;
    defaultRps: number;
    defaultLatency: number;
    defaultError: number;
  }[] = [
    {
      type: 'STEADY_LOAD',
      name: 'Steady Equilibrium',
      description: 'Baseline Zipfian traffic distributed across catalog items.',
      iconColor: 'text-brand-emerald',
      defaultRps: 120,
      defaultLatency: 60,
      defaultError: 0.0,
    },
    {
      type: 'TRAFFIC_SPIKE',
      name: 'Sudden Hotspot Surge',
      description: 'Instant 10x-50x burst concentrated on 3 specific hot items.',
      iconColor: 'text-amber-400',
      defaultRps: 250,
      defaultLatency: 90,
      defaultError: 0.0,
    },
    {
      type: 'COLD_START',
      name: 'Cold Start Sweep',
      description: 'Empties cache and warms it with rapid multi-key lookups.',
      iconColor: 'text-orange-400',
      defaultRps: 150,
      defaultLatency: 75,
      defaultError: 0.0,
    },
    {
      type: 'POPULARITY_SHIFT',
      name: 'Popularity Drift',
      description: 'Concept drift shifting the active hot key cluster over time.',
      iconColor: 'text-amber-300',
      defaultRps: 140,
      defaultLatency: 70,
      defaultError: 0.0,
    },
    {
      type: 'BACKEND_DEGRADATION',
      name: 'Backend Degradation & Faults',
      description: 'High DB query latency + 35% error rate to test Circuit Breaker.',
      iconColor: 'text-brand-rose',
      defaultRps: 180,
      defaultLatency: 420,
      defaultError: 0.35,
    },
    {
      type: 'COMPUTE_HEAVY',
      name: 'Compute-Heavy Recompute',
      description: 'Complex aggregation queries with high CPU cost & long query time.',
      iconColor: 'text-orange-400',
      defaultRps: 90,
      defaultLatency: 320,
      defaultError: 0.0,
    },
    {
      type: 'READ_HEAVY',
      name: 'Read-Heavy Catalog (98%)',
      description: 'Heavy repeat read volume on top 20% cached assets.',
      iconColor: 'text-emerald-400',
      defaultRps: 220,
      defaultLatency: 45,
      defaultError: 0.0,
    },
    {
      type: 'WRITE_HEAVY',
      name: 'Write & Invalidation Churn',
      description: 'Frequent mutations forcing cache invalidation & eviction cycles.',
      iconColor: 'text-rose-400',
      defaultRps: 110,
      defaultLatency: 110,
      defaultError: 0.05,
    },
  ];

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const runs = await apiClient.getWorkloadRuns();
      if (Array.isArray(runs)) {
        setHistoricalRuns(runs);
      }
    } catch (err: any) {
      console.warn('Failed to load workload history:', err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'UPLOAD') {
      fetchHistory();
    }
  }, [activeTab]);

  const handleSelectPreset = (preset: typeof scenarioPresets[0]) => {
    setSelectedType(preset.type);
    setRps(preset.defaultRps);
    setBackendLatencyMs(preset.defaultLatency);
    setBackendErrorRate(preset.defaultError);
  };

  const handleStartTest = async () => {
    setIsStarting(true);
    try {
      const config: WorkloadConfig = {
        type: selectedType,
        requestsPerSecond: rps,
        durationSeconds: duration,
        objectCount,
        trafficMultiplier: multiplier,
        backendLatencyMs,
        backendErrorRate,
        cacheCapacityMb,
      };
      await apiClient.startWorkload(config);
      await checkWorkloadStatus();
    } catch (err: any) {
      alert(`Error starting workload: ${err.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopTest = async () => {
    try {
      await apiClient.stopWorkload();
      await checkWorkloadStatus();
    } catch (err: any) {
      alert(`Error stopping workload: ${err.message}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setServerError(null);
      setUploadResult(null);
      setUploadProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
      setServerError(null);
      setUploadResult(null);
      setUploadProgress(0);
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      setServerError('Please select a CSV or JSON workload file to upload.');
      return;
    }

    setIsUploading(true);
    setServerError(null);
    setUploadResult(null);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const result = await apiClient.uploadWorkload(formData, (percent) => {
        setUploadProgress(Math.max(10, Math.min(95, percent)));
      });

      setUploadProgress(100);
      setUploadResult(result);
      if (result.validation_errors && result.validation_errors.length > 0) {
        setShowValidationErrors(true);
      }
      // Refresh historical runs
      await fetchHistory();
    } catch (err: any) {
      setServerError(err.message || 'Server error occurred during workload ingestion.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteRun = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete workload trace "${id}" from database?`)) {
      await apiClient.deleteWorkloadRun(id);
      await fetchHistory();
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-amber-400" />
            Traffic Lab & Workload Controller
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Ingest real CSV/JSON request traces and execute live traffic scenarios against AdaptiveCache
          </p>
        </div>

        {/* Tab Selector & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex bg-dark-900 border border-dark-750 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('GENERATOR')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                activeTab === 'GENERATOR'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Traffic Generator
            </button>
            <button
              onClick={() => setActiveTab('UPLOAD')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                activeTab === 'UPLOAD'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              Upload Workload
            </button>
          </div>

          {activeTab === 'GENERATOR' && (
            <div>
              {isWorkloadRunning ? (
                <button
                  onClick={handleStopTest}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-rose hover:bg-rose-600 text-white font-bold text-xs font-mono rounded-xl shadow-lg shadow-brand-rose/20 transition-all cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-white" />
                  STOP WORKLOAD
                </button>
              ) : (
                <button
                  onClick={handleStartTest}
                  disabled={isStarting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold text-xs font-mono rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-stone-950" />
                  {isStarting ? 'STARTING...' : 'START TEST'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: WORKLOAD UPLOAD & INGESTION                                        */}
      {/* ========================================================================= */}
      {activeTab === 'UPLOAD' && (
        <div className="space-y-6">
          {/* Upload Drop Zone & Information */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upload Box */}
            <div className="lg:col-span-2 bg-dark-900 border border-dark-750 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-dark-750">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                    Ingest Workload Trace (CSV / JSON)
                  </span>
                </div>
                <span className="text-[10px] font-mono text-stone-400">Max 50MB</span>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : 'border-dark-700 hover:border-amber-500/30 hover:bg-dark-850'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="flex flex-col items-center space-y-2">
                    {selectedFile.name.endsWith('.json') ? (
                      <FileCode className="w-10 h-10 text-amber-400" />
                    ) : (
                      <FileSpreadsheet className="w-10 h-10 text-emerald-400" />
                    )}
                    <span className="text-sm font-bold text-stone-100">{selectedFile.name}</span>
                    <span className="text-xs font-mono text-stone-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB &bull;{' '}
                      {selectedFile.name.endsWith('.json') ? 'JSON Array' : 'CSV Trace'}
                    </span>
                    <span className="text-[11px] text-amber-400 mt-2">Click or drag another file to replace</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-2">
                    <UploadCloud className="w-10 h-10 text-stone-500" />
                    <span className="text-xs font-bold text-stone-300">
                      Drop CSV or JSON workload file here, or browse
                    </span>
                    <p className="text-[11px] text-stone-500 max-w-md leading-relaxed">
                      Accepts request logs containing <code className="text-amber-400 font-mono">timestamp</code>,{' '}
                      <code className="text-amber-400 font-mono">request_id</code>,{' '}
                      <code className="text-amber-400 font-mono">object_id</code>,{' '}
                      <code className="text-amber-400 font-mono">operation</code>,{' '}
                      <code className="text-amber-400 font-mono">response_size</code>,{' '}
                      <code className="text-amber-400 font-mono">backend_latency</code>,{' '}
                      <code className="text-amber-400 font-mono">regeneration_cost</code>,{' '}
                      <code className="text-amber-400 font-mono">status_code</code>.
                    </p>
                  </div>
                )}
              </div>

              {/* Upload Progress Bar */}
              {isUploading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-stone-400">Parsing and validating schema...</span>
                    <span className="text-amber-400 font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-dark-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-amber-400 h-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Server / Network Error Alert */}
              {serverError && (
                <div className="p-3.5 bg-brand-rose/10 border border-brand-rose/30 rounded-xl flex items-start gap-3 text-xs text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-brand-rose shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold">Ingestion Error:</span> {serverError}
                  </div>
                </div>
              )}

              {/* Upload Action Button */}
              <div className="flex justify-end gap-3 pt-2">
                {selectedFile && (
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setUploadResult(null);
                      setServerError(null);
                    }}
                    className="px-4 py-2 bg-dark-800 hover:bg-dark-750 text-stone-400 text-xs font-mono rounded-xl cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={handleUploadSubmit}
                  disabled={!selectedFile || isUploading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-stone-950 font-extrabold text-xs font-mono rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 fill-stone-950" />
                  {isUploading ? 'INGESTING & VALIDATING...' : 'INGEST WORKLOAD'}
                </button>
              </div>
            </div>

            {/* Ingestion Guidelines / Field Specs */}
            <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-dark-750">
                <Info className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                  Required Trace Schema
                </span>
              </div>

              <div className="space-y-2 text-[11px] text-stone-400 font-mono">
                <div className="p-2 bg-dark-800 rounded-lg border border-dark-750">
                  <span className="text-amber-400 font-bold">timestamp</span>: ISO string or epoch ms
                </div>
                <div className="p-2 bg-dark-800 rounded-lg border border-dark-750">
                  <span className="text-amber-400 font-bold">request_id</span>: Unique request identifier
                </div>
                <div className="p-2 bg-dark-800 rounded-lg border border-dark-750">
                  <span className="text-amber-400 font-bold">object_id</span>: Target object / resource key
                </div>
                <div className="p-2 bg-dark-800 rounded-lg border border-dark-750">
                  <span className="text-amber-400 font-bold">operation</span>: GET | SET | INVALIDATE
                </div>
                <div className="p-2 bg-dark-800 rounded-lg border border-dark-750">
                  <span className="text-amber-400 font-bold">response_size</span>: Payload size in bytes
                </div>
                <div className="p-2 bg-dark-800 rounded-lg border border-dark-750">
                  <span className="text-amber-400 font-bold">backend_latency</span>: Origin latency (ms)
                </div>
                <div className="p-2 bg-dark-800 rounded-lg border border-dark-750">
                  <span className="text-amber-400 font-bold">regeneration_cost</span>: Compute cost (ms)
                </div>
                <div className="p-2 bg-dark-800 rounded-lg border border-dark-750">
                  <span className="text-amber-400 font-bold">status_code</span>: HTTP status (100-599)
                </div>
              </div>
            </div>
          </div>

          {/* Upload Success Summary & Validation Report */}
          {uploadResult && (
            <div className="bg-dark-900 border border-dark-750 rounded-xl p-6 shadow-sm space-y-4 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-dark-750">
                <div className="flex items-center gap-2.5">
                  {uploadResult.status === 'VALIDATED' ? (
                    <CheckCircle2 className="w-5 h-5 text-brand-emerald" />
                  ) : (
                    <XCircle className="w-5 h-5 text-brand-rose" />
                  )}
                  <div>
                    <h3 className="text-sm font-bold text-stone-100">
                      Workload Ingestion Result: {uploadResult.filename}
                    </h3>
                    <span className="text-[10px] font-mono text-stone-400">
                      ID: {uploadResult.workload_id || uploadResult.workloadId} &bull; Uploaded at{' '}
                      {new Date(uploadResult.uploaded_at || uploadResult.uploadedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-xs font-mono font-bold px-3 py-1 rounded-lg border ${
                    uploadResult.status === 'VALIDATED'
                      ? 'text-brand-emerald bg-brand-emerald/10 border-brand-emerald/30'
                      : 'text-brand-rose bg-brand-rose/10 border-brand-rose/30'
                  }`}
                >
                  {uploadResult.status}
                </span>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 bg-dark-800 rounded-xl border border-dark-750">
                  <span className="text-[10px] font-mono uppercase text-stone-400">Total Rows</span>
                  <div className="text-lg font-bold font-mono text-stone-100 mt-0.5">
                    {uploadResult.total_rows ?? uploadResult.totalRows}
                  </div>
                </div>

                <div className="p-3 bg-dark-800 rounded-xl border border-dark-750">
                  <span className="text-[10px] font-mono uppercase text-stone-400">Valid Rows</span>
                  <div className="text-lg font-bold font-mono text-brand-emerald mt-0.5">
                    {uploadResult.valid_rows ?? uploadResult.validRows}
                  </div>
                </div>

                <div className="p-3 bg-dark-800 rounded-xl border border-dark-750">
                  <span className="text-[10px] font-mono uppercase text-stone-400">Rejected Rows</span>
                  <div className="text-lg font-bold font-mono text-brand-rose mt-0.5">
                    {uploadResult.rejected_rows ?? uploadResult.rejectedRows}
                  </div>
                </div>

                <div className="p-3 bg-dark-800 rounded-xl border border-dark-750">
                  <span className="text-[10px] font-mono uppercase text-stone-400">Unique Objects</span>
                  <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                    {uploadResult.unique_objects ?? uploadResult.uniqueObjects}
                  </div>
                </div>

                <div className="p-3 bg-dark-800 rounded-xl border border-dark-750">
                  <span className="text-[10px] font-mono uppercase text-stone-400">Trace Span</span>
                  <div className="text-lg font-bold font-mono text-orange-400 mt-0.5">
                    {(uploadResult.time_range ?? uploadResult.timeRange)?.durationSeconds || 0}s
                  </div>
                </div>
              </div>

              {/* Validation Errors Breakdown */}
              {uploadResult.validation_errors && uploadResult.validation_errors.length > 0 && (
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => setShowValidationErrors(!showValidationErrors)}
                    className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    {showValidationErrors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Validation Warnings ({uploadResult.validation_errors.length} rejected rows)
                  </button>

                  {showValidationErrors && (
                    <div className="max-h-56 overflow-y-auto bg-dark-800 border border-dark-750 rounded-xl p-3 space-y-1.5 font-mono text-xs">
                      {uploadResult.validation_errors.map((err, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-rose-300 py-1 border-b border-dark-750/50">
                          <AlertCircle className="w-3.5 h-3.5 text-brand-rose shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-stone-200">Row {err.row}:</span> {err.error}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="text-[11px] text-stone-400 italic pt-1">
                * Workload trace successfully saved to database. Benchmark metrics will be calculated only upon execution.
              </div>
            </div>
          )}

          {/* Historical Uploaded Workloads Table */}
          <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-dark-750">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                  Historical Workload Traces ({historicalRuns.length})
                </span>
              </div>
              <button
                onClick={fetchHistory}
                disabled={isLoadingHistory}
                className="flex items-center gap-1 text-[11px] font-mono text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {historicalRuns.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                <FileCode className="w-10 h-10 text-stone-600" />
                <span className="text-xs font-bold text-stone-400">No custom workloads uploaded yet</span>
                <p className="text-[11px] text-stone-500 max-w-sm">
                  Upload a CSV or JSON request trace above to store and replay realistic customer access patterns.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-dark-750 text-stone-400 text-[10px] uppercase">
                      <th className="pb-2.5 font-semibold">Workload ID</th>
                      <th className="pb-2.5 font-semibold">Filename</th>
                      <th className="pb-2.5 font-semibold">Format</th>
                      <th className="pb-2.5 font-semibold">Valid Rows</th>
                      <th className="pb-2.5 font-semibold">Unique Keys</th>
                      <th className="pb-2.5 font-semibold">Duration</th>
                      <th className="pb-2.5 font-semibold">Status</th>
                      <th className="pb-2.5 font-semibold">Uploaded</th>
                      <th className="pb-2.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-750">
                    {historicalRuns.map((run) => (
                      <tr key={run.workload_id || run.workloadId} className="hover:bg-dark-850/50 transition-colors">
                        <td className="py-3 text-amber-400 font-bold">
                          {run.workload_id || run.workloadId}
                        </td>
                        <td className="py-3 text-stone-100 font-sans font-medium">{run.filename}</td>
                        <td className="py-3">
                          <span className="text-[10px] bg-dark-800 px-2 py-0.5 rounded border border-dark-700 text-stone-300">
                            {run.file_type || run.fileType}
                          </span>
                        </td>
                        <td className="py-3 text-brand-emerald">
                          {run.valid_rows ?? run.validRows}
                          {(run.rejected_rows ?? run.rejectedRows ?? 0) > 0 && (
                            <span className="text-rose-400 text-[10px] ml-1">
                              (+{run.rejected_rows ?? run.rejectedRows} rej)
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-stone-300">{run.unique_objects ?? run.uniqueObjects}</td>
                        <td className="py-3 text-orange-400">
                          {(run.time_range ?? run.timeRange)?.durationSeconds || 0}s
                        </td>
                        <td className="py-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              run.status === 'VALIDATED'
                                ? 'text-brand-emerald bg-brand-emerald/10 border-brand-emerald/20'
                                : 'text-brand-rose bg-brand-rose/10 border-brand-rose/20'
                            }`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="py-3 text-stone-400 text-[11px]">
                          {new Date(run.uploaded_at || run.uploadedAt).toLocaleString()}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={(e) => handleDeleteRun(run.workload_id || run.workloadId, e)}
                            className="p-1.5 hover:bg-rose-500/10 hover:text-brand-rose text-stone-500 rounded-lg transition-colors cursor-pointer"
                            title="Delete trace"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SYNTHETIC WORKLOAD GENERATOR                                      */}
      {/* ========================================================================= */}
      {activeTab === 'GENERATOR' && (
        <div className="space-y-6">
          {/* Preset Scenario Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {scenarioPresets.map((preset) => {
              const isSelected = selectedType === preset.type;
              return (
                <div
                  key={preset.type}
                  onClick={() => !isWorkloadRunning && handleSelectPreset(preset)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-dark-800 border-amber-500 shadow-md shadow-amber-500/10'
                      : 'bg-dark-900 border-dark-750 hover:border-dark-700'
                  } ${isWorkloadRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-stone-100">{preset.name}</span>
                    <span className={`text-[10px] font-mono font-bold ${preset.iconColor}`}>
                      {preset.defaultRps} RPS
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed">
                    {preset.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Interactive Controls & Real-Time Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 1 Col: Sliders Control Panel */}
            <div className="bg-dark-900 border border-dark-750 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-dark-750">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                    Workload Parameters
                  </span>
                </div>
              </div>

              <div className="space-y-3.5 text-xs font-mono">
                {/* RPS */}
                <div>
                  <div className="flex justify-between text-stone-300 mb-1">
                    <span>Target Request Rate:</span>
                    <span className="text-amber-400 font-bold">{rps} RPS</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="400"
                    step="10"
                    value={rps}
                    disabled={isWorkloadRunning}
                    onChange={(e) => setRps(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 bg-dark-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Multiplier */}
                <div>
                  <div className="flex justify-between text-stone-300 mb-1">
                    <span>Traffic Multiplier:</span>
                    <span className="text-orange-400 font-bold">{multiplier.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="4.0"
                    step="0.5"
                    value={multiplier}
                    disabled={isWorkloadRunning}
                    onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                    className="w-full accent-orange-500 bg-dark-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Object Count */}
                <div>
                  <div className="flex justify-between text-stone-300 mb-1">
                    <span>Catalog Objects:</span>
                    <span className="text-stone-100 font-bold">{objectCount} items</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="300"
                    step="10"
                    value={objectCount}
                    disabled={isWorkloadRunning}
                    onChange={(e) => setObjectCount(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-400 bg-dark-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Cache Capacity */}
                <div>
                  <div className="flex justify-between text-stone-300 mb-1">
                    <span>Cache Capacity:</span>
                    <span className="text-brand-emerald font-bold">{cacheCapacityMb} MB</span>
                  </div>
                  <input
                    type="range"
                    min="16"
                    max="256"
                    step="16"
                    value={cacheCapacityMb}
                    disabled={isWorkloadRunning}
                    onChange={(e) => setCacheCapacityMb(parseInt(e.target.value, 10))}
                    className="w-full accent-brand-emerald bg-dark-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Backend Latency */}
                <div>
                  <div className="flex justify-between text-stone-300 mb-1">
                    <span>Simulated DB Latency:</span>
                    <span className="text-amber-400 font-bold">{backendLatencyMs} ms</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="10"
                    value={backendLatencyMs}
                    disabled={isWorkloadRunning}
                    onChange={(e) => setBackendLatencyMs(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 bg-dark-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Backend Error Rate */}
                <div>
                  <div className="flex justify-between text-stone-300 mb-1">
                    <span>Simulated Error Rate:</span>
                    <span className="text-brand-rose font-bold">{(backendErrorRate * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.05"
                    value={backendErrorRate}
                    disabled={isWorkloadRunning}
                    onChange={(e) => setBackendErrorRate(parseFloat(e.target.value))}
                    className="w-full accent-brand-rose bg-dark-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Duration */}
                <div>
                  <div className="flex justify-between text-stone-300 mb-1">
                    <span>Test Duration:</span>
                    <span className="text-stone-100 font-bold">{duration} seconds</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="120"
                    step="5"
                    value={duration}
                    disabled={isWorkloadRunning}
                    onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                    className="w-full accent-stone-200 bg-dark-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Right 2 Cols: Live Execution Telemetry Stream */}
            <div className="lg:col-span-2 space-y-4">
              {/* Real-time Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-dark-900 border border-dark-750 rounded-xl p-3">
                  <span className="text-[10px] font-mono text-stone-400 uppercase">Live RPS</span>
                  <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                    {telemetry?.requestsPerSecond ?? 0}
                  </div>
                </div>

                <div className="bg-dark-900 border border-dark-750 rounded-xl p-3">
                  <span className="text-[10px] font-mono text-stone-400 uppercase">Cache Hit Rate</span>
                  <div className="text-xl font-bold font-mono text-brand-emerald mt-1">
                    {telemetry ? `${(telemetry.cacheHitRate * 100).toFixed(1)}%` : '0%'}
                  </div>
                </div>

                <div className="bg-dark-900 border border-dark-750 rounded-xl p-3">
                  <span className="text-[10px] font-mono text-stone-400 uppercase">Backend Miss Load</span>
                  <div className="text-xl font-bold font-mono text-orange-400 mt-1">
                    {telemetry ? `${(telemetry.backendLoadRatio * 100).toFixed(1)}%` : '0%'}
                  </div>
                </div>

                <div className="bg-dark-900 border border-dark-750 rounded-xl p-3">
                  <span className="text-[10px] font-mono text-stone-400 uppercase">Circuit Breaker</span>
                  <div className={`text-sm font-bold font-mono mt-1 ${
                    telemetry?.circuitBreakerState === 'CLOSED' ? 'text-brand-emerald' : 'text-amber-400'
                  }`}>
                    {telemetry?.circuitBreakerState || 'CLOSED'}
                  </div>
                </div>
              </div>

              {/* Real-time Traffic Graph */}
              <div className="bg-dark-900 border border-dark-750 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-200">
                    Live Traffic Stream (RPS & Average Latency)
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                    Real Request Dispatch
                  </span>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#26221f" />
                      <XAxis dataKey="time" stroke="#78716c" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#78716c" tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#141210', borderColor: '#332c27', borderRadius: '8px', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Line type="monotone" dataKey="rps" name="Incoming RPS" stroke="#FBBF24" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="avgLatency" name="Average Latency (ms)" stroke="#EA580C" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

