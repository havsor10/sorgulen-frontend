(function exposeWorkOrderTime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SorgulenWorkOrderTime = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  function intervalSeconds(interval, now = Date.now()) {
    if (!interval) return 0;
    const explicit = Number(interval.durationSeconds);
    if (interval.source === "manual" && Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
    const safeNowMs = now instanceof Date ? now.getTime() : Number(now);
    const nowMs = Number.isFinite(safeNowMs) ? safeNowMs : Date.now();
    const startedAt = new Date(interval.startedAt).getTime();
    const endedAt = interval.endedAt ? new Date(interval.endedAt).getTime() : nowMs;
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return 0;
    return Math.floor((endedAt - startedAt) / 1000);
  }

  function calculateWorkSeconds(workOrder, now = Date.now()) {
    if (!workOrder) return 0;
    if (["completed", "cancelled"].includes(workOrder.status)) {
      return Math.max(0, Number(workOrder.totalWorkSeconds) || 0);
    }

    return (workOrder.workIntervals || []).reduce((sum, interval) => sum + intervalSeconds(interval, now), 0);
  }

  function calculateCurrentSessionSeconds(workOrder, now = Date.now()) {
    if (!workOrder || !["active", "paused"].includes(workOrder.status)) return 0;

    const lastStoppedAt = (workOrder.events || [])
      .filter((event) => event?.type === "stopped" && event?.at)
      .reduce((latest, event) => {
        const at = new Date(event.at).getTime();
        return Number.isFinite(at) ? Math.max(latest, at) : latest;
      }, Number.NEGATIVE_INFINITY);

    return (workOrder.workIntervals || [])
      .filter((interval) => interval?.source !== "manual")
      .filter((interval) => {
        const startedAt = new Date(interval?.startedAt).getTime();
        return Number.isFinite(startedAt) && startedAt > lastStoppedAt;
      })
      .reduce((sum, interval) => sum + intervalSeconds(interval, now), 0);
  }

  function calculateEstimatedAmount(workOrder, seconds = calculateWorkSeconds(workOrder)) {
    if (workOrder?.status === "completed" && workOrder.calculatedAmount != null) {
      return Number(workOrder.calculatedAmount);
    }
    const rate = Number(workOrder?.hourlyRate || 0);
    return Math.round((((Number(seconds) * rate) / 3600) + Number.EPSILON) * 100) / 100;
  }

  return { intervalSeconds, calculateWorkSeconds, calculateCurrentSessionSeconds, calculateEstimatedAmount };
});
