/**
 * Base Cache Strategy Class
 * Common interface for all cache implementations
 */

export class BaseCache {
  constructor(name, capacityBytes) {
    this.name = name;
    this.capacityBytes = capacityBytes;
    this.usedBytes = 0;
    this.entries = new Map(); // id -> entry

    // Telemetry counters
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.refreshes = 0;
  }

  get(id, currentTime) {
    throw new Error('get() must be implemented by subclass');
  }

  put(item, currentTime) {
    throw new Error('put() must be implemented by subclass');
  }

  evict(bytesNeeded, currentTime) {
    throw new Error('evict() must be implemented by subclass');
  }

  setCapacity(newCapacityBytes) {
    this.capacityBytes = newCapacityBytes;
    if (this.usedBytes > this.capacityBytes) {
      this.evict(this.usedBytes - this.capacityBytes, Date.now() / 1000);
    }
  }

  clear() {
    this.entries.clear();
    this.usedBytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.refreshes = 0;
  }

  getHitRate() {
    const total = this.hits + this.misses;
    return total > 0 ? (this.hits / total) : 0;
  }

  getUsagePercent() {
    return this.capacityBytes > 0 ? (this.usedBytes / this.capacityBytes) * 100 : 0;
  }

  getEntriesList() {
    return Array.from(this.entries.values());
  }
}
