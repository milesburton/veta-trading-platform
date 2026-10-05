import { marketHoursMode } from "@veta/frontend/domain/market/marketHoursMode.ts";
import type { MarketHoursConfig } from "@veta/frontend/store/gatewayApi.ts";

interface MarketHoursModeSwitchProps {
  config: MarketHoursConfig | undefined;
  disabled: boolean;
  onChange: (allowOutOfHours: boolean) => void;
}

const OPTIONS = [
  { label: "Simulated 24/7", allowOutOfHours: true, mode: "simulated" },
  { label: "Real hours", allowOutOfHours: false, mode: "real" },
] as const;

const MODE_DESCRIPTIONS = {
  simulated: "Every asset class ticks around the clock.",
  real: "Every asset class ticks only while its real market is open.",
  mixed: "Asset classes are set individually below.",
} as const;

export function MarketHoursModeSwitch({ config, disabled, onChange }: MarketHoursModeSwitchProps) {
  const mode = config ? marketHoursMode(config) : undefined;
  return (
    <div
      data-testid="market-hours-mode-switch"
      className="bg-surface/40 p-3 flex items-center justify-between gap-4"
    >
      <div>
        <div className="text-secondary font-medium">Mode</div>
        <div className="text-[10px] text-muted mt-1">
          {mode ? MODE_DESCRIPTIONS[mode] : "—"} Saved across restarts.
        </div>
      </div>
      <fieldset
        aria-label="Market hours mode"
        className="flex shrink-0 rounded border border-panel overflow-hidden"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={mode === option.mode}
            disabled={disabled || !config || mode === option.mode}
            onClick={() => onChange(option.allowOutOfHours)}
            className={`px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed ${
              mode === option.mode
                ? "bg-emerald-600 text-white"
                : "text-secondary hover:bg-surface disabled:opacity-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
