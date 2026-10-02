export interface FixDetail {
  file: string;
  line?: number;
  rule: string;
  description: string;
  original?: string;
  fixed?: string;
}

export interface FixerSummary {
  filesScanned: number;
  filesModified: number;
  totalFixes: number;
  details: FixDetail[];
  dryRun: boolean;
}

export interface FixerOptions {
  dryRun?: boolean;
}
