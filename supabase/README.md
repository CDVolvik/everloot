# supabase/

Backend — Postgres + Auth + Edge Functions + pgvector (for AI RAG, post-Phase-1).

**Status**: empty. Scaffolded in `BUILD_PLAN.md` Session 2 (schema v1).

**Setup**:
```bash
npm install -g supabase
supabase init
supabase login
supabase link --project-ref <everloot-dev-ref>
```

**Layout (target)**:
```
supabase/
├── config.toml
├── migrations/
│   ├── 001_users_and_characters.sql
│   ├── 002_collection_libraries.sql
│   └── ...
├── functions/
│   ├── sync-character/
│   ├── get-missing-mounts/
│   ├── send-push/
│   └── chat-with-ai/
└── seed.sql  (test data only — real seed data comes from scripts/)
```

**Key decisions**:
- Row-Level Security on every user-owned table. Reference characters by their `bnet_id`, not `name+realm` (names change).
- Collection sync uses upsert with `synced_at` timestamp — staleness is detectable, not destructive.
- pgvector tables don't exist until AI module (Session 11).
