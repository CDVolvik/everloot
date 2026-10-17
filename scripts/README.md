# scripts/

Repository-level tools. Site-specific maintainer scripts are in `web/scripts/`.

| Script | What it does |
|---|---|
| `package-addon.py` | Builds `web/public/downloads/Everloot-<version>.zip` from `addon/`. CI checks the committed zip matches. |
| `check_internal_paths.py` | CI guard: fails when a file names a maintainer's private workspace, secrets folder or personal paths. Its tests are `test_check_internal_paths.py`. |
| `check_dco.py` | CI guard on pull requests: fails when a commit has no `Signed-off-by:` line and prints the fix. Its tests are `test_check_dco.py`. |
| `check_no_ai_credit.py` | CI guard on pull requests: fails when a commit or the PR description credits an AI tool (co-author lines, vendor addresses, "generated with" footers). Its tests are `test_check_no_ai_credit.py`. |
| `generate-snapshot.ps1` | Builds a public knowledge release from a source database (wraps `npm run kb -- snapshot`). |
| `issue-publication-grant.ts` | Maintainer-only: issues a scoped publication grant after an officer's authority was verified out of band. |
| `cleanup-test-data.ps1` | Maintainer-only: runs the launch maintenance preflight or cleanup against production configuration. |

Run the Python ones from the repository root.
