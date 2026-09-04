/**
 * Live Pipeline Visualizer
 * Renders the real-time interconnected causal chain from Traffic to DB, Latency, and Scaling.
 */

export class PipelineVisualizer {
  constructor(containerId = 'live-pipeline-track') {
    this.container = document.getElementById(containerId);
  }

  update(snapshot, scalingResult) {
    if (!this.container) {
      this.container = document.getElementById('live-pipeline-track');
      if (!this.container) return;
    }

    const {
      trafficRps,
      scenario,
      hitRatePercent,
      backendLoadPercent,
      dbCpuPercent,
      p99,
      costPerHour
    } = snapshot;

    // Node data mappings
    const nodes = [
      { name: '1. Traffic', val: `${trafficRps} RPS`, pulse: scenario !== 'STEADY' },
      { name: '2. Access Pattern', val: scenario.replace('_', ' '), pulse: false },
      { name: '3. Multi-Factor Scoring', val: `Adaptive W`, pulse: false },
      { name: '4. Dynamic TTL', val: `15s - 600s`, pulse: false },
      { name: '5. Cache Decision', val: `RETAIN / REFRESH`, pulse: false },
      { name: '6. Hit / Miss', val: `${hitRatePercent}% Hit`, pulse: hitRatePercent > 80 },
      { name: '7. Backend Load', val: `${backendLoadPercent}% Load`, pulse: backendLoadPercent > 50 },
      { name: '8. Database CPU', val: `${dbCpuPercent}% CPU`, pulse: dbCpuPercent > 60 },
      { name: '9. Latency P99', val: `${p99} ms`, pulse: p99 > 50 },
      { name: '10. Hourly Cost', val: `$${costPerHour}/hr`, pulse: false },
      { name: '11. Scaling Decision', val: scalingResult.decision, pulse: scalingResult.shouldScale }
    ];

    let html = '';
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isLast = i === nodes.length - 1;
      const pulseClass = node.pulse ? 'active-pulse' : '';

      html += `
        <div class="pipeline-node ${pulseClass}">
          <span class="pipeline-node-name">${node.name}</span>
          <span class="pipeline-node-val">${node.val}</span>
        </div>
      `;

      if (!isLast) {
        html += `<span class="pipeline-arrow">➔</span>`;
      }
    }

    this.container.innerHTML = html;
  }
}
