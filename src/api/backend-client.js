/**
 * Backend API & WebSocket Client
 * Connects frontend dashboard directly to FastAPI Python backend (REST + WebSocket streaming).
 */

export class BackendClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl || (window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:8000');
    this.wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
    this.ws = null;
    this.isConnected = false;
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.isPolling = false;

    this.connectWebSocket();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    const list = this.listeners.get(event) || [];
    for (const cb of list) {
      try {
        cb(data);
      } catch (err) {
        console.error(`Error in event listener for ${event}:`, err);
      }
    }
  }

  connectWebSocket() {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit('connection_status', { connected: true, mode: 'websocket' });
        console.log('⚡ Connected to FastAPI WebSocket stream:', this.wsUrl);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SIMULATION_TICK' || msg.type === 'INITIAL_STATE') {
            this.emit('simulation_tick', msg.data);
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('connection_status', { connected: false, mode: 'disconnected' });
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (e) {
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connectWebSocket();
      }, 2500);
    }
  }

  sendWsCommand(action, payload = {}) {
    if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, payload }));
      return true;
    }
    return false;
  }

  async postApi(endpoint, body = {}) {
    try {
      const res = await fetch(`${this.baseUrl}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await res.json();
    } catch (err) {
      console.warn(`REST fallback failed for /api/${endpoint}:`, err);
      return { success: false, error: err.message };
    }
  }

  async getApi(endpoint) {
    try {
      const res = await fetch(`${this.baseUrl}/api/${endpoint}`);
      return await res.json();
    } catch (err) {
      console.warn(`GET failed for /api/${endpoint}:`, err);
      return null;
    }
  }

  // --- High-level Action Dispatchers ---

  async startWorkload() {
    this.sendWsCommand('START');
    return await this.postApi('workload/start');
  }

  async pauseWorkload() {
    this.sendWsCommand('PAUSE');
    return await this.postApi('workload/pause');
  }

  async stepWorkload() {
    this.sendWsCommand('STEP');
    return await this.postApi('workload/step');
  }

  async resetSimulation() {
    this.sendWsCommand('RESET');
    return await this.postApi('cache/reset');
  }

  async setWorkloadType(type) {
    this.sendWsCommand('SET_WORKLOAD', { workloadType: type });
    return await this.postApi('workload/type', { workloadType: type });
  }

  async setScenario(scenario, options = {}) {
    this.sendWsCommand('SET_SCENARIO', { scenario, ...options });
    return await this.postApi('workload/scenario', { scenario, ...options });
  }

  async setBaseRps(rps) {
    this.sendWsCommand('SET_RPS', { rps: Number(rps) });
    return await this.postApi('workload/rps', { rps: Number(rps) });
  }

  async setSpeedMultiplier(speed) {
    return await this.postApi('workload/speed', { speed: Number(speed) });
  }

  async setCapacity(capacityGB) {
    this.sendWsCommand('SET_CAPACITY', { capacityGB: Number(capacityGB) });
    return await this.postApi('cache/capacity', { capacityGB: Number(capacityGB) });
  }

  async setScoringWeights(weights, autoAdapt = false) {
    return await this.postApi('scoring/config', { weights, autoAdapt });
  }

  async runBenchmark(options = {}) {
    return await this.postApi('benchmark/run', options);
  }

  async uploadUserData(fileOrText, isJson = false) {
    try {
      let body;
      let headers = {};

      if (typeof fileOrText === 'string') {
        body = JSON.stringify({ content: fileOrText, format: isJson ? 'json' : 'csv' });
        headers['Content-Type'] = 'application/json';
      } else if (fileOrText instanceof File) {
        const text = await fileOrText.text();
        const isCsv = fileOrText.name.toLowerCase().endsWith('.csv');
        body = JSON.stringify({ content: text, format: isCsv ? 'csv' : 'json' });
        headers['Content-Type'] = 'application/json';
      } else {
        body = JSON.stringify(fileOrText);
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(`${this.baseUrl}/api/data/upload`, {
        method: 'POST',
        headers,
        body
      });
      return await res.json();
    } catch (err) {
      return { success: false, detail: err.message };
    }
  }
}
