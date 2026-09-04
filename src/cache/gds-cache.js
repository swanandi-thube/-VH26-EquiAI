/**
 * GDS (Greedy Dual-Size) Cache Implementation
 * Evicts based on cost/size ratio with an aging inflation clock L.
 * Formula: H(p) = L + (Cost / Size_KB)
 */

import { BaseCache } from './base-cache.js';
import { CACHE_STRATEGIES, DEFAULT_CONFIG } from '../core/types.js';

export class GDSCache extends BaseCache {
  constructor(capacityBytes = DEFAULT_CONFIG.cacheCapacityBytes) {
    super(CACHE_STRATEGIES.GDS, capacityBytes);
    this.inflationClockL = 0; // L clock
  }

  computePriority(entry) {
    const sizeKB = Math.max(1, (entry.sizeBytes || 4096) / 1024);
    const cost = (entry.baseDbLatencyMs || 50) * (entry.recomputeCostUnits || 1);
    return this.inflationClockL + (cost / sizeKB);
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
    entry.lastAccessedAt = currentTime;
    entry.priorityH = this.computePriority(entry);
    return { hit: true, entry };
  }

  put(item, currentTime) {
    const sizeBytes = item.sizeBytes || 4096;
    if (sizeBytes > this.capacityBytes) return { admitted: false };

    if (this.entries.has(item.id)) {
      const existing = this.entries.get(item.id);
      this.usedBytes -= existing.sizeBytes;
      existing.lastAccessedAt = currentTime;
      existing.sizeBytes = sizeBytes;
      this.usedBytes += sizeBytes;
      existing.priorityH = this.computePriority(existing);
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
      currentTTL: DEFAULT_CONFIG.defaultTTL
    };

    entry.priorityH = this.computePriority(entry);
    this.entries.set(item.id, entry);
    this.usedBytes += sizeBytes;
    return { admitted: true, entry };
  }

  evict(bytesNeeded, currentTime) {
    let freedBytes = 0;
    // Sort by priorityH ascending (lowest priority H evicted first)
    const entriesList = Array.from(this.entries.values()).sort((a, b) => a.priorityH - b.priorityH);

    for (const victim of entriesList) {
      if (freedBytes >= bytesNeeded) break;
      this.inflationClockL = victim.priorityH; // Advance L clock to minimum evicted H
      this.entries.delete(victim.id);
      this.usedBytes -= victim.sizeBytes;
      freedBytes += victim.sizeBytes;
      this.evictions++;
    }
    return freedBytes;
  }
}
