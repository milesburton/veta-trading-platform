import { join } from "https://deno.land/std@0.210.0/path/mod.ts";

export interface Violation {
  file: string;
  line: number;
  rule: string;
  text: string;
}

interface Rule {
  id: string;
  pattern: RegExp;
  why: string;
}

const RULES: Rule[] = [
  {
    id: "drop-table",
    pattern: /\bDROP\s+TABLE\b/i,
    why: "removes a table the currently-live version may still read",
  },
  {
    id: "drop-column",
    pattern: /\bDROP\s+COLUMN\b/i,
    why: "removes a column the currently-live version may still select",
  },
  {
    id: "drop-not-exists-column",
    pattern: /\bALTER\s+TABLE\b[\s\S]*?\bDROP\b(?![\s\S]*?\bIF\s+EXISTS\b)/i,
    why: "drops a column without IF EXISTS; unsafe across a deploy gap",
  },
  {
    id: "delete-without-where",
    pattern: /\bDELETE\s+FROM\b(?![\s\S]*?\bWHERE\b)/i,
    why: "deletes every row; data the live version depends on disappears",
  },
  {
    id: "truncate",
    pattern: /\bTRUNCATE\b/i,
    why: "empties a table the live version may still read",
  },
  {
    id: "rename-column",
    pattern: /\bRENAME\s+COLUMN\b/i,
    why: "the live version still references the old column name",
  },
  {
    id: "rename-table",
    pattern: /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\s+TO\b/i,
    why: "the live version still references the old table name",
  },
  {
    id: "add-not-null-no-default",
    pattern: /\bADD\s+COLUMN\b(?![\s\S]*?\bIF\s+NOT\s+EXISTS\b[\s\S]*?)?[\s\S]*?\bNOT\s+NULL\b(?![\s\S]*?\bDEFAULT\b)/i,
    why: "a NOT NULL column with no default rejects the live version's inserts",
  },
];

function stripComments(sql: string): string[] {
  const noBlock = sql.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock.split("\n").map((line) => {
    const idx = line.indexOf("--");
    return idx === -1 ? line : line.slice(0, idx);
  });
}

export function scanSql(file: string, sql: string): Violation[] {
  const lines = stripComments(sql);
  const violations: Violation[] = [];
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        violations.push({ file, line: i + 1, rule: rule.id, text: lines[i].trim() });
      }
    }
  }
  return violations;
}

async function migrationFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) files.push(entry.name);
  }
  return files.sort();
}

async function main(): Promise<void> {
  const args = Deno.args;
  const dirname = import.meta.dirname;
  if (!dirname) {
    console.error("checkMigrationsSafe requires import.meta.dirname");
    Deno.exit(2);
  }
  const dir = join(dirname, "migrations");

  const targets = args.length > 0
    ? args
    : (await migrationFiles(dir)).map((f) => join(dir, f));

  const allViolations: Violation[] = [];
  for (const path of targets) {
    const abs = path.endsWith(".sql") && !path.includes("/") ? join(dir, path) : path;
    let sql: string;
    try {
      sql = await Deno.readTextFile(abs);
    } catch {
      continue;
    }
    allViolations.push(...scanSql(abs, sql));
  }

  if (allViolations.length === 0) {
    console.log(`✅ migration safety: ${targets.length} file(s) clean (expand/contract)`);
    return;
  }

  console.error("❌ destructive migration detected — unsafe across a deploy gap:");
  for (const v of allViolations) {
    const rule = RULES.find((r) => r.id === v.rule);
    console.error(`  ${v.file}:${v.line} [${v.rule}] ${rule?.why}`);
    console.error(`    ${v.text}`);
  }
  console.error("");
  console.error("Migrations must be expand/contract: additive and backward-compatible so a");
  console.error("still-running previous version keeps working. Split a destructive change");
  console.error("into an additive migration now and a contract migration a release later.");
  Deno.exit(1);
}

if (import.meta.main) {
  await main();
}
