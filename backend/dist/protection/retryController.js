"use strict";
/**
 * Retry Controller with Jittered Exponential Backoff (Phase 7 Backend Protection)
 * Retries transient backend failures while respecting circuit breaker states.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryController = exports.RetryController = void 0;
const circuitBreaker_1 = require("./circuitBreaker");
class RetryController {
    maxRetries = 3;
    initialBackoffMs = 100;
    maxBackoffMs = 2000;
    jitterRatio = 0.25;
    totalRetries = 0;
    successfulRetries = 0;
    exhaustedRetries = 0;
    constructor(maxRetries = 3, initialBackoffMs = 100, maxBackoffMs = 2000) {
        this.maxRetries = maxRetries;
        this.initialBackoffMs = initialBackoffMs;
        this.maxBackoffMs = maxBackoffMs;
    }
    setConfig(maxRetries, initialBackoffMs = 100, maxBackoffMs = 2000) {
        this.maxRetries = maxRetries;
        this.initialBackoffMs = initialBackoffMs;
        this.maxBackoffMs = maxBackoffMs;
    }
    /**
     * Execute an async operation with jittered exponential backoff
     */
    async executeWithRetry(operation, shouldRetryPredicate) {
        let attempt = 0;
        while (true) {
            // 1. Check Circuit Breaker before executing attempt
            if (!circuitBreaker_1.circuitBreaker.canExecute()) {
                throw new Error('Circuit Breaker is OPEN. Retry attempt aborted.');
            }
            try {
                const result = await operation();
                if (attempt > 0) {
                    this.successfulRetries++;
                }
                return result;
            }
            catch (err) {
                attempt++;
                // If circuit breaker tripped open during execution, don't continue retrying
                if (circuitBreaker_1.circuitBreaker.getState() === 'OPEN') {
                    this.exhaustedRetries++;
                    throw err;
                }
                const isRetryable = shouldRetryPredicate ? shouldRetryPredicate(err) : true;
                if (!isRetryable || attempt > this.maxRetries) {
                    if (attempt > 1) {
                        this.exhaustedRetries++;
                    }
                    throw err;
                }
                this.totalRetries++;
                // Jittered exponential backoff: base * 2^(attempt - 1) * (1 +/- jitter)
                const baseBackoff = Math.min(this.maxBackoffMs, this.initialBackoffMs * Math.pow(2, attempt - 1));
                const jitter = (Math.random() * 2 - 1) * this.jitterRatio * baseBackoff;
                const sleepMs = Math.max(20, Math.round(baseBackoff + jitter));
                await new Promise(r => setTimeout(r, sleepMs));
            }
        }
    }
    getStats() {
        return {
            totalRetries: this.totalRetries,
            successfulRetries: this.successfulRetries,
            exhaustedRetries: this.exhaustedRetries,
            maxRetries: this.maxRetries,
        };
    }
    reset() {
        this.totalRetries = 0;
        this.successfulRetries = 0;
        this.exhaustedRetries = 0;
    }
}
exports.RetryController = RetryController;
exports.retryController = new RetryController();
