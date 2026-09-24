import { z } from 'zod';
import {
  DECISIONS,
  DECISION_MODES,
  ENVIRONMENTS,
  FAILURE_TYPES,
  JEV_PROVIDERS,
  JEV_STATUSES,
  LOW_CONFIDENCE_POLICIES,
  REASON_CODES,
  SOURCE_ERROR_POLICIES,
  TEST_STATUSES,
} from './enums.js';

export const TestResultSchema = z.object({
  test_id: z.string().min(1).max(512),
  name: z.string().min(1).max(1024).optional(),
  suite: z.string().max(1024).optional(),
  file: z.string().max(1024).optional(),
  status: z.enum(TEST_STATUSES),
  duration_ms: z.number().nonnegative().finite().optional(),
  error_message: z.string().max(4000).optional(),
  error_type: z.string().max(256).optional(),
  stack_snippet: z.string().max(4000).optional(),
  retries: z.number().int().nonnegative().max(100).optional(),
  attempt: z.number().int().positive().max(100).optional(),
  tags: z.array(z.string().max(64)).max(32).optional(),
  timestamp: z.string().max(64).optional(),
  source: z.string().max(64).optional(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

export const HistoryRunSchema = z.object({
  run_id: z.string().min(1).max(128),
  started_at: z.string().max(64).optional(),
  head_branch: z.string().max(256).optional(),
  head_sha: z.string().max(64).optional(),
  conclusion: z.enum(['success', 'failure', 'cancelled', 'skipped', 'unknown']).optional(),
  results: z.array(TestResultSchema).max(2000),
});
export type HistoryRun = z.infer<typeof HistoryRunSchema>;

export const TestSignalsSchema = z.object({
  test_id: z.string(),
  current_status: z.enum(TEST_STATUSES),
  history_count: z.number().int().nonnegative(),
  fail_count: z.number().int().nonnegative(),
  pass_count: z.number().int().nonnegative(),
  skip_count: z.number().int().nonnegative(),
  pass_rate: z.number().min(0).max(1),
  flip_count: z.number().int().nonnegative(),
  consecutive_failures: z.number().int().nonnegative(),
  first_failure: z.boolean(),
  same_error_ratio: z.number().min(0).max(1).nullable(),
  environment_marker_hits: z.array(z.string()).max(16),
  changed_path_overlap: z.boolean(),
  avg_duration_ms: z.number().nonnegative().nullable(),
  duration_spike: z.boolean(),
});
export type TestSignals = z.infer<typeof TestSignalsSchema>;

export const ClassificationSchema = z.object({
  test_id: z.string(),
  name: z.string().optional(),
  failure_type: z.enum(FAILURE_TYPES),
  confidence: z.number().min(0).max(1),
  reason_codes: z.array(z.enum(REASON_CODES)).max(24),
  evidence: TestSignalsSchema.partial().optional(),
  error_digest: z.string().max(256).optional(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const DetectiveDecisionSchema = z.object({
  decision: z.enum(DECISIONS),
  failure_type: z.enum(FAILURE_TYPES),
  classifications: z.array(ClassificationSchema).max(500),
  confidence: z.number().min(0).max(1),
  reason_codes: z.array(z.enum(REASON_CODES)).max(32),
  summary: z.string().max(500),
  provisional: z.boolean(),
  provider: z.enum(JEV_PROVIDERS).optional(),
  jev_status: z.enum(JEV_STATUSES),
  jev_proposed: z.enum(FAILURE_TYPES).nullable(),
});
export type DetectiveDecision = z.infer<typeof DetectiveDecisionSchema>;

export const SourceErrorSchema = z.object({
  source: z.string(),
  message: z.string().max(500),
});
export type SourceError = z.infer<typeof SourceErrorSchema>;

export const RunOptionsSchema = z.object({
  environment: z.enum(ENVIRONMENTS).default('ci'),
  runner_os: z.string().max(64).optional(),
  runner_arch: z.string().max(64).optional(),
  failing_only: z.boolean().default(true),
  test_id: z.string().max(512).optional(),
  min_confidence: z.number().min(0).max(1).default(0.7),
  low_confidence_policy: z.enum(LOW_CONFIDENCE_POLICIES).default('warn'),
  source_error_policy: z.enum(SOURCE_ERROR_POLICIES).default('warn'),
  max_tests: z.number().int().positive().max(5000).default(500),
  max_tests_to_jev: z.number().int().positive().max(100).default(25),
  history_lookback: z.number().int().positive().max(50).default(20),
  comment_on_github: z.boolean().default(false),
  create_check_run: z.boolean().default(true),
  write_report_artifact: z.boolean().default(false),
  structured_logs: z.boolean().default(false),
  dry_run: z.boolean().default(false),
  decision_mode: z.enum(DECISION_MODES).default('jev'),
});
export type RunOptions = z.infer<typeof RunOptionsSchema>;

export const EvidenceSummarySchema = z.object({
  tests_considered: z.number().int().nonnegative(),
  failing_count: z.number().int().nonnegative(),
  history_runs: z.number().int().nonnegative(),
  history_available: z.boolean(),
  avg_pass_rate: z.number().min(0).max(1).nullable(),
  avg_flip_count: z.number().nonnegative().nullable(),
  environment_marker_tests: z.number().int().nonnegative(),
  changed_path_overlap_tests: z.number().int().nonnegative(),
  adapter_sources: z.array(z.string()).max(16),
});
export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;

export type { TestStatus } from './enums.js';
