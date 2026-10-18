/** Everloot's public repository. The AGPL asks the site to offer the source it runs. */
export const REPO_URL = "https://github.com/Everloot/everloot";

/** The deployed commit's tree when Vercel names one, otherwise the repository. */
export function sourceUrl(sha = process.env.VERCEL_GIT_COMMIT_SHA): string {
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? `${REPO_URL}/tree/${sha}` : REPO_URL;
}
