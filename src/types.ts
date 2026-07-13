export interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  stdout?: string;
  stderr?: string;
  reason?: string;
}