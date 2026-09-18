const test = require("node:test");
const assert = require("node:assert/strict");
const {
  intervalSeconds,
  calculateWorkSeconds,
  calculateCurrentSessionSeconds,
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

test("manual time uses stored duration instead of synthetic timestamps", () => {
  const manual = {
    source: "manual",
    durationSeconds: 4200,
    startedAt: "2026-09-11T12:00:00.000Z",
    endedAt: "2026-09-11T15:00:00.000Z",
  };
  assert.equal(intervalSeconds(manual), 4200);
  assert.equal(calculateWorkSeconds({ status: "planned", workIntervals: [manual] }), 4200);
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


test("live session timer resets after the previous stopped session", () => {
  const order = {
    status: "active",
    events: [
      { type: "stopped", at: "2026-09-17T14:00:00.000Z" },
      { type: "resumed", at: "2026-09-18T10:03:00.000Z" },
    ],
    workIntervals: [
      { source: "timer", startedAt: "2026-09-17T09:30:00.000Z", endedAt: "2026-09-17T14:00:00.000Z" },
      { source: "manual", durationSeconds: 4200, startedAt: "2026-09-18T08:00:00.000Z", endedAt: "2026-09-18T09:10:00.000Z" },
      { source: "timer", startedAt: "2026-09-18T10:03:00.000Z", endedAt: null },
    ],
  };

  assert.equal(calculateWorkSeconds(order, new Date("2026-09-18T10:04:00.000Z")), 20_460);
  assert.equal(calculateCurrentSessionSeconds(order, new Date("2026-09-18T10:04:00.000Z")), 60);
});

test("pause and resume stay inside the same current session", () => {
  const order = {
    status: "active",
    events: [
      { type: "stopped", at: "2026-09-17T14:00:00.000Z" },
      { type: "resumed", at: "2026-09-18T08:00:00.000Z" },
      { type: "paused", at: "2026-09-18T08:30:00.000Z" },
      { type: "resumed", at: "2026-09-18T08:45:00.000Z" },
    ],
    workIntervals: [
      { source: "timer", startedAt: "2026-09-18T08:00:00.000Z", endedAt: "2026-09-18T08:30:00.000Z" },
      { source: "timer", startedAt: "2026-09-18T08:45:00.000Z", endedAt: null },
    ],
  };

  assert.equal(calculateCurrentSessionSeconds(order, new Date("2026-09-18T09:00:00.000Z")), 2_700);
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
