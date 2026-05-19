// fallow-ignore-file unused-file
import { bearishReversal } from "./bearish-reversal.ts";
import { bullishMomentum } from "./bullish-momentum.ts";
import { neutralContext } from "./neutral-context.ts";
import type { Playbook, PlaybookContext } from "./types.ts";

export type { Playbook, PlaybookContext } from "./types.ts";

const PLAYBOOKS: readonly Playbook[] = [bullishMomentum, bearishReversal, neutralContext];

export function listPlaybooks(): readonly Playbook[] {
  return PLAYBOOKS;
}

export function selectPlaybook(ctx: PlaybookContext): Playbook | null {
  for (const pb of PLAYBOOKS) {
    if (pb.applies(ctx)) return pb;
  }
  return null;
}

export function playbookById(id: string): Playbook | null {
  return PLAYBOOKS.find((pb) => pb.id === id) ?? null;
}
