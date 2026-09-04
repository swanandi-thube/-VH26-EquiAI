/**
 * Automated 5-Minute Technical Demo Controller
 * Guides judges through Cold Start, Steady Load, Popularity Spike, Pollution Defense, Scaling ROI, and Digital Twin.
 */

import { TRAFFIC_SCENARIOS, WORKLOAD_TYPES } from '../core/types.js';

export class DemoController {
  constructor(simulationEngine, uiController) {
    this.sim = simulationEngine;
    this.ui = uiController;
    this.isActive = false;
    this.currentStepIdx = 0;
    this.stepTimer = null;

    this.steps = [
      {
        title: 'Step 1/6: Cold Start & Cache Warming',
        durationSec: 25,
        narrative: 'Initiating Cold Start with empty cache. Notice 100% initial miss rate driving high DB CPU (~75%) and elevated latency before the cache warms.',
        action: () => {
          this.ui.switchTab('overview');
          this.sim.setScenario(TRAFFIC_SCENARIOS.COLD_START);
          this.sim.setBaseRps(250);
        }
      },
      {
        title: 'Step 2/6: Steady-State Multi-Factor Scoring',
        durationSec: 30,
        narrative: 'Cache reaches steady equilibrium. Multi-factor scoring evaluates Frequency, Recency, Retrieval Cost, and Object Size rather than naive recency alone.',
        action: () => {
          this.ui.switchTab('decision-engine');
          this.sim.setScenario(TRAFFIC_SCENARIOS.STEADY);
          this.sim.setBaseRps(350);
        }
      },
      {
        title: 'Step 3/6: Sudden Popularity Spike & Dynamic TTL',
        durationSec: 30,
        narrative: 'Triggering sudden 45x traffic spike on hot item. Score increases instantly and Dynamic TTL extends (60s -> 220s) to protect the hot item.',
        action: () => {
          this.ui.switchTab('objects');
          this.sim.setScenario(TRAFFIC_SCENARIOS.POPULARITY_SPIKE);
        }
      },
      {
        title: 'Step 4/6: Cache Pollution Attack & Defense',
        durationSec: 35,
        narrative: 'Deluge of ephemeral unique keys injected. Watch the Pollution Guard detect HIGH risk and shield high-value resident items from eviction churn.',
        action: () => {
          this.ui.switchTab('pollution');
          this.sim.setScenario(TRAFFIC_SCENARIOS.CACHE_POLLUTION, { pollutionRate: 0.85 });
        }
      },
      {
        title: 'Step 5/6: Traffic Burst & Adaptive Scaling ROI',
        durationSec: 35,
        narrative: 'Surging traffic volume 4x. System evaluates cost-benefit of expanding cache capacity (Additional Memory Cost vs Expected DB Savings).',
        action: () => {
          this.ui.switchTab('cost-scaling');
          this.sim.setScenario(TRAFFIC_SCENARIOS.TRAFFIC_BURST);
          this.sim.setBaseRps(1200);
        }
      },
      {
        title: 'Step 6/6: Digital Twin Strategy Battle',
        durationSec: 40,
        narrative: 'Running live synchronous Digital Twin benchmark comparing Smart Cache against LRU, LFU, and GDS under identical workload traces.',
        action: () => {
          this.ui.switchTab('benchmark');
          if (this.ui.runDigitalTwinBenchmark) {
            this.ui.runDigitalTwinBenchmark();
          }
        }
      }
    ];
  }

  startDemo() {
    this.isActive = true;
    this.currentStepIdx = 0;
    this.sim.start();
    this.sim.setSpeedMultiplier(2); // 2x speed for brisk demo
    this.renderOverlay();
    this.executeStep(0);
  }

  executeStep(idx) {
    if (!this.isActive || idx >= this.steps.length) {
      this.stopDemo();
      return;
    }

    this.currentStepIdx = idx;
    const step = this.steps[idx];
    
    // Execute action
    step.action();
    this.updateOverlayContent(step);

    // Schedule next step
    if (this.stepTimer) clearTimeout(this.stepTimer);
    this.stepTimer = setTimeout(() => {
      this.executeStep(idx + 1);
    }, (step.durationSec / 2) * 1000); // adjusted for 2x sim speed
  }

  nextStep() {
    if (this.stepTimer) clearTimeout(this.stepTimer);
    this.executeStep(this.currentStepIdx + 1);
  }

  stopDemo() {
    this.isActive = false;
    if (this.stepTimer) clearTimeout(this.stepTimer);
    this.sim.setSpeedMultiplier(1);
    const bar = document.getElementById('demo-control-bar');
    if (bar) bar.classList.remove('active');
  }

  renderOverlay() {
    let bar = document.getElementById('demo-control-bar');
    if (!bar) return;
    bar.classList.add('active');
  }

  updateOverlayContent(step) {
    const titleEl = document.getElementById('demo-step-title');
    const narrativeEl = document.getElementById('demo-step-narrative');
    if (titleEl) titleEl.textContent = step.title;
    if (narrativeEl) narrativeEl.textContent = step.narrative;
  }
}
