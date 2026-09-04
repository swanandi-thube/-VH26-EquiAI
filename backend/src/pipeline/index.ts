/**
 * Real Request Pipeline for ADAPTIVECACHE
 * Delegates to CacheService and exposes unified pipeline interface for workloads and controllers.
 */

import { cacheService, CacheRequestResult } from '../services/cacheService';

export interface PipelineResult {
  requestId: string;
  objectId: string;
  statusCode: number;
  data: any | null;
  cacheHit: boolean;
  backendCalled: boolean;
  wasCoalesced: boolean;
  cacheLatencyMs: number;
  backendLatencyMs: number;
  totalLatencyMs: number;
  decision?: string;
  adaptiveScore?: number;
  errorMessage?: string;
}

export class RequestPipeline {
  /**
   * Process generic object request through the real cache request flow
   */
  public async processRequest(
    objectId: string,
    simulatedLatencyMs?: number,
    simulatedErrorRate?: number,
    mode?: 'live' | 'demo'
  ): Promise<PipelineResult> {
    const res: CacheRequestResult = await cacheService.handleRequest(objectId, {
      simulatedLatencyMs,
      simulatedErrorRate,
      mode,
    });

    return {
      requestId: res.requestId,
      objectId: res.objectId,
      statusCode: res.statusCode,
      data: res.data,
      cacheHit: res.cacheHit,
      backendCalled: res.backendCalled,
      wasCoalesced: res.wasCoalesced || false,
      cacheLatencyMs: res.cacheLatencyMs,
      backendLatencyMs: res.backendLatencyMs,
      totalLatencyMs: res.totalLatencyMs,
      decision: res.metadata?.lastDecision || (res.cacheHit ? 'KEEP' : 'MISS'),
      adaptiveScore: res.metadata?.adaptiveScore,
      errorMessage: res.errorMessage,
    };
  }

  /**
   * Backward-compatible alias
   */
  public async processProductRequest(
    objectId: string,
    simulatedLatencyMs?: number,
    simulatedErrorRate?: number,
    mode?: 'live' | 'demo'
  ): Promise<PipelineResult> {
    return this.processRequest(objectId, simulatedLatencyMs, simulatedErrorRate, mode);
  }
}

export const pipeline = new RequestPipeline();
