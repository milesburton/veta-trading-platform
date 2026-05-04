import { useState } from "react";
import { AssetSelector } from "@veta/frontend/components/AssetSelector";

const assets = [
  { symbol: "AAPL", initialPrice: 195, volatility: 0.02, sector: "Tech" },
  { symbol: "MSFT", initialPrice: 410, volatility: 0.018, sector: "Tech" },
  { symbol: "JPM", initialPrice: 198, volatility: 0.022, sector: "Financials" },
  { symbol: "GS", initialPrice: 478, volatility: 0.025, sector: "Financials" },
  { symbol: "EUR/USD", initialPrice: 1.0834, volatility: 0.005, sector: "FX" },
  { symbol: "GBP/USD", initialPrice: 1.2576, volatility: 0.006, sector: "FX" },
];

const prices: Record<string, number> = {
  AAPL: 195.42,
  MSFT: 410.16,
  JPM: 198.83,
  GS: 478.55,
  "EUR/USD": 1.0834,
  "GBP/USD": 1.2576,
};

export function AssetSelectorDemo() {
  const [value, setValue] = useState("AA");
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "240px" }}>
      <AssetSelector
        assets={assets}
        value={value}
        onChange={setValue}
        onSelect={(sym) => {
          setPicked(sym);
          setValue(sym);
        }}
        prices={prices}
      />
      <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#94a3b8" }}>
        Last selected: <code>{picked ?? "(none)"}</code>
      </div>
    </div>
  );
}

export default AssetSelectorDemo;
