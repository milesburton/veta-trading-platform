import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const REPO_ROOT = resolve(process.cwd(), "../..");
const REPO_URL = "https://github.com/milesburton/veta-trading-platform";
const GIT_REF = process.env.DOCS_GIT_REF ?? "main";

const REGION_RE = (id: string) => new RegExp(`^\\s*(?://|#)\\s*#region\\s+${escapeRegex(id)}\\s*$`);
const REGION_END_RE = /^\s*(?:\/\/|#)\s*#endregion\b/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface SourceRegion {
  path: string;
  region: string;
  startLine: number;
  endLine: number;
  body: string;
  url: string;
}

export async function loadRegion(path: string, region: string): Promise<SourceRegion> {
  if (path.startsWith("/") || path.includes("..")) {
    throw new Error(`Source path must be repo-relative: ${path}`);
  }
  const absolute = resolve(REPO_ROOT, path);
  let raw: string;
  try {
    raw = await readFile(absolute, "utf8");
  } catch {
    throw new Error(`Source file not found: ${path}`);
  }

  const lines = raw.split("\n");
  const startRe = REGION_RE(region);
  let startLine = -1;
  let endLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startLine === -1 && startRe.test(lines[i])) {
      startLine = i + 1;
      continue;
    }
    if (startLine !== -1 && REGION_END_RE.test(lines[i])) {
      endLine = i + 1;
      break;
    }
  }
  if (startLine === -1) {
    throw new Error(`Region "${region}" not found in ${path}`);
  }
  if (endLine === -1) {
    throw new Error(`Region "${region}" in ${path} has no #endregion`);
  }
  if (endLine - startLine < 2) {
    throw new Error(`Region "${region}" in ${path} is empty`);
  }

  const bodyLines = lines.slice(startLine, endLine - 1);
  const dedented = dedent(bodyLines).join("\n");
  const url = `${REPO_URL}/blob/${GIT_REF}/${path}#L${startLine + 1}-L${endLine - 1}`;

  return {
    path,
    region,
    startLine: startLine + 1,
    endLine: endLine - 1,
    body: dedented,
    url,
  };
}

export function fileUrl(path: string, line?: number): string {
  if (path.startsWith("/") || path.includes("..")) {
    throw new Error(`Source path must be repo-relative: ${path}`);
  }
  const fragment = line != null ? `#L${line}` : "";
  return `${REPO_URL}/blob/${GIT_REF}/${path}${fragment}`;
}

function dedent(lines: string[]): string[] {
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return lines;
  const indent = Math.min(...nonEmpty.map((l) => l.match(/^[ \t]*/)?.[0].length ?? 0));
  return lines.map((l) => l.slice(indent));
}

export function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "ts",
    tsx: "tsx",
    js: "js",
    jsx: "jsx",
    json: "json",
    sh: "bash",
    bash: "bash",
    fish: "fish",
    py: "python",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "md",
    css: "css",
    html: "html",
    sql: "sql",
  };
  return map[ext] ?? "text";
}
