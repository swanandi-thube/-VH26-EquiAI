"use strict";
/**
 * Origin Data Source Adapter Interface & Implementations
 * Provides a clean abstraction for fetching data from the origin data store.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultOriginAdapter = exports.DevOriginAdapter = exports.DatabaseOriginAdapter = void 0;
const repositories_1 = require("../repositories");
const client_1 = require("../database/client");
/**
 * Production Database Origin Adapter
 * Queries the real PostgreSQL / Supabase store for entities
 */
class DatabaseOriginAdapter {
    async fetchObject(objectId, options) {
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
                sourceType: client_1.dbClient.isConnected ? 'PRODUCTION_DATABASE' : 'DEV_ADAPTER',
                errorMessage: 'Origin database returned simulated 503 error',
            };
        }
        // Query entity from repository (PostgreSQL or fallback store)
        const entity = await repositories_1.cacheObjectRepository.findById(objectId);
        // Calculate actual retrieval time
        let simulatedDelay = 0;
        if (options?.simulatedLatencyMs !== undefined && options.simulatedLatencyMs > 0) {
            simulatedDelay = options.simulatedLatencyMs;
        }
        else if (entity) {
            simulatedDelay = entity.baseRetrievalCostMs;
        }
        else {
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
                sourceType: client_1.dbClient.isConnected ? 'PRODUCTION_DATABASE' : 'DEV_ADAPTER',
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
            sourceType: client_1.dbClient.isConnected ? 'PRODUCTION_DATABASE' : 'DEV_ADAPTER',
        };
    }
}
exports.DatabaseOriginAdapter = DatabaseOriginAdapter;
/**
 * Development Adapter (clearly separated for testing when DB is offline)
 */
class DevOriginAdapter {
    async fetchObject(objectId, options) {
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
exports.DevOriginAdapter = DevOriginAdapter;
exports.defaultOriginAdapter = new DatabaseOriginAdapter();
