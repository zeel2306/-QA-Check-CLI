import type { QAContext } from "./context.js";
import { QACheckTimeoutError, serializeError } from "./errors.js";
import { inferCheckCategory, normalizeCheckResult } from "./normalize.js";
import type { QACheck } from "../checks/types.js";
import type { Check, CheckResult } from "../types/result.js";

const DEFAULT_TIMEOUT_MS = 120_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  checkName: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new QACheckTimeoutError(`${checkName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function legacyCheckAdapter(check: Check): QACheck {
  return {
    name: check.name,
    category: inferCheckCategory(check.name),
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

export async function executeCheck(
  check: Check | QACheck,
  context: QAContext,
): Promise<CheckResult> {
  const qaCheck = toQACheck(check);
  const started = performance.now();
  const startedAt = new Date().toISOString();

  try {
    const result = await withTimeout(
      Promise.resolve(qaCheck.run(context)),
      qaCheck.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      qaCheck.name,
    );
    const finishedAt = new Date().toISOString();

    const normalized = normalizeCheckResult({
      ...result,
      name: result.name ?? qaCheck.name,
      category: result.category ?? qaCheck.category,
      duration: result.duration || performance.now() - started,
      startedAt,
      finishedAt,
      metadata: {
        description: qaCheck.description,
        ...result.metadata,
      },
    });

    context.logger.result(normalized);
    return normalized;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const serialized = serializeError(error);
    const result = normalizeCheckResult({
      name: qaCheck.name,
      category: qaCheck.category,
      status: serialized.code === "QA_CHECK_TIMEOUT" ? "SKIPPED" : "ERROR",
      message: serialized.message,
      duration: performance.now() - started,
      startedAt,
      finishedAt,
      error: serialized,
      metadata: {
        description: qaCheck.description,
      },
    });

    context.logger.result(result);
    return result;
  }
}
