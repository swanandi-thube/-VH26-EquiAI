/**
 * Request Queue & Concurrency Controller (Phase 7 Backend Protection)
 * Regulates concurrent backend in-flight queries and manages bounded FIFO request queue.
 */

import { RequestQueueStats } from '../types';

interface QueuedItem<T> {
  task: () => Promise<T>;
  enqueuedAt: number;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  timer: NodeJS.Timeout;
}

export class RequestQueue {
  private maxConcurrency: number = 50;  // Max concurrent in-flight requests to origin
  private maxQueueDepth: number = 200;  // Max queued requests waiting
  private activeRequests: number = 0;
  private queue: QueuedItem<any>[] = [];

  private totalQueued: number = 0;
  private totalProcessed: number = 0;
  private rejectedRequests: number = 0;
  private recentWaitTimes: number[] = [];

  constructor(maxConcurrency = 50, maxQueueDepth = 200) {
    this.maxConcurrency = maxConcurrency;
    this.maxQueueDepth = maxQueueDepth;
  }

  public setConfig(maxConcurrency: number, maxQueueDepth: number) {
    this.maxConcurrency = maxConcurrency;
    this.maxQueueDepth = maxQueueDepth;
  }

  /**
   * Enqueue a backend task with bounded concurrency and timeout
   */
  public async enqueue<T>(task: () => Promise<T>, timeoutMs = 5000): Promise<T> {
    // 1. If capacity is immediately available and no queue exists, execute immediately
    if (this.activeRequests < this.maxConcurrency && this.queue.length === 0) {
      this.activeRequests++;
      this.totalProcessed++;
      try {
        const result = await task();
        return result;
      } finally {
        this.activeRequests--;
        this.processNext();
      }
    }

    // 2. Check if queue is saturated
    if (this.queue.length >= this.maxQueueDepth) {
      this.rejectedRequests++;
      throw new Error(`Backend Request Queue Saturated (Queue depth ${this.queue.length}/${this.maxQueueDepth})`);
    }

    // 3. Queue item with timeout
    this.totalQueued++;
    const enqueuedAt = Date.now();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const idx = this.queue.findIndex(item => item.enqueuedAt === enqueuedAt);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          this.rejectedRequests++;
          reject(new Error(`Backend Request Queuing Timeout (${timeoutMs}ms elapsed)`));
        }
      }, timeoutMs);

      this.queue.push({
        task,
        enqueuedAt,
        resolve,
        reject,
        timer,
      });
    });
  }

  private async processNext(): Promise<void> {
    if (this.activeRequests >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    clearTimeout(item.timer);
    const waitTime = Math.max(0, Date.now() - item.enqueuedAt);
    this.recentWaitTimes.push(waitTime);
    if (this.recentWaitTimes.length > 50) {
      this.recentWaitTimes.shift();
    }

    this.activeRequests++;
    this.totalProcessed++;

    try {
      const result = await item.task();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.activeRequests--;
      this.processNext();
    }
  }

  public getStats(): RequestQueueStats {
    const totalWait = this.recentWaitTimes.reduce((a, b) => a + b, 0);
    const avgWait = this.recentWaitTimes.length > 0 ? Math.round(totalWait / this.recentWaitTimes.length) : 0;

    return {
      queueDepth: this.queue.length,
      activeRequests: this.activeRequests,
      waitingRequests: this.queue.length,
      rejectedRequests: this.rejectedRequests,
      maxConcurrency: this.maxConcurrency,
      maxQueueDepth: this.maxQueueDepth,
      averageWaitTimeMs: avgWait,
    };
  }

  public reset(): void {
    for (const item of this.queue) {
      clearTimeout(item.timer);
      item.reject(new Error('Request queue reset'));
    }
    this.queue = [];
    this.activeRequests = 0;
    this.totalQueued = 0;
    this.totalProcessed = 0;
    this.rejectedRequests = 0;
    this.recentWaitTimes = [];
  }
}

export const requestQueue = new RequestQueue();
