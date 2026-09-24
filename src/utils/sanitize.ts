const SECRET_PATTERNS: RegExp[] = [
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b(AI_GATEWAY_API_KEY|TYPESAFE_API_KEY|JEV_CUSTOM_API_KEY)\s*[:=]\s*\S+/gi,
  /\b(api[_-]?key|token|authorization|bearer)\b\s*[:=]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._\-+=/]{12,}/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

export function sanitizeSummary(text: string, maxChars = 500): string {
  const cleaned = redactSecrets(text)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars - 1)}…`;
}

export function sanitizeError(text: string | undefined, maxChars = 800): string | undefined {
  if (!text) return undefined;
  return sanitizeSummary(text, maxChars);
}

export function digestError(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const cleaned = sanitizeSummary(text, 400)
    .replace(/\d+/g, 'N')
    .replace(/0x[0-9a-fA-F]+/g, '0xH')
    .replace(/[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}/g, 'UUID')
    .toLowerCase();
  let hash = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    hash = (hash * 31 + cleaned.charCodeAt(i)) >>> 0;
  }
  return `${hash.toString(16)}:${cleaned.slice(0, 80)}`;
}
