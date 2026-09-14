import { logger } from "@veta/logger";

export function armIdleExit(
  timeoutMs: number,
  onExit?: () => Promise<void> | void,
  exit: (code: number) => void = Deno.exit
): { touch: () => void } {
  let timer: number | undefined;

  const fire = async () => {
    try {
      if (onExit) await onExit();
    } catch (err) {
      logger.error("armIdleExit: onExit failed, exiting anyway", { err });
    } finally {
      exit(0);
    }
  };

  const touch = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fire, timeoutMs);
  };

  touch();
  return { touch };
}

export function armConsumerIdleExit(
  timeoutMs: number,
  label: string,
  exit: (code: number) => void = Deno.exit
): { touch: () => void } {
  let timer: number | undefined;

  const fire = () => {
    logger.info(`[${label}] Idle timeout reached with no messages consumed — exiting`);
    exit(0);
  };

  const touch = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fire, timeoutMs);
  };

  touch();
  return { touch };
}
