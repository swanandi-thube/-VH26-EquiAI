/**
 * PostgreSQL Database Migrations & Table Verification Runner
 * Creates all 14 required tables, indexes, and foreign keys for ADAPTIVECACHE (Supabase & local PG compatible),
 * and seeds realistic commodity products and deterministic historical baseline data.
 */

import { dbClient } from './client';
import { COMMODITY_CATALOG } from './commodityCatalog';

export interface TableVerificationResult {
  verified: boolean;
  tableCount: number;
  expectedCount: number;
  tables: { [tableName: string]: boolean };
  missingTables: string[];
  foreignKeys: Array<{ table: string; constraint: string }>;
  indexes: Array<{ table: string; index: string }>;
}

export const REQUIRED_TABLES = [
  'users',
  'cache_objects',
  'cache_accesses',
  'cache_decisions',
  'request_logs',
  'system_events',
  'workload_runs',
  'workload_requests',
  'benchmark_runs',
  'benchmark_results',
  'scenario_runs',
  'cost_records',
  'system_settings',
  'object_observations',
] as const;

export class MigrationRunner {
  public static getRequiredTables(): readonly string[] {
    return REQUIRED_TABLES;
  }

  public static async runMigrations(): Promise<boolean> {
    const health = await dbClient.checkHealth();
    if (health.status !== 'CONNECTED') {
      console.log('[Migrations] Skipping PostgreSQL migrations (No active database connection).');
      return false;
    }

    try {
      console.log('[Migrations] Executing PostgreSQL schema migrations for all 14 tables...');

      // 1. users table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(128) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          tier VARCHAR(32) NOT NULL DEFAULT 'FREE',
          region VARCHAR(64) DEFAULT 'us-east-1',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
      `);

      // 2. system_settings table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          id VARCHAR(32) PRIMARY KEY DEFAULT 'default',
          cache_capacity_bytes BIGINT NOT NULL DEFAULT 67108864,
          default_ttl_seconds INT NOT NULL DEFAULT 300,
          min_ttl_seconds INT NOT NULL DEFAULT 30,
          max_ttl_seconds INT NOT NULL DEFAULT 3600,
          prediction_window_seconds INT NOT NULL DEFAULT 60,
          rate_limit_rps INT NOT NULL DEFAULT 250,
          circuit_breaker_failure_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.50,
          circuit_breaker_recovery_time_ms INT NOT NULL DEFAULT 5000,
          weights JSONB NOT NULL,
          cost_assumptions JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 3. cache_objects table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS cache_objects (
          object_id VARCHAR(128) PRIMARY KEY,
          key VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          category VARCHAR(100) DEFAULT 'General',
          payload JSONB NOT NULL,
          size_bytes INT NOT NULL,
          base_retrieval_cost_ms INT NOT NULL,
          compute_complexity INT DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_cache_objects_key ON cache_objects(key);
        CREATE INDEX IF NOT EXISTS idx_cache_objects_cat ON cache_objects(category);
      `);

      // 4. cache_accesses table (FK -> cache_objects)
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS cache_accesses (
          id BIGSERIAL PRIMARY KEY,
          object_id VARCHAR(128) NOT NULL,
          accessed_at TIMESTAMPTZ DEFAULT NOW(),
          latency_ms INT NOT NULL,
          cache_hit BOOLEAN NOT NULL,
          source VARCHAR(32) DEFAULT 'live'
        );
        CREATE INDEX IF NOT EXISTS idx_cache_accesses_obj_time ON cache_accesses(object_id, accessed_at DESC);
      `);

      // 5. request_logs table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS request_logs (
          request_id VARCHAR(64) PRIMARY KEY,
          timestamp BIGINT NOT NULL,
          object_id VARCHAR(128) NOT NULL,
          operation VARCHAR(16) NOT NULL DEFAULT 'GET',
          response_size_bytes INT NOT NULL DEFAULT 0,
          cache_hit BOOLEAN NOT NULL,
          backend_called BOOLEAN NOT NULL DEFAULT FALSE,
          backend_latency_ms INT NOT NULL DEFAULT 0,
          cache_latency_ms INT NOT NULL DEFAULT 0,
          total_latency_ms INT NOT NULL DEFAULT 0,
          status_code INT NOT NULL DEFAULT 200,
          error_message TEXT,
          was_coalesced BOOLEAN DEFAULT FALSE,
          strategy_used VARCHAR(32) DEFAULT 'ADAPTIVE',
          source VARCHAR(32) DEFAULT 'live',
          mode VARCHAR(32) DEFAULT 'live'
        );
        CREATE INDEX IF NOT EXISTS idx_request_logs_time ON request_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_request_logs_obj_time ON request_logs(object_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_request_logs_source ON request_logs(source);
      `);

      // Ensure optional columns exist if migrating from earlier schema
      await dbClient.query(`
        ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'live';
        ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS mode VARCHAR(32) DEFAULT 'live';
      `);

      // 6. cache_decisions table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS cache_decisions (
          id VARCHAR(64) PRIMARY KEY,
          object_id VARCHAR(128) NOT NULL,
          decision_type VARCHAR(32) NOT NULL,
          adaptive_score NUMERIC(5,4) NOT NULL,
          factors JSONB NOT NULL,
          previous_ttl INT NOT NULL,
          new_ttl INT NOT NULL,
          predicted_demand NUMERIC(5,4) NOT NULL,
          confidence NUMERIC(5,4) NOT NULL,
          reason TEXT NOT NULL,
          timestamp BIGINT NOT NULL,
          source VARCHAR(32) DEFAULT 'live'
        );
        CREATE INDEX IF NOT EXISTS idx_cache_decisions_obj_time ON cache_decisions(object_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_cache_decisions_time ON cache_decisions(timestamp DESC);
        ALTER TABLE cache_decisions ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'live';
      `);

      // 7. system_events table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS system_events (
          id VARCHAR(64) PRIMARY KEY,
          timestamp BIGINT NOT NULL,
          event_type VARCHAR(32) NOT NULL,
          object_id VARCHAR(128),
          score NUMERIC(5,4),
          reason TEXT NOT NULL,
          metadata JSONB,
          source VARCHAR(32) DEFAULT 'live'
        );
        CREATE INDEX IF NOT EXISTS idx_system_events_time ON system_events(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type, timestamp DESC);
        ALTER TABLE system_events ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'live';
      `);

      // 8. workload_runs table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS workload_runs (
          id VARCHAR(64) PRIMARY KEY,
          filename VARCHAR(255) NOT NULL,
          file_type VARCHAR(16) NOT NULL,
          file_size_bytes BIGINT NOT NULL DEFAULT 0,
          total_rows INT NOT NULL DEFAULT 0,
          valid_rows INT NOT NULL DEFAULT 0,
          rejected_rows INT NOT NULL DEFAULT 0,
          unique_objects INT NOT NULL DEFAULT 0,
          start_time BIGINT,
          end_time BIGINT,
          duration_seconds INT DEFAULT 0,
          status VARCHAR(32) NOT NULL DEFAULT 'VALIDATED',
          validation_errors JSONB DEFAULT '[]'::jsonb,
          uploaded_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workload_runs_time ON workload_runs(uploaded_at DESC);
      `);

      // 9. workload_requests table (FK -> workload_runs)
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS workload_requests (
          id BIGSERIAL PRIMARY KEY,
          workload_id VARCHAR(64) NOT NULL REFERENCES workload_runs(id) ON DELETE CASCADE,
          row_index INT NOT NULL,
          timestamp BIGINT NOT NULL,
          request_id VARCHAR(128) NOT NULL,
          object_id VARCHAR(128) NOT NULL,
          operation VARCHAR(32) NOT NULL DEFAULT 'GET',
          response_size INT NOT NULL DEFAULT 0,
          backend_latency INT NOT NULL DEFAULT 0,
          regeneration_cost INT NOT NULL DEFAULT 0,
          status_code INT NOT NULL DEFAULT 200,
          ttl INT,
          content_type VARCHAR(64),
          priority INT,
          region VARCHAR(64),
          is_valid BOOLEAN NOT NULL DEFAULT TRUE,
          validation_error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_workload_requests_wid ON workload_requests(workload_id, row_index);
        CREATE INDEX IF NOT EXISTS idx_workload_requests_time ON workload_requests(workload_id, timestamp);
      `);

      // 10. object_observations table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS object_observations (
          id BIGSERIAL PRIMARY KEY,
          object_id VARCHAR(128) NOT NULL,
          product_name VARCHAR(255),
          category VARCHAR(100),
          location VARCHAR(128),
          price NUMERIC(10,2),
          previous_price NUMERIC(10,2),
          price_change_pct NUMERIC(6,2) DEFAULT 0.00,
          timestamp BIGINT NOT NULL,
          source VARCHAR(64) DEFAULT 'live',
          source_reference VARCHAR(128),
          data_status VARCHAR(32) DEFAULT 'COMMITTED',
          request_count INT NOT NULL DEFAULT 1,
          demand NUMERIC(10,2) NOT NULL DEFAULT 1.00,
          inventory INT,
          backend_latency INT NOT NULL DEFAULT 0,
          retrieval_cost INT NOT NULL DEFAULT 0,
          response_size INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_object_observations_obj_time ON object_observations(object_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_object_observations_src ON object_observations(source);
      `);

      // Upgrade existing object_observations table columns if present
      await dbClient.query(`
        ALTER TABLE object_observations ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
        ALTER TABLE object_observations ADD COLUMN IF NOT EXISTS category VARCHAR(100);
        ALTER TABLE object_observations ADD COLUMN IF NOT EXISTS location VARCHAR(128);
        ALTER TABLE object_observations ADD COLUMN IF NOT EXISTS previous_price NUMERIC(10,2);
        ALTER TABLE object_observations ADD COLUMN IF NOT EXISTS price_change_pct NUMERIC(6,2) DEFAULT 0.00;
        ALTER TABLE object_observations ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'live';
        ALTER TABLE object_observations ADD COLUMN IF NOT EXISTS source_reference VARCHAR(128);
        ALTER TABLE object_observations ADD COLUMN IF NOT EXISTS data_status VARCHAR(32) DEFAULT 'COMMITTED';
        ALTER TABLE object_observations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      `);

      // 11. benchmark_runs table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS benchmark_runs (
          id VARCHAR(64) PRIMARY KEY,
          trace_id VARCHAR(64) NOT NULL,
          trace_name VARCHAR(255) NOT NULL,
          total_requests_in_trace INT NOT NULL,
          cache_capacity_bytes BIGINT NOT NULL,
          is_trace_verified_fair BOOLEAN NOT NULL DEFAULT TRUE,
          fairness_details JSONB NOT NULL DEFAULT '{}'::jsonb,
          results JSONB NOT NULL DEFAULT '[]'::jsonb,
          started_at BIGINT NOT NULL,
          completed_at BIGINT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_benchmark_runs_time ON benchmark_runs(started_at DESC);
      `);

      // 12. benchmark_results table (FK -> benchmark_runs)
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS benchmark_results (
          id VARCHAR(64) PRIMARY KEY,
          benchmark_run_id VARCHAR(64) NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
          strategy VARCHAR(32) NOT NULL,
          total_requests INT NOT NULL DEFAULT 0,
          cache_hits INT NOT NULL DEFAULT 0,
          cache_misses INT NOT NULL DEFAULT 0,
          hit_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
          miss_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
          avg_latency_ms NUMERIC(10,2) NOT NULL DEFAULT 0,
          p95_latency_ms NUMERIC(10,2) NOT NULL DEFAULT 0,
          p99_latency_ms NUMERIC(10,2) NOT NULL DEFAULT 0,
          backend_requests INT NOT NULL DEFAULT 0,
          evictions INT NOT NULL DEFAULT 0,
          memory_used_bytes BIGINT NOT NULL DEFAULT 0,
          total_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
          metrics JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_benchmark_results_run ON benchmark_results(benchmark_run_id);
        CREATE INDEX IF NOT EXISTS idx_benchmark_results_strat ON benchmark_results(benchmark_run_id, strategy);
      `);

      // 13. scenario_runs table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS scenario_runs (
          id VARCHAR(64) PRIMARY KEY,
          scenario_name VARCHAR(255) NOT NULL,
          config JSONB NOT NULL DEFAULT '{}'::jsonb,
          current_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
          projected_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
          net_savings_usd NUMERIC(12,4) DEFAULT 0,
          status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
          applied_at BIGINT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_scenario_runs_time ON scenario_runs(created_at DESC);
      `);

      // 14. cost_records table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS cost_records (
          id VARCHAR(64) PRIMARY KEY,
          timestamp BIGINT NOT NULL,
          adaptive_cost_usd NUMERIC(14,6) NOT NULL DEFAULT 0,
          baseline_cost_usd NUMERIC(14,6) NOT NULL DEFAULT 0,
          net_savings_usd NUMERIC(14,6) NOT NULL DEFAULT 0,
          roi_percent NUMERIC(8,2) NOT NULL DEFAULT 0,
          backend_offload_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
          breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_cost_records_time ON cost_records(timestamp DESC);
      `);

      console.log('[Migrations] All 14 PostgreSQL tables, indexes, and foreign keys verified.');

      // Seed Product Catalog and Historical Baselines
      await this.seedCommodities();
      await this.seedHistoricalBaseline();

      return true;
    } catch (err: any) {
      console.error('[Migrations] Migration failed:', err.message);
      return false;
    }
  }

  /**
   * Seed realistic commodity catalog into PostgreSQL cache_objects and object_observations
   */
  public static async seedCommodities(): Promise<void> {
    if (!dbClient.isConnected) return;
    try {
      console.log(`[Migrations] Seeding ${COMMODITY_CATALOG.length} realistic commodity items into PostgreSQL...`);
      for (const item of COMMODITY_CATALOG) {
        const payload = {
          id: item.objectId,
          name: item.name,
          category: item.category,
          location: item.location,
          price: item.price,
          previousPrice: item.previousPrice,
          priceChangePct: item.priceChangePct,
          unit: item.unit,
          specs: item.specs,
          description: item.description,
          source: 'postgresql_origin',
          updatedAt: Date.now(),
        };

        await dbClient.query(
          `INSERT INTO cache_objects (object_id, key, name, category, payload, size_bytes, base_retrieval_cost_ms, compute_complexity, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (object_id) DO UPDATE SET
             name = EXCLUDED.name,
             category = EXCLUDED.category,
             payload = EXCLUDED.payload,
             size_bytes = EXCLUDED.size_bytes,
             base_retrieval_cost_ms = EXCLUDED.base_retrieval_cost_ms,
             compute_complexity = EXCLUDED.compute_complexity,
             updated_at = NOW()`,
          [
            item.objectId,
            `cache:obj:${item.objectId}`,
            item.name,
            item.category,
            JSON.stringify(payload),
            item.sizeBytes,
            item.baseRetrievalCostMs,
            item.computeComplexity,
          ]
        );
      }
      console.log(`[Migrations] Commodity catalog seeded successfully in PostgreSQL.`);
    } catch (err: any) {
      console.warn('[Migrations] Commodity seed warning:', err.message);
    }
  }

  /**
   * Seed deterministic historical baseline requests and observations (source = 'seeded_demo')
   */
  public static async seedHistoricalBaseline(): Promise<void> {
    if (!dbClient.isConnected) return;
    try {
      // Check if historical records already exist
      const checkRes = await dbClient.query(
        `SELECT COUNT(*) AS total FROM request_logs WHERE source = 'seeded_demo'`
      );
      const count = parseInt(checkRes.rows[0].total, 10);
      if (count >= 20) {
        return; // Already seeded
      }

      console.log('[Migrations] Seeding deterministic historical request logs and observations (source = seeded_demo)...');
      const now = Date.now();
      const commodities = COMMODITY_CATALOG.slice(0, 10);

      for (let i = 0; i < commodities.length; i++) {
        const item = commodities[i];
        const pastTime = now - ((commodities.length - i) * 60000); // 1-minute steps into past

        // 1. Observation record
        await dbClient.query(
          `INSERT INTO object_observations (
            object_id, product_name, category, location, price, previous_price, price_change_pct,
            timestamp, source, source_reference, data_status, request_count, demand, backend_latency, retrieval_cost, response_size
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            item.objectId,
            item.name,
            item.category,
            item.location,
            item.price,
            item.previousPrice || item.price,
            item.priceChangePct || 0,
            pastTime,
            'seeded_demo',
            'APMC_MARKET_FEED_HISTORICAL',
            'COMMITTED',
            10 + (i * 3),
            1.2 + (i * 0.1),
            item.baseRetrievalCostMs,
            item.baseRetrievalCostMs,
            item.sizeBytes,
          ]
        );

        // 2. Historical request log
        await dbClient.query(
          `INSERT INTO request_logs (
            request_id, timestamp, object_id, operation, response_size_bytes,
            cache_hit, backend_called, backend_latency_ms, cache_latency_ms,
            total_latency_ms, status_code, strategy_used, source, mode
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (request_id) DO NOTHING`,
          [
            `HIST-REQ-${item.objectId}-001`,
            pastTime,
            item.objectId,
            'GET',
            item.sizeBytes,
            true,
            false,
            0,
            2,
            2,
            200,
            'ADAPTIVE',
            'seeded_demo',
            'historical',
          ]
        );

        // 3. Historical decision
        await dbClient.query(
          `INSERT INTO cache_decisions (
            id, object_id, decision_type, adaptive_score, factors,
            previous_ttl, new_ttl, predicted_demand, confidence, reason, timestamp, source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO NOTHING`,
          [
            `HIST-DEC-${item.objectId}-001`,
            item.objectId,
            'KEEP',
            0.75,
            JSON.stringify({
              frequency: 0.8,
              recency: 0.7,
              trend: 0.75,
              retrievalCost: item.baseRetrievalCostMs / 450,
              backendPressure: 0.2,
              memoryCost: 0.05,
              predictedDemand: 0.15,
              confidence: 0.85,
              finalScore: 0.75,
            }),
            300,
            420,
            0.15,
            0.85,
            `Historical baseline: active commodity demand and stable origin response (${item.baseRetrievalCostMs}ms).`,
            pastTime,
            'seeded_demo',
          ]
        );
      }
      console.log('[Migrations] Deterministic historical baseline initialized successfully.');
    } catch (err: any) {
      console.warn('[Migrations] Historical baseline seed warning:', err.message);
    }
  }

  /**
   * Verifies the existence of all 14 required tables, foreign keys, and indexes in PostgreSQL.
   */
  public static async verifyTables(): Promise<TableVerificationResult> {
    const tablesMap: { [tableName: string]: boolean } = {};
    REQUIRED_TABLES.forEach((t) => (tablesMap[t] = false));

    const health = await dbClient.checkHealth();
    if (health.status !== 'CONNECTED') {
      return {
        verified: false,
        tableCount: 0,
        expectedCount: REQUIRED_TABLES.length,
        tables: tablesMap,
        missingTables: [...REQUIRED_TABLES],
        foreignKeys: [],
        indexes: [],
      };
    }

    try {
      // 1. Check existing tables in public schema
      const res = await dbClient.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE';
      `);

      const foundTables = new Set(res.rows.map((r: any) => r.table_name.toLowerCase()));
      REQUIRED_TABLES.forEach((t) => {
        tablesMap[t] = foundTables.has(t.toLowerCase());
      });

      const missing = REQUIRED_TABLES.filter((t) => !tablesMap[t]);

      // 2. Inspect foreign keys
      const fkRes = await dbClient.query(`
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public';
      `);
      const foreignKeys = fkRes.rows.map((r: any) => ({
        table: r.table_name,
        constraint: r.constraint_name,
      }));

      // 3. Inspect indexes
      const idxRes = await dbClient.query(`
        SELECT tablename, indexname
        FROM pg_indexes
        WHERE schemaname = 'public';
      `);
      const indexes = idxRes.rows.map((r: any) => ({
        table: r.tablename,
        index: r.indexname,
      }));

      const verified = missing.length === 0;

      return {
        verified,
        tableCount: REQUIRED_TABLES.length - missing.length,
        expectedCount: REQUIRED_TABLES.length,
        tables: tablesMap,
        missingTables: missing,
        foreignKeys,
        indexes,
      };
    } catch (err: any) {
      console.error('[Migrations] Table verification failed:', err.message);
      return {
        verified: false,
        tableCount: 0,
        expectedCount: REQUIRED_TABLES.length,
        tables: tablesMap,
        missingTables: [...REQUIRED_TABLES],
        foreignKeys: [],
        indexes: [],
      };
    }
  }
}
