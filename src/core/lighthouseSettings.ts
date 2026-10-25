export const DEFAULT_LIGHTHOUSE_ROUTE_TIMEOUT_MS = 45_000;
export const MAX_LIGHTHOUSE_ROUTE_TIMEOUT_MS = 120_000;

export function lighthouseRouteTimeout(value: unknown = DEFAULT_LIGHTHOUSE_ROUTE_TIMEOUT_MS): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_LIGHTHOUSE_ROUTE_TIMEOUT_MS) {
    throw new Error(`lighthouseRouteTimeoutMs must be a positive integer no greater than ${MAX_LIGHTHOUSE_ROUTE_TIMEOUT_MS}`);
  }
  return value;
}
