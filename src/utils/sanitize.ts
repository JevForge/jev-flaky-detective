import { createHash } from 'node:crypto';

const SECRET_PATTERNS: RegExp[] = [
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b(AI_GATEWAY_API_KEY|TYPESAFE_API_KEY|JEV_CUSTOM_API_KEY)\s*[:=]\s*\S+/gi,
  /\b(api[_-]?key|token|secret|password|passwd|authorization|bearer)\b\s*[:=]\s*[^\s,;&]+/gi,
  /\bBearer\s+[A-Za-z0-9._\-+=/]{12,}/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  out = out.replace(/\b(authorization)\s*[:=]\s*bearer\s+[^\s,;&]+/gi, '$1: [REDACTED]');
  out = out.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@');
  out = out.replace(
    /([?&](?:access[_-]?token|api[_-]?key|auth|key|password|passwd|secret|signature|sig|token)=)[^&#\s]+/gi,
    '$1[REDACTED]',
  );
  out = out.replace(
    /((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s:/]+:)[^\s/@]+(@)/gi,
    '$1[REDACTED]$2',
  );
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

export interface ErrorFingerprintInput {
  errorType?: string;
  message?: string;
  stack?: string;
}

function normalizeVolatile(value: string): string {
  return redactSecrets(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}/g, 'UUID')
    .replace(/0x[0-9a-fA-F]+/g, '0xH')
    .replace(/\b\d+(?:\.\d+)?\b/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeStack(stack: string | undefined): string {
  if (!stack) return '';
  return stack
    .split('\n')
    .slice(0, 8)
    .map(line => {
      const stableLine = line.replace(/(?:[A-Za-z]:)?[/\\](?:workspace|runner|home|tmp|Users)[/\\]/gi, '/');
      const pathMatch = stableLine.match(/(?:file:\/\/)?((?:[A-Za-z]:)?(?:[/\\][^()\s]+)+)/);
      if (!pathMatch) return normalizeVolatile(line);
      const segments = pathMatch[1]!.split(/[/\\]+/).filter(Boolean);
      const anchor = segments.findIndex(segment => /^(src|test|tests|lib|packages)$/i.test(segment));
      const stablePath = segments.slice(anchor >= 0 ? anchor : Math.max(0, segments.length - 2)).join('/');
      return normalizeVolatile(stableLine.replace(pathMatch[1]!, stablePath));
    })
    .join('|');
}

export function fingerprintError(input: ErrorFingerprintInput | string | undefined): string | undefined {
  if (!input) return undefined;
  const value = typeof input === 'string' ? { message: input, stack: input } : input;
  const canonical = [
    normalizeVolatile(value.errorType ?? ''),
    normalizeVolatile(value.message ?? ''),
    normalizeStack(value.stack),
  ].join('|');
  if (!canonical.replace(/\|/g, '')) return undefined;
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function digestError(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const [firstLine = text, ...stackLines] = text.split(/\r?\n/);
  const type = firstLine.match(/^([A-Za-z_$][\w$.-]*(?:Error|Exception))\s*:/)?.[1];
  return fingerprintError({ errorType: type, message: firstLine, stack: stackLines.join('\n') });
}

export function fingerprintTestResult(result: {
  error_type?: string;
  error_message?: string;
  stack_snippet?: string;
}): string | undefined {
  return fingerprintError({
    errorType: result.error_type,
    message: result.error_message,
    stack: result.stack_snippet,
  });
}
