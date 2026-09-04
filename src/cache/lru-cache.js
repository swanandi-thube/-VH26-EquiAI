/**
 * LRU (Least Recently Used) Cache Implementation
 * Evicts strictly based on timestamp of last access.
 */

import { BaseCache } from './base-cache.js';
import { CACHE_STRATEGIES, DEFAULT_CONFIG } from '../core/types.js';

export class LRUCache extends BaseCache {
  constructor(capacityBytes = DEFAULT_CONFIG.cacheCapacityBytes) {
    super(CACHE_STRATEGIES.LRU, capacityBytes);
  }

  get(id, currentTime) {
    const entry = this.entries.get(id);
    if (!entry) {
      this.misses++;
      return { hit: false, entry: null };
    }

    // Static TTL check (90s)
    const age = currentTime - entry.createdAt;
    if (age >= DEFAULT_CONFIG.defaultTTL) {
      this.entries.delete(id);
      this.usedBytes -= entry.sizeBytes;
      this.misses++;
      return { hit: false, entry: null, expired: true };
    }

    this.hits++;
    entry.lastAccessedAt = currentTime;
    entry.totalHits++;
    return { hit: true, entry };
  }

  put(item, currentTime) {
    const sizeBytes = item.sizeBytes || 4096;
    if (sizeBytes > this.capacityBytes) return { admitted: false };

    if (this.entries.has(item.id)) {
      const existing = this.entries.get(item.id);
      this.usedBytes -= existing.sizeBytes;
      existing.lastAccessedAt = currentTime;
      existing.totalHits++;
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
      totalHits: 1,
      currentTTL: DEFAULT_CONFIG.defaultTTL
    };

    this.entries.set(item.id, entry);
    this.usedBytes += sizeBytes;
    return { admitted: true, entry };
  }

  evict(bytesNeeded, currentTime) {
    let freedBytes = 0;
    // Sort by lastAccessedAt ascending
    const entriesList = Array.from(this.entries.values()).sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

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
