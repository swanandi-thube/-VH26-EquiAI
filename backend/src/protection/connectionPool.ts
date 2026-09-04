/**
 * Database Connection Pool & Read Replicas Architecture Monitor
 */

export interface ReadReplicaNode {
  id: string;
  name: string;
  role: 'PRIMARY_WRITER' | 'READ_REPLICA';
  region: string;
  status: 'HEALTHY' | 'DEGRADED' | 'SYNCING';
  replicationLagMs: number;
  activeQueries: number;
  cpuUtilizationPercent: number;
}

export class ConnectionPoolMonitor {
  private replicas: ReadReplicaNode[] = [
    {
      id: 'pg-primary-01',
      name: 'Postgres Primary (us-east-1a)',
      role: 'PRIMARY_WRITER',
      region: 'us-east-1a',
      status: 'HEALTHY',
      replicationLagMs: 0,
      activeQueries: 2,
      cpuUtilizationPercent: 18.5,
    },
    {
      id: 'pg-replica-01',
      name: 'Postgres Read Replica 1 (us-east-1b)',
      role: 'READ_REPLICA',
      region: 'us-east-1b',
      status: 'HEALTHY',
      replicationLagMs: 1.2,
      activeQueries: 4,
      cpuUtilizationPercent: 24.1,
    },
    {
      id: 'pg-replica-02',
      name: 'Postgres Read Replica 2 (us-west-2a)',
      role: 'READ_REPLICA',
      region: 'us-west-2a',
      status: 'HEALTHY',
      replicationLagMs: 8.5,
      activeQueries: 3,
      cpuUtilizationPercent: 19.8,
    },
  ];

  public getReplicas(): ReadReplicaNode[] {
    return [...this.replicas];
  }

  public updateReplicaLoad(primaryActive: number, missRate: number) {
    // Dynamically adjust replica metrics based on real miss load
    const primary = this.replicas[0];
    primary.activeQueries = primaryActive;
    primary.cpuUtilizationPercent = Math.min(100, Math.round((15 + (primaryActive * 4) + (missRate * 25)) * 10) / 10);

    const r1 = this.replicas[1];
    r1.activeQueries = Math.max(1, Math.round(primaryActive * 0.6));
    r1.cpuUtilizationPercent = Math.min(100, Math.round((12 + (r1.activeQueries * 3) + (missRate * 18)) * 10) / 10);

    const r2 = this.replicas[2];
    r2.activeQueries = Math.max(1, Math.round(primaryActive * 0.4));
    r2.cpuUtilizationPercent = Math.min(100, Math.round((10 + (r2.activeQueries * 3) + (missRate * 14)) * 10) / 10);
  }
}

export const poolMonitor = new ConnectionPoolMonitor();
