/**
 * PostgreSQL Database Migrations & Initial Seed Runner
 * Creates minimum required tables for Phase 1 and seeds default settings and objects.
 */

import { dbClient } from './client';

export class MigrationRunner {
  public static async runMigrations(): Promise<boolean> {
    const health = await dbClient.checkHealth();
    if (health.status === 'OFFLINE') {
      console.log('[Migrations] Skipping PostgreSQL migrations (No active DATABASE_URL).');
      return false;
    }

    try {
      console.log('[Migrations] Executing PostgreSQL schema migrations...');

      // 1. system_settings table
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

      // 2. cache_objects table (Generic entity store)
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
      `);

      // 3. cache_accesses table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS cache_accesses (
          id BIGSERIAL PRIMARY KEY,
          object_id VARCHAR(128) NOT NULL REFERENCES cache_objects(object_id) ON DELETE CASCADE,
          accessed_at TIMESTAMPTZ DEFAULT NOW(),
          latency_ms INT NOT NULL,
          cache_hit BOOLEAN NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cache_accesses_obj_time ON cache_accesses(object_id, accessed_at DESC);
      `);

      // 4. request_logs table
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
          strategy_used VARCHAR(32) DEFAULT 'ADAPTIVE'
        );
        CREATE INDEX IF NOT EXISTS idx_request_logs_time ON request_logs(timestamp DESC);
      `);

      // 5. cache_decisions table
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
          timestamp BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cache_decisions_time ON cache_decisions(timestamp DESC);
      `);

      // 6. system_events table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS system_events (
          id VARCHAR(64) PRIMARY KEY,
          timestamp BIGINT NOT NULL,
          event_type VARCHAR(32) NOT NULL,
          object_id VARCHAR(128),
          score NUMERIC(5,4),
          reason TEXT NOT NULL,
          metadata JSONB
        );
        CREATE INDEX IF NOT EXISTS idx_system_events_time ON system_events(timestamp DESC);
      `);

      // 7. workload_runs table (Historical custom uploaded workloads & synthetic runs)
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

      // 8. workload_requests table (Individual request rows inside custom workloads)
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

      // 9. object_observations table (Phase 5 Time-Series Append-Only Store)
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS object_observations (
          id BIGSERIAL PRIMARY KEY,
          object_id VARCHAR(128) NOT NULL,
          timestamp BIGINT NOT NULL,
          request_count INT NOT NULL DEFAULT 1,
          demand NUMERIC(10,2) NOT NULL DEFAULT 1.00,
          price NUMERIC(10,2),
          inventory INT,
          backend_latency INT NOT NULL DEFAULT 0,
          retrieval_cost INT NOT NULL DEFAULT 0,
          response_size INT NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_object_observations_obj_time ON object_observations(object_id, timestamp DESC);
      `);

      // 10. benchmark_runs and benchmark_results tables (Phase 8 Multi-Strategy Benchmark)
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

      console.log('[Migrations] All PostgreSQL tables and indexes created successfully.');
      return true;
    } catch (err: any) {
      console.error('[Migrations] Migration failed:', err.message);
      return false;
    }
  }
}
