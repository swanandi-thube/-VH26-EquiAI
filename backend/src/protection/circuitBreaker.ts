/**
 * Circuit Breaker Pattern for Backend Protection
 * Implements finite state machine (CLOSED -> OPEN -> HALF-OPEN -> CLOSED)
 * Protects database & backend services during severe degradation or outages.
 */

import { CircuitBreakerState } from '../types';

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rejectedCalls: number;
  errorRate: number;
  lastStateChange: number;
  lastFailureTime: number;
  recoveryTimeMs: number;
  timeUntilHalfOpenMs: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureThreshold: number = 0.5; // 50% error rate
  private recoveryTimeMs: number = 5000;  // 5s backoff
  private halfOpenSuccessThreshold: number = 3; // 3 successes to close
  private windowSize: number = 20;

  private recentResults: boolean[] = []; // true = success, false = failure
  private consecutiveHalfOpenSuccesses: number = 0;
  private lastStateChange: number = Date.now();
  private lastFailureTime: number = 0;

  private totalCalls: number = 0;
  private successfulCalls: number = 0;
  private failedCalls: number = 0;
  private rejectedCalls: number = 0;

  private onStateChangeCallback?: (oldState: CircuitBreakerState, newState: CircuitBreakerState, reason: string) => void;

  constructor(failureThreshold = 0.5, recoveryTimeMs = 5000) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeMs = recoveryTimeMs;
  }

  public setConfig(threshold: number, recoveryMs: number) {
    this.failureThreshold = threshold;
    this.recoveryTimeMs = recoveryMs;
  }

  public onStateChange(cb: (oldState: CircuitBreakerState, newState: CircuitBreakerState, reason: string) => void) {
    this.onStateChangeCallback = cb;
  }

  public getState(): CircuitBreakerState {
    const now = Date.now();
    // Check if recovery timer expired while OPEN
    if (this.state === 'OPEN' && now - this.lastStateChange >= this.recoveryTimeMs) {
      this.transitionTo('HALF-OPEN', 'Recovery timer elapsed, probing backend health');
    }
    return this.state;
  }

  /**
   * Evaluates if request can proceed or must be short-circuited
   */
  public canExecute(): boolean {
    const currentState = this.getState();
    if (currentState === 'OPEN') {
      this.rejectedCalls++;
      return false;
    }
    return true;
  }

  /**
   * Records execution outcome (success or failure)
   */
  public recordResult(success: boolean): void {
    this.totalCalls++;
    const now = Date.now();

    if (success) {
      this.successfulCalls++;
      this.recentResults.push(true);
      if (this.recentResults.length > this.windowSize) {
        this.recentResults.shift();
      }

      if (this.state === 'HALF-OPEN') {
        this.consecutiveHalfOpenSuccesses++;
        if (this.consecutiveHalfOpenSuccesses >= this.halfOpenSuccessThreshold) {
          this.transitionTo('CLOSED', `Backend restored: ${this.consecutiveHalfOpenSuccesses} consecutive successful probes`);
          this.consecutiveHalfOpenSuccesses = 0;
          this.recentResults = [];
        }
      }
    } else {
      this.failedCalls++;
      this.lastFailureTime = now;
      this.recentResults.push(false);
      if (this.recentResults.length > this.windowSize) {
        this.recentResults.shift();
      }

      if (this.state === 'HALF-OPEN') {
        this.transitionTo('OPEN', 'Probe failed during HALF-OPEN state, re-opening circuit');
        this.consecutiveHalfOpenSuccesses = 0;
        return;
      }

      // Check failure threshold in rolling window
      if (this.recentResults.length >= 5) {
        const failures = this.recentResults.filter(r => !r).length;
        const rate = failures / this.recentResults.length;
        if (rate >= this.failureThreshold) {
          this.transitionTo('OPEN', `Error rate ${(rate * 100).toFixed(1)}% exceeded threshold ${(this.failureThreshold * 100).toFixed(1)}%`);
        }
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState, reason: string) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(oldState, newState, reason);
    }
  }

  public getStats(): CircuitBreakerStats {
    const currentState = this.getState();
    const failuresInWindow = this.recentResults.filter(r => !r).length;
    const errorRate = this.recentResults.length > 0 ? failuresInWindow / this.recentResults.length : 0;
    const elapsed = Date.now() - this.lastStateChange;
    const timeUntilHalfOpen = currentState === 'OPEN' ? Math.max(0, this.recoveryTimeMs - elapsed) : 0;

    return {
      state: currentState,
      totalCalls: this.totalCalls,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      rejectedCalls: this.rejectedCalls,
      errorRate,
      lastStateChange: this.lastStateChange,
      lastFailureTime: this.lastFailureTime,
      recoveryTimeMs: this.recoveryTimeMs,
      timeUntilHalfOpenMs: timeUntilHalfOpen,
    };
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.recentResults = [];
    this.consecutiveHalfOpenSuccesses = 0;
    this.lastStateChange = Date.now();
    this.totalCalls = 0;
    this.successfulCalls = 0;
    this.failedCalls = 0;
    this.rejectedCalls = 0;
  }
}

export const circuitBreaker = new CircuitBreaker();
