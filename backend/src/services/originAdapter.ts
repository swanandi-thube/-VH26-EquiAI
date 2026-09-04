/**
 * Origin Data Source Adapter Interface & Implementations
 * Provides a clean abstraction for fetching data from the origin data store.
 */

import { cacheObjectRepository, CacheObjectEntity } from '../repositories';
import { dbClient } from '../database/client';
import { DEMO_FIXTURES, DemoFixtureObject } from './demoFixtures';

export interface OriginFetchResult {
  objectId: string;
  data: any;
  sizeBytes: number;
  retrievalCostMs: number;
  statusCode: number;
  sourceType: 'PRODUCTION_DATABASE' | 'DEV_ADAPTER' | 'DEMO_SOURCE';
  errorMessage?: string;
}

export interface IOriginDataSource {
  fetchObject(
    objectId: string,
    options?: {
      simulatedLatencyMs?: number;
      simulatedErrorRate?: number;
    }
  ): Promise<OriginFetchResult>;
}

/**
 * Production Database Origin Adapter
 * Queries the real PostgreSQL / Supabase store for entities
 */
export class DatabaseOriginAdapter implements IOriginDataSource {
  public async fetchObject(
    objectId: string,
    options?: {
      simulatedLatencyMs?: number;
      simulatedErrorRate?: number;
    }
  ): Promise<OriginFetchResult> {
    const startTime = Date.now();

    // Check simulated error rate if injected by traffic lab
    const errRate = options?.simulatedErrorRate ?? 0;
    if (errRate > 0 && ((Date.now() + objectId.length) % 100) < (errRate * 100)) {
      const delay = options?.simulatedLatencyMs || 250;
      await new Promise(r => setTimeout(r, delay));
      return {
        objectId,
        data: null,
        sizeBytes: 0,
        retrievalCostMs: Date.now() - startTime,
        statusCode: 503,
        sourceType: dbClient.isConnected ? 'PRODUCTION_DATABASE' : 'DEV_ADAPTER',
        errorMessage: 'Origin database returned simulated 503 error',
      };
    }

    // Query entity from repository (PostgreSQL or fallback store)
    const entity = await cacheObjectRepository.findById(objectId);

    // Calculate actual retrieval time
    let simulatedDelay = 0;
    if (options?.simulatedLatencyMs !== undefined && options.simulatedLatencyMs > 0) {
      simulatedDelay = options.simulatedLatencyMs;
    } else if (entity) {
      simulatedDelay = entity.baseRetrievalCostMs;
    } else {
      simulatedDelay = 20; // fast 404 lookup
    }

    if (simulatedDelay > 0) {
      await new Promise(r => setTimeout(r, simulatedDelay));
    }

    const elapsed = Date.now() - startTime;

    if (!entity) {
      return {
        objectId,
        data: null,
        sizeBytes: 0,
        retrievalCostMs: elapsed,
        statusCode: 404,
        sourceType: dbClient.isConnected ? 'PRODUCTION_DATABASE' : 'DEV_ADAPTER',
        errorMessage: `Entity with objectId "${objectId}" not found in origin`,
      };
    }

    const payload = entity.payload || entity;
    const sizeBytes = entity.sizeBytes || Buffer.byteLength(JSON.stringify(payload), 'utf8');

    return {
      objectId,
      data: payload,
      sizeBytes,
      retrievalCostMs: elapsed,
      statusCode: 200,
      sourceType: dbClient.isConnected ? 'PRODUCTION_DATABASE' : 'DEV_ADAPTER',
    };
  }
}

/**
 * Deterministic Demo Origin Data Source Adapter
 * Provides strict test fixtures with fixed object IDs, prices, demands, sizes, and retrieval costs.
 */
export class DemoOriginAdapter implements IOriginDataSource {
  public async fetchObject(
    objectId: string,
    options?: {
      simulatedLatencyMs?: number;
      simulatedErrorRate?: number;
    }
  ): Promise<OriginFetchResult> {
    const startTime = Date.now();

    // Check simulated error rate if injected by degradation scenario
    const errRate = options?.simulatedErrorRate ?? 0;
    if (errRate > 0 && ((Date.now() + objectId.length) % 100) < (errRate * 100)) {
      const delay = options?.simulatedLatencyMs || 300;
      await new Promise(r => setTimeout(r, delay));
      return {
        objectId,
        data: null,
        sizeBytes: 0,
        retrievalCostMs: Date.now() - startTime,
        statusCode: 503,
        sourceType: 'DEMO_SOURCE',
        errorMessage: 'Demo origin data source returned simulated 503 error',
      };
    }

    const fixture = DEMO_FIXTURES[objectId];
    const simulatedDelay = options?.simulatedLatencyMs !== undefined && options.simulatedLatencyMs > 0
      ? options.simulatedLatencyMs
      : (fixture ? fixture.retrievalCostMs : 20);

    if (simulatedDelay > 0) {
      await new Promise(r => setTimeout(r, simulatedDelay));
    }

    const elapsed = Date.now() - startTime;

    if (!fixture) {
      return {
        objectId,
        data: null,
        sizeBytes: 0,
        retrievalCostMs: elapsed,
        statusCode: 404,
        sourceType: 'DEMO_SOURCE',
        errorMessage: `Demo fixture with objectId "${objectId}" not found`,
      };
    }

    const payload = {
      id: fixture.objectId,
      name: fixture.name,
      category: fixture.category,
      price: fixture.price,
      demand: fixture.demand,
      description: fixture.description,
      source: 'demo',
      retrievalCostMs: fixture.retrievalCostMs,
      sizeBytes: fixture.sizeBytes,
      createdAt: Date.now(),
    };

    return {
      objectId,
      data: payload,
      sizeBytes: fixture.sizeBytes,
      retrievalCostMs: elapsed,
      statusCode: 200,
      sourceType: 'DEMO_SOURCE',
    };
  }
}

/**
 * Development Adapter (clearly separated for testing when DB is offline)
 */
export class DevOriginAdapter implements IOriginDataSource {
  public async fetchObject(
    objectId: string,
    options?: {
      simulatedLatencyMs?: number;
      simulatedErrorRate?: number;
    }
  ): Promise<OriginFetchResult> {
    const startTime = Date.now();
    const delay = options?.simulatedLatencyMs || 50;
    await new Promise(r => setTimeout(r, delay));

    const mockPayload = {
      id: objectId,
      name: `Dev Object ${objectId}`,
      description: 'Development adapter synthetic record for testing',
      createdAt: Date.now(),
    };

    return {
      objectId,
      data: mockPayload,
      sizeBytes: 1024,
      retrievalCostMs: Date.now() - startTime,
      statusCode: 200,
      sourceType: 'DEV_ADAPTER',
    };
  }
}

export const defaultOriginAdapter: IOriginDataSource = new DatabaseOriginAdapter();
export const demoOriginAdapter: IOriginDataSource = new DemoOriginAdapter();

