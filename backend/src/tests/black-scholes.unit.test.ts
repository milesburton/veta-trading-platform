import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from "jsr:@std/assert@0.217";
import { blackScholes, normCdf, normPdf } from "../analytics/black-scholes.ts";
import type { OptionType } from "../analytics/types.ts";

const SPOT = 100;
const STRIKE = 100;
const TIME = 1;
const RATE = 0.05;
const VOL = 0.2;

function priceOption(
  optionType: OptionType,
  spot = SPOT,
  strike = STRIKE,
  time = TIME,
  rate = RATE,
  vol = VOL,
) {
  return blackScholes(optionType, spot, strike, time, rate, vol);
}

function assertCommonGreeks(optionType: OptionType) {
  const result = priceOption(optionType);
  const { delta, gamma, theta, vega, rho } = result.greeks;

  assert(result.price > 0);
  assert(gamma >= 0);
  assert(theta <= 0);
  assert(vega >= 0);

  if (optionType === "call") {
    assert(delta >= 0);
    assert(delta <= 1);
    assert(rho >= 0);
    return;
  }

  assert(delta >= -1);
  assert(delta <= 0);
  assert(rho <= 0);
}

function assertDeltaPredicate(
  label: string,
  optionType: OptionType,
  spot: number,
  predicate: (delta: number) => boolean,
) {
  assert(predicate(priceOption(optionType, spot).greeks.delta), label);
}

Deno.test("[black-scholes] normCdf returns valid values", () => {
  assertEquals(normCdf(-Infinity), 0);
  assertEquals(normCdf(Infinity), 1);

  const knownValues = [
    { input: 0, expected: 0.5 },
    { input: 1, expected: 0.8413447460685429 },
    { input: -1, expected: 0.15865525393145707 },
  ];

  for (const { input, expected } of knownValues) {
    assertAlmostEquals(normCdf(input), expected, 1e-6);
  }
});

Deno.test("[black-scholes] normPdf returns valid values", () => {
  assert(normPdf(0) > 0);
  assertEquals(normPdf(Infinity), 0);
  assertEquals(normPdf(-Infinity), 0);
  assertAlmostEquals(normPdf(0), 1 / Math.sqrt(2 * Math.PI), 1e-10);
});

for (const optionType of ["call", "put"] as const) {
  Deno.test(`[black-scholes] ${optionType} option pricing`, () => {
    assertCommonGreeks(optionType);
  });
}

Deno.test("[black-scholes] edge cases return intrinsic value", () => {
  const cases = [
    {
      label: "zero time",
      result: priceOption("call", 100, 100, 0),
    },
    {
      label: "zero volatility",
      result: priceOption("call", 100, 100, TIME, RATE, 0),
    },
    {
      label: "zero spot",
      result: priceOption("call", 0),
    },
  ];

  for (const { label, result } of cases) {
    assertEquals(result.price, 0, label);
    assertEquals(result.greeks.delta, 0, label);
  }
});

Deno.test("[black-scholes] deep moneyness pushes delta to expected extremes", () => {
  const cases = [
    {
      label: "deep ITM call",
      optionType: "call" as const,
      spot: 200,
      predicate: (delta: number) => delta > 0.9,
    },
    {
      label: "deep OTM call",
      optionType: "call" as const,
      spot: 50,
      predicate: (delta: number) => delta < 0.1,
    },
    {
      label: "deep ITM put",
      optionType: "put" as const,
      spot: 50,
      predicate: (delta: number) => delta < -0.9,
    },
    {
      label: "deep OTM put",
      optionType: "put" as const,
      spot: 200,
      predicate: (delta: number) => delta > -0.1,
    },
  ];

  for (const { label, optionType, spot, predicate } of cases) {
    assertDeltaPredicate(label, optionType, spot, predicate);
  }
});

Deno.test("[black-scholes] greek sign checks remain sane", () => {
  const callGreeks = priceOption("call").greeks;
  const putGreeks = priceOption("put").greeks;

  assert(callGreeks.gamma > 0);
  assert(callGreeks.vega > 0);
  assert(callGreeks.theta <= 0);
  assert(callGreeks.rho >= 0);
  assert(putGreeks.rho <= 0);
});
