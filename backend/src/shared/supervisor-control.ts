const DEFAULT_SUPERVISORD_CONF = "/home/deno/supervisord.conf";

function supervisordConf(): string {
  return Deno.env.get("SUPERVISORD_CONF") || DEFAULT_SUPERVISORD_CONF;
}

export type SupervisorctlRunner = (args: string[]) => Promise<{ ok: boolean; output: string }>;

export const defaultSupervisorctlRunner: SupervisorctlRunner = async (args) => {
  try {
    const cmd = new Deno.Command("supervisorctl", {
      args: ["-c", supervisordConf(), ...args],
      stdout: "piped",
      stderr: "piped",
    });
    const result = await cmd.output();
    const stdout = new TextDecoder().decode(result.stdout).trim();
    const stderr = new TextDecoder().decode(result.stderr).trim();
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
