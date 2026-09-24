import { toPosix } from '../utils/paths.js';

export interface PullFilesClient {
  listPullFiles(owner: string, repo: string, pullNumber: number): Promise<string[]>;
}

export async function listChangedPaths(
  client: PullFilesClient,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string[]> {
  if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
    throw new Error('pull request number is invalid');
  }
  const files = await client.listPullFiles(owner, repo, pullNumber);
  return [...new Set(files.map(toPosix).filter(Boolean))].slice(0, 2000);
}
