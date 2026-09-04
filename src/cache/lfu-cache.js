/**
 * LFU (Least Frequently Used) Cache Implementation
 * Evicts based on total access count with periodic aging decay.
 */

import { BaseCache } from './base-cache.js';
import { CACHE_STRATEGIES, DEFAULT_CONFIG } from '../core/types.js';

export class LFUCache extends BaseCache {
  constructor(capacityBytes = DEFAULT_CONFIG.cacheCapacityBytes) {
    super(CACHE_STRATEGIES.LFU, capacityBytes);
  }

  get(id, currentTime) {
    const entry = this.entries.get(id);
    if (!entry) {
      this.misses++;
      return { hit: false, entry: null };
    }

    const age = currentTime - entry.createdAt;
    if (age >= DEFAULT_CONFIG.defaultTTL) {
      this.entries.delete(id);
      this.usedBytes -= entry.sizeBytes;
      this.misses++;
      return { hit: false, entry: null, expired: true };
    }

    this.hits++;
    entry.frequency = (entry.frequency || 0) + 1;
    entry.lastAccessedAt = currentTime;
    return { hit: true, entry };
  }

  put(item, currentTime) {
    const sizeBytes = item.sizeBytes || 4096;
    if (sizeBytes > this.capacityBytes) return { admitted: false };

    if (this.entries.has(item.id)) {
      const existing = this.entries.get(item.id);
      this.usedBytes -= existing.sizeBytes;
      existing.frequency = (existing.frequency || 0) + 1;
      existing.lastAccessedAt = currentTime;
      existing.sizeBytes = sizeBytes;
      this.usedBytes += sizeBytes;
      return { admitted: true, entry: existing };
    }

    const bytesNeeded = (this.usedBytes + sizeBytes) - this.capacityBytes;
    if (bytesNeeded > 0) {
      this.evict(bytesNeeded, currentTime);
    }

    const entry = {
      id: item.id,
      name: item.name,
      category: item.category,
      type: item.type,
      sizeBytes,
      baseDbLatencyMs: item.baseDbLatencyMs || 50,
      recomputeCostUnits: item.recomputeCostUnits || 1.0,
      createdAt: currentTime,
      lastAccessedAt: currentTime,
      frequency: 1,
      currentTTL: DEFAULT_CONFIG.defaultTTL
    };

    this.entries.set(item.id, entry);
    this.usedBytes += sizeBytes;
    return { admitted: true, entry };
  }

  evict(bytesNeeded, currentTime) {
    let freedBytes = 0;
    // Sort by frequency ascending, secondary tie-breaker lastAccessedAt
    const entriesList = Array.from(this.entries.values()).sort((a, b) => {
      if (a.frequency !== b.frequency) return a.frequency - b.frequency;
      return a.lastAccessedAt - b.lastAccessedAt;
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
}
