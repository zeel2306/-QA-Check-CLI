/**
 * Strips ANSI escape codes (color codes, cursor movements, etc.) from text.
 * Preserves normal UTF-8/Unicode characters.
 */
export function stripAnsi(text: string): string {
  if (!text) return "";
  // Standard ANSI escape sequence regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

export function sanitizeSensitiveData(text: string): string {
  if (!text) return "";
  let clean = text;
  // Redact Bearer tokens and Authorization headers
  clean = clean.replace(/(authorization:\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]");
  // Redact sensitive query parameters in URLs
  clean = clean.replace(/([?&](?:token|api_key|apikey|secret|password|access_token|auth_token)=)[^&"'\s]+/gi, "$1[REDACTED]");
  return clean;
}

export function sanitizeAnsi<T>(input: T): T {
  if (typeof input === "string") {
    return sanitizeSensitiveData(stripAnsi(input)) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeAnsi(item)) as unknown as T;
  }
  if (input !== null && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = new Set(["password", "token", "secret", "api_key", "apikey", "access_token", "auth_token"]);
    for (const [key, val] of Object.entries(obj)) {
      if (sensitiveKeys.has(key.toLowerCase()) && typeof val === "string" && val.length > 0) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeAnsi(val);
      }
    }
    return sanitized as unknown as T;
  }
  return input;
}
