import { z } from "zod";
import type { Pool } from "./db.ts";

export const AuditEventSchema = z.object({
  actorId: z.string().min(1),
  actorRole: z.string().min(1),
  action: z.string().min(1),
  target: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).default({}),
  ts: z.number().int().positive().optional(),
});
export type AuditEvent = z.input<typeof AuditEventSchema>;

export interface AuditRecord {
  seq: number;
  ts: number;
  actorId: string;
  actorRole: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  hash: string;
}

interface AuditRow {
  seq: bigint;
  ts: Date;
  actor_id: string;
  actor_role: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  hash: string;
}

export async function appendAudit(pool: Pool, event: AuditEvent): Promise<void> {
  const client = await pool.connect();
  try {
    await client.queryArray(
      `INSERT INTO audit.events (ts, actor_id, actor_role, action, target, detail)
       VALUES (COALESCE(to_timestamp($1::double precision / 1000), now()), $2, $3, $4, $5, $6::jsonb)`,
      [
        event.ts ?? null,
        event.actorId,
        event.actorRole,
        event.action,
        event.target ?? null,
        JSON.stringify(event.detail ?? {}),
      ]
    );
  } finally {
    client.release();
  }
}

export async function firstBrokenSeq(pool: Pool): Promise<number | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.queryObject<{ broken: bigint | null }>(
      "SELECT audit.first_broken_seq() AS broken"
    );
    const broken = rows[0]?.broken ?? null;
    return broken === null ? null : Number(broken);
  } finally {
    client.release();
  }
}

export async function listAudit(
  pool: Pool,
  options: { limit?: number; beforeSeq?: number; actorId?: string } = {}
): Promise<AuditRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const client = await pool.connect();
  try {
    const { rows } = await client.queryObject<AuditRow>(
      `SELECT seq, ts, actor_id, actor_role, action, target, detail, hash
         FROM audit.events
        WHERE ($1::bigint IS NULL OR seq < $1)
          AND ($2::text IS NULL OR actor_id = $2)
        ORDER BY seq DESC
        LIMIT $3`,
      [options.beforeSeq ?? null, options.actorId ?? null, limit]
    );
    return rows.map((r) => ({
      seq: Number(r.seq),
      ts: r.ts.getTime(),
      actorId: r.actor_id,
      actorRole: r.actor_role,
      action: r.action,
      target: r.target,
      detail: r.detail,
      hash: r.hash,
    }));
  } finally {
    client.release();
  }
}

export interface AuditAnchor {
  seq: number;
  hash: string;
}

export interface AuditHeadReport {
  head: AuditAnchor | null;
  at: AuditAnchor | null;
}

export async function auditHead(pool: Pool, atSeq?: number): Promise<AuditHeadReport> {
  const client = await pool.connect();
  try {
    const { rows } = await client.queryObject<{ seq: bigint; hash: string }>(
      `(SELECT seq, hash FROM audit.events ORDER BY seq DESC LIMIT 1)
       UNION ALL
       (SELECT seq, hash FROM audit.events WHERE seq = $1::bigint)`,
      [atSeq ?? null]
    );
    const toAnchor = (row?: { seq: bigint; hash: string }): AuditAnchor | null =>
      row ? { seq: Number(row.seq), hash: row.hash } : null;
    const head = toAnchor(rows[0]);
    const at = atSeq === undefined ? null : toAnchor(rows.find((r) => Number(r.seq) === atSeq));
    return { head, at };
  } finally {
    client.release();
  }
}
