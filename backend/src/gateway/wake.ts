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

export function isConnectionRefused(res: Response): boolean {
  // proxy.ts maps every fetch failure, including connection refused, to 502.
  return res.status === 502;
}

export async function proxyWithWake(
  svcName: string,
  proxyFn: () => Promise<Response>,
  req: Request,
  specByComposeName: Map<string, ServiceSpec>,
  corsHeaders: (req: Request) => Record<string, string>,
  options: {
    retryDelaysMs?: number[];
    sleep?: (ms: number) => Promise<void>;
    isProgramRunningFn?: typeof isProgramRunning;
    startProgramFn?: typeof startProgram;
  } = {}
): Promise<Response> {
  const retryDelaysMs = options.retryDelaysMs ?? WAKE_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const isRunning = options.isProgramRunningFn ?? isProgramRunning;
  const start = options.startProgramFn ?? startProgram;

  const spec = specByComposeName.get(svcName);
  const program = spec?.supervisorProgram ?? svcName;

  let res = await proxyFn();
  if (!isConnectionRefused(res)) return res;

  const alreadyRunning = await isRunning(program);
  if (!alreadyRunning) await start(program);

  for (const delayMs of retryDelaysMs) {
    await sleep(delayMs);
    res = await proxyFn();
    if (!isConnectionRefused(res)) return res;
  }

  return startingResponse(req, corsHeaders);
}
