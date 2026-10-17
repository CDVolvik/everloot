#!/usr/bin/env bash
# Run once when the repository goes public: gh must be signed in with admin rights on the repo.
set -euo pipefail
repo=CDVolvik/everloot
gh label create "good first issue" --repo "$repo" --force --color 7057ff --description "A small, well-described first contribution"
gh label create "help wanted"      --repo "$repo" --force --color 008672 --description "Open for anyone to pick up"
gh label create "data"             --repo "$repo" --force --color fbca04 --description "Wrong or missing data, data sources, the data policy"
gh label create "addon"            --repo "$repo" --force --color 1d76db --description "The in-game Lua addon"
gh label create "web"              --repo "$repo" --force --color 0e8a16 --description "everloot.app"
gh label create "lore"             --repo "$repo" --force --color c5def5 --description "The lore archive and the wiki importer"
gh label create "kb"               --repo "$repo" --force --color bfd4f2 --description "The knowledge base and MCP server"
gh label create "companion"        --repo "$repo" --force --color d4c5f9 --description "The desktop companion"
gh label create "idea"             --repo "$repo" --force --color f9d0c4 --description "A feature idea from the issue form"
