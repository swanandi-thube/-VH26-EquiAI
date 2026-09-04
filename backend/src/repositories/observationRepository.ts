/**
 * Object Observations Repository (Phase 5 Append-Only Time-Series Store)
 * Stores and queries historical time-series observation data for cache objects.
 */

import { dbClient } from '../database/client';
import { ObjectObservationRecord } from '../types';

export class ObservationRepository {
  private fallbackObservations: ObjectObservationRecord[] = [];
  private maxMemoryRecords: number = 10000;

  /**
   * Save an observation record (append-only)
   */
  public async saveObservation(obs: ObjectObservationRecord): Promise<void> {
    const record: ObjectObservationRecord = {
      ...obs,
      timestamp: obs.timestamp || Date.now(),
      requestCount: obs.requestCount !== undefined ? obs.requestCount : 1,
      demand: obs.demand !== undefined ? obs.demand : 1.0,
      backendLatencyMs: obs.backendLatencyMs || 0,
      retrievalCostMs: obs.retrievalCostMs || 0,
      responseSizeBytes: obs.responseSizeBytes || 0,
    };

    this.fallbackObservations.push(record);
    if (this.fallbackObservations.length > this.maxMemoryRecords) {
      this.fallbackObservations.splice(0, 1000);
    }

    if (dbClient.isConnected) {
      try {
        await dbClient.query(
          `INSERT INTO object_observations (
            object_id, timestamp, request_count, demand, price, inventory,
            backend_latency, retrieval_cost, response_size
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            record.objectId,
            record.timestamp,
            record.requestCount,
            record.demand,
            record.price !== undefined ? record.price : null,
            record.inventory !== undefined ? record.inventory : null,
            record.backendLatencyMs,
            record.retrievalCostMs,
            record.responseSizeBytes,
          ]
        );
      } catch (err: any) {
        console.warn(`[ObservationRepo] DB save error:`, err.message);
      }
    }
  }

  /**
   * Get recent observations for a specific object (sorted chronologically ascending or descending)
   */
  public async getRecentObservations(objectId: string, limit = 50): Promise<ObjectObservationRecord[]> {
    if (dbClient.isConnected) {
      try {
        const res = await dbClient.query(
          `SELECT id, object_id, timestamp, request_count, demand, price, inventory,
                  backend_latency, retrieval_cost, response_size
           FROM object_observations
           WHERE object_id = $1
           ORDER BY timestamp DESC
           LIMIT $2`,
          [objectId, limit]
        );
        return res.rows.map(row => ({
          id: row.id ? String(row.id) : undefined,
          objectId: row.object_id,
          timestamp: Number(row.timestamp),
          requestCount: parseInt(row.request_count, 10),
          demand: parseFloat(row.demand),
          price: row.price !== null ? parseFloat(row.price) : undefined,
          inventory: row.inventory !== null ? parseInt(row.inventory, 10) : undefined,
          backendLatencyMs: parseInt(row.backend_latency, 10),
          retrievalCostMs: parseInt(row.retrieval_cost, 10),
          responseSizeBytes: parseInt(row.response_size, 10),
        }));
      } catch (err: any) {
        console.warn(`[ObservationRepo] DB query error:`, err.message);
      }
    }

    return this.fallbackObservations
      .filter(o => o.objectId === objectId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get observations for an object within a time range
   */
  public async getObservationsInRange(
    objectId: string,
    startTime: number,
    endTime: number
  ): Promise<ObjectObservationRecord[]> {
    if (dbClient.isConnected) {
      try {
        const res = await dbClient.query(
          `SELECT id, object_id, timestamp, request_count, demand, price, inventory,
                  backend_latency, retrieval_cost, response_size
           FROM object_observations
           WHERE object_id = $1 AND timestamp >= $2 AND timestamp <= $3
           ORDER BY timestamp ASC`,
          [objectId, startTime, endTime]
        );
        return res.rows.map(row => ({
          id: row.id ? String(row.id) : undefined,
          objectId: row.object_id,
          timestamp: Number(row.timestamp),
          requestCount: parseInt(row.request_count, 10),
          demand: parseFloat(row.demand),
          price: row.price !== null ? parseFloat(row.price) : undefined,
          inventory: row.inventory !== null ? parseInt(row.inventory, 10) : undefined,
          backendLatencyMs: parseInt(row.backend_latency, 10),
          retrievalCostMs: parseInt(row.retrieval_cost, 10),
          responseSizeBytes: parseInt(row.response_size, 10),
        }));
      } catch (err: any) {
        console.warn(`[ObservationRepo] DB query range error:`, err.message);
      }
    }

    return this.fallbackObservations
      .filter(o => o.objectId === objectId && o.timestamp >= startTime && o.timestamp <= endTime)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get all recent observations across all objects
   */
  public async getAllObservations(limit = 100): Promise<ObjectObservationRecord[]> {
    if (dbClient.isConnected) {
      try {
        const res = await dbClient.query(
          `SELECT id, object_id, timestamp, request_count, demand, price, inventory,
                  backend_latency, retrieval_cost, response_size
           FROM object_observations
           ORDER BY timestamp DESC
           LIMIT $1`,
          [limit]
        );
        return res.rows.map(row => ({
          id: row.id ? String(row.id) : undefined,
          objectId: row.object_id,
          timestamp: Number(row.timestamp),
          requestCount: parseInt(row.request_count, 10),
          demand: parseFloat(row.demand),
          price: row.price !== null ? parseFloat(row.price) : undefined,
          inventory: row.inventory !== null ? parseInt(row.inventory, 10) : undefined,
          backendLatencyMs: parseInt(row.backend_latency, 10),
          retrievalCostMs: parseInt(row.retrieval_cost, 10),
          responseSizeBytes: parseInt(row.response_size, 10),
        }));
      } catch (err: any) {
        console.warn(`[ObservationRepo] DB query all error:`, err.message);
      }
    }

    return this.fallbackObservations.slice(-limit).reverse();
  }

  /**
   * Clear in-memory observations (useful for unit tests)
   */
  public clear(): void {
    this.fallbackObservations = [];
  }
}

export const observationRepository = new ObservationRepository();
