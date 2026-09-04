/**
 * Smart Cache Implementation
 * Flagship Adaptive, Application-Aware Cache with Multi-Factor Scoring, Dynamic TTL, and Pollution Defense
 */

import { BaseCache } from './base-cache.js';
import { SmartScorer } from './smart-scorer.js';
import { DynamicTTLManager } from './ttl-manager.js';
import { PollutionGuard } from './pollution-guard.js';
import { CACHE_STRATEGIES, DECISION_TYPES, DEFAULT_CONFIG } from '../core/types.js';

export class SmartCache extends BaseCache {
  constructor(capacityBytes = DEFAULT_CONFIG.cacheCapacityBytes, workloadType) {
    super(CACHE_STRATEGIES.SMART, capacityBytes);
    this.scorer = new SmartScorer(workloadType);
    this.ttlManager = new DynamicTTLManager();
    this.pollutionGuard = new PollutionGuard();
    this.maxItemSizeBytes = DEFAULT_CONFIG.maxItemSizeBytes;
    
    // Activity tracking for rate calculation
    this.windowRequests = 0;
    this.lastEvaluatedAt = 0;
  }

  setWorkloadType(workloadType) {
    this.scorer.updateWeightsForWorkload(workloadType);
  }

  get(id, currentTime) {
    const entry = this.entries.get(id);
    if (!entry) {
      this.misses++;
      return { hit: false, entry: null };
    }

    const age = currentTime - entry.createdAt;
    
    // Check for expiration
    if (age >= entry.currentTTL) {
      // Expired
      this.entries.delete(id);
      this.usedBytes -= entry.sizeBytes;
      this.misses++;
      return { hit: false, entry: null, expired: true };
    }

    // HIT
    this.hits++;
    entry.totalHits++;
    entry.recentHits = (entry.recentHits || 0) + 1;
    entry.lastAccessedAt = currentTime;

    // Check if item qualifies for proactive REFRESH (approaching staleness but high utility)
    if (age >= entry.currentTTL * 0.75 && entry.score >= 0.45) {
      entry.decision = DECISION_TYPES.REFRESH;
      entry.reason = `Approaching TTL threshold (${Math.round(age)}s / ${entry.currentTTL}s). Background refresh triggered to preserve hot cache line.`;
      this.refreshes++;
      entry.createdAt = currentTime; // Proactively refreshed
    }

    return { hit: true, entry };
  }

  put(item, currentTime) {
    const sizeBytes = item.sizeBytes || 4096;

    // Reject single item exceeding full cache
    if (sizeBytes > this.capacityBytes) {
      return { admitted: false, reason: 'Object size exceeds total cache capacity' };
    }

    // Record with Pollution Guard
    this.pollutionGuard.recordRequest(item.id, item.isPollutionKey, currentTime);

    // If pollution attack is high and item is an unverified single-use key, reject or quarantine
    const pollutionStatus = this.pollutionGuard.evaluate(this.getEntriesList(), currentTime);
    if (pollutionStatus.riskLevel === 'HIGH' && item.isPollutionKey) {
      return { admitted: false, reason: 'Rejected by Cache Pollution Defense: low-reuse ephemeral key.' };
    }

    // If already exists, update entry
    if (this.entries.has(item.id)) {
      const existing = this.entries.get(item.id);
      this.usedBytes -= existing.sizeBytes;
      existing.lastAccessedAt = currentTime;
      existing.totalHits++;
      existing.recentHits = (existing.recentHits || 0) + 1;
      existing.sizeBytes = sizeBytes;
      this.usedBytes += sizeBytes;
      this.recalculateEntry(existing, currentTime);
      return { admitted: true, entry: existing };
    }

    // Evict space if needed
    const bytesNeeded = (this.usedBytes + sizeBytes) - this.capacityBytes;
    if (bytesNeeded > 0) {
      this.evict(bytesNeeded, currentTime);
    }

    // Create fresh entry
    const entry = {
      id: item.id,
      name: item.name,
      category: item.category,
      type: item.type,
      sizeBytes,
      baseDbLatencyMs: item.baseDbLatencyMs || 50,
      recomputeCostUnits: item.recomputeCostUnits || 1.0,
      updateVolatility: item.updateVolatility || 0.1,
      createdAt: currentTime,
      lastAccessedAt: currentTime,
      totalHits: 1,
      recentHits: 1,
      prevWindowHits: 0,
      currentTTL: DEFAULT_CONFIG.defaultTTL,
      prevTTL: DEFAULT_CONFIG.defaultTTL,
      score: 0.50,
      decision: DECISION_TYPES.RETAIN,
      reason: 'Newly admitted into cache store.',
      factors: {}
    };

    this.entries.set(item.id, entry);
    this.usedBytes += sizeBytes;

    // Immediate scoring evaluation
    this.recalculateEntry(entry, currentTime);

    return { admitted: true, entry };
  }

  recalculateEntry(entry, currentTime) {
    const context = {
      currentTime,
      cacheCapacityBytes: this.capacityBytes,
      maxItemSizeBytes: this.maxItemSizeBytes,
      totalWindowRequests: Math.max(1, this.windowRequests)
    };

    const evalResult = this.scorer.evaluateObject(entry, context);
    const ttlResult = this.ttlManager.computeTTL(entry, evalResult);

    entry.score = evalResult.finalScore;
    entry.factors = evalResult.factors;
    entry.weights = evalResult.weights;
    entry.prevTTL = ttlResult.prevTTL;
    entry.currentTTL = ttlResult.newTTL;

    const age = currentTime - entry.createdAt;

    // Compute explicit decision and explainable reason
    if (age >= entry.currentTTL * 0.80 && entry.score >= 0.45) {
      entry.decision = DECISION_TYPES.REFRESH;
      entry.reason = `High demand item (${entry.totalHits} hits, score ${entry.score}) approaching staleness threshold. Proactive refresh active.`;
    } else if (entry.score >= 0.40) {
      entry.decision = DECISION_TYPES.RETAIN;
      entry.reason = `High frequency + retrieval cost (${entry.baseDbLatencyMs}ms) + recent access justifies cache occupancy.`;
    } else {
      entry.decision = DECISION_TYPES.EVICT;
      entry.reason = `Low reuse probability + score (${entry.score}) makes this object prime candidate for eviction under memory pressure.`;
    }

    return entry;
  }

  evict(bytesNeeded, currentTime) {
    let freedBytes = 0;

    // Recalculate all entries before eviction ranking
    const entriesList = this.getEntriesList();
    for (const e of entriesList) {
      this.recalculateEntry(e, currentTime);
    }

    // Sort by Score ascending (lowest score evicted first), protecting shielded items
    entriesList.sort((a, b) => {
      const aProtected = this.pollutionGuard.isProtected(a.id) ? 1 : 0;
      const bProtected = this.pollutionGuard.isProtected(b.id) ? 1 : 0;
      if (aProtected !== bProtected) return aProtected - bProtected;
      return a.score - b.score;
    });

    for (const victim of entriesList) {
      if (freedBytes >= bytesNeeded) break;
      this.entries.delete(victim.id);
      this.usedBytes -= victim.sizeBytes;
      freedBytes += victim.sizeBytes;
      this.evictions++;
    }

    return freedBytes;
  }

  periodicMaintenance(currentTime, totalWindowRequests) {
    this.windowRequests = totalWindowRequests;
    this.pollutionGuard.evaluate(this.getEntriesList(), currentTime);

    // Update hits and decay
    for (const entry of this.entries.values()) {
      entry.prevWindowHits = entry.recentHits || 0;
      entry.recentHits = Math.floor((entry.recentHits || 0) * 0.7); // decay
      this.recalculateEntry(entry, currentTime);
    }
  }
}
