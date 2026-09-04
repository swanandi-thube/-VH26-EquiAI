"use strict";
/**
 * Token Bucket Rate Limiter for Backend Protection
 * Controls incoming request velocity to prevent system saturation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = exports.TokenBucketRateLimiter = void 0;
class TokenBucketRateLimiter {
    capacity = 250; // Max burst capacity
    refillRateRps = 200; // Tokens added per second
    tokens = 250;
    lastRefillTimestamp = Date.now();
    totalRequests = 0;
    allowedRequests = 0;
    throttledRequests = 0;
    constructor(refillRateRps = 200, capacity = 250) {
        this.refillRateRps = refillRateRps;
        this.capacity = capacity;
        this.tokens = capacity;
    }
    setLimit(rps, burstCapacity) {
        this.refillRateRps = rps;
        this.capacity = burstCapacity || Math.max(rps, 50);
        this.tokens = Math.min(this.tokens, this.capacity);
    }
    refillTokens() {
        const now = Date.now();
        const elapsedSeconds = (now - this.lastRefillTimestamp) / 1000;
        if (elapsedSeconds > 0) {
            const tokensToAdd = elapsedSeconds * this.refillRateRps;
            this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
            this.lastRefillTimestamp = now;
        }
    }
    /**
     * Attempts to consume 1 token. Returns true if allowed, false if rate limited.
     */
    tryAcquire(cost = 1) {
        this.totalRequests++;
        this.refillTokens();
        if (this.tokens >= cost) {
            this.tokens -= cost;
            this.allowedRequests++;
            return true;
        }
        this.throttledRequests++;
        return false;
    }
    getStats() {
        this.refillTokens();
        return {
            capacity: this.capacity,
            tokensAvailable: Math.floor(this.tokens),
            refillRateRps: this.refillRateRps,
            totalRequests: this.totalRequests,
            allowedRequests: this.allowedRequests,
            throttledRequests: this.throttledRequests,
        };
    }
    reset() {
        this.tokens = this.capacity;
        this.lastRefillTimestamp = Date.now();
        this.totalRequests = 0;
        this.allowedRequests = 0;
        this.throttledRequests = 0;
    }
}
exports.TokenBucketRateLimiter = TokenBucketRateLimiter;
exports.rateLimiter = new TokenBucketRateLimiter();
