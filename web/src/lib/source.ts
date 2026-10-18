/** Everloot's public repository. The AGPL asks the site to offer the source it runs. */
export const REPO_URL = "https://github.com/CDVolvik/everloot";

const SHA = /^[0-9a-f]{7,40}$/i;

/** The deployed commit when Vercel names a well-formed one, otherwise nothing. */
export function deployedSha(sha = process.env.VERCEL_GIT_COMMIT_SHA): string | undefined {
  return sha && SHA.test(sha) ? sha : undefined;
}

/** The deployed commit's tree when Vercel names one, otherwise the repository. */
export function sourceUrl(sha = process.env.VERCEL_GIT_COMMIT_SHA): string {
  const known = deployedSha(sha);
  return known ? `${REPO_URL}/tree/${known}` : REPO_URL;
}
