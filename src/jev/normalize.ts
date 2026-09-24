import { FAILURE_TYPES, type FailureType } from '../schemas/enums.js';
import type { JevCallResult } from './contract.js';

export interface EvaluationBody {
  answers?: Record<
    string,
    { type?: string; choice?: string; probability?: number; confidence?: number } | undefined
  >;
  confidence?: Record<string, number>;
  providerMetadata?: { typesafe?: { confidence?: Record<string, number> } };
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function interpretEvaluation(body: EvaluationBody): JevCallResult {
  const selected = body.answers?.failure_type;
  if (!selected || selected.type !== 'choice' || typeof selected.choice !== 'string') {
    return { status: 'schema_rejected', message: 'SCHEMA_REJECTED: missing failure_type choice' };
  }
  if (!(FAILURE_TYPES as readonly string[]).includes(selected.choice)) {
    return {
      status: 'schema_rejected',
      message: `SCHEMA_REJECTED: failure_type ${selected.choice} is not allowed`,
    };
  }
  const typesafe = body.providerMetadata?.typesafe?.confidence?.failure_type;
  const confidence = clampConfidence(
    typesafe ?? body.confidence?.failure_type ?? selected.confidence ?? selected.probability ?? 0,
  );
  const abstain = body.answers?.abstain;
  const abstainProbability = abstain?.type === 'boolean' ? abstain.probability : undefined;
  return {
    status: 'evaluated',
    failure_type: selected.choice as FailureType,
    confidence,
    explanation: `Jev proposed ${selected.choice}`,
    abstain: (abstainProbability ?? 0) >= 0.55,
  };
}

export function unavailable(message: string): JevCallResult {
  return { status: 'unavailable', message: message.slice(0, 500) };
}

export function isSchemaRejected(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('SCHEMA_REJECTED');
}
