(function exposeWorkOrderTime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SorgulenWorkOrderTime = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  function calculateWorkSeconds(workOrder, now = Date.now()) {
    if (!workOrder) return 0;
    if (["completed", "cancelled"].includes(workOrder.status)) {
      return Math.max(0, Number(workOrder.totalWorkSeconds) || 0);
    }

    const nowMs = now instanceof Date ? now.getTime() : Number(now);
    const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    let totalMs = 0;

    for (const interval of workOrder.workIntervals || []) {
      const startedAt = new Date(interval.startedAt).getTime();
      const endedAt = interval.endedAt ? new Date(interval.endedAt).getTime() : safeNowMs;
      if (!Number.isNaN(startedAt) && !Number.isNaN(endedAt) && endedAt >= startedAt) {
        totalMs += endedAt - startedAt;
      }
    }

    return Math.max(0, Math.floor(totalMs / 1000));
  }

  function calculateEstimatedAmount(workOrder, seconds = calculateWorkSeconds(workOrder)) {
    if (workOrder?.status === "completed" && workOrder.calculatedAmount != null) {
      return Number(workOrder.calculatedAmount);
    }
    const rate = Number(workOrder?.hourlyRate || 0);
    return Math.round((((Number(seconds) * rate) / 3600) + Number.EPSILON) * 100) / 100;
  }

  return { calculateWorkSeconds, calculateEstimatedAmount };
});
