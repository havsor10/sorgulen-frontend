const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateWorkSeconds,
  calculateEstimatedAmount,
} = require("../admin/work-order-time");

test("excludes every pause from the displayed work time", () => {
  const workOrder = {
    status: "stopped",
    hourlyRate: 850,
    workIntervals: [
      { startedAt: "2026-09-02T06:00:00.000Z", endedAt: "2026-09-02T08:00:00.000Z" },
      { startedAt: "2026-09-02T08:20:00.000Z", endedAt: "2026-09-02T10:00:00.000Z" },
      { startedAt: "2026-09-02T10:30:00.000Z", endedAt: "2026-09-02T13:00:00.000Z" },
    ],
  };

  assert.equal(calculateWorkSeconds(workOrder), 22_200);
  assert.equal(calculateEstimatedAmount(workOrder), 5_241.67);
});

test("reconstructs an active timer from persisted timestamps after refresh", () => {
  const persistedJson = JSON.stringify({
    status: "active",
    hourlyRate: 650,
    workIntervals: [
      { startedAt: "2026-09-02T08:00:00.000Z", endedAt: "2026-09-02T09:00:00.000Z" },
      { startedAt: "2026-09-02T09:15:00.000Z", endedAt: null },
    ],
  });
  const restored = JSON.parse(persistedJson);

  assert.equal(
    calculateWorkSeconds(restored, new Date("2026-09-02T10:00:00.000Z")),
    6_300
  );
  assert.equal(
    calculateWorkSeconds(restored, new Date("2026-09-02T10:00:01.000Z")),
    6_301
  );
});

test("a paused timer does not grow while the page stays open", () => {
  const paused = {
    status: "paused",
    workIntervals: [
      { startedAt: "2026-09-02T08:00:00.000Z", endedAt: "2026-09-02T09:00:00.000Z" },
    ],
  };

  assert.equal(calculateWorkSeconds(paused, new Date("2026-09-02T10:00:00.000Z")), 3_600);
  assert.equal(calculateWorkSeconds(paused, new Date("2026-09-03T10:00:00.000Z")), 3_600);
});

test("completed history keeps the stored time and amount snapshots", () => {
  const completed = {
    status: "completed",
    totalWorkSeconds: 8_072,
    hourlyRate: 850,
    calculatedAmount: 1_905.89,
    workIntervals: [],
  };

  assert.equal(calculateWorkSeconds(completed), 8_072);
  assert.equal(calculateEstimatedAmount(completed), 1_905.89);
});
