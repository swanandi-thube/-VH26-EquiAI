"use strict";
/**
 * WebSocket Server & Live Stream Broadcaster for ADAPTIVECACHE
 * Streams live telemetry frames (4Hz) and activity events directly to connected React clients.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsService = exports.WebSocketService = void 0;
const ws_1 = require("ws");
const telemetry_1 = require("../telemetry");
const circuitBreaker_1 = require("../protection/circuitBreaker");
const db_1 = require("../db");
const uuid_1 = require("uuid");
class WebSocketService {
    wss = null;
    clients = new Set();
    broadcastInterval = null;
    init(server) {
        this.wss = new ws_1.WebSocketServer({ server, path: '/ws' });
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            console.log(`[WebSocket] Client connected. Total active clients: ${this.clients.size}`);
            // Send immediate snapshot on connect
            try {
                const snapshot = telemetry_1.telemetry.getSnapshot();
                ws.send(JSON.stringify({ type: 'TELEMETRY_SNAPSHOT', data: snapshot }));
            }
            catch (err) {
                console.warn('[WebSocket] Error sending initial snapshot:', err.message);
            }
            ws.on('close', () => {
                this.clients.delete(ws);
                console.log(`[WebSocket] Client disconnected. Total active clients: ${this.clients.size}`);
            });
            ws.on('error', (err) => {
                console.warn('[WebSocket] Client error:', err.message);
                this.clients.delete(ws);
            });
        });
        // Circuit Breaker state change notifications
        circuitBreaker_1.circuitBreaker.onStateChange((oldState, newState, reason) => {
            this.broadcast({
                type: 'CIRCUIT_BREAKER_EVENT',
                data: {
                    oldState,
                    newState,
                    reason,
                    timestamp: Date.now(),
                },
            });
            db_1.db.logEvent({
                id: `EVT-${(0, uuid_1.v4)().substring(0, 8)}`,
                timestamp: Date.now(),
                eventType: 'CIRCUIT-BREAKER',
                reason: `Circuit Breaker transitioned: ${oldState} -> ${newState} (${reason})`,
            });
        });
        // Start 4Hz (250ms) telemetry broadcast stream
        this.broadcastInterval = setInterval(() => {
            if (this.clients.size === 0)
                return;
            try {
                const snapshot = telemetry_1.telemetry.getSnapshot();
                this.broadcast({
                    type: 'TELEMETRY_SNAPSHOT',
                    data: snapshot,
                });
            }
            catch (err) {
                console.warn('[WebSocket] Error broadcasting snapshot:', err.message);
            }
        }, 250);
    }
    broadcast(payload) {
        const dataStr = JSON.stringify(payload);
        for (const client of this.clients) {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(dataStr);
            }
        }
    }
    getActiveClientCount() {
        return this.clients.size;
    }
}
exports.WebSocketService = WebSocketService;
exports.wsService = new WebSocketService();
