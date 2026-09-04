/**
 * Main UI Controller
 * Binds DOM controls, event handlers, tab routing, drawer inspector, user data uploads, and chart updates.
 * Connected directly to Python FastAPI backend.
 */

import { globalEventBus } from '../core/event-bus.js';
import { ChartManager } from './charts.js';
import { PipelineVisualizer } from './pipeline-visualizer.js';
import { DecisionFeed } from './decision-feed.js';
import { ViewRenderers } from './views.js';
import { DemoController } from './demo-controller.js';
import { DigitalTwinBenchmark } from '../benchmark/digital-twin.js';
import { BackendClient } from '../api/backend-client.js';
import { WORKLOAD_TYPES, TRAFFIC_SCENARIOS } from '../core/types.js';

export class UIController {
  constructor(simulationEngine) {
    this.sim = simulationEngine;
    this.api = new BackendClient();
    this.activeTab = 'overview';
    this.selectedObjectId = null;
    this.objectsFilter = 'all';
    this.objectsSearch = '';

    this.chartManager = new ChartManager();
    this.pipelineVisualizer = new PipelineVisualizer();
    this.decisionFeed = new DecisionFeed();
    this.renderers = new ViewRenderers(this);
    this.benchmarkEngine = new DigitalTwinBenchmark();
    this.demoController = new DemoController(this.sim, this);

    this.initCharts();
    this.bindEvents();
    this.bindDOMControls();
    this.bindUserDataControls();
  }

  initCharts() {
    // 1. Traffic Chart
    this.chartManager.register('chart-traffic', {
      title: 'Traffic Throughput',
      unit: ' RPS',
      series: [{ key: 'trafficRps', label: 'Traffic', color: '#0284c7', fill: true, fillColor: 'rgba(2,132,199,0.08)' }]
    });

    // 2. Hit Rate Chart
    this.chartManager.register('chart-hit-rate', {
      title: 'Cache Hit Rate',
      unit: '%',
      yMin: 0,
      yMax: 100,
      series: [{ key: 'hitRatePercent', label: 'Hit Rate', color: '#10b981', fill: true, fillColor: 'rgba(16,185,129,0.08)' }]
    });

    // 3. Latency Percentiles Chart (P50, P95, P99)
    this.chartManager.register('chart-latency', {
      title: 'Latency Percentiles',
      unit: 'ms',
      series: [
        { key: 'p99LatencyMs', label: 'P99', color: '#ef4444', lineWidth: 2 },
        { key: 'p95LatencyMs', label: 'P95', color: '#f59e0b', lineWidth: 1.5 },
        { key: 'p50LatencyMs', label: 'P50', color: '#38bdf8', lineWidth: 1.5 }
      ]
    });

    // 4. Infrastructure Cost Chart
    this.chartManager.register('chart-cost', {
      title: 'Simulated Infrastructure Cost',
      unit: '$/hr',
      series: [
        { key: 'costPerHour', label: 'Current Cost', color: '#8b5cf6', fill: true, fillColor: 'rgba(139,92,246,0.08)' }
      ]
    });

    // 5. Backend & DB CPU Chart (Live Sim Tab)
    this.chartManager.register('chart-backend-db', {
      title: 'Backend Load & Database CPU',
      unit: '%',
      yMin: 0,
      yMax: 100,
      series: [
        { key: 'dbCpuPercent', label: 'DB CPU', color: '#ef4444', lineWidth: 2 },
        { key: 'backendLoadPercent', label: 'Backend Thread Load', color: '#f59e0b', lineWidth: 2 }
      ]
    });

    // 6. Cache Memory Occupancy Chart (Live Sim Tab)
    this.chartManager.register('chart-memory-occupancy', {
      title: 'Cache Memory Footprint',
      unit: 'MB',
      series: [
        { key: 'memoryUsedMB', label: 'Memory Used', color: '#0284c7', fill: true, fillColor: 'rgba(2,132,199,0.1)' }
      ]
    });

    window.addEventListener('resize', () => {
      this.chartManager.resizeAll();
    });
  }

  bindEvents() {
    // 1. WebSocket Live Stream from FastAPI Backend
    this.api.on('simulation_tick', data => {
      const { snapshot, events, objects } = data;
      if (!snapshot) return;

      // Update Header & Top Ribbon
      this.renderers.renderTelemetryRibbon(snapshot);

      // Update Pipeline Visualizer
      this.pipelineVisualizer.update(snapshot, snapshot.scalingDecision);

      // Update Charts with history
      if (this.sim.metricsEngine) {
        this.sim.metricsEngine.recordSnapshot(snapshot);
        const historyData = this.sim.metricsEngine.getRollingHistory();
        this.chartManager.updateAll(historyData);
      }

      // Update Decision Feed
      if (events && events.length > 0) {
        for (let i = events.length - 1; i >= 0; i--) {
          const ev = events[i];
          globalEventBus.emit('decision_feed_event', ev);
        }
      }

      // Update Active Tab Content
      if (this.activeTab === 'objects') {
        this.renderers.renderObjectsTable(this.sim.smartCache, this.objectsFilter, this.objectsSearch);
      } else if (this.activeTab === 'battle') {
        this.renderers.renderStrategyBattleTable(this.sim.smartCache, this.sim.lruCache, this.sim.lfuCache, this.sim.gdsCache);
      } else if (this.activeTab === 'timemachine') {
        this.renderers.renderTimeMachine(this.sim.historyRecorder);
      }

      // Update Cost & Scaling Tab Elements
      this.updateCostAndScalingTab(snapshot, snapshot.scalingDecision || {});

      // Update DB Tab Elements
      this.updateDatabaseTab(snapshot);

      // Update Pollution Defense Tab Elements
      this.updatePollutionTab(snapshot);
    });

    this.api.on('connection_status', ({ connected, mode }) => {
      const dot = document.getElementById('header-status-dot');
      const text = document.getElementById('header-status-text');
      if (dot && text) {
        if (connected) {
          dot.className = 'status-dot';
          text.textContent = 'FASTAPI BACKEND: CONNECTED';
        } else {
          dot.className = 'status-dot paused';
          text.textContent = 'CONNECTING TO FASTAPI...';
        }
      }
    });

    // Local event bus for fallback
    globalEventBus.on('simulation_tick', data => {
      if (!this.api.isConnected) {
        const { snapshot, smartCache, lruCache, lfuCache, gdsCache, scalingResult, pollutionStatus } = data;
        this.renderers.renderTelemetryRibbon(snapshot);
        this.pipelineVisualizer.update(snapshot, scalingResult);
        const historyData = this.sim.metricsEngine.getRollingHistory();
        this.chartManager.updateAll(historyData);

        if (this.activeTab === 'objects') {
          this.renderers.renderObjectsTable(smartCache, this.objectsFilter, this.objectsSearch);
        } else if (this.activeTab === 'battle') {
          this.renderers.renderStrategyBattleTable(smartCache, lruCache, lfuCache, gdsCache);
        } else if (this.activeTab === 'timemachine') {
          this.renderers.renderTimeMachine(this.sim.historyRecorder);
        }

        this.updateCostAndScalingTab(snapshot, scalingResult);
        this.updateDatabaseTab(snapshot);
        this.updatePollutionTab(snapshot);
      }
    });

    globalEventBus.on('simulation_status', ({ isRunning }) => {
      const playBtn = document.getElementById('btn-play-pause');
      if (playBtn) {
        playBtn.innerHTML = isRunning ? '❚❚ Pause' : '▶ Start';
      }
    });
  }

  bindDOMControls() {
    // 1. Sidebar Navigation
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // 2. Play/Pause & Reset Controls
    const playBtn = document.getElementById('btn-play-pause');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (this.sim.isRunning) {
          this.sim.pause();
          this.api.pauseWorkload();
        } else {
          this.sim.start();
          this.api.startWorkload();
        }
      });
    }

    const resetBtn = document.getElementById('btn-sim-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.sim.reset();
        this.api.resetSimulation();
      });
    }

    const stepBtn = document.getElementById('btn-sim-step');
    if (stepBtn) {
      stepBtn.addEventListener('click', () => {
        this.sim.step();
        this.api.stepWorkload();
      });
    }

    // 3. Workload Selector
    document.querySelectorAll('.workload-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.workload-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const workload = btn.dataset.workload;
        this.sim.setWorkloadType(workload);
        this.api.setWorkloadType(workload);
      });
    });

    // 4. Scenario Buttons
    document.querySelectorAll('.scenario-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const scenario = btn.dataset.scenario;
        this.sim.setScenario(scenario);
        this.api.setScenario(scenario);
      });
    });

    // 5. Traffic RPS Slider
    const rpsSlider = document.getElementById('slider-rps');
    const rpsVal = document.getElementById('slider-rps-val');
    if (rpsSlider && rpsVal) {
      rpsSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        rpsVal.textContent = `${val} req/s`;
        this.sim.setBaseRps(val);
        this.api.setBaseRps(val);
      });
    }

    // 6. Speed Multipliers
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = Number(btn.dataset.speed) || 1;
        this.sim.setSpeedMultiplier(speed);
        this.api.setSpeedMultiplier(speed);
      });
    });

    // 7. Cache Capacity Selector
    const capSelect = document.getElementById('select-cache-capacity');
    if (capSelect) {
      capSelect.addEventListener('change', (e) => {
        const gb = Number(e.target.value);
        this.sim.setCapacity(gb * 1024 * 1024 * 1024);
        this.api.setCapacity(gb);
      });
    }

    // 8. Objects Search & Filter
    const objSearch = document.getElementById('objects-search-input');
    if (objSearch) {
      objSearch.addEventListener('input', (e) => {
        this.objectsSearch = e.target.value;
        this.renderers.renderObjectsTable(this.sim.smartCache, this.objectsFilter, this.objectsSearch);
      });
    }

    document.querySelectorAll('.objects-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.objects-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.objectsFilter = btn.dataset.filter;
        this.renderers.renderObjectsTable(this.sim.smartCache, this.objectsFilter, this.objectsSearch);
      });
    });

    // 9. Benchmark Run Button
    const runBenchBtn = document.getElementById('btn-run-benchmark');
    if (runBenchBtn) {
      runBenchBtn.addEventListener('click', () => {
        this.runDigitalTwinBenchmark();
      });
    }

    // 10. 5-Minute Demo Button
    const startDemoBtn = document.getElementById('btn-start-demo');
    if (startDemoBtn) {
      startDemoBtn.addEventListener('click', () => {
        this.demoController.startDemo();
      });
    }

    const demoNextBtn = document.getElementById('btn-demo-next');
    if (demoNextBtn) {
      demoNextBtn.addEventListener('click', () => {
        this.demoController.nextStep();
      });
    }

    const demoStopBtn = document.getElementById('btn-demo-stop');
    if (demoStopBtn) {
      demoStopBtn.addEventListener('click', () => {
        this.demoController.stopDemo();
      });
    }

    // 11. Scoring Weight Sliders (Decision Engine Tab)
    this.bindWeightSliders();
  }

  bindWeightSliders() {
    const weights = ['frequency', 'recency', 'popularity', 'retrievalCost', 'freshness', 'trend', 'reuseProbability', 'sizePenalty'];
    for (const key of weights) {
      const slider = document.getElementById(`slider-w-${key}`);
      const valLabel = document.getElementById(`val-w-${key}`);
      if (slider && valLabel) {
        slider.addEventListener('input', (e) => {
          const val = Number(e.target.value);
          valLabel.textContent = val.toFixed(2);
          const custom = {};
          custom[key] = val;
          this.sim.smartCache.scorer.setWeights(custom);
          this.api.setScoringWeights(custom, false);
          const autoSwitch = document.getElementById('toggle-auto-weights');
          if (autoSwitch) autoSwitch.checked = false;
        });
      }
    }

    const autoWeightsToggle = document.getElementById('toggle-auto-weights');
    if (autoWeightsToggle) {
      autoWeightsToggle.addEventListener('change', (e) => {
        this.sim.smartCache.scorer.setAutoAdapt(e.target.checked);
        this.api.setScoringWeights({}, e.target.checked);
        this.syncWeightSlidersFromScorer();
      });
    }
  }

  bindUserDataControls() {
    const dropzone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('file-input-upload');
    const submitBtn = document.getElementById('btn-submit-user-data');
    const textarea = document.getElementById('textarea-user-data');
    const statusBox = document.getElementById('user-data-status-box');
    const loadSampleCsvBtn = document.getElementById('btn-load-sample-csv');
    const loadSampleJsonBtn = document.getElementById('btn-load-sample-json');

    if (dropzone && fileInput) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleFileUpload(e.target.files[0]);
        }
      });
    }

    if (loadSampleCsvBtn && textarea) {
      loadSampleCsvBtn.addEventListener('click', () => {
        const sampleCsv = `id,name,category,sizeBytes,baseDbLatencyMs,recomputeCostUnits,updateVolatility
prod_custom_101,Custom Gaming Laptop,Electronics,131072,65.0,3.5,0.12
prod_custom_102,Noise-Cancelling Headphones,Audio,32768,45.0,1.8,0.25
prod_custom_103,4K Ultra HD Monitor,Displays,262144,110.0,4.2,0.08
prod_custom_104,Ergonomic Mechanical Keyboard,Accessories,16384,28.0,1.2,0.30
prod_custom_105,Smart Home Hub,IoT,24576,55.0,2.0,0.40`;
        textarea.value = sampleCsv;
      });
    }

    if (loadSampleJsonBtn && textarea) {
      loadSampleJsonBtn.addEventListener('click', () => {
        const sampleJson = `[
  {
    "id": "rec_custom_201",
    "name": "Transformer Attention Matrix",
    "category": "ML_INFERENCE",
    "sizeBytes": 2097152,
    "baseDbLatencyMs": 240.0,
    "recomputeCostUnits": 16.5,
    "updateVolatility": 0.15
  },
  {
    "id": "rec_custom_202",
    "name": "Graph Neural Node Embeddings",
    "category": "ML_INFERENCE",
    "sizeBytes": 4194304,
    "baseDbLatencyMs": 380.0,
    "recomputeCostUnits": 24.0,
    "updateVolatility": 0.10
  }
]`;
        textarea.value = sampleJson;
      });
    }

    if (submitBtn && textarea && statusBox) {
      submitBtn.addEventListener('click', async () => {
        const content = textarea.value.trim();
        if (!content) {
          statusBox.style.display = 'block';
          statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
          statusBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          statusBox.style.color = '#ef4444';
          statusBox.textContent = '❌ Please upload a file or paste CSV/JSON text above.';
          return;
        }

        const isJson = content.startsWith('[') || content.startsWith('{');
        const res = await this.api.uploadUserData(content, isJson);

        statusBox.style.display = 'block';
        if (res.success) {
          statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
          statusBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
          statusBox.style.color = '#10b981';
          statusBox.textContent = `✅ ${res.message} (${res.itemCount} items loaded into active pipeline).`;
          if (res.sampleItems) {
            this.renderers.renderUserDataPreview(res.sampleItems);
          }
        } else {
          statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
          statusBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          statusBox.style.color = '#ef4444';
          statusBox.textContent = `❌ Validation Error: ${res.detail || res.error || 'Failed to ingest dataset'}`;
        }
      });
    }
  }

  async handleFileUpload(file) {
    const statusBox = document.getElementById('user-data-status-box');
    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.style.background = 'rgba(56, 189, 248, 0.15)';
      statusBox.style.border = '1px solid rgba(56, 189, 248, 0.4)';
      statusBox.style.color = '#38bdf8';
      statusBox.textContent = `⏳ Uploading and validating ${file.name}...`;
    }

    const res = await this.api.uploadUserData(file, false);
    if (statusBox) {
      if (res.success) {
        statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
        statusBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
        statusBox.style.color = '#10b981';
        statusBox.textContent = `✅ ${res.message} (${res.itemCount} items loaded into active pipeline).`;
        if (res.sampleItems) {
          this.renderers.renderUserDataPreview(res.sampleItems);
        }
      } else {
        statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        statusBox.style.color = '#ef4444';
        statusBox.textContent = `❌ Validation Error: ${res.detail || res.error || 'Failed to ingest file'}`;
      }
    }
  }

  syncWeightSlidersFromScorer() {
    const W = this.sim.smartCache.scorer.weights;
    for (const [key, val] of Object.entries(W)) {
      const slider = document.getElementById(`slider-w-${key}`);
      const valLabel = document.getElementById(`val-w-${key}`);
      if (slider && valLabel) {
        slider.value = val;
        valLabel.textContent = Number(val).toFixed(2);
      }
    }
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${tabName}`);
    });

    // Render immediate content for the tab
    if (tabName === 'objects') {
      this.renderers.renderObjectsTable(this.sim.smartCache, this.objectsFilter, this.objectsSearch);
    } else if (tabName === 'battle') {
      this.renderers.renderStrategyBattleTable(this.sim.smartCache, this.sim.lruCache, this.sim.lfuCache, this.sim.gdsCache);
    } else if (tabName === 'benchmark') {
      this.runDigitalTwinBenchmark();
    } else if (tabName === 'timemachine') {
      this.renderers.renderTimeMachine(this.sim.historyRecorder);
    } else if (tabName === 'decision-engine') {
      this.syncWeightSlidersFromScorer();
    }

    // Force charts resize in new view
    setTimeout(() => {
      this.chartManager.resizeAll();
    }, 50);
  }

  openObjectDrawer(id) {
    this.selectedObjectId = id;
    const entry = this.sim.smartCache.entries.get(id);
    if (entry) {
      this.renderers.renderObjectDrawer(entry, this.sim.smartCache);
    }
  }

  closeObjectDrawer() {
    const drawer = document.getElementById('object-drawer-backdrop');
    if (drawer) drawer.classList.remove('active');
    this.selectedObjectId = null;
  }

  async runDigitalTwinBenchmark() {
    const scenarioSelect = document.getElementById('select-benchmark-scenario');
    const scenario = scenarioSelect ? scenarioSelect.value : 'STEADY';

    // Call backend API for benchmark
    const res = await this.api.runBenchmark({
      workloadType: this.sim.workloadGenerator.workloadType,
      scenario,
      requestCount: 1200,
      cacheCapacityGB: this.sim.cacheCapacityBytes / (1024 * 1024 * 1024)
    });

    if (res && res.success && res.data) {
      this.renderers.renderBenchmarkResults(res.data);
    } else {
      // Fallback
      const data = this.benchmarkEngine.runBenchmark({
        workloadType: this.sim.workloadGenerator.workloadType,
        scenario,
        requestCount: 1200,
        cacheCapacityBytes: this.sim.cacheCapacityBytes
      });
      this.renderers.renderBenchmarkResults(data);
    }
  }

  selectTimeMachineSnapshot(id) {
    this.renderers.renderTimeMachine(this.sim.historyRecorder, id);
  }

  updateCostAndScalingTab(snapshot, scalingResult) {
    const el = (id) => document.getElementById(id);
    if (!el('cost-tab-total')) return;

    el('cost-tab-total').textContent = `$${snapshot.costPerHour}/hr`;
    el('cost-tab-savings').textContent = `$${snapshot.costSavingsPerHour}/hr (${snapshot.savingsPercentage}%)`;
    el('cost-tab-uncached').textContent = `$${snapshot.uncachedCostPerHour}/hr`;
    el('cost-tab-cache-mem').textContent = `$${snapshot.cacheCostPerHour}/hr`;
    el('cost-tab-backend-comp').textContent = `$${snapshot.computeCostPerHour}/hr`;
    el('cost-tab-db-ops').textContent = `$${snapshot.dbCostPerHour}/hr`;

    // Scaling Evaluator Box
    if (el('scale-box-current-cap')) {
      el('scale-box-current-cap').textContent = `${scalingResult.currentGB || 2.0} GB`;
      el('scale-box-proposed-cap').textContent = `${scalingResult.proposedGB || 4.0} GB`;
      el('scale-box-add-cost').textContent = `+$${scalingResult.additionalCacheCostPerHour || 0.08}/hr`;
      el('scale-box-exp-saving').textContent = `+$${scalingResult.expectedBackendSavingPerHour || 0.21}/hr`;
      el('scale-box-net-benefit').textContent = `${(scalingResult.netBenefitPerHour || 0.13) >= 0 ? '+' : ''}$${scalingResult.netBenefitPerHour || 0.13}/hr`;
      
      const badge = el('scale-box-decision-badge');
      if (badge) {
        badge.className = `badge ${scalingResult.shouldScaleUp ? 'badge-retain' : (scalingResult.shouldScaleDown ? 'badge-info' : 'badge-neutral')}`;
        badge.textContent = scalingResult.badge || scalingResult.decision || 'MAINTAIN';
      }
      el('scale-box-reason').textContent = scalingResult.decisionReason || 'Optimal capacity.';
    }
  }

  updateDatabaseTab(snapshot) {
    const el = (id) => document.getElementById(id);
    if (!el('db-tab-cpu')) return;

    el('db-tab-cpu').textContent = `${snapshot.dbCpuPercent}%`;
    el('db-tab-latency').textContent = `${snapshot.dbLatencyMs} ms`;
    el('db-tab-connections').textContent = `${snapshot.dbConnections} / 100`;
    el('db-tab-qps').textContent = `${snapshot.dbQueriesPerSecond} QPS`;
    el('db-tab-backend-load').textContent = `${snapshot.backendLoadPercent}%`;
    el('db-tab-active-threads').textContent = `${snapshot.activeThreads} / 64`;
  }

  updatePollutionTab(snapshot) {
    const el = (id) => document.getElementById(id);
    if (!el('pollution-tab-risk')) return;

    const risk = snapshot.pollutionRisk || 'LOW';
    const riskBadge = el('pollution-tab-risk');
    riskBadge.textContent = risk;
    riskBadge.className = `badge ${risk === 'HIGH' ? 'badge-evict' : (risk === 'MEDIUM' ? 'badge-refresh' : 'badge-retain')}`;

    el('pollution-tab-unique-rate').textContent = `${snapshot.uniqueKeyRatePercent || 12}%`;
    el('pollution-tab-useful-occupancy').textContent = `${snapshot.usefulOccupancyPercent || 85}%`;
    el('pollution-tab-protected-count').textContent = `${snapshot.protectedItemsCount || 28} items`;
    el('pollution-tab-explanation').textContent = (risk === 'HIGH') 
      ? 'Unique key deluge active. High-value resident objects quarantined and shielded from eviction thrashing.'
      : 'Normal traffic access patterns. Useful cache occupancy is optimal.';
  }
}
