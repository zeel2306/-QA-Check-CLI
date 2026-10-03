import path from "path";
import { chromium, type Browser, type Page, type Response } from "playwright";
import type { Check, CheckResult } from "../types/result.js";
import type { AuthSession } from "../core/auth.js";

export type E2EStepAction =
  | { goto: string }
  | { click: string }
  | { fill: { selector: string; value: string } }
  | { select: { selector: string; value: string } }
  | { check: string }
  | { uncheck: string }
  | { hover: string }
  | { press: { selector?: string; key: string } | string }
  | { wait: number | string }
  | { upload: { selector: string; file: string } }
  | { screenshot: { name: string } }
  | { expectUrl: string }
  | { expectText: { selector: string; text: string } }
  | { expectVisible: string }
  | { expectHidden: string }
  | { expectStatus: number };

export interface E2EUserFlow {
  name: string;
  steps: E2EStepAction[];
}

export interface E2EStepResult {
  action: string;
  target?: string;
  status: "PASS" | "FAIL";
  duration: number;
  message: string;
}

export interface E2EFlowResult {
  name: string;
  status: "PASS" | "FAIL";
  duration: number;
  steps: E2EStepResult[];
  message: string;
}

export interface E2ECheckData {
  totalFlows: number;
  passedFlows: number;
  failedFlows: number;
  results: E2EFlowResult[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveEnv(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (_, envName) => process.env[envName] || "");
}

function maskIfSecret(key: string, val: string): string {
  if (/password|secret|token|key|cred/i.test(key)) {
    return "******";
  }
  return val;
}

export class E2EFlowTestingCheck implements Check<E2ECheckData> {
  readonly name = "E2E Flow Testing";

  constructor(
    private readonly flows: E2EUserFlow[],
    private readonly baseUrl?: string,
    private readonly authSession?: AuthSession,
    private readonly reportDir: string = "reports",
  ) {}

  async run(_projectPath: string): Promise<CheckResult<E2ECheckData>> {
    const started = performance.now();

    if (!this.flows || this.flows.length === 0) {
      return {
        name: this.name,
        category: "project",
        status: "SKIPPED",
        score: 100,
        message: "No E2E user flows configured",
        duration: performance.now() - started,
        data: {
          totalFlows: 0,
          passedFlows: 0,
          failedFlows: 0,
          results: [],
        },
      };
    }

    let browser: Browser | undefined;
    const flowResults: E2EFlowResult[] = [];
    let passedFlows = 0;
    let failedFlows = 0;

    try {
      try {
        browser = await chromium.launch({ headless: true });
      } catch (launchErr) {
        return {
          name: this.name,
          category: "project",
          status: "SKIPPED",
          score: 100,
          message: `Playwright browser unavailable: ${launchErr instanceof Error ? launchErr.message : String(launchErr)}`,
          duration: performance.now() - started,
          data: {
            totalFlows: this.flows.length,
            passedFlows: 0,
            failedFlows: 0,
            results: [],
          },
        };
      }

      for (const flow of this.flows) {
        const flowStart = performance.now();
        const stepResults: E2EStepResult[] = [];
        let flowPass = true;

        const context = await browser.newContext({
          extraHTTPHeaders: this.authSession?.headers,
        });

        if (this.authSession?.cookies && this.authSession.cookies.length > 0) {
          await context.addCookies(this.authSession.cookies);
        }

        const page: Page = await context.newPage();
        let lastResponse: Response | null = null;

        page.on("response", (res) => {
          if (res.request().isNavigationRequest()) {
            lastResponse = res;
          }
        });

        for (const step of flow.steps) {
          const stepStart = performance.now();
          let stepPass = true;
          let actionName = "";
          let targetDesc = "";
          let stepMessage = "";

          try {
            if ("goto" in step) {
              actionName = "goto";
              let dest = resolveEnv(step.goto);
              if (this.baseUrl && dest.startsWith("/")) {
                dest = new URL(dest, this.baseUrl).toString();
              }
              targetDesc = dest;
              const res = await page.goto(dest, { waitUntil: "domcontentloaded", timeout: 20_000 });
              if (res) lastResponse = res;
              await page.waitForTimeout(200);
              stepMessage = `Navigated to ${dest}`;
            } else if ("click" in step) {
              actionName = "click";
              const selector = resolveEnv(step.click);
              targetDesc = selector;
              await page.click(selector, { timeout: 10_000 });
              stepMessage = `Clicked ${selector}`;
            } else if ("fill" in step) {
              actionName = "fill";
              const selector = resolveEnv(step.fill.selector);
              const val = resolveEnv(step.fill.value);
              targetDesc = `${selector} = "${maskIfSecret(selector, val)}"`;
              await page.fill(selector, val, { timeout: 10_000 });
              stepMessage = `Filled ${selector}`;
            } else if ("select" in step) {
              actionName = "select";
              const selector = resolveEnv(step.select.selector);
              const val = resolveEnv(step.select.value);
              targetDesc = `${selector} = "${val}"`;
              await page.selectOption(selector, val, { timeout: 10_000 });
              stepMessage = `Selected ${val} in ${selector}`;
            } else if ("check" in step) {
              actionName = "check";
              const selector = resolveEnv(step.check);
              targetDesc = selector;
              await page.check(selector, { timeout: 10_000 });
              stepMessage = `Checked ${selector}`;
            } else if ("uncheck" in step) {
              actionName = "uncheck";
              const selector = resolveEnv(step.uncheck);
              targetDesc = selector;
              await page.uncheck(selector, { timeout: 10_000 });
              stepMessage = `Unchecked ${selector}`;
            } else if ("hover" in step) {
              actionName = "hover";
              const selector = resolveEnv(step.hover);
              targetDesc = selector;
              await page.hover(selector, { timeout: 10_000 });
              stepMessage = `Hovered over ${selector}`;
            } else if ("press" in step) {
              actionName = "press";
              if (typeof step.press === "string") {
                const key = resolveEnv(step.press);
                targetDesc = key;
                await page.keyboard.press(key);
                stepMessage = `Pressed key '${key}'`;
              } else {
                const selector = step.press.selector ? resolveEnv(step.press.selector) : undefined;
                const key = resolveEnv(step.press.key);
                targetDesc = `${selector ? `${selector} -> ` : ""}${key}`;
                if (selector) {
                  await page.press(selector, key);
                } else {
                  await page.keyboard.press(key);
                }
                stepMessage = `Pressed '${key}'`;
              }
            } else if ("wait" in step) {
              actionName = "wait";
              const rawWait = step.wait;
              const msNum = typeof rawWait === "number" ? rawWait : (!isNaN(Number(rawWait)) ? Number(rawWait) : null);

              if (msNum !== null) {
                targetDesc = `${msNum}ms`;
                await page.waitForTimeout(msNum);
                stepMessage = `Waited ${msNum}ms`;
              } else {
                const selector = resolveEnv(String(rawWait));
                targetDesc = selector;
                await page.waitForSelector(selector, { state: "visible", timeout: 10_000 });
                stepMessage = `Waited for ${selector} to be visible`;
              }
            } else if ("upload" in step) {
              actionName = "upload";
              const selector = resolveEnv(step.upload.selector);
              const filePath = resolveEnv(step.upload.file);
              targetDesc = `${selector} <- ${filePath}`;
              await page.setInputFiles(selector, filePath);
              stepMessage = `Uploaded ${filePath} to ${selector}`;
            } else if ("screenshot" in step || "name" in (step as any)) {
              actionName = "screenshot";
              const rawStep = step as any;
              let name = "screenshot";
              if (typeof rawStep.screenshot === "string") {
                name = resolveEnv(rawStep.screenshot);
              } else if (isRecord(rawStep.screenshot) && typeof rawStep.screenshot.name === "string") {
                name = resolveEnv(rawStep.screenshot.name);
              } else if (typeof rawStep.name === "string") {
                name = resolveEnv(rawStep.name);
              }
              const picPath = path.join(this.reportDir, "screenshots", `${name}.png`);
              targetDesc = picPath;
              await page.screenshot({ path: picPath, fullPage: true });
              stepMessage = `Captured screenshot ${name}.png`;
            } else if ("expectUrl" in step) {
              actionName = "expectUrl";
              const expectedPath = resolveEnv(step.expectUrl);
              targetDesc = expectedPath;
              const currentUrl = page.url();
              const currentPath = new URL(currentUrl).pathname;
              if (currentPath === expectedPath || currentPath.endsWith(expectedPath)) {
                stepMessage = `URL matched ${expectedPath}`;
              } else {
                stepPass = false;
                stepMessage = `Expected URL '${expectedPath}', got '${currentPath}'`;
              }
            } else if ("expectText" in step) {
              actionName = "expectText";
              const selector = resolveEnv(step.expectText.selector);
              const expectedText = resolveEnv(step.expectText.text);
              targetDesc = `${selector} contains "${expectedText}"`;

              let actualText = "";
              try {
                await page.waitForSelector(selector, { state: "attached", timeout: 5000 });
                actualText = (await page.locator(selector).first().innerText({ timeout: 5000 })).trim();
              } catch {
                try {
                  actualText = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    return el ? (el.textContent || "").trim() : "";
                  }, selector);
                } catch {
                  actualText = "";
                }
              }

              if (actualText.toLowerCase().includes(expectedText.toLowerCase())) {
                stepMessage = `Text '${expectedText}' found in ${selector}`;
              } else {
                stepPass = false;
                stepMessage = `Expected '${expectedText}' in ${selector}, got '${actualText}'`;
              }
            } else if ("expectVisible" in step) {
              actionName = "expectVisible";
              const selector = resolveEnv(step.expectVisible);
              targetDesc = selector;

              let isVisible = false;
              try {
                await page.waitForSelector(selector, { state: "visible", timeout: 5000 });
                isVisible = await page.locator(selector).first().isVisible();
              } catch {
                isVisible = await page.evaluate((sel) => {
                  const el = document.querySelector(sel);
                  if (!el) return false;
                  const style = window.getComputedStyle(el);
                  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
                }, selector).catch(() => false);
              }

              if (isVisible) {
                stepMessage = `${selector} is visible`;
              } else {
                stepPass = false;
                stepMessage = `${selector} is not visible`;
              }
            } else if ("expectHidden" in step) {
              actionName = "expectHidden";
              const selector = resolveEnv(step.expectHidden);
              targetDesc = selector;

              let isHidden = false;
              try {
                await page.waitForSelector(selector, { state: "hidden", timeout: 5000 });
                isHidden = true;
              } catch {
                isHidden = false;
              }

              if (isHidden) {
                stepMessage = `${selector} is hidden`;
              } else {
                stepPass = false;
                stepMessage = `${selector} is visible (expected hidden)`;
              }
            } else if ("expectStatus" in step) {
              actionName = "expectStatus";
              const expectedStatus = step.expectStatus;
              targetDesc = `HTTP ${expectedStatus}`;

              const actualStatus = lastResponse ? lastResponse.status() : 0;
              if (actualStatus === expectedStatus) {
                stepMessage = `HTTP status matched ${expectedStatus}`;
              } else {
                stepPass = false;
                stepMessage = `Expected HTTP status ${expectedStatus}, got ${actualStatus}`;
              }
            } else {
              actionName = "unknown";
              stepPass = false;
              stepMessage = "Unknown step action";
            }
          } catch (stepErr) {
            stepPass = false;
            stepMessage = stepErr instanceof Error ? stepErr.message : String(stepErr);
          }

          const stepDuration = Math.round(performance.now() - stepStart);
          stepResults.push({
            action: actionName,
            target: targetDesc,
            status: stepPass ? "PASS" : "FAIL",
            duration: stepDuration,
            message: stepMessage,
          });

          if (!stepPass) {
            flowPass = false;

            if (this.reportDir) {
              try {
                const failPicPath = path.join(
                  this.reportDir,
                  "screenshots",
                  `e2e-fail-${flow.name.replace(/[^a-z0-9]+/gi, "-")}.png`,
                );
                await page.screenshot({ path: failPicPath, fullPage: true });
              } catch {
                // Ignore screenshot failure
              }
            }
            break;
          }
        }

        await context.close();

        const flowDuration = Math.round(performance.now() - flowStart);
        if (flowPass) {
          passedFlows += 1;
        } else {
          failedFlows += 1;
        }

        flowResults.push({
          name: flow.name,
          status: flowPass ? "PASS" : "FAIL",
          duration: flowDuration,
          steps: stepResults,
          message: flowPass
            ? `${stepResults.length}/${stepResults.length} steps passed (${flowDuration}ms)`
            : `Failed at step '${stepResults[stepResults.length - 1]?.action}': ${stepResults[stepResults.length - 1]?.message}`,
        });
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    const totalFlows = this.flows.length;
    const score = totalFlows > 0 ? Math.round((passedFlows / totalFlows) * 100) : 100;
    const overallStatus = failedFlows === 0 ? "PASS" : "FAIL";

    return {
      name: this.name,
      category: "project",
      status: overallStatus,
      score,
      message: `${passedFlows}/${totalFlows} E2E user flow(s) passed`,
      duration: Math.round(performance.now() - started),
      data: {
        totalFlows,
        passedFlows,
        failedFlows,
        results: flowResults,
      },
    };
  }
}
