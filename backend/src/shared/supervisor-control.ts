import { runCommand } from "../lib/process.ts";
const DEFAULT_SUPERVISORD_CONF = "/home/veta/supervisord.conf";

function supervisordConf(): string {
  return process.env.SUPERVISORD_CONF || DEFAULT_SUPERVISORD_CONF;
}

export type SupervisorctlRunner = (args: string[]) => Promise<{ ok: boolean; output: string }>;

export const defaultSupervisorctlRunner: SupervisorctlRunner = async (args) => {
  try {
    const result = await runCommand("supervisorctl", ["-c", supervisordConf(), ...args]);
    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();
    return { ok: result.code === 0, output: stdout || stderr };
  } catch (err) {
    return { ok: false, output: (err as Error).message };
  }
};

export function startProgram(
  program: string,
  run: SupervisorctlRunner = defaultSupervisorctlRunner
): Promise<{ ok: boolean; output: string }> {
  return run(["start", program]);
}

export function stopProgram(
  program: string,
  run: SupervisorctlRunner = defaultSupervisorctlRunner
): Promise<{ ok: boolean; output: string }> {
  return run(["stop", program]);
}

export async function isProgramRunning(
  program: string,
  run: SupervisorctlRunner = defaultSupervisorctlRunner
): Promise<boolean> {
  const { ok, output } = await run(["status", program]);
  if (!ok && !output) return false;
  return /RUNNING/.test(output);
}
