import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { JevProviderId } from '../schemas/enums.js';
import { JEV_PROVIDERS } from '../schemas/enums.js';
import { assertInsideWorkspace } from '../utils/paths.js';

export interface JevConfigFile {
  jev_provider?: JevProviderId;
  jev_endpoint?: string;
  jev_model?: string;
  min_confidence?: number;
  low_confidence_policy?: string;
}

export function loadJevConfig(workspace: string, configPath: string): JevConfigFile {
  try {
    const full = assertInsideWorkspace(workspace, configPath);
    if (!existsSync(full)) return {};
    const raw = readFileSync(full, 'utf8');
    const parsed = parseYaml(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return {};
    const provider = parsed.jev_provider;
    return {
      jev_provider:
        typeof provider === 'string' && (JEV_PROVIDERS as readonly string[]).includes(provider)
          ? (provider as JevProviderId)
          : undefined,
      jev_endpoint: typeof parsed.jev_endpoint === 'string' ? parsed.jev_endpoint : undefined,
      jev_model: typeof parsed.jev_model === 'string' ? parsed.jev_model : undefined,
      min_confidence: typeof parsed.min_confidence === 'number' ? parsed.min_confidence : undefined,
      low_confidence_policy:
        typeof parsed.low_confidence_policy === 'string' ? parsed.low_confidence_policy : undefined,
    };
  } catch {
    return {};
  }
}
