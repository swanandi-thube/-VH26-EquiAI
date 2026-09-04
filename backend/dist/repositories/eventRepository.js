"use strict";
/**
 * Event Repository
 * Stores and queries system events, circuit breaker transitions, and cache lifecycle audit logs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventRepository = exports.EventRepository = void 0;
const client_1 = require("../database/client");
const db_1 = require("../db");
const server_1 = require("../ws/server");
class EventRepository {
    fallbackEvents = [];
    maxMemoryEvents = 2000;
    /**
     * Log an activity event
     */
    async log(event) {
        this.fallbackEvents.push(event);
        db_1.db.logEvent(event);
        // Live WebSocket broadcast to connected dashboard clients
        try {
            server_1.wsService.broadcast({
                type: 'ACTIVITY_EVENT',
                data: event,
            });
        }
        catch {
            // Ignore if wsService not ready
        }
        if (this.fallbackEvents.length > this.maxMemoryEvents) {
            this.fallbackEvents.splice(0, 500);
        }
        if (client_1.dbClient.isConnected) {
            try {
                await client_1.dbClient.query(`INSERT INTO system_events (
            id, timestamp, event_type, object_id, score, reason, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING`, [
                    event.id,
                    event.timestamp,
                    event.eventType,
                    event.objectId || null,
                    event.score !== undefined ? event.score : null,
                    event.reason,
                    event.metadata ? JSON.stringify(event.metadata) : null,
                ]);
            }
            catch (err) {
                console.warn(`[EventRepo] DB log error:`, err.message);
            }
        }
    }
    /**
     * Get recent events with optional eventType filter
     */
    async getRecent(limit = 100, typeFilter) {
        if (client_1.dbClient.isConnected) {
            try {
                let query = 'SELECT id, timestamp, event_type, object_id, score, reason, metadata FROM system_events';
                const params = [];
                if (typeFilter && typeFilter !== 'ALL') {
                    query += ' WHERE event_type = $1';
                    params.push(typeFilter);
                    query += ` ORDER BY timestamp DESC LIMIT $2`;
                    params.push(limit);
                }
                else {
                    query += ` ORDER BY timestamp DESC LIMIT $1`;
                    params.push(limit);
                }
                const res = await client_1.dbClient.query(query, params);
                return res.rows.map(row => ({
                    id: row.id,
                    timestamp: Number(row.timestamp),
                    eventType: row.event_type,
                    objectId: row.object_id || undefined,
                    score: row.score !== null ? parseFloat(row.score) : undefined,
                    reason: row.reason,
                    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
                }));
            }
            catch (err) {
                console.warn(`[EventRepo] DB query error:`, err.message);
            }
        }
        let filtered = this.fallbackEvents;
        if (typeFilter && typeFilter !== 'ALL') {
            filtered = filtered.filter(e => e.eventType === typeFilter);
        }
        return filtered.slice(-limit).reverse();
    }
}
exports.EventRepository = EventRepository;
exports.eventRepository = new EventRepository();
