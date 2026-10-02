import chalk from "chalk";

export interface AuthConfig {
  loginUrl: string;
  method?: "POST" | "GET";
  credentials?: Record<string, string>;
  headers?: Record<string, string>;
  tokenPath?: string;
  authHeader?: string;
  authPrefix?: string;
  cookieName?: string;
}

export interface AuthSession {
  token?: string;
  headers: Record<string, string>;
  cookies: Array<{ name: string; value: string; domain: string; path: string }>;
}

function getNestedValue(obj: unknown, pathStr: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = pathStr.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function resolveEnvString(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (_, envKey) => process.env[envKey] || "");
}

function resolveDeepEnv<T>(val: T): T {
  if (typeof val === "string") return resolveEnvString(val) as T;
  if (Array.isArray(val)) return val.map(resolveDeepEnv) as T;
  if (val && typeof val === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = resolveDeepEnv(v);
    }
    return res as T;
  }
  return val;
}

export async function authenticateSession(
  authConfig: AuthConfig,
  baseUrl?: string,
): Promise<AuthSession | undefined> {
  let targetUrl = resolveEnvString(authConfig.loginUrl);
  if (baseUrl && targetUrl.startsWith("/")) {
    targetUrl = new URL(targetUrl, baseUrl).toString();
  }

  const method = (authConfig.method || "POST").toUpperCase();
  const rawHeaders = resolveDeepEnv(authConfig.headers || {});
  const credentials = resolveDeepEnv(authConfig.credentials || {});

  const tokenPath = authConfig.tokenPath || "data.token";
  const authHeaderName = authConfig.authHeader || "Authorization";
  const authPrefix = authConfig.authPrefix !== undefined ? authConfig.authPrefix : "Bearer ";
  const cookieName = authConfig.cookieName || "token";

  console.log(chalk.cyan(`🔐 Authenticating session at ${targetUrl}...`));

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...rawHeaders,
      },
    };

    if (method !== "GET" && Object.keys(credentials).length > 0) {
      fetchOptions.body = JSON.stringify(credentials);
    }

    const response = await fetch(targetUrl, fetchOptions);

    if (!response.ok) {
      console.log(chalk.yellow(`⚠️  Auth failed: HTTP ${response.status}. Proceeding unauthenticated.`));
      return undefined;
    }

    const json = await response.json();
    let token = getNestedValue(json, tokenPath);

    // Fallback token extraction attempts
    if (!token && typeof json === "object" && json !== null) {
      token = (json as any).token || (json as any).access_token || (json as any)?.data?.token;
    }

    if (token !== undefined && token !== null) {
      token = String(token);
    }

    if (!token || typeof token !== "string") {
      console.log(chalk.yellow(`⚠️  Auth response received, but token not found at path '${tokenPath}'.`));
      return undefined;
    }

    console.log(chalk.green(`✔ Authenticated successfully. Session token acquired.`));

    const headers: Record<string, string> = {
      [authHeaderName]: `${authPrefix}${token}`,
    };

    let domain = "localhost";
    try {
      domain = new URL(targetUrl).hostname;
    } catch {
      // default localhost
    }

    const cookies = [
      {
        name: cookieName,
        value: token,
        domain,
        path: "/",
      },
    ];

    return {
      token,
      headers,
      cookies,
    };
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Auth request error: ${error instanceof Error ? error.message : String(error)}`));
    return undefined;
  }
}
