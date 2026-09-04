"use strict";
/**
 * Request Coalescing (Singleflight Pattern)
 * Deduplicates in-flight concurrent backend requests for the same uncached key.
 * If 100 requests arrive concurrently for 'Product_42', only 1 backend execution
 * occurs. All other 99 requests await and receive the same result.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.coalescer = exports.RequestCoalescer = void 0;
class RequestCoalescer {
    inFlight = new Map();
    incomingRequests = 0;
    backendRegenerations = 0;
    requestsCollapsed = 0;
    /**
     * Executes or shares a backend request for key
     */
    async execute(key, fn) {
        this.incomingRequests++;
        const existingPromise = this.inFlight.get(key);
        if (existingPromise) {
            this.requestsCollapsed++;
            const result = await existingPromise;
            return { result, wasCoalesced: true };
        }
        this.backendRegenerations++;
        const promise = (async () => {
            try {
                return await fn();
            }
            finally {
                this.inFlight.delete(key);
            }
        })();
        this.inFlight.set(key, promise);
        const result = await promise;
        return { result, wasCoalesced: false };
    }
    getStats() {
        return {
            incomingRequests: this.incomingRequests,
            backendRegenerations: this.backendRegenerations,
            requestsCollapsed: this.requestsCollapsed,
            activeInFlightKeys: this.inFlight.size,
        };
    }
    resetCounters() {
        this.incomingRequests = 0;
        this.backendRegenerations = 0;
        this.requestsCollapsed = 0;
    }
}
exports.RequestCoalescer = RequestCoalescer;
exports.coalescer = new RequestCoalescer();
