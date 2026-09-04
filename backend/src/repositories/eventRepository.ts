/**
 * Event Repository
 * Stores and queries system events, circuit breaker transitions, and cache lifecycle audit logs.
 */

import { dbClient } from '../database/client';
import { db } from '../db';
import { ActivityEvent } from '../types';
import { wsService } from '../ws/server';

export class EventRepository {
  private fallbackEvents: ActivityEvent[] = [];
  private maxMemoryEvents: number = 2000;

  /**
   * Log an activity event
   */
  public async log(event: ActivityEvent): Promise<void> {
    this.fallbackEvents.push(event);
    db.logEvent(event);

    // Live WebSocket broadcast to connected dashboard clients
    try {
      wsService.broadcast({
        type: 'ACTIVITY_EVENT',
        data: event,
      });
    } catch {
      // Ignore if wsService not ready
    }

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
   * Get recent events with optional eventType filter and mode filter
   */
  public async getRecent(limit = 100, typeFilter?: string, modeFilter?: 'live' | 'demo'): Promise<ActivityEvent[]> {
    if (dbClient.isConnected) {
      try {
        let query = 'SELECT id, timestamp, event_type, object_id, score, reason, metadata FROM system_events WHERE 1=1';
        const params: any[] = [];

        if (typeFilter && typeFilter !== 'ALL') {
          query += ` AND event_type = $${params.length + 1}`;
          params.push(typeFilter);
        }

        if (modeFilter === 'demo') {
          query += ` AND (reason LIKE '[DEMO]%' OR object_id LIKE 'DEMO-%')`;
        } else if (modeFilter === 'live') {
          query += ` AND (reason NOT LIKE '[DEMO]%' AND (object_id IS NULL OR object_id NOT LIKE 'DEMO-%'))`;
        }

        query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const res = await dbClient.query(query, params);
        return res.rows.map(row => ({
          id: row.id,
          timestamp: Number(row.timestamp),
          eventType: row.event_type,
          objectId: row.object_id || undefined,
          score: row.score !== null ? parseFloat(row.score) : undefined,
          reason: row.reason,
          metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
          source: (row.reason && row.reason.startsWith('[DEMO]')) || (row.object_id && row.object_id.startsWith('DEMO-')) ? 'demo' : 'live',
        }));
      } catch (err: any) {
        console.warn(`[EventRepo] DB query error:`, err.message);
      }
    }

    let filtered = this.fallbackEvents;
    if (typeFilter && typeFilter !== 'ALL') {
      filtered = filtered.filter(e => e.eventType === typeFilter);
    }
    if (modeFilter === 'demo') {
      filtered = filtered.filter(e => e.source === 'demo' || e.reason.startsWith('[DEMO]') || (e.objectId && e.objectId.startsWith('DEMO-')));
    } else if (modeFilter === 'live') {
      filtered = filtered.filter(e => e.source !== 'demo' && !e.reason.startsWith('[DEMO]') && (!e.objectId || !e.objectId.startsWith('DEMO-')));
    }
    return filtered.slice(-limit).reverse();
  }

  /**
   * Clears ONLY demo activity events, leaving live events untouched.
   */
  public async clearDemoEvents(): Promise<number> {
    const beforeCount = this.fallbackEvents.length;
    this.fallbackEvents = this.fallbackEvents.filter(e =>
      e.source !== 'demo' && !e.reason.startsWith('[DEMO]') && (!e.objectId || !e.objectId.startsWith('DEMO-'))
    );
    const deletedCount = beforeCount - this.fallbackEvents.length;

    if (dbClient.isConnected) {
      try {
        await dbClient.query(`DELETE FROM system_events WHERE reason LIKE '[DEMO]%' OR object_id LIKE 'DEMO-%'`);
      } catch (err: any) {
        console.warn(`[EventRepo] DB clearDemoEvents error:`, err.message);
      }
    }

    return deletedCount;
  }
}

export const eventRepository = new EventRepository();
