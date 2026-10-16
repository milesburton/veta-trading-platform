import pg from "pg";

const INT8_OID = 20;

pg.types.setTypeParser(INT8_OID, (value: string) => BigInt(value));

export interface QueryResult<Row> {
  rows: Row[];
  rowCount: number | null;
}

export interface PooledClient {
  queryArray<Row extends unknown[] = unknown[]>(
    sql: string,
    args?: unknown[]
  ): Promise<QueryResult<Row>>;
  queryObject<Row = Record<string, unknown>>(
    sql: string,
    args?: unknown[]
  ): Promise<QueryResult<Row>>;
  release(): void;
}

function wrapClient(client: pg.PoolClient): PooledClient {
  return {
    async queryArray<Row extends unknown[] = unknown[]>(sql: string, args?: unknown[]) {
      const result = await client.query({ text: sql, values: args, rowMode: "array" });
      return { rows: result.rows as Row[], rowCount: result.rowCount };
    },
    async queryObject<Row = Record<string, unknown>>(sql: string, args?: unknown[]) {
      const result = await client.query(sql, args);
      return { rows: result.rows as Row[], rowCount: result.rowCount };
    },
    release: () => client.release(),
  };
}

export class Pool {
  private readonly inner: pg.Pool;

  constructor(connectionString: string, size: number, _lazy = true) {
    this.inner = new pg.Pool({ connectionString, max: size });
  }

  async connect(): Promise<PooledClient> {
    return wrapClient(await this.inner.connect());
  }

  end(): Promise<void> {
    return this.inner.end();
  }
}

function resolveUrl(serviceKey: string): string {
  const url = process.env[`${serviceKey}_DATABASE_URL`] ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(`DATABASE_URL is required (set ${serviceKey}_DATABASE_URL or DATABASE_URL)`);
  }
  return url;
}

interface PoolSpec {
  key: string;
  size: number;
  lazy: boolean;
}

const SPECS: PoolSpec[] = [
  { key: "JOURNAL", size: 12, lazy: true },
  { key: "FIX_ARCHIVE", size: 3, lazy: true },
  { key: "USERS", size: 12, lazy: true },
  { key: "INTELLIGENCE", size: 3, lazy: true },
  { key: "LLM_ADVISORY", size: 12, lazy: true },
  { key: "REPLAY", size: 3, lazy: true },
  { key: "RISK", size: 3, lazy: true },
  { key: "SCENARIOS", size: 4, lazy: true },
  { key: "MARKET_SIM", size: 2, lazy: true },
];

const cache: Record<string, Pool> = {};

function getPool(key: string, size: number, lazy: boolean): Pool {
  if (!cache[key]) {
    cache[key] = new Pool(resolveUrl(key), size, lazy);
  }
  return cache[key];
}

function lazyExport(key: string, size: number, lazy: boolean): Pool {
  return new Proxy({} as Pool, {
    get(_target, prop) {
      const pool = getPool(key, size, lazy);
      const value = Reflect.get(pool, prop, pool);
      return typeof value === "function" ? value.bind(pool) : value;
    },
  });
}

export const journalPool = lazyExport("JOURNAL", 12, true);
export const fixArchivePool = lazyExport("FIX_ARCHIVE", 3, true);
export const usersPool = lazyExport("USERS", 12, true);
export const intelligencePool = lazyExport("INTELLIGENCE", 3, true);
export const llmAdvisoryPool = lazyExport("LLM_ADVISORY", 12, true);
export const replayPool = lazyExport("REPLAY", 3, true);
export const riskPool = lazyExport("RISK", 3, true);
export const scenariosPool = lazyExport("SCENARIOS", 4, true);
export const marketSimPool = lazyExport("MARKET_SIM", 2, true);

export const _SPECS = SPECS;
