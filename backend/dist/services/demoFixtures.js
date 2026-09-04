"use strict";
/**
 * Deterministic Test Fixtures and Scenarios for ADAPTIVECACHE Safe Demo Mode
 * Strict test fixtures with fixed object IDs, prices, demands, sizes, and retrieval costs.
 * NO Math.random() or dynamic fake metrics are used.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_SCENARIOS = exports.DEMO_FIXTURES = void 0;
exports.DEMO_FIXTURES = {
    'DEMO-001': {
        objectId: 'DEMO-001',
        price: 500,
        demand: 100,
        sizeBytes: 2048,
        retrievalCostMs: 60,
        source: 'demo',
        category: 'electronics',
        name: 'Demo Object 001 (High Demand Widget)',
        description: 'Deterministic test fixture object 1',
    },
    'DEMO-002': {
        objectId: 'DEMO-002',
        price: 750,
        demand: 80,
        sizeBytes: 4096,
        retrievalCostMs: 80,
        source: 'demo',
        category: 'hardware',
        name: 'Demo Object 002 (Medium Demand Assembly)',
        description: 'Deterministic test fixture object 2',
    },
    'DEMO-003': {
        objectId: 'DEMO-003',
        price: 1200,
        demand: 150,
        sizeBytes: 3072,
        retrievalCostMs: 120,
        source: 'demo',
        category: 'compute',
        name: 'Demo Object 003 (Expensive Query Result)',
        description: 'Deterministic test fixture object 3',
    },
    'DEMO-004': {
        objectId: 'DEMO-004',
        price: 450,
        demand: 40,
        sizeBytes: 1024,
        retrievalCostMs: 40,
        source: 'demo',
        category: 'storage',
        name: 'Demo Object 004 (Small Config Node)',
        description: 'Deterministic test fixture object 4',
    },
    'DEMO-005': {
        objectId: 'DEMO-005',
        price: 900,
        demand: 65,
        sizeBytes: 5120,
        retrievalCostMs: 90,
        source: 'demo',
        category: 'analytics',
        name: 'Demo Object 005 (Medium Report Buffer)',
        description: 'Deterministic test fixture object 5',
    },
    'DEMO-006': {
        objectId: 'DEMO-006',
        price: 1500,
        demand: 25,
        sizeBytes: 8192,
        retrievalCostMs: 150,
        source: 'demo',
        category: 'archive',
        name: 'Demo Object 006 (Cold Heavy Object)',
        description: 'Deterministic test fixture object 6',
    },
    'DEMO-007': {
        objectId: 'DEMO-007',
        price: 300,
        demand: 180,
        sizeBytes: 1536,
        retrievalCostMs: 35,
        source: 'demo',
        category: 'fast-read',
        name: 'Demo Object 007 (Fast Popular Token)',
        description: 'Deterministic test fixture object 7',
    },
    'DEMO-008': {
        objectId: 'DEMO-008',
        price: 1100,
        demand: 55,
        sizeBytes: 6144,
        retrievalCostMs: 110,
        source: 'demo',
        category: 'heavy-calc',
        name: 'Demo Object 008 (Cold Heavy Compute)',
        description: 'Deterministic test fixture object 8',
    },
    'DEMO-009': {
        objectId: 'DEMO-009',
        price: 650,
        demand: 95,
        sizeBytes: 2560,
        retrievalCostMs: 70,
        source: 'demo',
        category: 'stream',
        name: 'Demo Object 009 (Standard Stream Block)',
        description: 'Deterministic test fixture object 9',
    },
    'DEMO-010': {
        objectId: 'DEMO-010',
        price: 2000,
        demand: 15,
        sizeBytes: 10240,
        retrievalCostMs: 200,
        source: 'demo',
        category: 'legacy',
        name: 'Demo Object 010 (Legacy Heavy Cold Object)',
        description: 'Deterministic test fixture object 10',
    },
};
exports.DEMO_SCENARIOS = {
    BASIC_CACHE: {
        id: 'BASIC_CACHE',
        title: 'Basic Cache Flow (Miss -> Hit)',
        description: 'Requests demo objects sequentially with repeats to demonstrate deterministic Redis Miss on first access followed by Hit.',
        expectedBehavior: 'First request to DEMO-001 results in MISS (origin fetched and cached). Second request results in immediate Redis HIT with 0ms backend delay.',
        sequence: [
            'DEMO-001',
            'DEMO-002',
            'DEMO-003',
            'DEMO-001',
            'DEMO-002',
            'DEMO-001',
            'DEMO-004',
            'DEMO-005',
            'DEMO-001',
            'DEMO-003',
        ],
    },
    HOT_OBJECT: {
        id: 'HOT_OBJECT',
        title: 'Hot Object Elevation',
        description: 'Repeatedly generates high-frequency requests for DEMO-001 and DEMO-003 to increase frequency, recency, and adaptive score.',
        expectedBehavior: 'Access counters and EWMA frequency rise, causing the Adaptive Decision Engine to elevate priority and extend dynamic TTL.',
        sequence: [
            'DEMO-001', 'DEMO-003', 'DEMO-001', 'DEMO-001', 'DEMO-003',
            'DEMO-002', 'DEMO-001', 'DEMO-003', 'DEMO-001', 'DEMO-003',
            'DEMO-001', 'DEMO-001', 'DEMO-003', 'DEMO-001', 'DEMO-003'
        ],
    },
    COLD_OBJECT: {
        id: 'COLD_OBJECT',
        title: 'Cold Object Access',
        description: 'Infrequently accesses heavy objects DEMO-006 and DEMO-008.',
        expectedBehavior: 'Low request frequency and large memory footprint yield low adaptive retention scores.',
        sequence: [
            'DEMO-001', 'DEMO-002', 'DEMO-006', 'DEMO-003', 'DEMO-001',
            'DEMO-002', 'DEMO-008', 'DEMO-001', 'DEMO-004', 'DEMO-005'
        ],
    },
    CACHE_PRESSURE: {
        id: 'CACHE_PRESSURE',
        title: 'Cache Pressure & Eviction',
        description: 'Enforces a strict 12KB demo cache capacity limit and streams objects DEMO-001 through DEMO-008.',
        expectedBehavior: 'Memory pressure triggers the Multi-Factor Scorer to evict the lowest-scoring objects deterministically.',
        sequence: [
            'DEMO-001', 'DEMO-002', 'DEMO-006', 'DEMO-003', 'DEMO-008',
            'DEMO-004', 'DEMO-005', 'DEMO-007', 'DEMO-009', 'DEMO-010'
        ],
        options: {
            cacheCapacityBytes: 12 * 1024, // 12 KB tight capacity
        },
    },
    TRAFFIC_SPIKE: {
        id: 'TRAFFIC_SPIKE',
        title: 'Traffic Spike Multiplier',
        description: 'Replays the standard 10-object deterministic request trace with configurable multipliers (1x, 2x, 5x).',
        expectedBehavior: 'Produces real calculated load, hit rates, RPS scaling, and coalesced concurrent requests.',
        sequence: [
            'DEMO-001', 'DEMO-002', 'DEMO-003', 'DEMO-001', 'DEMO-002',
            'DEMO-001', 'DEMO-004', 'DEMO-005', 'DEMO-001', 'DEMO-003'
        ],
        options: {
            multiplier: 3,
        },
    },
    BACKEND_DEGRADATION: {
        id: 'BACKEND_DEGRADATION',
        title: 'Backend Degradation & Circuit Protection',
        description: 'Applies deterministic 300ms backend latency and 40% simulated error rate on origin data source.',
        expectedBehavior: 'Exercises rate limiting, request queueing, singleflight coalescing, and circuit breaker protection without crashing.',
        sequence: [
            'DEMO-001', 'DEMO-002', 'DEMO-003', 'DEMO-004', 'DEMO-005',
            'DEMO-006', 'DEMO-007', 'DEMO-008', 'DEMO-009', 'DEMO-010'
        ],
        options: {
            simulatedLatencyMs: 300,
            simulatedErrorRate: 0.4,
        },
    },
};
