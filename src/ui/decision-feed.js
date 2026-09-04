/**
 * Live Decision Feed
 * Displays real-time explainable decision events, score shifts, TTL mutations, and scaling triggers.
 */

import { globalEventBus } from '../core/event-bus.js';

export class DecisionFeed {
  constructor(containerId = 'live-decision-feed-list') {
    this.container = document.getElementById(containerId);
    this.events = [];
    this.maxEvents = 35;
    this.filter = 'all';

    globalEventBus.on('decision_feed_event', event => this.addEvent(event));
  }

  addEvent(event) {
    const timestamp = event.timestamp !== undefined ? Math.round(event.timestamp) : 0;
    const dateObj = new Date();
    const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`;

    const formattedEvent = {
      id: `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timeStr,
      simTimeStr: `t=${timestamp}s`,
      type: event.type || 'SYSTEM_EVENT',
      title: event.title || 'Decision Event',
      description: event.description || '',
      severity: event.severity || 'info' // info, success, warning, danger
    };

    this.events.unshift(formattedEvent);
    if (this.events.length > this.maxEvents) {
      this.events.pop();
    }

    this.render();
  }

  setFilter(filter) {
    this.filter = filter;
    this.render();
  }

  render() {
    if (!this.container) {
      this.container = document.getElementById('live-decision-feed-list');
      if (!this.container) return;
    }

    const filtered = this.filter === 'all' 
      ? this.events 
      : this.events.filter(e => e.severity === this.filter);

    if (filtered.length === 0) {
      this.container.innerHTML = `<div class="text-dim text-xs" style="padding: 12px; text-align: center;">Waiting for live decision events...</div>`;
      return;
    }

    let html = '';
    for (const evt of filtered) {
      html += `
        <div class="feed-event-item ${evt.severity}">
          <div class="feed-event-header">
            <span class="feed-event-title">${evt.title}</span>
            <span class="feed-event-time">${evt.timeStr} (${evt.simTimeStr})</span>
          </div>
          <div class="feed-event-desc">${evt.description}</div>
        </div>
      `;
    }

    this.container.innerHTML = html;
  }
}
