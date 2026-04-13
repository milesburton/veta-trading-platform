import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

function resolveUrl(serviceKey?: string): string {
  const url =
    (serviceKey ? Deno.env.get(`${serviceKey}_DATABASE_URL`) : undefined) ??
      Deno.env.get("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

export const journalPool = new Pool(resolveUrl("JOURNAL"), 12, true);
export const fixArchivePool = new Pool(resolveUrl("FIX_ARCHIVE"), 3, true);
export const usersPool = new Pool(resolveUrl("USERS"), 12, true);
export const intelligencePool = new Pool(resolveUrl("INTELLIGENCE"), 3, true);
export const llmAdvisoryPool = new Pool(resolveUrl("LLM_ADVISORY"), 3, true);
export const replayPool = new Pool(resolveUrl("REPLAY"), 3, true);
