export class QAError extends Error {
  constructor(
    message: string,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class QAConfigError extends QAError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "QA_CONFIG_ERROR", options);
  }
}

export class QAProjectError extends QAError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "QA_PROJECT_ERROR", options);
  }
}

export class QABrowserError extends QAError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "QA_BROWSER_ERROR", options);
  }
}

export class QACheckTimeoutError extends QAError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "QA_CHECK_TIMEOUT", options);
  }
}

export class QAExecutionError extends QAError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "QA_EXECUTION_ERROR", options);
  }
}

export function serializeError(error: unknown): {
  name: string;
  message: string;
  code?: string;
  stack?: string;
} {
  if (error instanceof QAError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}
