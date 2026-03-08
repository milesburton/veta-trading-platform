/**
 * Trade recommendation engine for options.
 *
 * Two modes:
 *  - Rule-based: 12 structural heuristics evaluate the option's own properties
 *  - Signal-driven: blends the rule score (35%) with a live intelligence-pipeline
 *    signal (65%) for a more market-aware recommendation
 */

import { blackScholes } from "./black-scholes.ts";
import type {
  OptionType,
  Recommendation,
  SignalInput,
  SignalStrength,
} from "./types.ts";

// ── Score → signal band ───────────────────────────────────────────────────────

function scoreToStrength(score: number): SignalStrength {
  if (score >= 60) return "STRONG_BUY";
  if (score >= 20) return "BUY";
  if (score > -20) return "NEUTRAL";
  if (score > -60) return "SELL";
  return "STRONG_SELL";
}

// ── Structural rules ──────────────────────────────────────────────────────────

interface RuleResult {
  reason: string;
  delta: number;
}

function evaluateRules(
  optionType: OptionType,
  S: number,
  K: number,
  T: number,
  sigma: number,
  price: number,
  delta: number,
  theta: number,
  vega: number,
): RuleResult[] {
  const results: RuleResult[] = [];
  const moneyness = S / K;
  const daysToExpiry = T * 365;
  const isCall = optionType === "call";

  const absDelta = Math.abs(delta);

  // 1. Deep ITM
  if (absDelta > 0.85) results.push({ reason: "DEEP_ITM", delta: -15 });

  // 2. Deep OTM
  if (absDelta < 0.10) results.push({ reason: "DEEP_OTM", delta: -25 });

  // 3. ATM + high vol
  const isNearATM = Math.abs(moneyness - 1) < 0.05;
  if (isNearATM && sigma > 0.30) results.push({ reason: "ATM_HIGH_VOL", delta: 15 });

  // 4. Low time value
  const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  const timeValue = Math.max(0, price - intrinsic);
  if (timeValue < price * 0.1 && price > 0) results.push({ reason: "LOW_TIME_VALUE", delta: -10 });

  // 5. High theta decay
  const dailyDecayPct = price > 0 ? Math.abs(theta) / price : 0;
  if (dailyDecayPct > 0.03) results.push({ reason: "HIGH_THETA_DECAY", delta: -20 });

  // 6. Positive delta trend (call)
  if (isCall && delta > 0.4 && delta <= 0.7) results.push({ reason: "POSITIVE_DELTA_TREND", delta: 20 });

  // 7. Negative delta trend (put)
  if (!isCall && delta < -0.4 && delta >= -0.7) results.push({ reason: "NEGATIVE_DELTA_TREND", delta: 20 });

  // 8. Vol premium elevated
  if (sigma > 0.40) results.push({ reason: "VOL_PREMIUM_ELEVATED", delta: -15 });

  // 9. Vol discount
  if (sigma < 0.15) results.push({ reason: "VOL_DISCOUNT", delta: 15 });

  // 10. Near expiry risk
  if (daysToExpiry < 7) results.push({ reason: "NEAR_EXPIRY_RISK", delta: -20 });

  // 11. Wide bid-ask proxy
  const vegaRatio = price > 0 ? vega / price : 0;
  if (vegaRatio > 0.5) results.push({ reason: "WIDE_BID_ASK_PROXY", delta: -10 });

  // 12. Favourable risk/reward
  if (absDelta >= 0.25 && absDelta <= 0.55 && timeValue > price * 0.3 && daysToExpiry >= 14) {
    results.push({ reason: "FAVOURABLE_RISK_REWARD", delta: 25 });
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score an option using structural rules only (rule-based mode).
 */
export function scoreOption(
  optionType: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
): Recommendation {
  const { price, greeks } = blackScholes(optionType, S, K, T, r, sigma);
  const rules = evaluateRules(optionType, S, K, T, sigma, price, greeks.delta, greeks.theta, greeks.vega);

  const rawScore = rules.reduce((acc, rule) => acc + rule.delta, 0);
  const score = Math.min(100, Math.max(-100, rawScore));

  return {
    optionType,
    strike: K,
    expirySecs: Math.round(T * 365 * 86400),
    price,
    score,
    signalStrength: scoreToStrength(score),
    reasons: rules.map((r) => r.reason),
    greeks,
    impliedVol: sigma,
    scoringMode: "rule-based",
  };
}

/**
 * Score an option blending structural rules (35%) with a live intelligence-
 * pipeline signal (65%). The signal direction strongly biases call vs put
 * recommendations while the structural rules still capture option quality.
 */
export function scoreOptionWithSignal(
  optionType: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  signal: SignalInput,
): Recommendation {
  const { price, greeks } = blackScholes(optionType, S, K, T, r, sigma);
  const rules = evaluateRules(optionType, S, K, T, sigma, price, greeks.delta, greeks.theta, greeks.vega);

  const ruleScore = rules.reduce((acc, rule) => acc + rule.delta, 0);

  // Signal bias: directional alignment drives the dominant component
  let signalBias = 0;
  const { score: sigScore, direction, confidence } = signal;
  if (direction === "long") {
    signalBias = optionType === "call"
      ? sigScore * confidence * 60    // long signal strongly favours calls
      : -sigScore * confidence * 40;  // long signal mildly contra puts
  } else if (direction === "short") {
    signalBias = optionType === "put"
      ? (-sigScore) * confidence * 60  // short signal strongly favours puts
      : sigScore * confidence * 40;    // short signal mildly contra calls
  }
  // neutral direction: signalBias = 0

  const rawScore = ruleScore * 0.35 + signalBias * 0.65;
  const score = Math.min(100, Math.max(-100, rawScore));

  // Top-3 signal factor contributors
  const topFactors = [...signal.factors]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3)
    .map((f) => ({ name: f.name, contribution: f.contribution }));

  // Reasons: rule codes + top-3 signal factors as strings
  const reasons = [
    ...rules.map((r) => r.reason),
    ...topFactors.map((f) => `${f.name}:${f.contribution >= 0 ? "+" : ""}${f.contribution.toFixed(3)}`),
  ];

  return {
    optionType,
    strike: K,
    expirySecs: Math.round(T * 365 * 86400),
    price,
    score,
    signalStrength: scoreToStrength(score),
    reasons,
    greeks,
    impliedVol: sigma,
    scoringMode: "signal-driven",
    signalScore: signal.score,
    signalConfidence: signal.confidence,
    signalDirection: signal.direction,
    topFactors,
  };
}

/**
 * Generate strike candidates around ATM.
 */
export function generateStrikes(S: number): number[] {
  const tick = S < 50 ? 1 : S < 200 ? 5 : 10;
  const atm = Math.round(S / tick) * tick;
  const strikes = new Set<number>();
  for (let i = -5; i <= 5; i++) {
    const k = atm + i * tick;
    if (k > 0) strikes.add(k);
  }
  return Array.from(strikes).sort((a, b) => a - b);
}

/**
 * Standard expiry ladder in seconds.
 */
export const DEFAULT_EXPIRIES_SECS = [7, 14, 30, 60, 90].map((d) => d * 86400);
