/**
 * High-Performance HTML5 Canvas Chart Renderer
 * Zero-dependency, ultra-crisp time-series charts and sparklines for observability metrics.
 */

export class TimeSeriesCanvasChart {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.title = options.title || '';
    this.unit = options.unit || '';
    this.yMin = options.yMin !== undefined ? options.yMin : 0;
    this.yMax = options.yMax !== undefined ? options.yMax : null; // auto if null
    this.series = options.series || []; // [{ key: 'trafficRps', label: 'RPS', color: '#0284c7' }]
    this.formatValue = options.formatValue || (v => `${v}${this.unit}`);
    
    this.setupRetina();
  }

  setupRetina() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    this.width = rect.width || 360;
    this.height = rect.height || 160;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  render(historyData) {
    if (!this.canvas || !this.ctx || !historyData || !historyData.timestamps) return;
    
    const timestamps = historyData.timestamps;
    const n = timestamps.length;
    if (n < 2) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const padLeft = 40;
    const padRight = 10;
    const padTop = 15;
    const padBottom = 22;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    ctx.clearRect(0, 0, w, h);

    // 1. Determine Min & Max bounds
    let maxVal = this.yMax !== null ? this.yMax : 0;
    let minVal = this.yMin;

    for (const s of this.series) {
      const dataArr = historyData[s.key] || [];
      for (const val of dataArr) {
        if (this.yMax === null && val > maxVal) maxVal = val;
      }
    }

    if (maxVal === 0) maxVal = 10;
    if (this.yMax === null) maxVal = maxVal * 1.15; // 15% top padding

    // 2. Draw Subtle Grid Lines & Y-Axis Labels
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const gridSteps = 3;
    for (let i = 0; i <= gridSteps; i++) {
      const yVal = minVal + (maxVal - minVal) * (i / gridSteps);
      const yPos = padTop + plotH - (i / gridSteps) * plotH;

      ctx.beginPath();
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(w - padRight, yPos);
      ctx.stroke();

      let formattedLabel = Math.round(yVal);
      if (maxVal < 5) formattedLabel = yVal.toFixed(2);
      ctx.fillText(`${formattedLabel}${this.unit}`, padLeft - 6, yPos);
    }

    // 3. Plot Each Series
    for (const s of this.series) {
      const dataArr = historyData[s.key] || [];
      if (dataArr.length < 2) continue;

      ctx.beginPath();
      ctx.strokeStyle = s.color || '#0284c7';
      ctx.lineWidth = s.lineWidth || 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let i = 0; i < dataArr.length; i++) {
        const val = dataArr[i];
        const xPos = padLeft + (i / (n - 1)) * plotW;
        const normalizedY = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal || 1)));
        const yPos = padTop + plotH - (normalizedY * plotH);

        if (i === 0) {
          ctx.moveTo(xPos, yPos);
        } else {
          ctx.lineTo(xPos, yPos);
        }
      }
      ctx.stroke();

      // Optional Area Fill
      if (s.fill) {
        ctx.lineTo(padLeft + plotW, padTop + plotH);
        ctx.lineTo(padLeft, padTop + plotH);
        ctx.closePath();
        ctx.fillStyle = s.fillColor || 'rgba(2, 132, 199, 0.08)';
        ctx.fill();
      }
    }

    // 4. Draw Legend in Top Right
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    let legendX = w - padRight;
    for (const s of this.series) {
      const lastVal = (historyData[s.key] && historyData[s.key].length > 0)
        ? historyData[s.key][historyData[s.key].length - 1]
        : 0;

      ctx.fillStyle = s.color;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(`${s.label}: ${lastVal}${this.unit}`, legendX, 2);
      legendX -= (s.label.length * 7 + 55);
    }
  }

  resize() {
    this.setupRetina();
  }
}

export class ChartManager {
  constructor() {
    this.charts = new Map();
  }

  register(id, options) {
    const chart = new TimeSeriesCanvasChart(id, options);
    this.charts.set(id, chart);
    return chart;
  }

  updateAll(historyData) {
    for (const chart of this.charts.values()) {
      chart.render(historyData);
    }
  }

  resizeAll() {
    for (const chart of this.charts.values()) {
      chart.resize();
    }
  }
}
