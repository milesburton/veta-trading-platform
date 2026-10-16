import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

export async function readDirEntries(dir: string): Promise<DirEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
  }));
}

export interface WalkEntry extends DirEntry {
  path: string;
}

export async function* walk(
  root: string,
  options: { exts?: string[]; skip?: RegExp[]; includeDirs?: boolean } = {}
): AsyncGenerator<WalkEntry> {
  const { exts, skip = [], includeDirs = true } = options;
  for (const entry of await readDirEntries(root)) {
    const path = join(root, entry.name);
    if (skip.some((pattern) => pattern.test(path))) continue;
    if (entry.isDirectory) {
      if (includeDirs) yield { ...entry, path };
      yield* walk(path, options);
    } else if (!exts || exts.some((ext) => entry.name.endsWith(ext))) {
      yield { ...entry, path };
    }
  }
}
