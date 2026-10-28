import { spawn } from "node:child_process";

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const ALLOWED_COMMANDS: Readonly<Record<string, string>> = {
  supervisorctl: "supervisorctl",
  df: "df",
  docker: "docker",
  bash: "bash",
};

export function runCommand(
  command: string,
  args: string[] = [],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}
): Promise<CommandResult> {
  const binary = Object.hasOwn(ALLOWED_COMMANDS, command) ? ALLOWED_COMMANDS[command] : undefined;
  if (binary === undefined) {
    return Promise.reject(new Error(`command not permitted: ${command}`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env: options.env ?? process.env,
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export function spawnDetached(command: string, args: string[]): void {
  spawn(command, args, { stdio: "ignore", detached: true }).unref();
}
