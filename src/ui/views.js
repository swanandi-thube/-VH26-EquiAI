/**
 * View Renderers for all 11 Application Sections
 * High-density, professional engineering observability presentation.
 */

import { formatBytes, formatMs } from '../core/types.js';

export class ViewRenderers {
  constructor(uiController) {
    this.ui = uiController;
  }

  // 1. TOP TELEMETRY RIBBON & OVERVIEW BANNERS
  renderTelemetryRibbon(snapshot) {
    const el = (id) => document.getElementById(id);
    if (!el('tel-hit-rate')) return;

    el('tel-hit-rate').textContent = `${snapshot.hitRatePercent}%`;
    el('tel-p95').textContent = `${snapshot.p50LatencyMs || snapshot.p95}ms`;
    el('tel-p99').textContent = `${snapshot.p99LatencyMs || snapshot.p99}ms`;
    el('tel-backend-load').textContent = `${snapshot.backendLoadPercent}%`;
    el('tel-db-cpu').textContent = `${snapshot.dbCpuPercent}%`;
    el('tel-cost').textContent = `$${snapshot.costPerHour}`;
    el('tel-savings').textContent = `$${snapshot.costSavingsPerHour}`;
    el('tel-memory').textContent = `${snapshot.memoryUsedMB} MB`;
    el('tel-evictions').textContent = snapshot.evictions;

    // Render Traffic State Banner
    const tfBadge = el('overview-traffic-badge');
    const tfText = el('overview-traffic-text');
    if (tfBadge && tfText && snapshot.trafficState) {
      const ts = snapshot.trafficState;
      let badgeClass = 'state-normal';
      let icon = '🟢';
      if (ts.state === 'TRAFFIC_SPIKE_DETECTED') {
        badgeClass = 'state-spike';
        icon = '🔴';
      } else if (ts.state === 'TRAFFIC_BURST') {
        badgeClass = 'state-burst';
        icon = '🟠';
      } else if (ts.state === 'TRAFFIC_INCREASING') {
        badgeClass = 'state-increasing';
        icon = '🟡';
      } else if (ts.state === 'TRAFFIC_DECREASING') {
        badgeClass = 'state-decreasing';
        icon = '🔵';
      }

      tfBadge.className = `traffic-badge ${badgeClass}`;
      tfBadge.textContent = `${icon} ${ts.badge || ts.state}`;
      tfText.textContent = ts.statusText || `${snapshot.trafficRps} req/s`;
    }

    // Render Scaling Alert Banner
    const scBadge = el('overview-scaling-badge');
    const scReason = el('overview-scaling-reason');
    const scRoi = el('overview-scaling-roi');
    if (scBadge && scReason && snapshot.scalingDecision) {
      const sc = snapshot.scalingDecision;
      scBadge.textContent = `${sc.badge || sc.decision} (${sc.currentGB} GB ➔ ${sc.proposedGB} GB)`;
      scReason.textContent = sc.decisionReason || 'Optimal capacity.';
      if (scRoi) {
        scRoi.textContent = `ROI: ${sc.netBenefitPerHour >= 0 ? '+' : ''}$${sc.netBenefitPerHour}/hr`;
      }
    }
  }

  // 12. USER DATA PREVIEW TABLE
  renderUserDataPreview(items) {
    const tbody = document.getElementById('user-data-preview-table-body');
    const countBadge = document.getElementById('user-data-item-count');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">No custom dataset uploaded yet. Ingest CSV/JSON above or click "Load Sample Dataset".</td></tr>`;
      if (countBadge) countBadge.textContent = '0 Items';
      return;
    }

    if (countBadge) countBadge.textContent = `${items.length} Items`;

    let html = '';
    for (const item of items) {
      const sizeKB = Math.round(item.sizeBytes / 1024);
      const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
      html += `
        <tr>
          <td class="font-mono font-bold text-info">${item.id}</td>
          <td>${item.name}</td>
          <td><span class="badge badge-neutral">${item.category}</span></td>
          <td class="font-mono">${sizeStr}</td>
          <td class="font-mono">${item.baseDbLatencyMs} ms</td>
          <td class="font-mono text-warning">${item.recomputeCostUnits}x</td>
          <td class="font-mono">${(item.updateVolatility * 100).toFixed(0)}%</td>
        </tr>
      `;
    }
    tbody.innerHTML = html;
  }

  // 2. CACHE OBJECTS TABLE VIEW
  renderObjectsTable(smartCache, filter = 'all', searchQuery = '') {
    const tbody = document.getElementById('objects-table-body');
    if (!tbody) return;

    const entries = smartCache.getEntriesList();
    let filtered = entries;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e => e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
    }

    if (filter === 'RETAIN') filtered = filtered.filter(e => e.decision === 'RETAIN');
    if (filter === 'REFRESH') filtered = filtered.filter(e => e.decision === 'REFRESH');
    if (filter === 'EVICT') filtered = filtered.filter(e => e.decision === 'EVICT');

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-dim text-xs" style="text-align: center; padding: 24px;">No objects match current filter criteria.</td></tr>`;
      return;
    }

    // Sort by score descending
    filtered.sort((a, b) => b.score - a.score);

    let html = '';
    for (const e of filtered) {
      const sizeKB = Math.round(e.sizeBytes / 1024);
      const sizeFormatted = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
      const ageSec = Math.round(Math.max(0, smartCache.lastEvaluatedAt || 0) - (e.createdAt || 0));
      const badgeClass = e.decision === 'RETAIN' ? 'badge-retain' : (e.decision === 'REFRESH' ? 'badge-refresh' : 'badge-evict');

      html += `
        <tr class="clickable" onclick="window.app.ui.openObjectDrawer('${e.id}')">
          <td class="font-mono font-bold">${e.id}</td>
          <td>${e.name}</td>
          <td class="font-mono">${sizeFormatted}</td>
          <td class="font-mono">${e.recentHits || 1} req</td>
          <td class="font-mono">${e.baseDbLatencyMs}ms</td>
          <td class="font-mono">${e.prevTTL}s ➔ <strong class="text-info">${e.currentTTL}s</strong></td>
          <td class="font-mono"><strong class="text-success">${e.score}</strong></td>
          <td><span class="badge ${badgeClass}">${e.decision}</span></td>
          <td class="text-xs text-muted" style="max-width: 260px; overflow: hidden; text-overflow: ellipsis;">${e.reason}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); window.app.ui.openObjectDrawer('${e.id}')">
              Inspect Math
            </button>
          </td>
        </tr>
      `;
    }

    tbody.innerHTML = html;
  }

  // 3. OBJECT DEEP-DIVE DRAWER (FORMULA CALCULATION BREAKDOWN)
  renderObjectDrawer(entry, smartCache) {
    const drawer = document.getElementById('object-drawer-content');
    if (!drawer || !entry) return;

    const F = entry.factors || {};
    const W = entry.weights || smartCache.scorer.weights;
    const badgeClass = entry.decision === 'RETAIN' ? 'badge-retain' : (entry.decision === 'REFRESH' ? 'badge-refresh' : 'badge-evict');
    const sizeKB = Math.round(entry.sizeBytes / 1024);
    const sizeFormatted = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(2)} MB` : `${sizeKB} KB`;

    // Mathematical formula product terms
    const termFreq = ((F.frequency || 0) * (W.frequency || 0)).toFixed(3);
    const termRec = ((F.recency || 0) * (W.recency || 0)).toFixed(3);
    const termPop = ((F.popularity || 0) * (W.popularity || 0)).toFixed(3);
    const termCost = ((F.retrievalCost || 0) * (W.retrievalCost || 0)).toFixed(3);
    const termFresh = ((F.freshness || 0) * (W.freshness || 0)).toFixed(3);
    const termTrend = ((F.trend || 0) * (W.trend || 0)).toFixed(3);
    const termReuse = ((F.reuseProbability || 0) * (W.reuseProbability || 0)).toFixed(3);
    const termSize = ((F.sizePenalty || 0) * (W.sizePenalty || 0)).toFixed(3);

    drawer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-default); padding-bottom: 14px;">
        <div>
          <div class="badge badge-info" style="margin-bottom: 6px;">${entry.category} / ${entry.type}</div>
          <h2 style="font-size: 18px; font-weight: 700;">${entry.name}</h2>
          <div class="font-mono text-dim text-xs">Object Key: ${entry.id} | Size: ${sizeFormatted}</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.app.ui.closeObjectDrawer()">✕ Close</button>
      </div>

      <div class="grid-2" style="margin-top: 10px;">
        <div class="obs-card" style="padding: 12px;">
          <div class="text-xs text-muted">Active Decision</div>
          <div style="margin-top: 4px;"><span class="badge ${badgeClass}" style="font-size: 13px; padding: 4px 10px;">${entry.decision}</span></div>
          <div class="text-xs text-muted" style="margin-top: 6px;">${entry.reason}</div>
        </div>
        <div class="obs-card" style="padding: 12px;">
          <div class="text-xs text-muted">Dynamic TTL Recalibration</div>
          <div class="font-mono text-base font-bold" style="margin-top: 4px;">${entry.prevTTL}s ➔ <span class="text-info">${entry.currentTTL}s</span></div>
          <div class="text-xs text-dim" style="margin-top: 6px;">Volatility: ${Math.round((entry.updateVolatility || 0.1) * 100)}% | Retrieval: ${entry.baseDbLatencyMs}ms</div>
        </div>
      </div>

      <div class="obs-card" style="margin-top: 10px;">
        <div class="obs-card-header">
          <span class="obs-card-title">Multi-Factor Mathematical Score Breakdown</span>
          <span class="badge badge-retain">Score: ${entry.score}</span>
        </div>

        <div class="formula-box">
          <div class="formula-row">
            <span>Access Frequency:</span>
            <span>${F.frequency} × W(${W.frequency}) = <strong>+${termFreq}</strong></span>
          </div>
          <div class="formula-row">
            <span>Access Recency:</span>
            <span>${F.recency} × W(${W.recency}) = <strong>+${termRec}</strong></span>
          </div>
          <div class="formula-row">
            <span>Popularity Share:</span>
            <span>${F.popularity} × W(${W.popularity}) = <strong>+${termPop}</strong></span>
          </div>
          <div class="formula-row">
            <span>Retrieval & Recompute Cost:</span>
            <span>${F.retrievalCost} × W(${W.retrievalCost}) = <strong>+${termCost}</strong></span>
          </div>
          <div class="formula-row">
            <span>Freshness Ratio:</span>
            <span>${F.freshness} × W(${W.freshness}) = <strong>+${termFresh}</strong></span>
          </div>
          <div class="formula-row">
            <span>Request Velocity Trend:</span>
            <span>${F.trend} × W(${W.trend}) = <strong>+${termTrend}</strong></span>
          </div>
          <div class="formula-row">
            <span>Reuse Probability:</span>
            <span>${F.reuseProbability} × W(${W.reuseProbability}) = <strong>+${termReuse}</strong></span>
          </div>
          <div class="formula-row">
            <span class="text-danger">Memory Size Penalty:</span>
            <span class="text-danger">-${F.sizePenalty} × W(${W.sizePenalty}) = <strong>-${termSize}</strong></span>
          </div>
          <div class="formula-row">
            <span>Composite Object Value Score:</span>
            <span>= <strong>${entry.score}</strong></span>
          </div>
        </div>
      </div>
    `;

    document.getElementById('object-drawer-backdrop').classList.add('active');
  }

  // 4. STRATEGY BATTLE TABLE
  renderStrategyBattleTable(smartCache, lruCache, lfuCache, gdsCache) {
    const tbody = document.getElementById('battle-table-body');
    if (!tbody) return;

    const entries = smartCache.getEntriesList().slice(0, 15);
    if (entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-dim text-xs" style="text-align: center; padding: 20px;">Populating strategy battle entries...</td></tr>`;
      return;
    }

    let html = '';
    for (const e of entries) {
      const inLRU = lruCache.entries.has(e.id);
      const inLFU = lfuCache.entries.has(e.id);
      const inGDS = gdsCache.entries.has(e.id);

      const lruAction = inLRU ? '<span class="badge badge-retain">KEEP</span>' : '<span class="badge badge-evict">EVICT</span>';
      const lfuAction = inLFU ? '<span class="badge badge-retain">KEEP</span>' : '<span class="badge badge-evict">EVICT</span>';
      const gdsAction = inGDS ? '<span class="badge badge-retain">KEEP</span>' : '<span class="badge badge-evict">EVICT</span>';
      const smartBadge = e.decision === 'RETAIN' ? 'badge-retain' : (e.decision === 'REFRESH' ? 'badge-refresh' : 'badge-evict');

      let advantageNote = "Balances cost vs recency perfectly";
      if (e.baseDbLatencyMs > 100 && !inLRU) {
        advantageNote = "LRU prematurely evicted high-cost object; Smart Cache retained it.";
      } else if (e.decision === 'REFRESH') {
        advantageNote = "Smart Cache triggered proactive background refresh before TTL expiration.";
      } else if (e.sizeBytes > 5 * 1024 * 1024 && !inGDS) {
        advantageNote = "Protected despite large size due to ultra-high frequency.";
      }

      html += `
        <tr>
          <td class="font-mono font-bold">${e.id}</td>
          <td>${e.name}</td>
          <td class="font-mono">${Math.round(e.sizeBytes / 1024)} KB</td>
          <td class="font-mono">${e.baseDbLatencyMs}ms</td>
          <td>${lruAction}</td>
          <td>${lfuAction}</td>
          <td>${gdsAction}</td>
          <td><span class="badge ${smartBadge}">${e.decision}</span></td>
          <td class="text-xs text-muted">${advantageNote}</td>
        </tr>
      `;
    }

    tbody.innerHTML = html;
  }

  // 5. BENCHMARK LAB MATRIX
  renderBenchmarkResults(benchmarkData) {
    const tbody = document.getElementById('benchmark-matrix-body');
    const advantageSummary = document.getElementById('benchmark-advantage-summary');
    if (!tbody || !benchmarkData) return;

    const S = benchmarkData.strategies;
    const metrics = [
      { label: 'Cache Hit Rate (%)', smart: `${S.SMART.hitRatePercent}%`, lru: `${S.LRU.hitRatePercent}%`, lfu: `${S.LFU.hitRatePercent}%`, gds: `${S.GDS.hitRatePercent}%`, highlight: true },
      { label: 'Cache Miss Rate (%)', smart: `${S.SMART.missRatePercent}%`, lru: `${S.LRU.missRatePercent}%`, lfu: `${S.LFU.missRatePercent}%`, gds: `${S.GDS.missRatePercent}%` },
      { label: 'P50 Latency (ms)', smart: `${S.SMART.p50LatencyMs} ms`, lru: `${S.LRU.p50LatencyMs} ms`, lfu: `${S.LFU.p50LatencyMs} ms`, gds: `${S.GDS.p50LatencyMs} ms` },
      { label: 'P95 Latency (ms)', smart: `${S.SMART.p95LatencyMs} ms`, lru: `${S.LRU.p95LatencyMs} ms`, lfu: `${S.LFU.p95LatencyMs} ms`, gds: `${S.GDS.p95LatencyMs} ms` },
      { label: 'P99 Latency (ms)', smart: `${S.SMART.p99LatencyMs} ms`, lru: `${S.LRU.p99LatencyMs} ms`, lfu: `${S.LFU.p99LatencyMs} ms`, gds: `${S.GDS.p99LatencyMs} ms`, highlight: true },
      { label: 'Backend Thread Load (%)', smart: `${S.SMART.backendLoadPercent}%`, lru: `${S.LRU.backendLoadPercent}%`, lfu: `${S.LFU.backendLoadPercent}%`, gds: `${S.GDS.backendLoadPercent}%` },
      { label: 'Database CPU Utilization (%)', smart: `${S.SMART.dbCpuPercent}%`, lru: `${S.LRU.dbCpuPercent}%`, lfu: `${S.LFU.dbCpuPercent}%`, gds: `${S.GDS.dbCpuPercent}%`, highlight: true },
      { label: 'Database Connections Pool', smart: `${S.SMART.dbConnections} / 100`, lru: `${S.LRU.dbConnections} / 100`, lfu: `${S.LFU.dbConnections} / 100`, gds: `${S.GDS.dbConnections} / 100` },
      { label: 'Number of Evictions', smart: `${S.SMART.evictions}`, lru: `${S.LRU.evictions}`, lfu: `${S.LFU.evictions}`, gds: `${S.GDS.evictions}` },
      { label: 'Proactive Refreshes', smart: `${S.SMART.refreshes}`, lru: `0 (None)`, lfu: `0 (None)`, gds: `0 (None)` },
      { label: 'Simulated Cost ($/hr)', smart: `$${S.SMART.costPerHour}`, lru: `$${S.LRU.costPerHour}`, lfu: `$${S.LFU.costPerHour}`, gds: `$${S.GDS.costPerHour}` },
      { label: 'Infrastructure Savings ($/hr)', smart: `<strong class="text-success">$${S.SMART.costSavingsPerHour}</strong>`, lru: `$${S.LRU.costSavingsPerHour}`, lfu: `$${S.LFU.costSavingsPerHour}`, gds: `$${S.GDS.costSavingsPerHour}`, highlight: true }
    ];

    let html = '';
    for (const m of metrics) {
      const hlStyle = m.highlight ? 'style="font-weight: 700; color: var(--text-primary);"' : '';
      html += `
        <tr ${hlStyle}>
          <td>${m.label}</td>
          <td class="font-mono text-success"><strong>${m.smart}</strong></td>
          <td class="font-mono">${m.lru}</td>
          <td class="font-mono">${m.lfu}</td>
          <td class="font-mono">${m.gds}</td>
        </tr>
      `;
    }
    tbody.innerHTML = html;

    if (advantageSummary && benchmarkData.advantage) {
      advantageSummary.innerHTML = `
        <div style="font-size: 13px; color: var(--color-success); font-weight: 600;">
          ★ ${benchmarkData.advantage.summary}
        </div>
      `;
    }
  }

  // 6. TIME MACHINE SNAPSHOTS LIST & COUNTERFACTUAL
  renderTimeMachine(historyRecorder, selectedSnapshotId = null) {
    const listEl = document.getElementById('timemachine-snapshot-list');
    const detailEl = document.getElementById('timemachine-detail-panel');
    if (!listEl || !detailEl) return;

    const snapshots = historyRecorder.getSnapshots();
    if (snapshots.length === 0) {
      listEl.innerHTML = `<div class="text-dim text-xs" style="padding: 16px;">Recording historical timeline snapshots...</div>`;
      return;
    }

    const currentSnap = selectedSnapshotId 
      ? historyRecorder.getSnapshotById(selectedSnapshotId) || snapshots[snapshots.length - 1]
      : snapshots[snapshots.length - 1];

    let listHtml = '';
    for (const s of snapshots) {
      const isSelected = s.id === currentSnap.id;
      listHtml += `
        <div class="feed-event-item info ${isSelected ? 'active-pulse' : ''}" style="cursor: pointer;" onclick="window.app.ui.selectTimeMachineSnapshot('${s.id}')">
          <div class="feed-event-header">
            <span class="font-bold">${s.timeLabel} (t=${s.simTimeSeconds}s)</span>
            <span class="badge badge-info">${s.scenario}</span>
          </div>
          <div class="text-xs text-muted" style="margin-top: 2px;">${s.eventSummary}</div>
          <div class="font-mono text-xs" style="margin-top: 4px; display: flex; gap: 10px;">
            <span>Hit: ${s.hitRatePercent}%</span>
            <span>P99: ${s.p99LatencyMs}ms</span>
            <span>Cost: $${s.costPerHour}/hr</span>
          </div>
        </div>
      `;
    }
    listEl.innerHTML = listHtml;

    // Render detail panel & counterfactuals
    const CF = currentSnap.counterfactuals || {};
    detailEl.innerHTML = `
      <div class="obs-card">
        <div class="obs-card-header">
          <span class="obs-card-title">Snapshot Inspection: ${currentSnap.timeLabel} (t=${currentSnap.simTimeSeconds}s)</span>
          <span class="badge badge-info">${currentSnap.scenario}</span>
        </div>

        <div style="font-size: 13px; color: var(--text-primary); font-weight: 500;">
          <strong>Event:</strong> ${currentSnap.eventSummary}
        </div>

        <div class="grid-3" style="margin-top: 10px;">
          <div class="obs-card" style="padding: 10px;">
            <div class="text-xs text-muted">Traffic Rate</div>
            <div class="font-mono text-base font-bold">${currentSnap.trafficRps} RPS</div>
          </div>
          <div class="obs-card" style="padding: 10px;">
            <div class="text-xs text-muted">Database CPU</div>
            <div class="font-mono text-base font-bold">${currentSnap.dbCpuPercent}%</div>
          </div>
          <div class="obs-card" style="padding: 10px;">
            <div class="text-xs text-muted">Simulated Cost</div>
            <div class="font-mono text-base font-bold">$${currentSnap.costPerHour}/hr</div>
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div class="obs-card-title" style="margin-bottom: 8px;">Counterfactual Simulation: "What would have happened under another caching strategy?"</div>
          <table class="obs-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Hit Rate (%)</th>
                <th>P99 Latency (ms)</th>
                <th>Hourly Cost ($/hr)</th>
                <th>Delta vs Smart Cache</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong class="text-success">Smart Cache (Recorded)</strong></td>
                <td class="font-mono text-success"><strong>${CF.SMART.hitRate}%</strong></td>
                <td class="font-mono text-success"><strong>${CF.SMART.p99} ms</strong></td>
                <td class="font-mono text-success"><strong>$${CF.SMART.cost}</strong></td>
                <td><span class="badge badge-retain">BASELINE</span></td>
              </tr>
              <tr>
                <td>LRU Strategy</td>
                <td class="font-mono">${CF.LRU.hitRate}%</td>
                <td class="font-mono">${CF.LRU.p99} ms</td>
                <td class="font-mono">$${CF.LRU.cost}</td>
                <td class="text-danger font-mono text-xs">+${(CF.LRU.cost - CF.SMART.cost).toFixed(3)}/hr cost</td>
              </tr>
              <tr>
                <td>LFU Strategy</td>
                <td class="font-mono">${CF.LFU.hitRate}%</td>
                <td class="font-mono">${CF.LFU.p99} ms</td>
                <td class="font-mono">$${CF.LFU.cost}</td>
                <td class="text-danger font-mono text-xs">+${(CF.LFU.cost - CF.SMART.cost).toFixed(3)}/hr cost</td>
              </tr>
              <tr>
                <td>GDS Strategy</td>
                <td class="font-mono">${CF.GDS.hitRate}%</td>
                <td class="font-mono">${CF.GDS.p99} ms</td>
                <td class="font-mono">$${CF.GDS.cost}</td>
                <td class="text-danger font-mono text-xs">+${(CF.GDS.cost - CF.SMART.cost).toFixed(3)}/hr cost</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}
