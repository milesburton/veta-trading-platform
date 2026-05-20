import type { PlatformStatsSnapshot } from "./platform-stats.ts";

const DEFAULT_HOUR_UTC = 9;

export interface DailySummaryContext {
  version: string;
  environment: string;
  startedAt: number;
  getStats: () => PlatformStatsSnapshot;
  getServices: () => Record<string, boolean> | null;
}

export interface DailySummaryOptions extends DailySummaryContext {
  hourUtc?: number;
  intervalMs?: number;
  sender?: (msg: string) => Promise<boolean>;
  now?: () => number;
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function shortSha(version: string): string {
  return version.length > 7 ? version.slice(0, 7) : version;
}

export function buildDailySummary(ctx: DailySummaryContext, nowMs: number = Date.now()): string {
  const stats = ctx.getStats();
  const services = ctx.getServices();
  const uptime = formatUptime(nowMs - ctx.startedAt);

  const overallEmoji = stats.worstServiceUpRatio === null
    ? "ℹ️"
    : stats.worstServiceUpRatio >= 1
    ? "✅"
    : stats.worstServiceUpRatio >= 0.95
    ? "⚠️"
    : "🚨";

  const lines: string[] = [
    `${overallEmoji} **VETA daily summary** · \`${shortSha(ctx.version)}\` (${ctx.environment}) · gateway uptime ${uptime}`,
    "",
  ];

  if (stats.serviceUpRatio !== null) {
    lines.push(
      `**Services (last 24h):** mean ${formatPct(stats.serviceUpRatio)} up · worst window ${formatPct(stats.worstServiceUpRatio ?? 0)}`,
    );
  } else {
    lines.push("**Services:** no samples in window yet");
  }
  if (services) {
    const entries = Object.entries(services);
    const downNow = entries.filter(([, ok]) => !ok).map(([name]) => name);
    if (downNow.length === 0) {
      lines.push(`Now: all ${entries.length} services up ✅`);
    } else {
      lines.push(`Now: ${entries.length - downNow.length}/${entries.length} up · 🔴 ${downNow.join(", ")}`);
    }
  }
  lines.push("");

  const known = ["CRITICAL", "WARNING", "INFO"];
  const totalAlerts = Object.values(stats.alertsBySeverity).reduce((s, n) => s + n, 0);
  if (totalAlerts === 0) {
    lines.push("**Alerts (last 24h):** none 🎯");
  } else {
    const parts: string[] = [];
    for (const sev of known) {
      if (stats.alertsBySeverity[sev]) {
        parts.push(`${sev.toLowerCase()}: ${stats.alertsBySeverity[sev]}`);
      }
    }
    for (const [sev, n] of Object.entries(stats.alertsBySeverity)) {
      if (!known.includes(sev) && n > 0) {
        parts.push(`${sev.toLowerCase()}: ${n}`);
      }
    }
    lines.push(`**Alerts (last 24h):** ${totalAlerts} total · ${parts.join(", ")}`);
    if (stats.lastCritical) {
      const ago = Math.round((nowMs - stats.lastCritical.ts) / 60000);
      lines.push(
        `Last critical: ${ago}m ago — \`${stats.lastCritical.source}\` ${stats.lastCritical.message.slice(0, 100)}`,
      );
    }
  }
  lines.push("");

  if (stats.bugReports === 0) {
    lines.push("**Bug reports (last 24h):** none");
  } else {
    lines.push(
      `**Bug reports (last 24h):** ${stats.bugReports} from ${stats.uniqueBugReporters} user${stats.uniqueBugReporters === 1 ? "" : "s"}`,
    );
  }
  lines.push("");

  if (stats.lastDeploySha) {
    lines.push(`**Deployed SHA:** \`${shortSha(stats.lastDeploySha)}\``);
  }

  return lines.join("\n").trim();
}

function nextFireTime(now: number, hourUtc: number): number {
  const d = new Date(now);
  const candidate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc, 0, 0, 0));
  if (candidate.getTime() < now) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.getTime();
}

function validHourUtc(value: number | undefined): number {
  if (value === undefined) return DEFAULT_HOUR_UTC;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 23) {
    return DEFAULT_HOUR_UTC;
  }
  return value;
}

export function startDailySummary(opts: DailySummaryOptions): { stop: () => void; nextFireAt: () => number } {
  const hourUtc = validHourUtc(opts.hourUtc);
  const sender = opts.sender ?? (() => Promise.resolve(false));
  const now = opts.now ?? (() => Date.now());
  let nextFire = nextFireTime(now(), hourUtc);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    const msg = buildDailySummary(opts, now());
    sender(msg).catch(() => {});
    nextFire = nextFireTime(now(), hourUtc);
    schedule();
  };

  const schedule = () => {
    const delay = Math.max(1000, nextFire - now());
    timer = setTimeout(fire, delay);
  };

  schedule();
  return {
    stop: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    nextFireAt: () => nextFire,
  };
}
