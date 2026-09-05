/**
 * Object Observations Repository (Phase 5 Append-Only Time-Series Store)
 * Stores and queries historical time-series observation data for cache objects with commodity metadata.
 */

import { dbClient } from '../database/client';
import { COMMODITY_CATALOG } from '../database/commodityCatalog';
import { ObjectObservationRecord } from '../types';

export class ObservationRepository {
  private fallbackObservations: ObjectObservationRecord[] = [];
  private maxMemoryRecords: number = 10000;

  constructor() {
    this.seedFallbackObservations();
  }

  private seedFallbackObservations() {
    const now = Date.now();
    for (let cIdx = 0; cIdx < COMMODITY_CATALOG.length; cIdx++) {
      const item = COMMODITY_CATALOG[cIdx];
      // 3 historical observations per commodity at past intervals
      const offsets = [72, 36, 12]; // hours ago
      const priceMultipliers = [0.96, 0.98, 1.0];

      for (let i = 0; i < offsets.length; i++) {
        const histPrice = Math.round(item.price * priceMultipliers[i] * 100) / 100;
        const prevPrice = i > 0
          ? Math.round(item.price * priceMultipliers[i - 1] * 100) / 100
          : Math.round(histPrice * 0.95 * 100) / 100;
        const changePct = Math.round(((histPrice - prevPrice) / prevPrice) * 10000) / 100;
        const obsTime = now - (offsets[i] * 3600000);

        this.fallbackObservations.push({
          id: `HIST-OBS-${item.objectId}-${i + 1}`,
          objectId: item.objectId,
          productName: item.name,
          category: item.category,
          location: item.location,
          price: histPrice,
          previousPrice: prevPrice,
          priceChangePct: changePct,
          timestamp: obsTime,
          source: 'seeded_demo',
          sourceReference: 'APMC_MARKET_FEED_HISTORICAL',
          dataStatus: 'COMMITTED',
          requestCount: 15 + (i * 10),
          demand: 1.0 + (i * 0.2),
          backendLatencyMs: item.baseRetrievalCostMs,
          retrievalCostMs: item.baseRetrievalCostMs,
          responseSizeBytes: item.sizeBytes,
        });
      }
    }
  }

  /**
   * Save an observation record (append-only)
   */
  public async saveObservation(obs: ObjectObservationRecord): Promise<void> {
    const record: ObjectObservationRecord = {
      ...obs,
      timestamp: obs.timestamp || Date.now(),
      source: obs.source || 'live',
      dataStatus: obs.dataStatus || 'COMMITTED',
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
            object_id, product_name, category, location, price, previous_price, price_change_pct,
            timestamp, source, source_reference, data_status, request_count, demand, inventory,
            backend_latency, retrieval_cost, response_size
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            record.objectId,
            record.productName || null,
            record.category || null,
            record.location || null,
            record.price !== undefined ? record.price : null,
            record.previousPrice !== undefined ? record.previousPrice : null,
            record.priceChangePct !== undefined ? record.priceChangePct : 0.0,
            record.timestamp,
            record.source || 'live',
            record.sourceReference || null,
            record.dataStatus || 'COMMITTED',
            record.requestCount || 1,
            record.demand || 1.0,
            record.inventory !== undefined ? record.inventory : null,
            record.backendLatencyMs || 0,
            record.retrievalCostMs || 0,
            record.responseSizeBytes || 0,
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
          `SELECT id, object_id, product_name, category, location, price, previous_price, price_change_pct,
                  timestamp, source, source_reference, data_status, request_count, demand, inventory,
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
          productName: row.product_name || undefined,
          category: row.category || undefined,
          location: row.location || undefined,
          price: row.price !== null ? parseFloat(row.price) : undefined,
          previousPrice: row.previous_price !== null ? parseFloat(row.previous_price) : undefined,
          priceChangePct: row.price_change_pct !== null ? parseFloat(row.price_change_pct) : undefined,
          timestamp: Number(row.timestamp),
          source: row.source || 'live',
          sourceReference: row.source_reference || undefined,
          dataStatus: row.data_status || 'COMMITTED',
          requestCount: parseInt(row.request_count, 10),
          demand: parseFloat(row.demand),
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
          `SELECT id, object_id, product_name, category, location, price, previous_price, price_change_pct,
                  timestamp, source, source_reference, data_status, request_count, demand, inventory,
                  backend_latency, retrieval_cost, response_size
           FROM object_observations
           WHERE object_id = $1 AND timestamp >= $2 AND timestamp <= $3
           ORDER BY timestamp ASC`,
          [objectId, startTime, endTime]
        );
        return res.rows.map(row => ({
          id: row.id ? String(row.id) : undefined,
          objectId: row.object_id,
          productName: row.product_name || undefined,
          category: row.category || undefined,
          location: row.location || undefined,
          price: row.price !== null ? parseFloat(row.price) : undefined,
          previousPrice: row.previous_price !== null ? parseFloat(row.previous_price) : undefined,
          priceChangePct: row.price_change_pct !== null ? parseFloat(row.price_change_pct) : undefined,
          timestamp: Number(row.timestamp),
          source: row.source || 'live',
          sourceReference: row.source_reference || undefined,
          dataStatus: row.data_status || 'COMMITTED',
          requestCount: parseInt(row.request_count, 10),
          demand: parseFloat(row.demand),
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
          `SELECT id, object_id, product_name, category, location, price, previous_price, price_change_pct,
                  timestamp, source, source_reference, data_status, request_count, demand, inventory,
                  backend_latency, retrieval_cost, response_size
           FROM object_observations
           ORDER BY timestamp DESC
           LIMIT $1`,
          [limit]
        );
        return res.rows.map(row => ({
          id: row.id ? String(row.id) : undefined,
          objectId: row.object_id,
          productName: row.product_name || undefined,
          category: row.category || undefined,
          location: row.location || undefined,
          price: row.price !== null ? parseFloat(row.price) : undefined,
          previousPrice: row.previous_price !== null ? parseFloat(row.previous_price) : undefined,
          priceChangePct: row.price_change_pct !== null ? parseFloat(row.price_change_pct) : undefined,
          timestamp: Number(row.timestamp),
          source: row.source || 'live',
          sourceReference: row.source_reference || undefined,
          dataStatus: row.data_status || 'COMMITTED',
          requestCount: parseInt(row.request_count, 10),
          demand: parseFloat(row.demand),
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
