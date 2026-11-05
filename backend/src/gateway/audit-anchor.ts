import { z } from "zod";
import type { AuditAnchor, AuditHeadReport } from "../lib/audit.ts";
import type { AlertRouter } from "./alert-router.ts";

export const ANCHOR_PREFIX = "anchors/";
const SEQ_WIDTH = 16;
const ANCHOR_ALERT_KEY = "audit-chain-anchor";
const STORE_ALERT_KEY = "audit-chain-anchor-store";
const DEFAULT_PUBLISH_INTERVAL_MS = 3_600_000;

const AnchorSchema = z.object({ seq: z.number().int().positive(), hash: z.string().length(64) });

const HeadReportSchema = z.object({
  head: AnchorSchema.nullable(),
  at: AnchorSchema.nullable(),
});

export interface AnchorStore {
  put: (anchor: AuditAnchor) => Promise<void>;
  latest: () => Promise<AuditAnchor | null>;
}

export interface S3Like {
  putObject: (key: string, body: string) => Promise<void>;
  listKeys: (prefix: string) => Promise<string[]>;
  getObject: (key: string) => Promise<string>;
}

export function anchorKey(seq: number): string {
  return `${ANCHOR_PREFIX}${String(seq).padStart(SEQ_WIDTH, "0")}.json`;
}

export function createS3AnchorStore(s3: S3Like): AnchorStore {
  return {
    put: (anchor) => s3.putObject(anchorKey(anchor.seq), JSON.stringify(anchor)),
    latest: async () => {
      const keys = (await s3.listKeys(ANCHOR_PREFIX)).filter((k) => k.endsWith(".json")).sort();
      const newest = keys.at(-1);
      if (!newest) return null;
      return AnchorSchema.parse(JSON.parse(await s3.getObject(newest)));
    },
  };
}

export interface AuditAnchorWatchOptions {
  router: AlertRouter;
  store: AnchorStore;
  fetchHead: (atSeq?: number) => Promise<unknown>;
  publish: (anchor: AuditAnchor) => Promise<unknown>;
  now?: () => number;
  publishIntervalMs?: number;
}

export interface AuditAnchorWatch {
  check: () => Promise<void>;
}

function describeProblem(anchor: AuditAnchor, report: AuditHeadReport): string | null {
  if (!report.head || report.head.seq < anchor.seq) {
    const headSeq = report.head?.seq ?? 0;
    return `Anchored head was sequence ${anchor.seq}, the database now ends at ${headSeq}. The newest rows were removed.`;
  }
  if (report.at?.hash !== anchor.hash) {
    return `The row at sequence ${anchor.seq} no longer matches its anchored hash. The log was rewritten after it was anchored.`;
  }
  return null;
}

export function createAuditAnchorWatch(options: AuditAnchorWatchOptions): AuditAnchorWatch {
  const now = options.now ?? Date.now;
  const interval = options.publishIntervalMs ?? DEFAULT_PUBLISH_INTERVAL_MS;
  let lastPublishedAt = Number.NEGATIVE_INFINITY;

  return {
    check: async () => {
      const anchor = await options.store.latest().catch(() => undefined);
      if (anchor === undefined) {
        options.router.raise({
          key: STORE_ALERT_KEY,
          severity: "WARNING",
          title: "Audit anchor store is unreachable",
          detail:
            "The chain head cannot be compared with its external anchor until the store recovers.",
        });
        return;
      }
      options.router.resolve(STORE_ALERT_KEY, "the audit anchor store is reachable again");

      const requested = anchor?.seq;
      const parsed = await options
        .fetchHead(requested)
        .then((body) => HeadReportSchema.safeParse(body))
        .catch(() => null);
      if (!parsed?.success) return;
      const report = parsed.data;

      if (anchor) {
        const problem = describeProblem(anchor, report);
        if (problem) {
          options.router.raise({
            key: ANCHOR_ALERT_KEY,
            severity: "CRITICAL",
            title: "Audit log no longer matches its external anchor",
            detail: problem,
          });
          return;
        }
        options.router.resolve(ANCHOR_ALERT_KEY, "the audit log matches its external anchor again");
      }

      const due = now() - lastPublishedAt >= interval;
      const moved = report.head !== null && report.head.seq > (anchor?.seq ?? 0);
      if (!due || !moved || !report.head) return;

      const published = await options.store.put(report.head).then(
        () => true,
        () => false
      );
      if (!published) return;
      lastPublishedAt = now();
      await options.publish(report.head).catch(() => undefined);
    },
  };
}
