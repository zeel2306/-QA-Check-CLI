/** Preserve QA Check's legacy TTFB field (server response duration in ms).
 * Navigation TTFB includes connection/redirect time and is reported separately.
 * Insight savings/numericValue are not timings and must never substitute for TTFB.
 */
export function lighthouseMetrics(audits: Record<string, any>) {
  const finite = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  const legacy = finite(audits["server-response-time"]?.numericValue);
  const response = finite(audits["document-latency-insight"]?.details?.debugData?.serverResponseTime);
  return {
    metrics: {
      CLS: finite(audits["cumulative-layout-shift"]?.numericValue),
      LCP: finite(audits["largest-contentful-paint"]?.numericValue),
      FCP: finite(audits["first-contentful-paint"]?.numericValue),
      INP: finite(audits["interaction-to-next-paint"]?.numericValue),
      TTFB: legacy ?? response,
      navigationTTFB: finite(audits.metrics?.details?.items?.[0]?.timeToFirstByte),
    },
    metricSources: {
      TTFB: legacy !== undefined ? "server-response-time.numericValue" : response !== undefined ? "document-latency-insight.details.debugData.serverResponseTime" : "UNAVAILABLE",
      navigationTTFB: "metrics.details.items[0].timeToFirstByte",
    },
  };
}
