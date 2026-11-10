import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { buildRegulatoryFields, validLei } from "../oms/regulatory.ts";

const LEI = "529900T8BM49AURSDO55";

test("[oms-regulatory] an algorithmic order is executed under the algo id", () => {
  const fields = buildRegulatoryFields({
    userId: "trader-1",
    strategy: "TWAP",
    limitPrice: 101.5,
    clientCode: "CLIENT-9",
    decisionMakerCode: "DM-7",
    lei: LEI,
  });
  assertEquals(fields, {
    algoId: "VETA-TWAP",
    algoVersion: "1.0.0",
    orderType: "LIMIT",
    lei: LEI,
    clientCode: "CLIENT-9",
    decisionMakerCode: "DM-7",
    executionDecisionCode: "VETA-TWAP",
  });
});

test("[oms-regulatory] a plain limit order is executed by the decision maker with no algo id", () => {
  const fields = buildRegulatoryFields({
    userId: "trader-1",
    strategy: "LIMIT",
    limitPrice: undefined,
    clientCode: null,
    decisionMakerCode: null,
    lei: undefined,
  });
  assertEquals(fields.algoId, undefined);
  assertEquals(fields.orderType, "MARKET");
  assertEquals(fields.clientCode, "trader-1");
  assertEquals(fields.decisionMakerCode, "trader-1");
  assertEquals(fields.executionDecisionCode, "trader-1");
  assertEquals(fields.lei, undefined);
});

test("[oms-regulatory] malformed LEIs are dropped", () => {
  assertEquals(validLei(LEI), LEI);
  assertEquals(validLei("short"), undefined);
  assertEquals(validLei("529900t8bm49aursdo55"), undefined);
  assertEquals(validLei(undefined), undefined);
});
