import {
  Oid,
  Pool,
  type ClientOptions,
  type Decoders,
} from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { createParams } from "https://deno.land/x/postgres@v0.19.3/connection/connection_params.ts";

function resolveUrl(serviceKey: string): string {
  const url = Deno.env.get(`${serviceKey}_DATABASE_URL`) ?? Deno.env.get("DATABASE_URL");
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

const floatDecoders: Decoders = {
  [Oid.float8]: (value: string) => Number.parseFloat(value),
  [Oid.float8_array]: (value: string, _oid: number, parseArray) =>
    parseArray(value, (entry) => Number.parseFloat(entry)),
};

function poolOptionsFromUrl(url: string): ClientOptions {
  const params = createParams(url);
  return {
    ...params,
    controls: {
      ...params.controls,
      decoders: {
        ...params.controls?.decoders,
        ...floatDecoders,
      },
    },
  };
}

function getPool(key: string, size: number, lazy: boolean): Pool {
  if (!cache[key]) {
    cache[key] = new Pool(poolOptionsFromUrl(resolveUrl(key)), size, lazy);
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
