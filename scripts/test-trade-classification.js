const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getSetupFields } = require("../src/utils/buildTradePayload");
const { tradeMetaSchema, tradeSchema } = require("../src/validators/trade.schemas");

test("setup lists retain order, deduplicate labels and explicitly clear prior assignments", () => {
  assert.deepEqual(getSetupFields({ setups: [" Gap ", "Pullback, first", "gap", "Reclaim"] }), {
    strategy: "Gap", additionalSetups: ["Pullback, first", "Reclaim"]
  });
  assert.deepEqual(getSetupFields({ setups: [], strategy: "old" }), { strategy: null, additionalSetups: [] });
  assert.deepEqual(getSetupFields({ strategy: "Legacy, exact" }), { strategy: "Legacy, exact" });
  assert.deepEqual(getSetupFields({ notes: "Only notes" }), {});
});

test("manual grades use the existing rubric on create and metadata-only edits", () => {
  const grade = { setupFit: 2, timing: 0, invalidation: 1, liquidity: 2, wouldRetake: false, notes: "Review" };
  const metadata = tradeMetaSchema.parse({ entryGrade: { ...grade, source: "BLIND" }, setups: ["Gap", "Reclaim"] });
  assert.equal(metadata.entryGrade.source, undefined);
  assert.equal(metadata.entryGrade.plannedStop, null);
  assert.equal(metadata.entryGrade.wouldRetake, false);
  assert.equal(tradeMetaSchema.safeParse({ entryGrade: { ...grade, timing: 3 } }).success, false);
  assert.equal(tradeMetaSchema.safeParse({ entryGrade: { ...grade, notes: " " } }).success, false);
  assert.equal(tradeMetaSchema.safeParse({ setups: Array(31).fill("Gap") }).success, false);
  const trade = { symbol: "ABC", side: "LONG", quantity: 100, entryPrice: 12, entryDate: "2026-11-24T12:30:00Z" };
  assert.deepEqual(tradeSchema.parse({ ...trade, entryGrade: grade }).entryGrade, metadata.entryGrade);
});
