/**
 * WebSocket Server & Live Stream Broadcaster for ADAPTIVECACHE
 * Streams live telemetry frames (4Hz) and activity events directly to connected React clients.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { telemetry } from '../telemetry';
import { circuitBreaker } from '../protection/circuitBreaker';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private broadcastInterval: NodeJS.Timeout | null = null;

  public init(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      console.log(`[WebSocket] Client connected. Total active clients: ${this.clients.size}`);

      // Send immediate snapshot on connect
      try {
        const snapshot = telemetry.getSnapshot();
        ws.send(JSON.stringify({ type: 'TELEMETRY_SNAPSHOT', data: snapshot }));
      } catch (err: any) {
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
    circuitBreaker.onStateChange((oldState, newState, reason) => {
      this.broadcast({
        type: 'CIRCUIT_BREAKER_EVENT',
        data: {
          oldState,
          newState,
          reason,
          timestamp: Date.now(),
        },
      });
      db.logEvent({
        id: `EVT-${uuidv4().substring(0, 8)}`,
        timestamp: Date.now(),
        eventType: 'CIRCUIT-BREAKER',
        reason: `Circuit Breaker transitioned: ${oldState} -> ${newState} (${reason})`,
      });
    });

    // Start 4Hz (250ms) telemetry broadcast stream
    this.broadcastInterval = setInterval(() => {
      if (this.clients.size === 0) return;
      try {
        const snapshot = telemetry.getSnapshot();
        this.broadcast({
          type: 'TELEMETRY_SNAPSHOT',
          data: snapshot,
        });
      } catch (err: any) {
        console.warn('[WebSocket] Error broadcasting snapshot:', err.message);
      }
    }, 250);
  }

  public broadcast(payload: any) {
    const dataStr = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(dataStr);
      }
    }
  }

  public getActiveClientCount(): number {
    return this.clients.size;
  }
}

export const wsService = new WebSocketService();
