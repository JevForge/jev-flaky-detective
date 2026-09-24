import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadEvidence } from './collectors/load.js';
import { loadJevConfig } from './collectors/config.js';
import { listChangedPaths } from './collectors/changed-paths.js';
import {
  createOctokitHistoryClient,
  fetchGithubTestHistory,
} from './collectors/github-history.js';
import { createJevProvider, credentialEnvName } from './jev/factory.js';
import { emitOutputs } from './github/outputs.js';
import { MARKER } from './executors/comment.js';
import { parseProviderId, runDetective } from './run.js';
import type { LowConfidencePolicy, SourceErrorPolicy } from './schemas/enums.js';
import { LOW_CONFIDENCE_POLICIES, SOURCE_ERROR_POLICIES, ENVIRONMENTS } from './schemas/enums.js';
import { assertModelId } from './utils/endpoint.js';

const LOG_PREFIX = '[JEV Flaky Detective]';

function failMessage(message: string): string {
  return message.startsWith(LOG_PREFIX) ? message : `${LOG_PREFIX} ${message}`;
}

function boolInput(name: string, fallback = false): boolean {
  const raw = core.getInput(name);
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function numInput(name: string, fallback: number): number {
  const raw = core.getInput(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(failMessage(`${name} must be a number`));
  return value;
}

function enumInput<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = (core.getInput(name) || fallback).trim() as T;
  if (!allowed.includes(raw)) {
    throw new Error(failMessage(`${name} must be one of ${allowed.join(', ')}`));
  }
  return raw;
}

async function main(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const config = loadJevConfig(workspace, core.getInput('jev_config_path') || '.jev/config.yml');

  const providerId = parseProviderId(core.getInput('jev_provider') || config.jev_provider || 'vercel-ai-gateway');
  const trustRepoEndpoint = boolInput('trust_repo_jev_endpoint', false);
  const endpointFromInput = core.getInput('jev_endpoint') || undefined;
  const endpoint =
    endpointFromInput || (trustRepoEndpoint ? config.jev_endpoint : undefined);
  const model = core.getInput('jev_model') || config.jev_model || undefined;
  if (model && !assertModelId(model)) {
    throw new Error(failMessage('jev_model has an invalid format'));
  }

  const loaded = loadEvidence({
    workspace,
    resultsInline: core.getInput('results') || undefined,
    resultsPath: core.getInput('results_path') || undefined,
    historyInline: core.getInput('history') || undefined,
    historyPath: core.getInput('history_path') || undefined,
    junitPath: core.getInput('junit_path') || undefined,
    jestPath: core.getInput('jest_path') || undefined,
    playwrightPath: core.getInput('playwright_path') || undefined,
    vitestPath: core.getInput('vitest_path') || undefined,
    mochaPath: core.getInput('mocha_path') || undefined,
    changedPathsRaw: core.getInput('changed_paths') || undefined,
  });

  const token = core.getInput('github_token') || process.env.GITHUB_TOKEN || '';
  const octokit = token ? github.getOctokit(token) : null;

  let changedPaths = loaded.changedPaths;
  const reasonCodes = [...loaded.reasonCodes];
  if (changedPaths.length === 0 && github.context.eventName === 'pull_request' && octokit) {
    try {
      const pullNumber = Number(github.context.payload.pull_request?.number);
      changedPaths = await listChangedPaths(
        {
          async listPullFiles(owner, repo, pull) {
            const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
              owner,
              repo,
              pull_number: pull,
              per_page: 100,
            });
            return files.map(file => file.filename);
          },
        },
        github.context.repo.owner,
        github.context.repo.repo,
        pullNumber,
      );
      if (changedPaths.length > 0) reasonCodes.push('CHANGED_PATHS_FROM_PR');
      else reasonCodes.push('NO_CHANGED_PATHS');
    } catch (error) {
      reasonCodes.push('CHANGED_PATHS_UNKNOWN');
      core.warning(
        failMessage(
          `Could not list pull request files: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  } else if (changedPaths.length === 0) {
    reasonCodes.push('NO_CHANGED_PATHS');
  }

  let history = loaded.history;
  if (boolInput('fetch_github_history', false)) {
    if (!octokit) {
      loaded.sourceErrors.push({ source: 'github-history', message: 'github_token is required' });
    } else {
      try {
        const focus = loaded.current
          .filter(test => test.status === 'failed' || test.status === 'timedOut')
          .map(test => test.test_id);
        const fetched = await fetchGithubTestHistory({
          client: createOctokitHistoryClient(octokit as never),
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          branch: core.getInput('history_branch') || github.context.ref.replace(/^refs\/heads\//, '') || undefined,
          workflowName: core.getInput('workflow_name') || undefined,
          lookback: numInput('history_lookback', 20),
          focusTestIds: focus,
        });
        history = [...fetched.runs, ...history];
        for (const code of fetched.reasonCodes) {
          if (!reasonCodes.includes(code)) reasonCodes.push(code);
        }
      } catch (error) {
        loaded.sourceErrors.push({
          source: 'github-history',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const apiKey = process.env[credentialEnvName(providerId)];
  const provider = createJevProvider(providerId, {
    apiKey,
    endpoint,
    model,
    timeoutMs: numInput('timeout_ms', 45000),
  });

  const commentClient =
    octokit && (github.context.payload.pull_request || github.context.payload.issue)
      ? {
          async upsertComment(body: string) {
            const issueNumber =
              github.context.payload.pull_request?.number ?? github.context.payload.issue?.number;
            if (!issueNumber) return 'posted' as const;
            const { data: comments } = await octokit.rest.issues.listComments({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
              per_page: 100,
            });
            const existing = comments.find(comment => comment.body?.includes(MARKER));
            if (existing) {
              await octokit.rest.issues.updateComment({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                comment_id: existing.id,
                body,
              });
              return 'updated' as const;
            }
            await octokit.rest.issues.createComment({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
              body,
            });
            return 'posted' as const;
          },
        }
      : null;

  const checkRunClient = octokit
    ? {
        async createCheckRun(input: {
          name: string;
          headSha: string;
          conclusion: 'success' | 'neutral' | 'failure';
          title: string;
          summary: string;
        }) {
          await octokit.rest.checks.create({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            name: input.name,
            head_sha: input.headSha,
            status: 'completed',
            conclusion: input.conclusion,
            output: { title: input.title, summary: input.summary },
          });
        },
      }
    : null;

  const result = await runDetective({
    workspace,
    current: loaded.current,
    history,
    changedPaths,
    sourceErrors: loaded.sourceErrors,
    adapterSources: loaded.adapterSources,
    baseReasonCodes: reasonCodes,
    truncated: loaded.truncated,
    provider,
    providerId,
    commentClient,
    checkRunClient,
    headSha: github.context.sha,
    options: {
      environment: enumInput('environment', ENVIRONMENTS, 'ci'),
      runner_os: core.getInput('runner_os') || undefined,
      runner_arch: core.getInput('runner_arch') || undefined,
      failing_only: boolInput('failing_only', true),
      test_id: core.getInput('test_id') || undefined,
      min_confidence:
        numInput('min_confidence', config.min_confidence ?? 0.7),
      low_confidence_policy: enumInput(
        'low_confidence_policy',
        LOW_CONFIDENCE_POLICIES,
        (config.low_confidence_policy as LowConfidencePolicy) || 'warn',
      ),
      source_error_policy: enumInput('source_error_policy', SOURCE_ERROR_POLICIES, 'warn' as SourceErrorPolicy),
      max_tests: numInput('max_tests', 500),
      max_tests_to_jev: numInput('max_tests_to_jev', 25),
      history_lookback: numInput('history_lookback', 20),
      comment_on_github: boolInput('comment_on_github', false),
      create_check_run: boolInput('create_check_run', true),
      write_report_artifact: boolInput('write_report_artifact', false),
      structured_logs: boolInput('structured_logs', false),
      dry_run: boolInput('dry_run', false),
    },
  });

  emitOutputs({
    writer: { setOutput: (name, value) => core.setOutput(name, value) },
    decision: result.outcome.decision,
    evidence: result.evidence,
    actionStatus: result.actionStatus,
    needsReview: result.outcome.needs_review,
    checkStatus: result.checkStatus,
    reportMarkdownFile: result.artifactPaths.markdownPath ?? '',
    reportJsonFile: result.artifactPaths.jsonPath ?? '',
    provider: providerId,
    workspace,
  });

  if (boolInput('structured_logs', false)) {
    core.info(
      JSON.stringify({
        event: 'jev-flaky-detective',
        decision: result.outcome.decision.decision,
        failure_type: result.outcome.decision.failure_type,
        confidence: result.outcome.decision.confidence,
        provisional: result.outcome.decision.provisional,
        provider: providerId,
        tests: result.evidence.tests_considered,
      }),
    );
  }

  await core.summary
    .addHeading('JEV Flaky Detective')
    .addRaw(result.outcome.decision.summary)
    .write();

  if (result.actionStatus === 'fail') {
    core.setFailed(failMessage(result.outcome.decision.summary));
  } else if (result.actionStatus === 'warn') {
    core.warning(failMessage(result.outcome.decision.summary));
  }
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(failMessage(message));
});
