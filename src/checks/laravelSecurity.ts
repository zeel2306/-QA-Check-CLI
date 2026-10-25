import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import fg from "../utils/sourceGlob.js";
import { execa } from "execa";
import type { Check, CheckResult } from "../types/result.js";

export interface SecurityFinding {
  ruleId: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  file?: string;
  target?: string;
  evidence: string;
  explanation: string;
  remediation: string;
}

export interface SecurityCheckData {
  totalFindings: number;
  findings: SecurityFinding[];
  bySeverity: Record<string, number>;
  isPartial?: boolean;
  unverifiedRoutes?: string[];
}

export interface LaravelRouteDefinition {
  method: string;
  uri: string;
  middleware: string[];
  action?: string;
}

export class LaravelSecurityCheck implements Check<SecurityCheckData> {
  readonly name = "Laravel Security";
  constructor(private readonly routeProvider?: (projectPath: string) => Promise<LaravelRouteDefinition[]>) {}

  async run(projectPath: string): Promise<CheckResult<SecurityCheckData>> {
    const started = performance.now();
    const findings: SecurityFinding[] = [];
    let resolvedRoutes: LaravelRouteDefinition[] | undefined;
    try {
      if (this.routeProvider) resolvedRoutes = await this.routeProvider(projectPath);
      else {
        const listing = await execa(process.platform === "win32" ? "php.exe" : "php", ["artisan", "route:list", "--json"], { cwd: projectPath, timeout: 15_000 });
        resolvedRoutes = JSON.parse(listing.stdout);
      }
      for (const route of resolvedRoutes || []) {
        const [className, method] = (route.action || "").split("@");
        if (!className?.startsWith("App\\") || !method) continue;
        const controller = await fsp.readFile(path.join(projectPath, "app", className.slice(4).replaceAll("\\", "/") + ".php"), "utf8").catch(() => "");
        const begin = controller.indexOf(`function ${method}(`);
        if (begin < 0) continue;
        const next = controller.indexOf("function ", begin + 9);
        const body = controller.slice(begin, next < 0 ? undefined : next);
        if (/\$this->authorize\s*\(|Gate::authorize\s*\(|abort_unless\s*\(\s*Auth::check\s*\(/.test(body)) route.middleware.push("auth:controller-evidence");
      }
    } catch { /* Missing runtime cannot establish absence of resolved middleware. */ }
    const middlewareFor = (target: string) => {
      const [method, uri] = target.split(" ");
      return resolvedRoutes?.find((route) => route.uri === uri?.replace(/^\//, "") && route.method.split("|").includes(method!))?.middleware.join(" ");
    };

    // Rule SEC-LAR-001: Unsafe production debug configuration
    try {
      const envExamplePath = path.join(projectPath, ".env.example");
      if (fs.existsSync(envExamplePath)) {
        const content = await fsp.readFile(envExamplePath, "utf8").catch(() => "");
        if (/^APP_DEBUG\s*=\s*true/mi.test(content)) {
          findings.push({
            ruleId: "SEC-LAR-001",
            severity: "MEDIUM",
            confidence: "HIGH",
            file: ".env.example",
            target: ".env.example",
            evidence: "APP_DEBUG=true in .env.example template",
            explanation: "APP_DEBUG=true in .env.example risks accidental deployment of debug mode in production environments, exposing detailed stack traces and system paths.",
            remediation: "Set APP_DEBUG=false in environment template files intended for production or deployment defaults.",
          });
        }
      }
    } catch {
      // Ignore read errors
    }

    // Evaluate resolved routes individually: group/controller middleware and prefixes
    // must not be inferred from unrelated declarations elsewhere in a file.
    let apiRoutes = resolvedRoutes;
    let unresolvedProtection = false;
    if (!apiRoutes) {
      const source = await fsp.readFile(path.join(projectPath, "routes/api.php"), "utf8").catch(() => "");
      const uncertainGroups = /middleware\s*\(|->group\s*\(/.test(source);
      unresolvedProtection = uncertainGroups;
      apiRoutes = [...source.matchAll(/Route::(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/gi)].map((match) => ({
        method: match[1]!.toUpperCase(), uri: "api/" + match[2]!.replace(/^\//, ""),
        middleware: uncertainGroups ? ["unknown-protection"] : ["api"],
      }));
    }
    for (const route of apiRoutes) {
      const middleware = route.middleware.join(" ");
      if (!route.uri.startsWith("api/") && !route.middleware.includes("api")) continue;
      if (middleware.includes("unknown-protection")) continue;
      const method = route.method.replace("|HEAD", "");
      const target = method + " /" + route.uri;
      const protectedRoute = /(?:^|[\s,])auth(?::|\b)|(?:^|\\)Authenticate(?::|\b)|(?:^|[\s,])can:|(?:^|\\)Authorize(?::|\b)/i.test(middleware);
      const addRisk = (ruleId: string, explanation: string, remediation: string) => findings.push({
        ruleId, severity: ruleId === "SEC-LAR-003" ? "MEDIUM" : "HIGH", confidence: "MEDIUM", file: "routes/api.php", target,
        evidence: "Static route analysis; middleware: " + (middleware || "none"), explanation, remediation,
      });
      if (!protectedRoute && method === "GET" && /(?:^|\/)(orders|users|profile|admin)(?:\/|$)/.test(route.uri)) addRisk("SEC-LAR-002", "Sensitive route lacks recognized authentication; custom guards require review.", "Require authentication and authorization.");
      if (/(?:^|\/)(login|register|password)(?:\/|$)/.test(route.uri) && !/throttle/i.test(middleware)) addRisk("SEC-LAR-003", "Authentication route lacks resolved rate limiting.", "Apply throttle middleware.");
      if (!protectedRoute && /POST|PUT|PATCH|DELETE/.test(method) && !/(?:^|\/)(login|register)(?:\/|$)/.test(route.uri)) addRisk("SEC-LAR-005", "Write route lacks recognized authorization; custom guards require review.", "Require authenticated and authorized mutations.");
    }

    // Literal token issuance is a static risk, not proof of production exploitation.
    const controllers = await fg(["app/Http/Controllers/**/*.php"], { cwd: projectPath });
    for (const file of controllers) {
      const content = await fsp.readFile(path.join(projectPath, file), "utf8").catch(() => "");
      if (/["'](?:access_)?token["']\s*=>\s*["'][^"']+["']/.test(content) && !/Hash::check|Auth::attempt|verifyCredentials|validateCredentials/i.test(content)) {
        const related = (resolvedRoutes || []).filter((route) => route.action && file.endsWith(route.action.split("@")[0]!.split("\\").at(-1)! + ".php"));
        findings.push({ ruleId: "SEC-LAR-004", severity: "HIGH", confidence: "MEDIUM", file,
          target: related.length ? related.map((route) => route.method.replace("|HEAD", "") + " /" + route.uri).join(", ") : file,
          evidence: "Controller contains literal token issuance; token value redacted",
          explanation: "Static authentication risk: literal tokens appear to be issued without recognized credential verification; review indirect guards.",
          remediation: "Validate credentials and issue unique expiring tokens." });
      }
    }

    const unique = new Map(findings.map((f) => [`${f.ruleId}:${f.target || f.file}`, f]));
    findings.splice(0, findings.length, ...unique.values());
    for (const finding of findings) {
      if (["SEC-LAR-002", "SEC-LAR-003", "SEC-LAR-005"].includes(finding.ruleId)) {
        finding.confidence = "MEDIUM";
        finding.explanation = `Static risk requiring review of custom guards: ${finding.explanation}`;
        if (resolvedRoutes) finding.evidence += `; resolved middleware: ${middlewareFor(finding.target || "") || "none"}`;
      }
    }

    const bySeverity: Record<string, number> = {
      CRITICAL: findings.filter((f) => f.severity === "CRITICAL").length,
      HIGH: findings.filter((f) => f.severity === "HIGH").length,
      MEDIUM: findings.filter((f) => f.severity === "MEDIUM").length,
      LOW: findings.filter((f) => f.severity === "LOW").length,
    };

    const status = findings.length ? "FAIL" : unresolvedProtection ? "PARTIAL" : "PASS";
    const score = unresolvedProtection && !findings.length ? null : Math.max(0, 100 - findings.length * 15);

    return {
      name: this.name,
      category: "security",
      status,
      score,
      message: unresolvedProtection && !findings.length ? "Middleware resolution unavailable; grouped routes remain unverified" : findings.length === 0
        ? "0 security issues detected"
        : `${findings.length} security finding(s) (${bySeverity.HIGH! + bySeverity.CRITICAL!} high/critical)`,
      duration: Math.round(performance.now() - started),
      data: {
        totalFindings: findings.length,
        findings,
        bySeverity,
        isPartial: unresolvedProtection,
        unverifiedRoutes: apiRoutes.filter((route) => route.middleware.includes("unknown-protection")).map((route) => route.method + " /" + route.uri),
      },
    };
  }
}
