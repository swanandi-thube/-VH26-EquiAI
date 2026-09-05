/**
 * Decision Repository
 * Stores and queries adaptive lifecycle decisions (KEEP, REFRESH, EVICT, PRE-CACHE).
 */

import { dbClient } from '../database/client';
import { db } from '../db';
import { DecisionRecord } from '../types';

export class DecisionRepository {
  private fallbackDecisions: DecisionRecord[] = [];
  private maxMemoryDecisions: number = 5000;

  /**
   * Log an adaptive decision
   */
  public async log(decision: DecisionRecord): Promise<void> {
    this.fallbackDecisions.push(decision);
    db.logDecision(decision);
    if (this.fallbackDecisions.length > this.maxMemoryDecisions) {
      this.fallbackDecisions.splice(0, 1000);
    }

    if (dbClient.isConnected) {
      try {
        await dbClient.query(
          `INSERT INTO cache_decisions (
            id, object_id, decision_type, adaptive_score, factors,
            previous_ttl, new_ttl, predicted_demand, confidence, reason, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO NOTHING`,
          [
            decision.id,
            decision.objectId,
            decision.decisionType,
            decision.adaptiveScore,
            JSON.stringify(decision.factors),
            decision.previousTtl,
            decision.newTtl,
            decision.predictedDemand,
            decision.confidence,
            decision.reason,
            decision.timestamp,
          ]
        );
      } catch (err: any) {
        console.warn(`[DecisionRepo] DB log error:`, err.message);
      }
    }
  }

  /**
   * Get recent decisions
   */
  public async getRecent(limit = 50): Promise<DecisionRecord[]> {
    if (dbClient.isConnected) {
      try {
        const res = await dbClient.query(
          `SELECT id, object_id, decision_type, adaptive_score, factors,
                  previous_ttl, new_ttl, predicted_demand, confidence, reason, timestamp
           FROM cache_decisions
           ORDER BY timestamp DESC
           LIMIT $1`,
          [limit]
        );
        return res.rows.map(row => ({
          id: row.id,
          objectId: row.object_id,
          decisionType: row.decision_type,
          adaptiveScore: parseFloat(row.adaptive_score),
          factors: row.factors
            ? (typeof row.factors === 'string' ? JSON.parse(row.factors) : row.factors)
            : { frequency: 0, recency: 0, trend: 0, retrievalCost: 0, backendPressure: 0, memoryCost: 0, predictedDemand: 0, confidence: 0, finalScore: 0 },
          previousTtl: parseInt(row.previous_ttl, 10),
          newTtl: parseInt(row.new_ttl, 10),
          predictedDemand: parseFloat(row.predicted_demand),
          confidence: parseFloat(row.confidence),
          reason: row.reason,
          timestamp: Number(row.timestamp),
        }));
      } catch (err: any) {
        console.warn(`[DecisionRepo] DB query error:`, err.message);
      }
    }

    return this.fallbackDecisions.slice(-limit).reverse();
  }

  /**
   * Get decision by ID
   */
  public async findById(id: string): Promise<DecisionRecord | null> {
    if (dbClient.isConnected) {
      try {
        const res = await dbClient.query(
          `SELECT id, object_id, decision_type, adaptive_score, factors,
                  previous_ttl, new_ttl, predicted_demand, confidence, reason, timestamp
           FROM cache_decisions
           WHERE id = $1`,
          [id]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            objectId: row.object_id,
            decisionType: row.decision_type,
            adaptiveScore: parseFloat(row.adaptive_score),
            factors: row.factors
              ? (typeof row.factors === 'string' ? JSON.parse(row.factors) : row.factors)
              : { frequency: 0, recency: 0, trend: 0, retrievalCost: 0, backendPressure: 0, memoryCost: 0, predictedDemand: 0, confidence: 0, finalScore: 0 },
            previousTtl: parseInt(row.previous_ttl, 10),
            newTtl: parseInt(row.new_ttl, 10),
            predictedDemand: parseFloat(row.predicted_demand),
            confidence: parseFloat(row.confidence),
            reason: row.reason,
            timestamp: Number(row.timestamp),
          };
        }
      } catch (err: any) {
        console.warn(`[DecisionRepo] DB find error:`, err.message);
      }
    }

    return this.fallbackDecisions.find(d => d.id === id) || null;
  }

  /**
   * Clears ONLY demo lifecycle decisions, leaving live data completely untouched.
   */
  public async clearDemoDecisions(): Promise<number> {
    const beforeCount = this.fallbackDecisions.length;
    this.fallbackDecisions = this.fallbackDecisions.filter(d =>
      d.source !== 'demo' && !d.reason.startsWith('[DEMO]') && !d.objectId.startsWith('DEMO-')
    );
    const deletedCount = beforeCount - this.fallbackDecisions.length;

    if (dbClient.isConnected) {
      try {
        await dbClient.query(`DELETE FROM cache_decisions WHERE reason LIKE '[DEMO]%' OR object_id LIKE 'DEMO-%'`);
      } catch (err: any) {
        console.warn(`[DecisionRepo] DB clearDemoDecisions error:`, err.message);
      }
    }

    return deletedCount;
  }
}

export const decisionRepository = new DecisionRepository();
