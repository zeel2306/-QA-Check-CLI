import fs from "fs/promises";
import path from "path";
import type { E2EUserFlow } from "../checks/e2e.js";

function coercePrimitive(val: string): unknown {
  const clean = val.replace(/^["']|["']$/g, "").trim();
  if (clean === "true") return true;
  if (clean === "false") return false;
  if (!isNaN(Number(clean)) && clean !== "") return Number(clean);
  return clean;
}

function parseSimpleYaml(content: string): unknown {
  const lines = content.split("\n");
  const result: any = {};
  let currentKey = "";
  let currentArray: any[] | null = null;
  let currentItem: any = null;

  for (let line of lines) {
    line = line.trimEnd();
    if (!line || line.trim().startsWith("#")) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      const itemContent = trimmed.substring(2).trim();
      if (!currentArray) {
        currentArray = [];
        if (currentKey) result[currentKey] = currentArray;
      }

      if (itemContent.includes(": ")) {
        const [k, ...v] = itemContent.split(": ");
        currentItem = { [k.trim()]: coercePrimitive(v.join(": ")) };
        currentArray.push(currentItem);
      } else if (itemContent.endsWith(":")) {
        const k = itemContent.slice(0, -1).trim();
        const nested: any = {};
        currentItem = { [k]: nested };
        currentArray.push(currentItem);
      } else if (itemContent) {
        currentArray.push(coercePrimitive(itemContent));
      }
    } else if (trimmed.includes(": ")) {
      const [k, ...v] = trimmed.split(": ");
      const key = k.trim();
      const val = coercePrimitive(v.join(": "));

      if (indent === 0) {
        currentKey = key;
        currentArray = null;
        if (val !== "") {
          result[key] = val;
        }
      } else if (currentItem && typeof currentItem === "object") {
        const firstKey = Object.keys(currentItem)[0];
        if (firstKey && typeof currentItem[firstKey] === "object" && currentItem[firstKey] !== null) {
          currentItem[firstKey][key] = val;
        } else {
          currentItem[key] = val;
        }
      }
    } else if (trimmed.endsWith(":")) {
      const key = trimmed.slice(0, -1).trim();
      if (indent === 0) {
        currentKey = key;
        currentArray = null;
      }
    }
  }

  return result;
}

export async function loadFlowFromFile(filePath: string): Promise<E2EUserFlow[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    let parsed: any;

    if (filePath.endsWith(".json")) {
      parsed = JSON.parse(raw);
    } else {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = parseSimpleYaml(raw);
      }
    }

    if (Array.isArray(parsed)) {
      return parsed as E2EUserFlow[];
    } else if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.flows)) {
        return parsed.flows as E2EUserFlow[];
      }
      if (typeof parsed.name === "string" && Array.isArray(parsed.steps)) {
        return [parsed as E2EUserFlow];
      }
    }
  } catch (err) {
    console.error(`Failed to load flow file '${filePath}':`, err instanceof Error ? err.message : String(err));
  }

  return [];
}

export async function loadFlowsFromTarget(targetPath: string): Promise<E2EUserFlow[]> {
  const stat = await fs.stat(targetPath).catch(() => undefined);
  if (!stat) return [];

  if (stat.isFile()) {
    return loadFlowFromFile(targetPath);
  }

  if (stat.isDirectory()) {
    const flows: E2EUserFlow[] = [];
    const entries = await fs.readdir(targetPath);
    for (const entry of entries) {
      if (/\.(json|yaml|yml)$/i.test(entry)) {
        const fileFlows = await loadFlowFromFile(path.join(targetPath, entry));
        flows.push(...fileFlows);
      }
    }
    return flows;
  }

  return [];
}
