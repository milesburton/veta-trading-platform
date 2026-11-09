import type { Pool } from "./db.ts";

export const REGULATORY_TOPICS = [
  "orders.submitted",
  "orders.routed",
  "orders.child",
  "orders.filled",
  "orders.expired",
  "orders.rejected",
] as const;

export interface RegulatoryEventInput {
  eventId: string;
  eventType: string;
  ts: number;
  orderId: string | null;
  childId: string | null;
  payload: Record<string, unknown>;
}

export interface RegulatoryRecord extends RegulatoryEventInput {
  seq: number;
  hash: string;
  prevHash: string;
}

interface RegulatoryRow {
  seq: bigint;
  event_id: string;
  event_type: string;
  ts: Date;
  order_id: string | null;
  child_id: string | null;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

export function isRegulatoryTopic(topic: string): boolean {
  return (REGULATORY_TOPICS as readonly string[]).includes(topic);
}

export async function appendRegulatoryEvent(
  pool: Pool,
  event: RegulatoryEventInput
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.queryArray(
      `INSERT INTO regulatory.order_events (event_id, event_type, ts, order_id, child_id, payload)
       VALUES ($1, $2, to_timestamp($3::double precision / 1000), $4, $5, $6::jsonb)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.eventId,
        event.eventType,
        event.ts,
        event.orderId,
        event.childId,
        JSON.stringify(event.payload),
      ]
    );
  } finally {
    client.release();
  }
}

export async function firstBrokenRegulatorySeq(pool: Pool): Promise<number | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.queryObject<{ broken: bigint | null }>(
      "SELECT regulatory.first_broken_seq() AS broken"
    );
    const broken = rows[0]?.broken ?? null;
    return broken === null ? null : Number(broken);
  } finally {
    client.release();
  }
}

export async function regulatoryHead(pool: Pool): Promise<{ seq: number; hash: string } | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.queryObject<{ seq: bigint; hash: string }>(
      "SELECT seq, hash FROM regulatory.order_events ORDER BY seq DESC LIMIT 1"
    );
    return rows[0] ? { seq: Number(rows[0].seq), hash: rows[0].hash } : null;
  } finally {
    client.release();
  }
}

export async function regulatoryEventsBetween(
  pool: Pool,
  fromMs: number,
  toMs: number
): Promise<RegulatoryRecord[]> {
  const client = await pool.connect();
  try {
    const { rows } = await client.queryObject<RegulatoryRow>(
      `SELECT seq, event_id, event_type, ts, order_id, child_id, payload, prev_hash, hash
         FROM regulatory.order_events
        WHERE ts >= to_timestamp($1::double precision / 1000)
          AND ts < to_timestamp($2::double precision / 1000)
        ORDER BY seq`,
      [fromMs, toMs]
    );
    return rows.map((r) => ({
      seq: Number(r.seq),
      eventId: r.event_id,
      eventType: r.event_type,
      ts: r.ts.getTime(),
      orderId: r.order_id,
      childId: r.child_id,
      payload: r.payload,
      prevHash: r.prev_hash,
      hash: r.hash,
    }));
  } finally {
    client.release();
  }
}
