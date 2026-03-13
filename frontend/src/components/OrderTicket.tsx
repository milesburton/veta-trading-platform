import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTradingContext } from "../context/TradingContext.tsx";
import { BOND_UNIVERSE } from "../data/bondUniverse.ts";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useGetBondPriceMutation, useGetQuoteMutation } from "../store/analyticsApi.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { isOrderBlocked } from "../store/killSwitchSlice.ts";
import { submitOrderThunk } from "../store/ordersSlice.ts";
import { setActiveSide, setActiveStrategy } from "../store/uiSlice.ts";
import type { BondPriceResponse, OptionQuoteResponse } from "../types/analytics.ts";
import type {
  AlgoParams,
  ArrivalPriceParams,
  BondSpec,
  IcebergParams,
  InstrumentType,
  IsParams,
  LimitParams,
  MomentumParams,
  PovParams,
  SniperParams,
  Trade,
  TwapParams,
  VwapParams,
} from "../types.ts";
import { AssetSelector } from "./AssetSelector";
import { StrategyParams } from "./StrategyParams";

function formatPrice(symbol: string, price: number) {
  return symbol.includes("/") ? price.toFixed(4) : price.toFixed(2);
}

function fmt2(n: number) {
  return n.toFixed(2);
}

function AssetInfoBar({ symbol }: { symbol: string }) {
  const assets = useAppSelector((s) => s.market.assets);
  const orderBook = useAppSelector((s) => s.market.orderBook);
  const asset = assets.find((a) => a.symbol === symbol);
  if (!asset) return null;

  const book = orderBook[symbol];
  const bid = book?.bids[0]?.price;
  const ask = book?.asks[0]?.price;
  const spreadBps = bid && ask ? (((ask - bid) / ((bid + ask) / 2)) * 10_000).toFixed(1) : null;

  return (
    <div
      className="rounded bg-gray-800/60 border border-gray-700/50 px-2.5 py-2 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1"
      data-testid="asset-info-bar"
    >
      <div className="flex justify-between">
        <span className="text-gray-500">Bid</span>
        <span className="tabular-nums text-sky-400">{bid ? formatPrice(symbol, bid) : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Ask</span>
        <span className="tabular-nums text-red-400">{ask ? formatPrice(symbol, ask) : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Spread</span>
        <span className="tabular-nums text-gray-400">{spreadBps ? `${spreadBps}bp` : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Beta</span>
        <span className="tabular-nums text-gray-400">
          {asset.beta !== undefined ? asset.beta.toFixed(2) : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Mkt Cap</span>
        <span className="tabular-nums text-gray-400">
          {asset.marketCapB !== undefined
            ? asset.marketCapB >= 1000
              ? `$${(asset.marketCapB / 1000).toFixed(1)}T`
              : `$${asset.marketCapB.toFixed(0)}B`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Div Yld</span>
        <span className="tabular-nums text-gray-400">
          {asset.dividendYield !== undefined && asset.dividendYield > 0
            ? `${(asset.dividendYield * 100).toFixed(2)}%`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">P/E</span>
        <span className="tabular-nums text-gray-400">
          {asset.peRatio !== undefined && asset.peRatio > 0 ? asset.peRatio.toFixed(1) : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Exchange</span>
        <span className="tabular-nums text-gray-400">{asset.exchange ?? "—"}</span>
      </div>
    </div>
  );
}

function OrderPreview({
  symbol,
  qty,
  limitPx,
  side,
}: {
  symbol: string;
  qty: number;
  limitPx: number;
  side: "BUY" | "SELL";
}) {
  const orderBook = useAppSelector((s) => s.market.orderBook);
  if (qty <= 0 || limitPx <= 0) return null;

  const notional = qty * limitPx;
  const book = orderBook[symbol];
  const mid = book?.mid;
  const arrivalSlippageBps =
    mid && mid > 0 ? ((limitPx - mid) / mid) * 10_000 * (side === "BUY" ? 1 : -1) : null;

  return (
    <div className="rounded bg-gray-800/40 border border-gray-700/40 px-2.5 py-1.5 text-[10px] flex items-center justify-between gap-3">
      <div className="flex gap-3">
        <span className="text-gray-500">Notional</span>
        <span className="tabular-nums text-gray-200 font-semibold">
          $
          {notional >= 1_000_000
            ? `${(notional / 1_000_000).toFixed(2)}M`
            : notional >= 1_000
              ? `${(notional / 1_000).toFixed(1)}K`
              : fmt2(notional)}
        </span>
      </div>
      {arrivalSlippageBps !== null && (
        <div className="flex gap-1.5 items-center">
          <span className="text-gray-500">vs Mid</span>
          <span
            className={`tabular-nums font-semibold ${
              arrivalSlippageBps > 5
                ? "text-red-400"
                : arrivalSlippageBps < -5
                  ? "text-emerald-400"
                  : "text-gray-400"
            }`}
          >
            {arrivalSlippageBps > 0 ? "+" : ""}
            {arrivalSlippageBps.toFixed(1)}bp
          </span>
        </div>
      )}
    </div>
  );
}

function OptionPreview({ qty, premium }: { qty: number; premium: number }) {
  if (qty <= 0 || premium <= 0) return null;
  const notional = qty * 100 * premium;
  return (
    <div className="rounded bg-gray-800/40 border border-gray-700/40 px-2.5 py-1.5 text-[10px] flex items-center justify-between gap-3">
      <span className="text-gray-500">
        {qty} contract{qty !== 1 ? "s" : ""}
      </span>
      <span className="tabular-nums text-gray-200 font-semibold">
        $
        {notional >= 1_000_000
          ? `${(notional / 1_000_000).toFixed(2)}M`
          : notional >= 1_000
            ? `${(notional / 1_000).toFixed(1)}K`
            : fmt2(notional)}
        {" notional"}
      </span>
    </div>
  );
}

const TIF_OPTIONS = [
  { value: "DAY", label: "DAY", title: "Day order — expires at market close" },
  { value: "GTC", label: "GTC", title: "Good Till Cancelled" },
  { value: "IOC", label: "IOC", title: "Immediate Or Cancel — fill what you can instantly" },
  { value: "FOK", label: "FOK", title: "Fill Or Kill — all or nothing immediately" },
] as const;

type TifValue = (typeof TIF_OPTIONS)[number]["value"];

const OPTION_EXPIRIES = [
  { label: "7d", secs: 7 * 86400 },
  { label: "14d", secs: 14 * 86400 },
  { label: "30d", secs: 30 * 86400 },
  { label: "60d", secs: 60 * 86400 },
  { label: "90d", secs: 90 * 86400 },
];

export function OrderTicket() {
  const dispatch = useAppDispatch();
  const { registerTicketRef } = useTradingContext();
  const channelIn = useChannelIn();
  const userRole = useAppSelector((s) => s.auth.user?.role);
  const userId = useAppSelector((s) => s.auth.user?.id);
  const blocks = useAppSelector((s) => s.killSwitch.blocks);

  const assets = useAppSelector((s) => s.market.assets);
  const prices = useAppSelector((s) => s.market.prices);
  const activeStrategy = useAppSelector((s) => s.ui.activeStrategy);
  const activeSide = useAppSelector((s) => s.ui.activeSide);
  const limits = useAppSelector((s) => s.auth.limits);

  const [getQuote] = useGetQuoteMutation();

  // ── Shared signals ─────────────────────────────────────────────────────────
  const instrumentType = useSignal<InstrumentType>("equity");
  const assetSearch = useSignal("AAPL");
  const quantity = useSignal("100");
  const submitting = useSignal(false);
  const feedback = useSignal<{ ok: boolean; msg: string } | null>(null);

  // ── Equity-mode signals ────────────────────────────────────────────────────
  const limitPrice = useSignal("");
  const expiresAt = useSignal("300");
  const tif = useSignal<TifValue>("DAY");
  const twapSlices = useSignal("10");
  const twapCap = useSignal("25");
  const povRate = useSignal("10");
  const povMin = useSignal("10");
  const povMax = useSignal("500");
  const vwapDev = useSignal("0.5");
  const vwapStart = useSignal("0");
  const vwapEnd = useSignal("300");
  const icebergVisible = useSignal("100");
  const sniperAggression = useSignal("80");
  const sniperMaxVenues = useSignal("2");
  const apUrgency = useSignal("50");
  const apMaxSlippageBps = useSignal("30");
  const isUrgency = useSignal("50");
  const isMaxSlippageBps = useSignal("30");
  const isMinSlices = useSignal("3");
  const isMaxSlices = useSignal("10");
  const momentumThreshold = useSignal("20");
  const momentumMaxTranches = useSignal("5");
  const momentumShortEma = useSignal("5");
  const momentumLongEma = useSignal("20");
  const momentumCooldown = useSignal("3");

  // ── Options-mode signals ───────────────────────────────────────────────────
  const optionType = useSignal<"call" | "put">("call");
  const optionStrike = useSignal("");
  const optionExpiry = useSignal(String(30 * 86400));
  const optionQuote = useSignal<OptionQuoteResponse | null>(null);
  const quoteFetching = useSignal(false);

  // ── Bond-mode signals ──────────────────────────────────────────────────────
  const bondSymbol = useSignal(BOND_UNIVERSE[4]?.symbol ?? "US10Y"); // default to US10Y
  const bondYield = useSignal("");
  const bondQuote = useSignal<BondPriceResponse | null>(null);
  const bondFetching = useSignal(false);

  const [getBondPrice] = useGetBondPriceMutation();
  const bondDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formRef = useRef<HTMLFormElement | null>(null);
  const assetInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    registerTicketRef(assetInputRef.current);
  }, [registerTicketRef]);

  const selectedAsset = assets.find((a) => a.symbol === assetSearch.value) ?? assets[0];
  const currentPrice = selectedAsset ? prices[selectedAsset.symbol] : undefined;

  const _priceInitialised = useRef(false);
  if (!_priceInitialised.current && currentPrice && instrumentType.value === "equity") {
    _priceInitialised.current = true;
    limitPrice.value = formatPrice(selectedAsset?.symbol ?? "", currentPrice);
  }

  function selectAsset(symbol: string) {
    assetSearch.value = symbol;
    const price = prices[symbol];
    if (instrumentType.value === "equity") {
      limitPrice.value = price ? formatPrice(symbol, price) : "";
    }
    optionQuote.value = null;
    scheduleQuoteFetch();
  }

  const channelAsset = channelIn.selectedAsset;
  // biome-ignore lint/correctness/useExhaustiveDependencies: signal read is reactive, selectAsset is stable
  useEffect(() => {
    if (channelAsset && channelAsset !== assetSearch.value) {
      selectAsset(channelAsset);
    }
  }, [channelAsset]);

  function scheduleQuoteFetch() {
    if (instrumentType.value !== "option") return;
    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    quoteDebounceRef.current = setTimeout(async () => {
      const symbol = assetSearch.value;
      const strike = Number(optionStrike.value);
      const expirySecs = Number(optionExpiry.value);
      if (!symbol || strike <= 0 || expirySecs <= 0) return;
      quoteFetching.value = true;
      try {
        const result = await getQuote({ symbol, optionType: optionType.value, strike, expirySecs });
        if ("data" in result && result.data) {
          optionQuote.value = result.data;
          limitPrice.value = result.data.price.toFixed(4);
        }
      } finally {
        quoteFetching.value = false;
      }
    }, 600);
  }

  function handleSwitchToOptions() {
    instrumentType.value = "option";
    dispatch(setActiveStrategy("LIMIT"));
    optionQuote.value = null;
    scheduleQuoteFetch();
  }

  function handleSwitchToEquity() {
    instrumentType.value = "equity";
    optionQuote.value = null;
    const price = currentPrice;
    if (price) limitPrice.value = formatPrice(selectedAsset?.symbol ?? "", price);
  }

  function handleSwitchToBond() {
    instrumentType.value = "bond";
    dispatch(setActiveStrategy("LIMIT"));
    bondQuote.value = null;
    scheduleBondQuoteFetch();
  }

  function scheduleBondQuoteFetch() {
    if (bondDebounceRef.current) clearTimeout(bondDebounceRef.current);
    bondDebounceRef.current = setTimeout(async () => {
      const def = BOND_UNIVERSE.find((b) => b.symbol === bondSymbol.value);
      if (!def) return;
      const yld = Number(bondYield.value) > 0 ? Number(bondYield.value) / 100 : def.initialYield;
      bondFetching.value = true;
      try {
        const result = await getBondPrice({
          face: def.faceValue,
          couponRate: def.couponRate,
          periodsPerYear: def.periodsPerYear,
          totalPeriods: def.totalPeriods,
          yieldAnnual: yld,
        });
        if ("data" in result && result.data) {
          bondQuote.value = result.data;
          limitPrice.value = (result.data.price / def.faceValue).toFixed(6); // price as fraction
        }
      } finally {
        bondFetching.value = false;
      }
    }, 600);
  }

  const qty = Number(quantity.value);
  const lx = Number(limitPrice.value);
  const isOptions = instrumentType.value === "option";
  const isBond = instrumentType.value === "bond";

  // ── Validation ─────────────────────────────────────────────────────────────
  const limitWarnings: string[] = [];
  if (!isOptions && !isBond) {
    if (qty > 0 && limits.max_order_qty > 0 && qty > limits.max_order_qty) {
      limitWarnings.push(
        `Quantity ${qty.toLocaleString()} exceeds your limit of ${limits.max_order_qty.toLocaleString()} shares`
      );
    }
    if (qty > 0 && lx > 0) {
      const notional = qty * lx;
      if (notional > limits.max_daily_notional) {
        limitWarnings.push(
          `Notional $${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })} exceeds your daily limit of $${limits.max_daily_notional.toLocaleString()}`
        );
      }
    }
    if (!limits.allowed_strategies.includes(activeStrategy)) {
      limitWarnings.push(`Strategy ${activeStrategy} is not permitted for your account`);
    }
    if (
      isOrderBlocked(blocks, { asset: selectedAsset?.symbol, strategy: activeStrategy, userId })
    ) {
      limitWarnings.push("⛔ Kill switch active — this order is currently blocked");
    }
  }

  const optionStrikeNum = Number(optionStrike.value);
  const selectedBondDef = BOND_UNIVERSE.find((b) => b.symbol === bondSymbol.value);
  const isValid = isOptions
    ? qty > 0 && optionStrikeNum > 0 && !!optionQuote.value && !quoteFetching.value
    : isBond
      ? qty > 0 && !!bondQuote.value && !bondFetching.value && !!selectedBondDef
      : qty > 0 &&
        lx > 0 &&
        Number(expiresAt.value) > 0 &&
        selectedAsset !== undefined &&
        limitWarnings.length === 0;

  function buildAlgoParams(): AlgoParams {
    if (activeStrategy === "TWAP") {
      const p: TwapParams = {
        strategy: "TWAP",
        numSlices: Number(twapSlices.value),
        participationCap: Number(twapCap.value),
      };
      return p;
    }
    if (activeStrategy === "POV") {
      const p: PovParams = {
        strategy: "POV",
        participationRate: Number(povRate.value),
        minSliceSize: Number(povMin.value),
        maxSliceSize: Number(povMax.value),
      };
      return p;
    }
    if (activeStrategy === "VWAP") {
      const p: VwapParams = {
        strategy: "VWAP",
        maxDeviation: Number(vwapDev.value) / 100,
        startOffsetSecs: Number(vwapStart.value),
        endOffsetSecs: Number(vwapEnd.value),
      };
      return p;
    }
    if (activeStrategy === "ICEBERG") {
      const p: IcebergParams = {
        strategy: "ICEBERG",
        visibleQty: Number(icebergVisible.value),
      };
      return p;
    }
    if (activeStrategy === "SNIPER") {
      const p: SniperParams = {
        strategy: "SNIPER",
        aggressionPct: Number(sniperAggression.value),
        maxVenues: Number(sniperMaxVenues.value),
      };
      return p;
    }
    if (activeStrategy === "ARRIVAL_PRICE") {
      const p: ArrivalPriceParams = {
        strategy: "ARRIVAL_PRICE",
        urgency: Number(apUrgency.value),
        maxSlippageBps: Number(apMaxSlippageBps.value),
      };
      return p;
    }
    if (activeStrategy === "IS") {
      const p: IsParams = {
        strategy: "IS",
        urgency: Number(isUrgency.value),
        maxSlippageBps: Number(isMaxSlippageBps.value),
        minSlices: Number(isMinSlices.value),
        maxSlices: Number(isMaxSlices.value),
      };
      return p;
    }
    if (activeStrategy === "MOMENTUM") {
      const p: MomentumParams = {
        strategy: "MOMENTUM",
        entryThresholdBps: Number(momentumThreshold.value),
        maxTranches: Number(momentumMaxTranches.value),
        shortEmaPeriod: Number(momentumShortEma.value),
        longEmaPeriod: Number(momentumLongEma.value),
        cooldownTicks: Number(momentumCooldown.value),
      };
      return p;
    }
    const p: LimitParams = { strategy: "LIMIT" };
    return p;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting.value || !selectedAsset) return;

    submitting.value = true;
    feedback.value = null;

    const algoParams: LimitParams = { strategy: "LIMIT" };

    let trade: Trade;
    if (isOptions) {
      trade = {
        asset: selectedAsset.symbol,
        side: activeSide,
        quantity: qty,
        limitPrice: lx,
        expiresAt: 300,
        algoParams,
        instrumentType: "option" as const,
        optionSpec: {
          optionType: optionType.value,
          strike: optionStrikeNum,
          expirySecs: Number(optionExpiry.value),
          premium: optionQuote.value?.price,
        },
      };
    } else if (isBond && selectedBondDef) {
      const yldDecimal =
        Number(bondYield.value) > 0 ? Number(bondYield.value) / 100 : selectedBondDef.initialYield;
      const bondSpec: BondSpec = {
        isin: selectedBondDef.isin,
        symbol: selectedBondDef.symbol,
        description: selectedBondDef.description,
        couponRate: selectedBondDef.couponRate,
        maturityDate: selectedBondDef.maturityDate,
        totalPeriods: selectedBondDef.totalPeriods,
        periodsPerYear: selectedBondDef.periodsPerYear,
        faceValue: selectedBondDef.faceValue,
        yieldAtOrder: yldDecimal,
        creditRating: selectedBondDef.creditRating,
      };
      trade = {
        asset: selectedBondDef.symbol,
        side: activeSide,
        quantity: qty,
        limitPrice: bondQuote.value?.price ?? 0,
        expiresAt: 300,
        algoParams,
        instrumentType: "bond" as const,
        bondSpec,
      };
    } else {
      trade = {
        asset: selectedAsset.symbol,
        side: activeSide,
        quantity: qty,
        limitPrice: lx,
        expiresAt: Number(expiresAt.value),
        algoParams: buildAlgoParams(),
      };
    }

    try {
      await dispatch(submitOrderThunk(trade)).unwrap();
      if (isOptions) {
        feedback.value = {
          ok: false,
          msg: "Options not supported in this simulation — order rejected",
        };
      } else if (isBond) {
        feedback.value = { ok: true, msg: "Bond order submitted." };
        quantity.value = "100";
        bondQuote.value = null;
        scheduleBondQuoteFetch();
      } else {
        feedback.value = { ok: true, msg: "Order submitted." };
        quantity.value = "100";
        limitPrice.value = currentPrice ? formatPrice(selectedAsset.symbol, currentPrice) : "";
      }
    } catch {
      feedback.value = { ok: false, msg: "Failed to submit order." };
    } finally {
      submitting.value = false;
      setTimeout(() => {
        feedback.value = null;
      }, 4_000);
    }
  }

  useHotkeys(
    "ctrl+enter",
    () => {
      formRef.current?.requestSubmit();
    },
    { preventDefault: true }
  );
  useHotkeys(
    "escape",
    () => {
      quantity.value = "100";
      limitPrice.value = currentPrice ? formatPrice(selectedAsset?.symbol ?? "", currentPrice) : "";
      feedback.value = null;
    },
    { preventDefault: false }
  );

  const symbol = selectedAsset?.symbol ?? "";

  if (userRole === "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <span className="text-2xl" aria-hidden="true">
          ⚙
        </span>
        <p className="text-sm font-semibold text-gray-300">Admin account</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Administrators cannot submit orders. This panel is reserved for trader accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="order-ticket-panel">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-2.5 p-3 overflow-auto flex-1"
      >
        {/* Instrument type toggle */}
        <div className="flex gap-1">
          <button
            type="button"
            aria-pressed={!isOptions && !isBond}
            onClick={handleSwitchToEquity}
            className={`flex-1 py-1 text-[11px] font-semibold rounded border transition-colors ${
              !isOptions && !isBond
                ? "bg-gray-700 border-gray-500 text-gray-100"
                : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500"
            }`}
          >
            Equity
          </button>
          <button
            type="button"
            aria-pressed={isOptions}
            onClick={handleSwitchToOptions}
            className={`flex-1 py-1 text-[11px] font-semibold rounded border transition-colors ${
              isOptions
                ? "bg-gray-700 border-gray-500 text-gray-100"
                : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500"
            }`}
          >
            Options
          </button>
          <button
            type="button"
            aria-pressed={isBond}
            onClick={handleSwitchToBond}
            className={`flex-1 py-1 text-[11px] font-semibold rounded border transition-colors ${
              isBond
                ? "bg-gray-700 border-gray-500 text-gray-100"
                : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500"
            }`}
          >
            Bond
          </button>
        </div>

        {/* Strategy — equity only */}
        {!isOptions && !isBond && (
          <div>
            <label htmlFor="strategy" className="block text-xs text-gray-500 mb-1">
              Strategy
            </label>
            <select
              id="strategy"
              data-testid="strategy-select"
              aria-label="Execution strategy"
              title="Choose how the order is executed. LIMIT sends a single order. TWAP/POV/VWAP are algorithmic strategies that slice the order over time."
              value={activeStrategy}
              onChange={(e) => dispatch(setActiveStrategy(e.target.value as typeof activeStrategy))}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="LIMIT" disabled={!limits.allowed_strategies.includes("LIMIT")}>
                Limit Order{!limits.allowed_strategies.includes("LIMIT") ? " (not permitted)" : ""}
              </option>
              <option value="TWAP" disabled={!limits.allowed_strategies.includes("TWAP")}>
                TWAP — Time Weighted Avg Price
                {!limits.allowed_strategies.includes("TWAP") ? " (not permitted)" : ""}
              </option>
              <option value="POV" disabled={!limits.allowed_strategies.includes("POV")}>
                POV — Percentage of Volume
                {!limits.allowed_strategies.includes("POV") ? " (not permitted)" : ""}
              </option>
              <option value="VWAP" disabled={!limits.allowed_strategies.includes("VWAP")}>
                VWAP — Volume Weighted Avg Price
                {!limits.allowed_strategies.includes("VWAP") ? " (not permitted)" : ""}
              </option>
              <option value="ICEBERG" disabled={!limits.allowed_strategies.includes("ICEBERG")}>
                ICEBERG — Hidden quantity reveal
                {!limits.allowed_strategies.includes("ICEBERG") ? " (not permitted)" : ""}
              </option>
              <option value="SNIPER" disabled={!limits.allowed_strategies.includes("SNIPER")}>
                SNIPER — Multi-venue smart routing
                {!limits.allowed_strategies.includes("SNIPER") ? " (not permitted)" : ""}
              </option>
              <option
                value="ARRIVAL_PRICE"
                disabled={!limits.allowed_strategies.includes("ARRIVAL_PRICE")}
              >
                ARRIVAL PRICE — Minimise arrival slippage
                {!limits.allowed_strategies.includes("ARRIVAL_PRICE") ? " (not permitted)" : ""}
              </option>
              <option value="IS" disabled={!limits.allowed_strategies.includes("IS")}>
                IS — Implementation Shortfall
                {!limits.allowed_strategies.includes("IS") ? " (not permitted)" : ""}
              </option>
              <option value="MOMENTUM" disabled={!limits.allowed_strategies.includes("MOMENTUM")}>
                MOMENTUM — EMA crossover entry
                {!limits.allowed_strategies.includes("MOMENTUM") ? " (not permitted)" : ""}
              </option>
            </select>
          </div>
        )}

        {!isBond && (
          <AssetSelector
            assets={assets}
            value={assetSearch.value}
            onChange={(v) => {
              assetSearch.value = v;
            }}
            onSelect={selectAsset}
            inputRef={assetInputRef}
            prices={prices}
          />
        )}

        {/* Equity: asset info bar */}
        {!isOptions && !isBond && symbol && <AssetInfoBar symbol={symbol} />}

        {/* Bond: ISIN selector + bond info + yield input */}
        {isBond && (
          <>
            <div>
              <label htmlFor="bondSymbol" className="block text-xs text-gray-500 mb-1">
                Bond / ISIN
              </label>
              <select
                id="bondSymbol"
                value={bondSymbol.value}
                onChange={(e) => {
                  bondSymbol.value = e.target.value;
                  bondYield.value = "";
                  bondQuote.value = null;
                  scheduleBondQuoteFetch();
                }}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-purple-500"
              >
                <optgroup label="US Treasuries">
                  {BOND_UNIVERSE.filter((b) => b.issuer === "UST").map((b) => (
                    <option key={b.symbol} value={b.symbol}>
                      {b.symbol} — {b.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Corporate">
                  {BOND_UNIVERSE.filter((b) => b.issuer === "Corp").map((b) => (
                    <option key={b.symbol} value={b.symbol}>
                      {b.symbol} — {b.description}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {selectedBondDef && (
              <div className="rounded bg-gray-800/60 border border-gray-700/50 px-2.5 py-2 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">ISIN</span>
                  <span className="tabular-nums text-gray-300 font-mono">
                    {selectedBondDef.isin}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Rating</span>
                  <span
                    className={`font-semibold ${
                      selectedBondDef.creditRating === "AAA"
                        ? "text-emerald-400"
                        : selectedBondDef.creditRating.startsWith("A")
                          ? "text-sky-400"
                          : "text-amber-400"
                    }`}
                  >
                    {selectedBondDef.creditRating}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Coupon</span>
                  <span className="tabular-nums text-gray-300">
                    {(selectedBondDef.couponRate * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Maturity</span>
                  <span className="tabular-nums text-gray-300">{selectedBondDef.maturityDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Face $</span>
                  <span className="tabular-nums text-gray-300">
                    ${selectedBondDef.faceValue.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Issuer</span>
                  <span className="text-gray-300">
                    {selectedBondDef.issuer === "UST"
                      ? "US Treasury"
                      : (selectedBondDef.sector ?? "Corp")}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="bondYield" className="block text-xs text-gray-500 mb-1">
                Yield (% p.a.){" "}
                {selectedBondDef && (
                  <span className="text-gray-600 normal-case">
                    (ref {(selectedBondDef.initialYield * 100).toFixed(2)}%)
                  </span>
                )}
              </label>
              <input
                id="bondYield"
                type="number"
                step="0.01"
                min="0.01"
                value={bondYield.value}
                onChange={(e) => {
                  bondYield.value = e.target.value;
                  bondQuote.value = null;
                  scheduleBondQuoteFetch();
                }}
                placeholder={
                  selectedBondDef
                    ? `${(selectedBondDef.initialYield * 100).toFixed(2)}`
                    : "e.g. 4.75"
                }
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-purple-500 tabular-nums"
              />
            </div>

            {bondFetching.value && (
              <div className="text-[10px] text-gray-600 text-center py-1">Pricing bond…</div>
            )}
            {bondQuote.value && !bondFetching.value && (
              <section
                className="rounded bg-gray-800/60 border border-gray-700/50 px-2.5 py-2 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1"
                aria-label="Bond price"
              >
                <div className="flex justify-between col-span-2">
                  <span className="text-gray-500">Clean Price</span>
                  <span className="tabular-nums font-semibold text-gray-100">
                    ${bondQuote.value.price.toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Mod Duration</span>
                  <span className="tabular-nums text-gray-300">
                    {bondQuote.value.modifiedDuration.toFixed(3)}y
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">DV01</span>
                  <span className="tabular-nums text-gray-300">
                    ${bondQuote.value.dv01.toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Convexity</span>
                  <span className="tabular-nums text-gray-300">
                    {bondQuote.value.convexity.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Yield p.a.</span>
                  <span className="tabular-nums text-gray-300">
                    {(bondQuote.value.yieldAnnual * 100).toFixed(3)}%
                  </span>
                </div>
                {selectedBondDef && qty > 0 && bondQuote.value && (
                  <div className="col-span-2 flex justify-between border-t border-gray-700 pt-1 mt-0.5">
                    <span className="text-gray-500">Notional ({qty} bonds)</span>
                    <span className="tabular-nums font-semibold text-gray-200">
                      $
                      {(qty * bondQuote.value.price).toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                )}
              </section>
            )}

            <div className="rounded border border-purple-700/40 bg-purple-950/30 px-2.5 py-1.5 text-[10px] text-purple-400">
              Bond orders always use LIMIT strategy at computed clean price.
            </div>
          </>
        )}

        {/* Options: option type + strike + expiry */}
        {isOptions && (
          <>
            <fieldset>
              <legend className="block text-xs text-gray-500 mb-1">Option Type</legend>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={optionType.value === "call"}
                  onClick={() => {
                    optionType.value = "call";
                    optionQuote.value = null;
                    scheduleQuoteFetch();
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-colors ${
                    optionType.value === "call"
                      ? "bg-emerald-800 border-emerald-600 text-emerald-100"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-emerald-700"
                  }`}
                >
                  CALL
                </button>
                <button
                  type="button"
                  aria-pressed={optionType.value === "put"}
                  onClick={() => {
                    optionType.value = "put";
                    optionQuote.value = null;
                    scheduleQuoteFetch();
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-colors ${
                    optionType.value === "put"
                      ? "bg-red-800 border-red-600 text-red-100"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-red-700"
                  }`}
                >
                  PUT
                </button>
              </div>
            </fieldset>

            <div>
              <label htmlFor="optionStrike" className="block text-xs text-gray-500 mb-1">
                Strike
              </label>
              <input
                id="optionStrike"
                type="number"
                min="1"
                step="0.5"
                aria-label="Option strike price"
                value={optionStrike.value}
                onChange={(e) => {
                  optionStrike.value = e.target.value;
                  optionQuote.value = null;
                  scheduleQuoteFetch();
                }}
                placeholder={currentPrice ? Math.round(currentPrice).toString() : "e.g. 150"}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="optionExpiry" className="block text-xs text-gray-500 mb-1">
                Expiry
              </label>
              <select
                id="optionExpiry"
                aria-label="Option expiry"
                value={optionExpiry.value}
                onChange={(e) => {
                  optionExpiry.value = e.target.value;
                  optionQuote.value = null;
                  scheduleQuoteFetch();
                }}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500"
              >
                {OPTION_EXPIRIES.map((ex) => (
                  <option key={ex.secs} value={String(ex.secs)}>
                    {ex.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Premium card */}
            {quoteFetching.value && (
              <div className="text-[10px] text-gray-600 text-center py-1">Pricing…</div>
            )}
            {optionQuote.value && !quoteFetching.value && (
              <section
                className="rounded bg-gray-800/60 border border-gray-700/50 px-2.5 py-2 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1"
                aria-label="Option premium"
              >
                <div className="flex justify-between col-span-2">
                  <span className="text-gray-500">Premium</span>
                  <span className="tabular-nums font-semibold text-gray-100">
                    ${optionQuote.value.price.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Δ Delta</span>
                  <span className="tabular-nums text-gray-300">
                    {optionQuote.value.greeks.delta.toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Θ Theta/d</span>
                  <span className="tabular-nums text-gray-300">
                    {optionQuote.value.greeks.theta.toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">IV</span>
                  <span className="tabular-nums text-gray-300">
                    {(optionQuote.value.impliedVol * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Spot</span>
                  <span className="tabular-nums text-gray-300">
                    ${optionQuote.value.spotPrice.toFixed(2)}
                  </span>
                </div>
              </section>
            )}

            <div className="rounded border border-amber-700/40 bg-amber-950/30 px-2.5 py-1.5 text-[10px] text-amber-500">
              Algorithmic strategies are not available for options. All option orders use LIMIT.
            </div>
          </>
        )}

        {/* Side */}
        <fieldset>
          <legend className="block text-xs text-gray-500 mb-1">
            Side <span className="text-gray-700">(B / S)</span>
          </legend>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="side-buy-tab"
              aria-pressed={activeSide === "BUY"}
              title="Buy — go long. Keyboard shortcut: B"
              onClick={() => dispatch(setActiveSide("BUY"))}
              className={`flex-1 py-2 text-xs font-semibold rounded border transition-colors ${
                activeSide === "BUY"
                  ? "bg-emerald-700 border-emerald-500 text-emerald-100"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-emerald-700"
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              data-testid="side-sell-tab"
              aria-pressed={activeSide === "SELL"}
              title="Sell — go short. Keyboard shortcut: S"
              onClick={() => dispatch(setActiveSide("SELL"))}
              className={`flex-1 py-2 text-xs font-semibold rounded border transition-colors ${
                activeSide === "SELL"
                  ? "bg-red-800 border-red-600 text-red-100"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-red-700"
              }`}
            >
              SELL
            </button>
          </div>
        </fieldset>

        <div>
          <label htmlFor="quantity" className="block text-xs text-gray-500 mb-1">
            {isOptions ? (
              <>
                Contracts <span className="text-gray-600">(1 contract = 100 shares)</span>
              </>
            ) : isBond ? (
              <>
                Quantity <span className="text-gray-600">(bonds)</span>
              </>
            ) : (
              <>
                Quantity <span className="text-gray-600">(shares)</span>
              </>
            )}
          </label>
          <input
            id="quantity"
            type="number"
            min="1"
            data-testid="qty-input"
            aria-label={isOptions ? "Number of contracts" : "Order quantity in shares"}
            title={
              isOptions
                ? "Number of option contracts (1 contract = 100 shares)"
                : "Number of shares to buy or sell"
            }
            value={quantity.value}
            onChange={(e) => {
              quantity.value = e.target.value;
            }}
            placeholder="100"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>

        {/* Equity: limit price */}
        {!isOptions && !isBond && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="limitPrice" className="text-xs text-gray-500">
                Limit Price
              </label>
              <div className="flex items-center gap-2">
                {currentPrice && (
                  <>
                    <span className="text-[10px] text-gray-600 tabular-nums" title="Live mid price">
                      mid <span className="text-gray-400">{formatPrice(symbol, currentPrice)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        limitPrice.value = formatPrice(symbol, currentPrice);
                      }}
                      className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
                      title="Snap limit price to current mid"
                    >
                      ↺
                    </button>
                  </>
                )}
              </div>
            </div>
            <input
              id="limitPrice"
              type="number"
              step="0.0001"
              min="0"
              data-testid="limit-price-input"
              value={limitPrice.value}
              onChange={(e) => {
                limitPrice.value = e.target.value;
              }}
              placeholder="e.g. 150.00"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        )}

        {/* Previews */}
        {!isOptions && !isBond && qty > 0 && lx > 0 && (
          <OrderPreview symbol={symbol} qty={qty} limitPx={lx} side={activeSide} />
        )}
        {isOptions && optionQuote.value && (
          <OptionPreview qty={qty} premium={optionQuote.value.price} />
        )}

        {/* Equity: TIF + duration + strategy params */}
        {!isOptions && !isBond && (
          <>
            <div>
              <span className="block text-xs text-gray-500 mb-1">Time In Force</span>
              <div className="flex gap-1">
                {TIF_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.title}
                    onClick={() => {
                      tif.value = opt.value;
                    }}
                    className={`flex-1 py-1 text-[10px] font-mono rounded border transition-colors ${
                      tif.value === opt.value
                        ? "bg-gray-600 border-gray-500 text-gray-100"
                        : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="expiresAt" className="block text-xs text-gray-500 mb-1">
                Duration <span className="text-gray-600">(seconds)</span>
              </label>
              <input
                id="expiresAt"
                type="number"
                min="1"
                aria-label="Order duration in seconds"
                title="How long the order remains active before expiring. 300 = 5 minutes."
                value={expiresAt.value}
                onChange={(e) => {
                  expiresAt.value = e.target.value;
                }}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
              />
            </div>

            <StrategyParams
              activeStrategy={activeStrategy}
              twapSlices={twapSlices.value}
              setTwapSlices={(v) => {
                twapSlices.value = v;
              }}
              twapCap={twapCap.value}
              setTwapCap={(v) => {
                twapCap.value = v;
              }}
              povRate={povRate.value}
              setPovRate={(v) => {
                povRate.value = v;
              }}
              povMin={povMin.value}
              setPovMin={(v) => {
                povMin.value = v;
              }}
              povMax={povMax.value}
              setPovMax={(v) => {
                povMax.value = v;
              }}
              vwapDev={vwapDev.value}
              setVwapDev={(v) => {
                vwapDev.value = v;
              }}
              vwapStart={vwapStart.value}
              setVwapStart={(v) => {
                vwapStart.value = v;
              }}
              vwapEnd={vwapEnd.value}
              setVwapEnd={(v) => {
                vwapEnd.value = v;
              }}
              icebergVisible={icebergVisible.value}
              setIcebergVisible={(v) => {
                icebergVisible.value = v;
              }}
              sniperAggression={sniperAggression.value}
              setSniperAggression={(v) => {
                sniperAggression.value = v;
              }}
              sniperMaxVenues={sniperMaxVenues.value}
              setSniperMaxVenues={(v) => {
                sniperMaxVenues.value = v;
              }}
              apUrgency={apUrgency.value}
              setApUrgency={(v) => {
                apUrgency.value = v;
              }}
              apMaxSlippageBps={apMaxSlippageBps.value}
              setApMaxSlippageBps={(v) => {
                apMaxSlippageBps.value = v;
              }}
              isUrgency={isUrgency.value}
              setIsUrgency={(v) => {
                isUrgency.value = v;
              }}
              isMaxSlippageBps={isMaxSlippageBps.value}
              setIsMaxSlippageBps={(v) => {
                isMaxSlippageBps.value = v;
              }}
              isMinSlices={isMinSlices.value}
              setIsMinSlices={(v) => {
                isMinSlices.value = v;
              }}
              isMaxSlices={isMaxSlices.value}
              setIsMaxSlices={(v) => {
                isMaxSlices.value = v;
              }}
              momentumThreshold={momentumThreshold.value}
              setMomentumThreshold={(v) => {
                momentumThreshold.value = v;
              }}
              momentumMaxTranches={momentumMaxTranches.value}
              setMomentumMaxTranches={(v) => {
                momentumMaxTranches.value = v;
              }}
              momentumShortEma={momentumShortEma.value}
              setMomentumShortEma={(v) => {
                momentumShortEma.value = v;
              }}
              momentumLongEma={momentumLongEma.value}
              setMomentumLongEma={(v) => {
                momentumLongEma.value = v;
              }}
              momentumCooldown={momentumCooldown.value}
              setMomentumCooldown={(v) => {
                momentumCooldown.value = v;
              }}
            />
          </>
        )}

        {limitWarnings.length > 0 && (
          <div
            className="rounded border border-amber-700/60 bg-amber-950/40 px-2.5 py-2 text-[10px] text-amber-400 space-y-0.5"
            role="alert"
            aria-label="Trading limit violations"
            data-testid="order-warning-msg"
          >
            {limitWarnings.map((w) => (
              <div key={w}>⚠ {w}</div>
            ))}
          </div>
        )}

        <button
          type="submit"
          data-testid="submit-order-btn"
          disabled={!isValid || submitting.value}
          title={
            !isValid && isOptions && !optionQuote.value
              ? "Enter a strike and wait for the premium to load"
              : !isValid && isBond && !bondQuote.value
                ? "Select a bond and wait for the price to load"
                : limitWarnings.length > 0
                  ? `Order blocked: ${limitWarnings[0]}`
                  : isValid
                    ? `Submit order — keyboard shortcut: Ctrl+Enter`
                    : "Fill in all required fields to submit"
          }
          aria-label={
            isValid
              ? isOptions
                ? `Submit ${activeSide} option for ${qty} ${optionType.value === "call" ? "CALL" : "PUT"} on ${symbol} strike ${optionStrikeNum}`
                : isBond
                  ? `Submit ${activeSide} bond order for ${qty}× ${bondSymbol.value}`
                  : `Submit ${activeSide} order for ${qty} shares of ${symbol} at $${lx}`
              : "Submit order (form incomplete)"
          }
          className={`w-full py-2.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
            activeSide === "BUY"
              ? "bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 text-white"
              : "bg-red-700 hover:bg-red-600 disabled:bg-red-900/50 text-white"
          } disabled:cursor-not-allowed`}
        >
          {submitting.value
            ? "Submitting…"
            : isOptions
              ? `${activeSide} ${qty}× ${symbol} ${optionStrikeNum > 0 ? `$${optionStrikeNum}` : ""}${optionType.value.toUpperCase()}${optionQuote.value ? ` · $${(qty * 100 * optionQuote.value.price).toFixed(0)}` : ""}`
              : isBond
                ? `${activeSide} ${qty}× ${bondSymbol.value}${bondQuote.value ? ` · $${(qty * bondQuote.value.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}`
                : `${activeSide} ${symbol}${qty > 0 && lx > 0 ? ` · $${(qty * lx).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}`}
        </button>

        <p
          className={`text-xs text-center min-h-4 ${
            feedback.value
              ? feedback.value.ok
                ? "text-emerald-400"
                : "text-red-400"
              : "text-transparent"
          }`}
          aria-live="polite"
          aria-atomic="true"
        >
          {feedback.value?.msg ?? "\u00a0"}
        </p>
      </form>
    </div>
  );
}
