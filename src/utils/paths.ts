import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

export function assertInsideWorkspace(workspace: string, candidate: string): string {
  const root = resolve(workspace);
  const target = resolve(workspace, candidate);
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (target !== root && !target.startsWith(prefix)) {
    throw new Error(`Path escapes workspace: ${candidate}`);
  }
  return target;
}

export function expandPathList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 64);
}

function matchGlob(relative: string, pattern: string): boolean {
  const posix = toPosix(relative);
  const escaped = pattern
    .replace(/\\/g, '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, ':::GLOBSTAR_SLASH:::')
    .replace(/\*\*/g, ':::GLOBSTAR:::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/:::GLOBSTAR_SLASH:::/g, '(?:.*/)?')
    .replace(/:::GLOBSTAR:::/g, '.*');
  return new RegExp(`^${escaped}$`).test(posix);
}

function walkFiles(dir: string, out: string[], depth = 0): void {
  if (depth > 12 || out.length > 500) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, out, depth + 1);
    else if (st.isFile()) out.push(full);
  }
}

export function resolveReportPaths(workspace: string, patterns: string[]): string[] {
  const root = resolve(workspace);
  const found = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.includes('*') || pattern.includes('?')) {
      const all: string[] = [];
      walkFiles(root, all);
      for (const file of all) {
        const rel = toPosix(file.slice(root.length + 1));
        if (matchGlob(rel, pattern)) found.add(file);
      }
    } else {
      const full = assertInsideWorkspace(workspace, pattern);
      if (existsSync(full) && statSync(full).isFile()) found.add(full);
    }
  }
  return [...found].slice(0, 200);
}

export function readWorkspaceText(workspace: string, relativeOrAbsolute: string): string {
  const full = assertInsideWorkspace(workspace, relativeOrAbsolute);
  return readFileSync(full, 'utf8');
}
