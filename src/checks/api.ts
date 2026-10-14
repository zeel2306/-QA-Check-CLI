import type { Check, CheckResult } from "../types/result.js";
import { matchesDeclaredRoute } from "../utils/routes.js";

export interface ApiTestCase {
  name: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  expect?: {
    status?: number;
    responseTime?: number;
    requiredFields?: string[];
  };
}

export interface ApiTestResultItem {
  name: string;
  method: string;
  url: string;
  status: "PASS" | "FAIL" | "BLOCKED";
  httpStatus?: number;
  expectedStatus: number;
  responseTime: number;
  expectedResponseTime?: number;
  requiredFieldsChecked?: string[];
  missingFields?: string[];
  message: string;
}

export interface ApiCheckData {
  total: number;
  passed: number;
  failed: number;
  results: ApiTestResultItem[];
  testedEndpointsCount?: number;
  testedEndpoints?: string[];
}

/** A configured successful JSON read is a non-mutating identity witness for external targets. */
export async function verifyApiTarget(testCase: ApiTestCase): Promise<void> {
  const response = await fetch(resolveEnvVars(testCase.url), { headers: { Accept: "application/json", ...resolveDeepEnvVars(testCase.headers || {}) }, redirect: "manual", signal: AbortSignal.timeout(5000) });
  if (response.status !== (testCase.expect?.status ?? 200)) throw new Error(`API readiness witness returned HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.includes("json")) throw new Error("API readiness witness returned HTML or a non-JSON application");
  const json = await response.json();
  if (!json || typeof json !== "object" || (testCase.expect?.requiredFields ?? []).some((field) => !(field in json))) throw new Error("API readiness witness does not match configured JSON contract");
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envName) => process.env[envName] || "");
}

function resolveDeepEnvVars<T>(obj: T): T {
  if (typeof obj === "string") {
    return resolveEnvVars(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveDeepEnvVars(item)) as T;
  }
  if (obj && typeof obj === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = resolveDeepEnvVars(v);
    }
    return res as T;
  }
  return obj;
}

export class ApiTestingCheck implements Check<ApiCheckData> {
  readonly name = "API Testing";

  constructor(private readonly testCases: ApiTestCase[], private readonly declaredRoutes: string[] = [], private readonly signal?: AbortSignal) {}

  async run(_projectPath: string): Promise<CheckResult<ApiCheckData>> {
    const started = performance.now();

    if (!this.testCases || this.testCases.length === 0) {
      return {
        name: this.name,
        category: "api",
        status: "SKIPPED",
        score: 100,
        message: "No API test cases configured",
        duration: performance.now() - started,
        data: {
          total: 0,
          passed: 0,
          failed: 0,
          results: [],
        },
      };
    }

    const results: ApiTestResultItem[] = [];
    let passed = 0;
    let failed = 0;
    let blocked = 0;

    for (const testCase of this.testCases) {
      this.signal?.throwIfAborted();
      const method = (testCase.method || "GET").toUpperCase();
      const targetUrl = resolveEnvVars(testCase.url);
      const expectedStatus = testCase.expect?.status ?? 200;
      const expectedResponseTime = testCase.expect?.responseTime;
      const requiredFields = testCase.expect?.requiredFields ?? [];

      const headers: Record<string, string> = resolveDeepEnvVars(testCase.headers || {});
      const reqStart = performance.now();

      let httpStatus: number | undefined;
      let responseTime = 0;
      let isPass = true;
      let infrastructureFailure = false;
      const messages: string[] = [];
      const missingFields: string[] = [];

      try {
        const fetchOptions: RequestInit = {
          method,
          headers: { Accept: "application/json", ...headers },
          signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(this.signal ? [this.signal] : [])]),
          redirect: "manual",
        };

        if (testCase.body && ["POST", "PUT", "PATCH"].includes(method)) {
          const resolvedBody = resolveDeepEnvVars(testCase.body);
          if (typeof resolvedBody === "string") {
            fetchOptions.body = resolvedBody;
          } else {
            fetchOptions.body = JSON.stringify(resolvedBody);
            if (!fetchOptions.headers || !("Content-Type" in fetchOptions.headers)) {
              fetchOptions.headers = { ...fetchOptions.headers, "Content-Type": "application/json" };
            }
          }
        }

        const response = await fetch(targetUrl, fetchOptions);
        responseTime = Math.round(performance.now() - reqStart);
        httpStatus = response.status;

        // 1. Validate HTTP Status
        if (httpStatus !== expectedStatus) {
          isPass = false;
          messages.push(`Expected HTTP ${expectedStatus}, got ${httpStatus}`);
        }

        // 2. Validate Response Time
        if (expectedResponseTime && responseTime > expectedResponseTime) {
          isPass = false;
          messages.push(`Response time ${responseTime}ms exceeded limit (${expectedResponseTime}ms)`);
        }

        // 3. Validate Required Fields in JSON
        if (requiredFields.length > 0) {
          try {
            const json = (await response.json()) as Record<string, unknown>;
            for (const field of requiredFields) {
              if (!(field in json)) {
                missingFields.push(field);
              }
            }
            if (missingFields.length > 0) {
              isPass = false;
              messages.push(`Missing required field(s): ${missingFields.join(", ")}`);
            }
          } catch {
            isPass = false;
            messages.push("Response was not valid JSON");
          }
        }

        if (isPass) {
          messages.push(`Status: ${httpStatus}`);
          if (requiredFields.length > 0) {
            messages.push(`${requiredFields.length} field(s) verified`);
          }
        }
      } catch (err) {
        responseTime = Math.round(performance.now() - reqStart);
        isPass = false;
        infrastructureFailure = true;
        messages.push(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (infrastructureFailure) {
        blocked += 1;
      } else if (isPass) {
        passed += 1;
      } else {
        failed += 1;
      }

      results.push({
        name: testCase.name,
        method,
        url: targetUrl,
        status: infrastructureFailure ? "BLOCKED" : isPass ? "PASS" : "FAIL",
        httpStatus,
        expectedStatus,
        responseTime,
        expectedResponseTime,
        requiredFieldsChecked: requiredFields,
        missingFields: missingFields.length > 0 ? missingFields : undefined,
        message: messages.join(" | "),
      });
    }

    const total = this.testCases.length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 100;
    const overallStatus = failed > 0 ? "FAIL" : blocked > 0 ? "BLOCKED" : "PASS";

    const testedEndpointsSet = new Set(
      results.map((r) => {
        const pathOnly = r.url.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0] || r.url;
        const normPath = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
        const declared = this.declaredRoutes.find((route) => route.startsWith(`${r.method} `) && matchesDeclaredRoute(normPath, route));
        return declared || `${r.method} ${normPath}`;
      })
    );
    const testedEndpoints = [...testedEndpointsSet];
    const testedEndpointsCount = testedEndpoints.length;

    return {
      name: this.name,
      category: "api",
      status: overallStatus,
      score,
      message: `${passed}/${total} API test(s) passed (${testedEndpointsCount} distinct endpoint(s) tested)${blocked ? `; ${blocked} blocked` : ""}`,
      duration: performance.now() - started,
      data: {
        total,
        passed,
        failed,
        results,
        testedEndpointsCount,
        testedEndpoints,
      },
    };
  }
}
