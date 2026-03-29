import type { Diagnostic, TicketContext } from "../ticket-types";

export function runInstrumentSpecCheck(ctx: TicketContext): Diagnostic[] {
  const { instrument, option, bond } = ctx;
  const diagnostics: Diagnostic[] = [];

  if (instrument.instrumentType === "option") {
    if (option.strike <= 0) {
      diagnostics.push({
        field: "optionStrike",
        severity: "error",
        message: "Strike price must be greater than zero",
        ruleId: "option-strike-required",
      });
    }
    if (option.expirySecs <= 0) {
      diagnostics.push({
        field: "optionExpiry",
        severity: "error",
        message: "Expiry must be selected",
        ruleId: "option-expiry-required",
      });
    }
    if (!option.hasQuote && !option.isFetching) {
      diagnostics.push({
        field: "optionQuote",
        severity: "error",
        message: "Enter a strike and wait for the premium to load",
        ruleId: "option-quote-missing",
      });
    }
    if (option.isFetching) {
      diagnostics.push({
        field: "optionQuote",
        severity: "info",
        message: "Pricing option…",
        ruleId: "option-quote-fetching",
      });
    }
  }

  if (instrument.instrumentType === "bond") {
    if (!bond.hasBondDef) {
      diagnostics.push({
        field: "bondSymbol",
        severity: "error",
        message: "A valid bond must be selected",
        ruleId: "bond-def-missing",
      });
    }
    if (!bond.hasQuote && !bond.isFetching) {
      diagnostics.push({
        field: "bondQuote",
        severity: "error",
        message: "Select a bond and wait for the price to load",
        ruleId: "bond-quote-missing",
      });
    }
    if (bond.isFetching) {
      diagnostics.push({
        field: "bondQuote",
        severity: "info",
        message: "Pricing bond…",
        ruleId: "bond-quote-fetching",
      });
    }
  }

  return diagnostics;
}
