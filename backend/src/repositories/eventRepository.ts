/**
 * Event Repository
 * Stores and queries system events, circuit breaker transitions, and cache lifecycle audit logs.
 */

import { dbClient } from '../database/client';
import { ActivityEvent } from '../types';

export class EventRepository {
  private fallbackEvents: ActivityEvent[] = [];
  private maxMemoryEvents: number = 2000;

  /**
   * Log an activity event
   */
  public async log(event: ActivityEvent): Promise<void> {
    this.fallbackEvents.push(event);
    if (this.fallbackEvents.length > this.maxMemoryEvents) {
      this.fallbackEvents.splice(0, 500);
    }

    if (dbClient.isConnected) {
      try {
        await dbClient.query(
          `INSERT INTO system_events (
            id, timestamp, event_type, object_id, score, reason, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING`,
          [
            event.id,
            event.timestamp,
            event.eventType,
            event.objectId || null,
            event.score !== undefined ? event.score : null,
            event.reason,
            event.metadata ? JSON.stringify(event.metadata) : null,
          ]
        );
      } catch (err: any) {
        console.warn(`[EventRepo] DB log error:`, err.message);
      }
    }
  }

  /**
   * Get recent events with optional eventType filter
   */
  public async getRecent(limit = 100, typeFilter?: string): Promise<ActivityEvent[]> {
    if (dbClient.isConnected) {
      try {
        let query = 'SELECT id, timestamp, event_type, object_id, score, reason, metadata FROM system_events';
        const params: any[] = [];

        if (typeFilter && typeFilter !== 'ALL') {
          query += ' WHERE event_type = $1';
          params.push(typeFilter);
          query += ` ORDER BY timestamp DESC LIMIT $2`;
          params.push(limit);
        } else {
          query += ` ORDER BY timestamp DESC LIMIT $1`;
          params.push(limit);
        }

        const res = await dbClient.query(query, params);
        return res.rows.map(row => ({
          id: row.id,
          timestamp: Number(row.timestamp),
          eventType: row.event_type,
          objectId: row.object_id || undefined,
          score: row.score !== null ? parseFloat(row.score) : undefined,
          reason: row.reason,
          metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
        }));
      } catch (err: any) {
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

export const eventRepository = new EventRepository();
