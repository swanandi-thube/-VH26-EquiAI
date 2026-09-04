/**
 * PostgreSQL Database Client & Connection Pool Manager
 * Supabase-compatible parameterized query interface with health telemetry.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';

export interface DbHealth {
  status: 'CONNECTED' | 'DEGRADED' | 'OFFLINE';
  latencyMs: number;
  message: string;
}

export class DatabaseClient {
  private pool: Pool | null = null;
  public isConnected: boolean = false;
  private maxPoolSize: number = 20;
  private activeConnections: number = 0;
  private connectionQueueDepth: number = 0;

  constructor() {
    this.initPool();
  }

  private initPool() {
    if (config.databaseUrl) {
      try {
        const isSsl = config.databaseUrl.includes('supabase') ||
                      config.databaseUrl.includes('sslmode=require') ||
                      config.databaseUrl.includes('render.com') ||
                      config.databaseUrl.includes('aws');

        this.pool = new Pool({
          connectionString: config.databaseUrl,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          max: this.maxPoolSize,
          ssl: isSsl ? { rejectUnauthorized: false } : undefined,
        });

        this.pool.on('error', (err) => {
          this.isConnected = false;
          console.error('[Database Pool Error]:', err.message);
        });

        // Run immediate startup probe
        this.probeConnection();
      } catch (err: any) {
        this.isConnected = false;
        console.warn('[Database] Failed to initialize PostgreSQL pool:', err.message);
        this.pool = null;
      }
    } else {
      this.isConnected = false;
      console.log('[Database] No DATABASE_URL provided. Operating with in-memory relational store fallback.');
    }
  }

  private async probeConnection() {
    if (!this.pool) return;
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        this.isConnected = true;
        console.log('[Database] PostgreSQL connection verified (SELECT 1 succeeded).');
      } finally {
        client.release();
      }
    } catch (err: any) {
      this.isConnected = false;
      console.warn(`[Database] PostgreSQL initial probe failed: ${err.message}`);
    }
  }

  /**
   * Execute a parameterized SQL query
   */
  public async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    this.activeConnections = Math.min(this.maxPoolSize, this.activeConnections + 1);

    if (!this.pool) {
      this.activeConnections = Math.max(0, this.activeConnections - 1);
      throw new Error('Database pool not initialized. DATABASE_URL is not set.');
    }

    try {
      const result = await this.pool.query<T>(text, params);
      this.isConnected = true;
      return result;
    } catch (err: any) {
      console.warn(`[Database Query Error]: ${err.message}`);
      throw err;
    } finally {
      this.activeConnections = Math.max(0, this.activeConnections - 1);
    }
  }

  /**
   * Get a dedicated client from the pool
   */
  public async getClient(): Promise<PoolClient | null> {
    if (!this.pool) return null;
    return await this.pool.connect();
  }

  /**
   * Get connection pool metrics
   */
  public getMetrics() {
    return {
      activeConnections: this.activeConnections,
      maxPoolSize: this.maxPoolSize,
      connectionQueueDepth: this.connectionQueueDepth,
      utilization: this.maxPoolSize > 0 ? this.activeConnections / this.maxPoolSize : 0,
      totalCount: this.pool?.totalCount || 0,
      idleCount: this.pool?.idleCount || 0,
      waitingCount: this.pool?.waitingCount || 0,
    };
  }

  /**
   * Real health verification via SELECT 1
   */
  public async checkHealth(): Promise<DbHealth> {
    const start = Date.now();
    if (!this.pool) {
      this.isConnected = false;
      return {
        status: 'OFFLINE',
        latencyMs: 0,
        message: 'DATABASE_URL not configured. Operating in in-memory relational store mode.',
      };
    }

    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        const latency = Date.now() - start;
        this.isConnected = true;
        return {
          status: 'CONNECTED',
          latencyMs: latency,
          message: 'PostgreSQL connection pool healthy (Supabase compatible)',
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      this.isConnected = false;
      return {
        status: 'DEGRADED',
        latencyMs: Date.now() - start,
        message: `PostgreSQL connection probe failed: ${err.message}`,
      };
    }
  }

  /**
   * Close pool on shutdown
   */
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
    }
  }
}

export const dbClient = new DatabaseClient();
