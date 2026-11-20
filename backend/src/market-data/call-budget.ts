export interface BudgetState {
  readonly day: string;
  readonly used: number;
}

export interface CallBudget {
  readonly limit: number;
  readonly minGapMs: number;
  tryConsume(): boolean;
  remaining(): number;
}

const DAY_MS = 86_400_000;

export const utcDay = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);

export function parseDailyLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function createCallBudget(options: {
  limit: number;
  clock: () => number;
  initial?: BudgetState;
  onChange?: (state: BudgetState) => void;
}): CallBudget {
  const { limit, clock, onChange } = options;
  let state: BudgetState = options.initial ?? { day: utcDay(clock()), used: 0 };

  const current = (): BudgetState => {
    const today = utcDay(clock());
    if (state.day !== today) state = { day: today, used: 0 };
    return state;
  };

  return {
    limit,
    minGapMs: limit > 0 ? Math.floor(DAY_MS / limit) : 0,
    tryConsume: () => {
      const now = current();
      if (limit > 0 && now.used >= limit) return false;
      state = { day: now.day, used: now.used + 1 };
      onChange?.(state);
      return true;
    },
    remaining: () => (limit > 0 ? Math.max(0, limit - current().used) : Number.POSITIVE_INFINITY),
  };
}
