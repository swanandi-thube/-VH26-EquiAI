"use strict";
/**
 * Request Queue & Concurrency Controller (Phase 7 Backend Protection)
 * Regulates concurrent backend in-flight queries and manages bounded FIFO request queue.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestQueue = exports.RequestQueue = void 0;
class RequestQueue {
    maxConcurrency = 50; // Max concurrent in-flight requests to origin
    maxQueueDepth = 200; // Max queued requests waiting
    activeRequests = 0;
    queue = [];
    totalQueued = 0;
    totalProcessed = 0;
    rejectedRequests = 0;
    recentWaitTimes = [];
    constructor(maxConcurrency = 50, maxQueueDepth = 200) {
        this.maxConcurrency = maxConcurrency;
        this.maxQueueDepth = maxQueueDepth;
    }
    setConfig(maxConcurrency, maxQueueDepth) {
        this.maxConcurrency = maxConcurrency;
        this.maxQueueDepth = maxQueueDepth;
    }
    /**
     * Enqueue a backend task with bounded concurrency and timeout
     */
    async enqueue(task, timeoutMs = 5000) {
        // 1. If capacity is immediately available and no queue exists, execute immediately
        if (this.activeRequests < this.maxConcurrency && this.queue.length === 0) {
            this.activeRequests++;
            this.totalProcessed++;
            try {
                const result = await task();
                return result;
            }
            finally {
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
        return new Promise((resolve, reject) => {
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
    async processNext() {
        if (this.activeRequests >= this.maxConcurrency || this.queue.length === 0) {
            return;
        }
        const item = this.queue.shift();
        if (!item)
            return;
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
        }
        catch (err) {
            item.reject(err);
        }
        finally {
            this.activeRequests--;
            this.processNext();
        }
    }
    getStats() {
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
    reset() {
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
exports.RequestQueue = RequestQueue;
exports.requestQueue = new RequestQueue();
