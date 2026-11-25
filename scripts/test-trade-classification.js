const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getSetupFields } = require("../src/utils/buildTradePayload");
const { tradeMetaSchema, tradeSchema } = require("../src/validators/trade.schemas");
const { blindGradeSchema } = require("../src/validators/entry-grade.schemas");

test("setup lists retain order, deduplicate labels and explicitly clear prior assignments", () => {
  assert.deepEqual(getSetupFields({ setups: [" Gap ", "Pullback, first", "gap", "Reclaim"] }), {
    strategy: "Gap", additionalSetups: ["Pullback, first", "Reclaim"]
  });
  assert.deepEqual(getSetupFields({ setups: [], strategy: "old" }), { strategy: null, additionalSetups: [] });
  assert.deepEqual(getSetupFields({ strategy: "Legacy, exact" }), { strategy: "Legacy, exact" });
  assert.deepEqual(getSetupFields({ notes: "Only notes" }), {});
});

test("trade creation, editing and blind review accept only the four letter grades", () => {
  const trade = { symbol: "ABC", side: "LONG", quantity: 100, entryPrice: 12, entryDate: "2026-11-24T12:30:00Z" };
  for (const letterGrade of ["A+", "A", "B", "C"]) {
    const entryGrade = { letterGrade };
    assert.deepEqual(tradeMetaSchema.parse({ entryGrade, setups: ["Gap", "Reclaim"] }).entryGrade, entryGrade);
    assert.deepEqual(tradeSchema.parse({ ...trade, entryGrade }).entryGrade, entryGrade);
    assert.deepEqual(blindGradeSchema.parse(entryGrade), entryGrade);
  }
  for (const invalid of ["A-", "D", "a", "", 8, null, undefined]) {
    assert.equal(tradeMetaSchema.safeParse({ entryGrade: { letterGrade: invalid } }).success, false);
    assert.equal(blindGradeSchema.safeParse({ letterGrade: invalid }).success, false);
  }
  assert.deepEqual(blindGradeSchema.parse({ letterGrade: "A+", plannedInitialRisk: 12 }), { letterGrade: "A+", plannedInitialRisk: 12 });
  assert.deepEqual(tradeMetaSchema.parse({ entryGrade: { letterGrade: "B", source: "BLIND", notes: "Ignored" } }).entryGrade, { letterGrade: "B" });
  assert.equal(tradeMetaSchema.safeParse({ setups: Array(31).fill("Gap") }).success, false);
});
