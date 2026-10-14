import type { ServiceSpec } from "../../../shared/serviceRegistry.ts";
import { isProgramRunning, startProgram } from "../shared/supervisor-control.ts";

const WAKE_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 4_000];

export function startingResponse(
  req: Request,
  corsHeaders: (req: Request) => Record<string, string>
): Response {
  return new Response(JSON.stringify({ status: "starting" }), {
    status: 503,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

export async function isConnectionRefused(res: Response): Promise<boolean> {
  if (res.status !== 502) return false;
  try {
    const body = (await res.clone().json()) as { connectionRefused?: boolean; error?: string };
    if (body.connectionRefused === true) return true;
    return typeof body.error === "string" && /(econnrefused|connection refused)/i.test(body.error);
  } catch {
    return false;
  }
}

interface WakeOptions {
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  isProgramRunningFn?: typeof isProgramRunning;
  startProgramFn?: typeof startProgram;
}

function resolveWakeOptions(options: WakeOptions) {
  return {
    retryDelaysMs: options.retryDelaysMs ?? WAKE_RETRY_DELAYS_MS,
    sleep: options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    isRunning: options.isProgramRunningFn ?? isProgramRunning,
    start: options.startProgramFn ?? startProgram,
  };
}

async function wakeProgram(
  program: string,
  isRunning: typeof isProgramRunning,
  start: typeof startProgram
): Promise<void> {
  const alreadyRunning = await isRunning(program);
  if (!alreadyRunning) await start(program);
}

export async function proxyWithWake(
  svcName: string,
  proxyFn: () => Promise<Response>,
  req: Request,
  specByComposeName: Map<string, ServiceSpec>,
  corsHeaders: (req: Request) => Record<string, string>,
  options: WakeOptions = {}
): Promise<Response> {
  const { retryDelaysMs, sleep, isRunning, start } = resolveWakeOptions(options);
  const program = specByComposeName.get(svcName)?.supervisorProgram ?? svcName;

  let res = await proxyFn();
  if (!(await isConnectionRefused(res))) return res;

  await wakeProgram(program, isRunning, start);

  for (const delayMs of retryDelaysMs) {
    await sleep(delayMs);
    res = await proxyFn();
    if (!(await isConnectionRefused(res))) return res;
  }

  return startingResponse(req, corsHeaders);
}
