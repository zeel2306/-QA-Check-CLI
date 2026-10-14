import type { QAContext } from "./context.js";
import { QACheckTimeoutError, serializeError } from "./errors.js";
import { inferCheckCategory, normalizeCheckResult } from "./normalize.js";
import type { QACheck } from "../checks/types.js";
import type { Check, CheckResult } from "../types/result.js";
import { BROWSER_CHECK_NAMES } from "../pipeline/runtime.js";

const DEFAULT_TIMEOUT_MS = 120_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  checkName: string,
  signal?: AbortSignal,
  onTimeout?: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let abort: (() => void) | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new QACheckTimeoutError(`${checkName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    abort = () => reject(signal?.reason || new Error("Scan cancelled"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  });
}

function legacyCheckAdapter(check: Check): QACheck {
  return {
    name: check.name,
    category: inferCheckCategory(check.name),
    timeoutMs: (check as any).timeoutMs,
    run: (context) => check.run(context.projectPath),
  };
}

function isQACheck(check: Check | QACheck): check is QACheck {
  return "category" in check;
}

export function toQACheck(check: Check | QACheck): QACheck {
  if (isQACheck(check)) {
    return check;
  }

  return legacyCheckAdapter(check);
}

const RUNTIME_CHECKS_FAST_SKIP = new Set([
  "SEO",
  "Lighthouse Performance",
  "Accessibility",
  "Responsive",
  "Performance",
  "Broken Links",
  "Broken Images",
  "Console Errors",
  "Network Errors",
  "API Testing",
  "E2E Flow Testing",
]);

export async function executeCheck(
  check: Check | QACheck,
  context: QAContext,
): Promise<CheckResult> {
  const qaCheck = toQACheck(check);
  const started = performance.now();
  const startedAt = new Date().toISOString();

  if (context.config.profile === "fast" && RUNTIME_CHECKS_FAST_SKIP.has(qaCheck.name)) {
    const finishedAt = new Date().toISOString();
    const result = normalizeCheckResult({
      name: qaCheck.name,
      category: qaCheck.category,
      status: "SKIPPED",
      skipReason: "Skipped in fast profile",
      message: "Skipped in fast profile",
      duration: 0,
      startedAt,
      finishedAt,
    });
    context.logger.result(result);
    return result;
  }

  let preparationMs = 0;
  try {
    const preparationStarted = performance.now();
    await context.runtime.prepareCheck(qaCheck.name);
    preparationMs = performance.now() - preparationStarted;
  } catch (error) {
    const result = normalizeCheckResult({ name: qaCheck.name, category: qaCheck.category, status: "BLOCKED", score: null, message: serializeError(error).message, duration: 0, metadata: { preparationDurationMs: performance.now() - started } });
    context.logger.result(result);
    return result;
  }

  const executionStarted = performance.now();
  const executionStartedAt = new Date().toISOString();
  const checkCancellation = new AbortController();
  context.runtime.setCheckSignal?.(AbortSignal.any([checkCancellation.signal, ...(context.config.signal ? [context.config.signal] : [])]));
  try {
    const result = await withTimeout(
      Promise.resolve(qaCheck.run(context)),
      context.config.runtime?.scannerTimeouts?.[qaCheck.name] ?? context.config.runtime?.scannerTimeoutMs ?? qaCheck.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      qaCheck.name,
      context.config.signal,
      () => checkCancellation.abort(new QACheckTimeoutError(`${qaCheck.name} execution budget exhausted`)),
    );
    const evidence = BROWSER_CHECK_NAMES.has(qaCheck.name) ? await context.runtime.auditEvidence() : undefined;
    if (evidence && qaCheck.name !== "Lighthouse Performance") {
      result.pageSummary = evidence.pageSummary;
      result.routeAudits = evidence.routeAudits;
      result.pagesDiscovered = evidence.pageSummary.eligible + evidence.pageSummary.unverified;
      result.pagesAttempted = evidence.pageSummary.attempted;
      result.pagesCompleted = evidence.pageSummary.completed;
      if (evidence.pageSummary.completed < evidence.pageSummary.eligible || evidence.pageSummary.unverified > 0) {
        result.metadata = { ...result.metadata, incompleteScope: true };
        if (["PASS", "WARNING", "NOT_APPLICABLE"].includes(result.status)) {
          result.status = evidence.pageSummary.completed || evidence.seo.length ? "PARTIAL" : evidence.pageSummary.timedOut ? "TIMEOUT" : "BLOCKED";
          if (!evidence.pageSummary.completed && !evidence.seo.length) result.score = null;
        }
        result.message = `${result.message || ""}\nRoute coverage incomplete: ${evidence.pageSummary.completed}/${evidence.pageSummary.eligible} completed; ${evidence.pageSummary.timedOut} timed out; ${evidence.pageSummary.blocked} blocked; ${evidence.pageSummary.unverified} untested`;
      }
    }
    const finishedAt = new Date().toISOString();

    const normalized = normalizeCheckResult({
      ...result,
      name: result.name ?? qaCheck.name,
      category: result.category ?? qaCheck.category,
      duration: performance.now() - executionStarted,
      startedAt: executionStartedAt,
      finishedAt,
      metadata: {
        description: qaCheck.description,
        preparationDurationMs: preparationMs,
        preparationStartedAt: startedAt,
        ...result.metadata,
      },
    });

    context.logger.result(normalized);
    return normalized;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const serialized = serializeError(error);
    const isTimeout = serialized.code === "QA_CHECK_TIMEOUT" || serialized.name === "QACheckTimeoutError";
    const result = normalizeCheckResult({
      name: qaCheck.name,
      category: qaCheck.category,
      status: context.config.signal?.aborted ? "BLOCKED" : isTimeout ? "TIMEOUT" : "ERROR",
      message: serialized.message,
      duration: performance.now() - executionStarted,
      startedAt: executionStartedAt,
      finishedAt,
      error: serialized,
      metadata: {
        description: qaCheck.description,
        preparationDurationMs: preparationMs,
        preparationStartedAt: startedAt,
      },
    });

    context.logger.result(result);
    return result;
  } finally {
    context.runtime.setCheckSignal?.(undefined);
  }
}
