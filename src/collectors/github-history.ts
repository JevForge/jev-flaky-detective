import type { HistoryRun, TestResult } from '../schemas/detective.js';
import type { ReasonCode } from '../schemas/enums.js';

export interface GithubHistoryClient {
  listWorkflowRuns(params: {
    owner: string;
    repo: string;
    branch?: string;
    workflowName?: string;
    perPage: number;
  }): Promise<Array<{ id: number; head_branch?: string | null; head_sha?: string | null; conclusion?: string | null; created_at?: string; name?: string | null }>>;
  listJobsForRun(params: {
    owner: string;
    repo: string;
    runId: number;
  }): Promise<Array<{ name?: string; conclusion?: string | null; steps?: Array<{ name?: string; conclusion?: string | null }> }>>;
}

function mapConclusion(value: string | null | undefined): HistoryRun['conclusion'] {
  if (value === 'success') return 'success';
  if (value === 'failure' || value === 'timed_out') return 'failure';
  if (value === 'cancelled') return 'cancelled';
  if (value === 'skipped') return 'skipped';
  return 'unknown';
}

function jobToResult(name: string, conclusion: string | null | undefined): TestResult {
  const status =
    conclusion === 'success'
      ? 'passed'
      : conclusion === 'failure' || conclusion === 'timed_out'
        ? 'failed'
        : conclusion === 'skipped' || conclusion === 'cancelled'
          ? 'skipped'
          : 'unknown';
  return {
    test_id: name.slice(0, 512),
    name: name.slice(0, 1024),
    status,
    source: 'github-actions',
    error_message: status === 'failed' ? `GitHub job/step concluded ${conclusion}` : undefined,
  };
}

export async function fetchGithubTestHistory(input: {
  client: GithubHistoryClient;
  owner: string;
  repo: string;
  branch?: string;
  workflowName?: string;
  lookback: number;
  focusTestIds: string[];
}): Promise<{ runs: HistoryRun[]; reasonCodes: ReasonCode[] }> {
  const reasonCodes: ReasonCode[] = [];
  const runsMeta = await input.client.listWorkflowRuns({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    workflowName: input.workflowName,
    perPage: Math.min(50, Math.max(1, input.lookback)),
  });

  const runs: HistoryRun[] = [];
  for (const run of runsMeta.slice(0, input.lookback)) {
    const jobs = await input.client.listJobsForRun({
      owner: input.owner,
      repo: input.repo,
      runId: run.id,
    });
    const results: TestResult[] = [];
    for (const job of jobs) {
      if (job.name) results.push(jobToResult(job.name, job.conclusion));
      for (const step of job.steps ?? []) {
        if (!step.name) continue;
        // Prefer step-level when names look like tests; always keep as evidence
        results.push(jobToResult(`${job.name ?? 'job'} › ${step.name}`, step.conclusion));
      }
    }

    // When focus ids exist, keep matching rows; otherwise keep all
    const filtered =
      input.focusTestIds.length === 0
        ? results
        : results.filter(result =>
            input.focusTestIds.some(
              id =>
                result.test_id === id ||
                result.name === id ||
                (result.name && id.includes(result.name)) ||
                (result.name && result.name.includes(id)),
            ),
          );

    runs.push({
      run_id: String(run.id),
      started_at: run.created_at,
      head_branch: run.head_branch ?? undefined,
      head_sha: run.head_sha ?? undefined,
      conclusion: mapConclusion(run.conclusion),
      results: filtered.slice(0, 500),
    });
  }

  if (runs.length > 0) reasonCodes.push('GITHUB_HISTORY_FETCHED', 'HISTORY_AVAILABLE');
  else reasonCodes.push('HISTORY_EMPTY');
  return { runs, reasonCodes };
}

export function createOctokitHistoryClient(octokit: {
  rest: {
    actions: {
      listWorkflowRunsForRepo: (params: Record<string, unknown>) => Promise<{ data: { workflow_runs: Array<Record<string, unknown>> } }>;
      listJobsForWorkflowRun: (params: Record<string, unknown>) => Promise<{ data: { jobs: Array<Record<string, unknown>> } }>;
    };
  };
}): GithubHistoryClient {
  return {
    async listWorkflowRuns({ owner, repo, branch, workflowName, perPage }) {
      const response = await octokit.rest.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch,
        per_page: perPage,
        exclude_pull_requests: true,
      });
      let runs = response.data.workflow_runs.map(run => ({
        id: Number(run.id),
        head_branch: (run.head_branch as string | null | undefined) ?? null,
        head_sha: (run.head_sha as string | null | undefined) ?? null,
        conclusion: (run.conclusion as string | null | undefined) ?? null,
        created_at: run.created_at as string | undefined,
        name: (run.name as string | null | undefined) ?? null,
      }));
      if (workflowName) {
        runs = runs.filter(run => run.name === workflowName);
      }
      return runs;
    },
    async listJobsForRun({ owner, repo, runId }) {
      const response = await octokit.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
        per_page: 100,
      });
      return response.data.jobs.map(job => ({
        name: job.name as string | undefined,
        conclusion: (job.conclusion as string | null | undefined) ?? null,
        steps: Array.isArray(job.steps)
          ? (job.steps as Array<Record<string, unknown>>).map(step => ({
              name: step.name as string | undefined,
              conclusion: (step.conclusion as string | null | undefined) ?? null,
            }))
          : [],
      }));
    },
  };
}
