"use strict";
/**
 * Decision Repository
 * Stores and queries adaptive lifecycle decisions (KEEP, REFRESH, EVICT, PRE-CACHE).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionRepository = exports.DecisionRepository = void 0;
const client_1 = require("../database/client");
class DecisionRepository {
    fallbackDecisions = [];
    maxMemoryDecisions = 5000;
    /**
     * Log an adaptive decision
     */
    async log(decision) {
        this.fallbackDecisions.push(decision);
        if (this.fallbackDecisions.length > this.maxMemoryDecisions) {
            this.fallbackDecisions.splice(0, 1000);
        }
        if (client_1.dbClient.isConnected) {
            try {
                await client_1.dbClient.query(`INSERT INTO cache_decisions (
            id, object_id, decision_type, adaptive_score, factors,
            previous_ttl, new_ttl, predicted_demand, confidence, reason, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO NOTHING`, [
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
                ]);
            }
            catch (err) {
                console.warn(`[DecisionRepo] DB log error:`, err.message);
            }
        }
    }
    /**
     * Get recent decisions
     */
    async getRecent(limit = 50) {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query(`SELECT id, object_id, decision_type, adaptive_score, factors,
                  previous_ttl, new_ttl, predicted_demand, confidence, reason, timestamp
           FROM cache_decisions
           ORDER BY timestamp DESC
           LIMIT $1`, [limit]);
                return res.rows.map(row => ({
                    id: row.id,
                    objectId: row.object_id,
                    decisionType: row.decision_type,
                    adaptiveScore: parseFloat(row.adaptive_score),
                    factors: typeof row.factors === 'string' ? JSON.parse(row.factors) : row.factors,
                    previousTtl: parseInt(row.previous_ttl, 10),
                    newTtl: parseInt(row.new_ttl, 10),
                    predictedDemand: parseFloat(row.predicted_demand),
                    confidence: parseFloat(row.confidence),
                    reason: row.reason,
                    timestamp: Number(row.timestamp),
                }));
            }
            catch (err) {
                console.warn(`[DecisionRepo] DB query error:`, err.message);
            }
        }
        return this.fallbackDecisions.slice(-limit).reverse();
    }
    /**
     * Get decision by ID
     */
    async findById(id) {
        if (client_1.dbClient.isConnected) {
            try {
                const res = await client_1.dbClient.query(`SELECT id, object_id, decision_type, adaptive_score, factors,
                  previous_ttl, new_ttl, predicted_demand, confidence, reason, timestamp
           FROM cache_decisions
           WHERE id = $1`, [id]);
                if (res.rows.length > 0) {
                    const row = res.rows[0];
                    return {
                        id: row.id,
                        objectId: row.object_id,
                        decisionType: row.decision_type,
                        adaptiveScore: parseFloat(row.adaptive_score),
                        factors: typeof row.factors === 'string' ? JSON.parse(row.factors) : row.factors,
                        previousTtl: parseInt(row.previous_ttl, 10),
                        newTtl: parseInt(row.new_ttl, 10),
                        predictedDemand: parseFloat(row.predicted_demand),
                        confidence: parseFloat(row.confidence),
                        reason: row.reason,
                        timestamp: Number(row.timestamp),
                    };
                }
            }
            catch (err) {
                console.warn(`[DecisionRepo] DB find error:`, err.message);
            }
        }
        return this.fallbackDecisions.find(d => d.id === id) || null;
    }
}
exports.DecisionRepository = DecisionRepository;
exports.decisionRepository = new DecisionRepository();
