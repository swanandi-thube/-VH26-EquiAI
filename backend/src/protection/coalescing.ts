/**
 * Request Coalescing (Singleflight Pattern)
 * Deduplicates in-flight concurrent backend requests for the same uncached key.
 * If 100 requests arrive concurrently for 'Product_42', only 1 backend execution
 * occurs. All other 99 requests await and receive the same result.
 */

export interface CoalescingStats {
  incomingRequests: number;
  backendRegenerations: number;
  requestsCollapsed: number;
  activeInFlightKeys: number;
}

export class RequestCoalescer {
  private inFlight: Map<string, Promise<any>> = new Map();
  private incomingRequests: number = 0;
  private backendRegenerations: number = 0;
  private requestsCollapsed: number = 0;

  /**
   * Executes or shares a backend request for key
   */
  public async execute<T>(key: string, fn: () => Promise<T>): Promise<{ result: T; wasCoalesced: boolean }> {
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
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    const result = await promise;
    return { result, wasCoalesced: false };
  }

  public getStats(): CoalescingStats {
    return {
      incomingRequests: this.incomingRequests,
      backendRegenerations: this.backendRegenerations,
      requestsCollapsed: this.requestsCollapsed,
      activeInFlightKeys: this.inFlight.size,
    };
  }

  public resetCounters(): void {
    this.incomingRequests = 0;
    this.backendRegenerations = 0;
    this.requestsCollapsed = 0;
  }
}

export const coalescer = new RequestCoalescer();
