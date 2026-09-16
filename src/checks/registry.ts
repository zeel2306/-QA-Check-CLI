import type { QACheck } from "./types.js";

export class CheckRegistry {
  private readonly checks = new Map<string, QACheck>();

  register(check: QACheck): void {
    this.checks.set(check.name, check);
  }

  get(name: string): QACheck | undefined {
    return this.checks.get(name);
  }

  getAll(): QACheck[] {
    return [...this.checks.values()];
  }

  getByCategory(category: QACheck["category"]): QACheck[] {
    return this.getAll().filter((check) => check.category === category);
  }
}

export function createCheckRegistry(checks: QACheck[]): CheckRegistry {
  const registry = new CheckRegistry();

  for (const check of checks) {
    registry.register(check);
  }

  return registry;
}
