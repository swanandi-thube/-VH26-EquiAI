/**
 * Main UI Controller
 * Binds DOM controls, event handlers, tab routing, drawer inspector, and chart updates.
 */

import { globalEventBus } from '../core/event-bus.js';
import { ChartManager } from './charts.js';
import { PipelineVisualizer } from './pipeline-visualizer.js';
import { DecisionFeed } from './decision-feed.js';
import { ViewRenderers } from './views.js';
import { DemoController } from './demo-controller.js';
import { DigitalTwinBenchmark } from '../benchmark/digital-twin.js';
import { WORKLOAD_TYPES, TRAFFIC_SCENARIOS } from '../core/types.js';

export class UIController {
  constructor(simulationEngine) {
    this.sim = simulationEngine;
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
    globalEventBus.on('simulation_tick', data => {
      const { snapshot, smartCache, lruCache, lfuCache, gdsCache, scalingResult, pollutionStatus } = data;

      // Update Header & Top Ribbon
      this.renderers.renderTelemetryRibbon(snapshot);

      // Update Pipeline Visualizer
      this.pipelineVisualizer.update(snapshot, scalingResult);

      // Update Charts
      const historyData = this.sim.metricsEngine.getRollingHistory();
      this.chartManager.updateAll(historyData);

      // Update Active Tab Content
      if (this.activeTab === 'objects') {
        this.renderers.renderObjectsTable(smartCache, this.objectsFilter, this.objectsSearch);
      } else if (this.activeTab === 'battle') {
        this.renderers.renderStrategyBattleTable(smartCache, lruCache, lfuCache, gdsCache);
      } else if (this.activeTab === 'timemachine') {
        this.renderers.renderTimeMachine(this.sim.historyRecorder);
      }

      // Update Cost & Scaling Tab Elements
      this.updateCostAndScalingTab(snapshot, scalingResult);

      // Update DB Tab Elements
      this.updateDatabaseTab(snapshot);

      // Update Pollution Defense Tab Elements
      this.updatePollutionTab(pollutionStatus, snapshot);
    });

    globalEventBus.on('simulation_status', ({ isRunning }) => {
      const dot = document.getElementById('header-status-dot');
      const text = document.getElementById('header-status-text');
      const playBtn = document.getElementById('btn-play-pause');
      if (dot && text && playBtn) {
        if (isRunning) {
          dot.className = 'status-dot';
          text.textContent = 'SIMULATION RUNNING';
          playBtn.innerHTML = '❚❚ Pause';
        } else {
          dot.className = 'status-dot paused';
          text.textContent = 'SIMULATION PAUSED';
          playBtn.innerHTML = '▶ Start';
        }
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
        } else {
          this.sim.start();
        }
      });
    }

    const resetBtn = document.getElementById('btn-sim-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.sim.reset();
      });
    }

    const stepBtn = document.getElementById('btn-sim-step');
    if (stepBtn) {
      stepBtn.addEventListener('click', () => {
        this.sim.step();
      });
    }

    // 3. Workload Selector
    document.querySelectorAll('.workload-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.workload-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const workload = btn.dataset.workload;
        this.sim.setWorkloadType(workload);
      });
    });

    // 4. Scenario Buttons
    document.querySelectorAll('.scenario-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const scenario = btn.dataset.scenario;
        this.sim.setScenario(scenario);
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
      });
    }

    // 6. Speed Multipliers
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = Number(btn.dataset.speed) || 1;
        this.sim.setSpeedMultiplier(speed);
      });
    });

    // 7. Cache Capacity Selector
    const capSelect = document.getElementById('select-cache-capacity');
    if (capSelect) {
      capSelect.addEventListener('change', (e) => {
        const gb = Number(e.target.value);
        this.sim.setCapacity(gb * 1024 * 1024 * 1024);
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
          const autoSwitch = document.getElementById('toggle-auto-weights');
          if (autoSwitch) autoSwitch.checked = false;
        });
      }
    }

    const autoWeightsToggle = document.getElementById('toggle-auto-weights');
    if (autoWeightsToggle) {
      autoWeightsToggle.addEventListener('change', (e) => {
        this.sim.smartCache.scorer.setAutoAdapt(e.target.checked);
        this.syncWeightSlidersFromScorer();
      });
    }
  }

  syncWeightSlidersFromScorer() {
    const W = this.sim.smartCache.scorer.weights;
    for (const [key, val] of Object.entries(W)) {
      const slider = document.getElementById(`slider-w-${key}`);
      const valLabel = document.getElementById(`val-w-${key}`);
      if (slider && valLabel) {
        slider.value = val;
        valLabel.textContent = val.toFixed(2);
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

  runDigitalTwinBenchmark() {
    const scenarioSelect = document.getElementById('select-benchmark-scenario');
    const scenario = scenarioSelect ? scenarioSelect.value : 'STEADY';
    const data = this.benchmarkEngine.runBenchmark({
      workloadType: this.sim.workloadGenerator.workloadType,
      scenario,
      requestCount: 1200,
      cacheCapacityBytes: this.sim.cacheCapacityBytes
    });
    this.renderers.renderBenchmarkResults(data);
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
      el('scale-box-current-cap').textContent = `${scalingResult.currentGB} GB`;
      el('scale-box-proposed-cap').textContent = `${scalingResult.proposedGB} GB`;
      el('scale-box-add-cost').textContent = `+$${scalingResult.additionalCacheCostPerHour}/hr`;
      el('scale-box-exp-saving').textContent = `+$${scalingResult.expectedBackendSavingPerHour}/hr`;
      el('scale-box-net-benefit').textContent = `${scalingResult.netBenefitPerHour >= 0 ? '+' : ''}$${scalingResult.netBenefitPerHour}/hr`;
      
      const badge = el('scale-box-decision-badge');
      if (badge) {
        badge.className = `badge ${scalingResult.shouldScale ? 'badge-retain' : 'badge-evict'}`;
        badge.textContent = scalingResult.decision;
      }
      el('scale-box-reason').textContent = scalingResult.decisionReason;
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

  updatePollutionTab(pollutionStatus, snapshot) {
    const el = (id) => document.getElementById(id);
    if (!el('pollution-tab-risk')) return;

    const riskBadge = el('pollution-tab-risk');
    riskBadge.textContent = pollutionStatus.riskLevel;
    riskBadge.className = `badge ${pollutionStatus.riskLevel === 'HIGH' ? 'badge-evict' : (pollutionStatus.riskLevel === 'MEDIUM' ? 'badge-refresh' : 'badge-retain')}`;

    el('pollution-tab-unique-rate').textContent = `${pollutionStatus.uniqueKeyRatePercent}%`;
    el('pollution-tab-useful-occupancy').textContent = `${pollutionStatus.usefulOccupancyPercent}%`;
    el('pollution-tab-protected-count').textContent = `${pollutionStatus.protectedCount} items`;
    el('pollution-tab-explanation').textContent = pollutionStatus.explanation;
  }
}
