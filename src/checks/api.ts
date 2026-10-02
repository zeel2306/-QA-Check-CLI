import type { Check, CheckResult } from "../types/result.js";

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
  status: "PASS" | "FAIL";
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

  constructor(private readonly testCases: ApiTestCase[]) {}

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

    for (const testCase of this.testCases) {
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
      const messages: string[] = [];
      const missingFields: string[] = [];

      try {
        const fetchOptions: RequestInit = {
          method,
          headers,
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
        } else {
          messages.push(`Status: ${httpStatus}`);
        }

        // 2. Validate Response Time
        if (expectedResponseTime && responseTime > expectedResponseTime) {
          isPass = false;
          messages.push(`Response time ${responseTime}ms exceeded limit (${expectedResponseTime}ms)`);
        } else {
          messages.push(`${responseTime}ms`);
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
            } else {
              messages.push(`${requiredFields.length} field(s) verified`);
            }
          } catch {
            isPass = false;
            messages.push("Response was not valid JSON");
          }
        }
      } catch (err) {
        responseTime = Math.round(performance.now() - reqStart);
        isPass = false;
        messages.push(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (isPass) {
        passed += 1;
      } else {
        failed += 1;
      }

      results.push({
        name: testCase.name,
        method,
        url: targetUrl,
        status: isPass ? "PASS" : "FAIL",
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
    const overallStatus = failed === 0 ? "PASS" : "FAIL";

    return {
      name: this.name,
      category: "api",
      status: overallStatus,
      score,
      message: `${passed}/${total} API test(s) passed`,
      duration: performance.now() - started,
      data: {
        total,
        passed,
        failed,
        results,
      },
    };
  }
}
