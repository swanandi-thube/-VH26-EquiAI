"use strict";
/**
 * Circuit Breaker Pattern for Backend Protection
 * Implements finite state machine (CLOSED -> OPEN -> HALF-OPEN -> CLOSED)
 * Protects database & backend services during severe degradation or outages.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.circuitBreaker = exports.CircuitBreaker = void 0;
class CircuitBreaker {
    state = 'CLOSED';
    failureThreshold = 0.5; // 50% error rate
    recoveryTimeMs = 5000; // 5s backoff
    halfOpenSuccessThreshold = 3; // 3 successes to close
    windowSize = 20;
    recentResults = []; // true = success, false = failure
    consecutiveHalfOpenSuccesses = 0;
    lastStateChange = Date.now();
    lastFailureTime = 0;
    totalCalls = 0;
    successfulCalls = 0;
    failedCalls = 0;
    rejectedCalls = 0;
    onStateChangeCallback;
    constructor(failureThreshold = 0.5, recoveryTimeMs = 5000) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeMs = recoveryTimeMs;
    }
    setConfig(threshold, recoveryMs) {
        this.failureThreshold = threshold;
        this.recoveryTimeMs = recoveryMs;
    }
    onStateChange(cb) {
        this.onStateChangeCallback = cb;
    }
    getState() {
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
    canExecute() {
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
    recordResult(success) {
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
        }
        else {
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
    transitionTo(newState, reason) {
        if (this.state === newState)
            return;
        const oldState = this.state;
        this.state = newState;
        this.lastStateChange = Date.now();
        if (this.onStateChangeCallback) {
            this.onStateChangeCallback(oldState, newState, reason);
        }
    }
    getStats() {
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
    reset() {
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
exports.CircuitBreaker = CircuitBreaker;
exports.circuitBreaker = new CircuitBreaker();
