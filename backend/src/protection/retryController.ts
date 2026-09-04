/**
 * Retry Controller with Jittered Exponential Backoff (Phase 7 Backend Protection)
 * Retries transient backend failures while respecting circuit breaker states.
 */

import { RetryControllerStats } from '../types';
import { circuitBreaker } from './circuitBreaker';

export class RetryController {
  private maxRetries: number = 3;
  private initialBackoffMs: number = 100;
  private maxBackoffMs: number = 2000;
  private jitterRatio: number = 0.25;

  private totalRetries: number = 0;
  private successfulRetries: number = 0;
  private exhaustedRetries: number = 0;

  constructor(maxRetries = 3, initialBackoffMs = 100, maxBackoffMs = 2000) {
    this.maxRetries = maxRetries;
    this.initialBackoffMs = initialBackoffMs;
    this.maxBackoffMs = maxBackoffMs;
  }

  public setConfig(maxRetries: number, initialBackoffMs = 100, maxBackoffMs = 2000) {
    this.maxRetries = maxRetries;
    this.initialBackoffMs = initialBackoffMs;
    this.maxBackoffMs = maxBackoffMs;
  }

  /**
   * Execute an async operation with jittered exponential backoff
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    shouldRetryPredicate?: (err: any) => boolean
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      // 1. Check Circuit Breaker before executing attempt
      if (!circuitBreaker.canExecute()) {
        throw new Error('Circuit Breaker is OPEN. Retry attempt aborted.');
      }

      try {
        const result = await operation();
        if (attempt > 0) {
          this.successfulRetries++;
        }
        return result;
      } catch (err: any) {
        attempt++;

        // If circuit breaker tripped open during execution, don't continue retrying
        if (circuitBreaker.getState() === 'OPEN') {
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

  public getStats(): RetryControllerStats {
    return {
      totalRetries: this.totalRetries,
      successfulRetries: this.successfulRetries,
      exhaustedRetries: this.exhaustedRetries,
      maxRetries: this.maxRetries,
    };
  }

  public reset(): void {
    this.totalRetries = 0;
    this.successfulRetries = 0;
    this.exhaustedRetries = 0;
  }
}

export const retryController = new RetryController();
