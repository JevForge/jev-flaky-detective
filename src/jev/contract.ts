/**
 * Local Jev provider contract for Flaky Detective.
 * When `@jevforge/core` is published, adapters can import shared types from that package.
 */
import type { FailureType, JevProviderId } from '../schemas/enums.js';
import type { DetectiveDecision } from '../schemas/detective.js';
import type { EvaluationState } from '../decision/evidence.js';

export interface EvaluationRequest {
  state: EvaluationState;
  questions: Record<
    string,
    | { type: 'choice'; instructions: string; criteria: Record<string, string> }
    | { type: 'boolean'; instructions: string }
  >;
}

export type JevCallResult =
  | {
      status: 'evaluated';
      failure_type: FailureType;
      confidence: number;
      abstain: boolean;
      explanation: string;
    }
  | { status: 'unavailable'; message: string }
  | { status: 'schema_rejected'; message: string };

export interface JevProvider {
  readonly id: JevProviderId;
  evaluateFailure(request: EvaluationRequest): Promise<JevCallResult>;
}

export interface JevProviderOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  evaluateImpl?: (args: {
    model: unknown;
    state: Record<string, unknown>;
    questions: EvaluationRequest['questions'];
    maxRetries?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, unknown>;
  }) => Promise<{
    answers: Record<string, { type?: string; choice?: string; probability?: number; confidence?: number }>;
    confidence?: Record<string, number>;
    providerMetadata?: { typesafe?: { confidence?: Record<string, number> } };
  }>;
}

export type { DetectiveDecision };
