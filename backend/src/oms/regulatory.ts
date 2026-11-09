import { algoIdentifiers } from "#veta/algo-registry";
import type { RegulatoryFields } from "#veta/schemas/orders";

export interface RegulatoryInput {
  userId: string | undefined;
  strategy: string | undefined;
  limitPrice: number | undefined;
  clientCode: string | null | undefined;
  decisionMakerCode: string | null | undefined;
  lei: string | undefined;
}

const LEI_PATTERN = /^[A-Z0-9]{18}[0-9]{2}$/;

export function validLei(value: string | undefined): string | undefined {
  return value && LEI_PATTERN.test(value) ? value : undefined;
}

export function buildRegulatoryFields(input: RegulatoryInput): RegulatoryFields {
  const decisionMakerCode = input.decisionMakerCode || input.userId;
  const clientCode = input.clientCode || input.userId;
  const identifiers = algoIdentifiers(input.strategy);
  const executionDecisionCode = identifiers.algoId ?? decisionMakerCode;
  return {
    ...identifiers,
    orderType: input.limitPrice === undefined ? "MARKET" : "LIMIT",
    lei: validLei(input.lei),
    clientCode,
    decisionMakerCode,
    executionDecisionCode,
  };
}
