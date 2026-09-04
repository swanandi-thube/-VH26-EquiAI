/**
 * Token Bucket Rate Limiter for Backend Protection
 * Controls incoming request velocity to prevent system saturation.
 */

export interface RateLimiterStats {
  capacity: number;
  tokensAvailable: number;
  refillRateRps: number;
  totalRequests: number;
  allowedRequests: number;
  throttledRequests: number;
}

export class TokenBucketRateLimiter {
  private capacity: number = 250;      // Max burst capacity
  private refillRateRps: number = 200; // Tokens added per second
  private tokens: number = 250;
  private lastRefillTimestamp: number = Date.now();

  private totalRequests: number = 0;
  private allowedRequests: number = 0;
  private throttledRequests: number = 0;

  constructor(refillRateRps = 200, capacity = 250) {
    this.refillRateRps = refillRateRps;
    this.capacity = capacity;
    this.tokens = capacity;
  }

  public setLimit(rps: number, burstCapacity?: number) {
    this.refillRateRps = rps;
    this.capacity = burstCapacity || Math.max(rps, 50);
    this.tokens = Math.min(this.tokens, this.capacity);
  }

  private refillTokens(): void {
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
  public tryAcquire(cost = 1): boolean {
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

  public getStats(): RateLimiterStats {
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

  public reset(): void {
    this.tokens = this.capacity;
    this.lastRefillTimestamp = Date.now();
    this.totalRequests = 0;
    this.allowedRequests = 0;
    this.throttledRequests = 0;
  }
}

export const rateLimiter = new TokenBucketRateLimiter();
