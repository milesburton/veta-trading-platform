export interface AlertEvent {
  severity: string;
  source: string;
  message: string;
  ts: number;
}

export interface BugEvent {
  title: string;
  userId: string;
  ts: number;
}

export interface ServiceSnapshot {
  ts: number;
  up: number;
  total: number;
}

export interface PlatformStatsSnapshot {
  windowStart: number;
  windowEnd: number;
  alertsBySeverity: Record<string, number>;
  bugReports: number;
  uniqueBugReporters: number;
  serviceUpRatio: number | null;
  worstServiceUpRatio: number | null;
  lastCritical: AlertEvent | null;
  lastDeploySha: string | null;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

export class PlatformStats {
  private alerts: AlertEvent[] = [];
  private bugs: BugEvent[] = [];
  private snapshots: ServiceSnapshot[] = [];
  private currentDeploySha: string | null = null;

  recordAlert(ev: AlertEvent): void {
    this.alerts.push(ev);
    this.prune();
  }

  recordBug(ev: BugEvent): void {
    this.bugs.push(ev);
    this.prune();
  }

  recordServiceSnapshot(up: number, total: number, ts: number = Date.now()): void {
    this.snapshots.push({ ts, up, total });
    this.prune();
  }

  setDeploySha(sha: string): void {
    this.currentDeploySha = sha;
  }

  private prune(): void {
    const cutoff = Date.now() - WINDOW_MS;
    this.alerts = this.alerts.filter((e) => e.ts >= cutoff);
    this.bugs = this.bugs.filter((e) => e.ts >= cutoff);
    this.snapshots = this.snapshots.filter((s) => s.ts >= cutoff);
  }

  snapshot(now: number = Date.now()): PlatformStatsSnapshot {
    this.prune();
    const alertsBySeverity: Record<string, number> = {};
    let lastCritical: AlertEvent | null = null;
    for (const a of this.alerts) {
      const sev = a.severity || "UNKNOWN";
      alertsBySeverity[sev] = (alertsBySeverity[sev] ?? 0) + 1;
      if (sev === "CRITICAL" && (!lastCritical || a.ts > lastCritical.ts)) {
        lastCritical = a;
      }
    }
    const uniqueReporters = new Set(this.bugs.map((b) => b.userId)).size;
    let serviceUpRatio: number | null = null;
    let worstServiceUpRatio: number | null = null;
    if (this.snapshots.length > 0) {
      const totalRatio = this.snapshots.reduce(
        (sum, s) => sum + (s.total > 0 ? s.up / s.total : 1),
        0,
      );
      serviceUpRatio = totalRatio / this.snapshots.length;
      worstServiceUpRatio = this.snapshots.reduce(
        (min, s) => Math.min(min, s.total > 0 ? s.up / s.total : 1),
        1,
      );
    }
    return {
      windowStart: now - WINDOW_MS,
      windowEnd: now,
      alertsBySeverity,
      bugReports: this.bugs.length,
      uniqueBugReporters: uniqueReporters,
      serviceUpRatio,
      worstServiceUpRatio,
      lastCritical,
      lastDeploySha: this.currentDeploySha,
    };
  }
}

export const platformStats = new PlatformStats();
