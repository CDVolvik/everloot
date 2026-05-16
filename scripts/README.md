# scripts/

One-off + scheduled scripts. Node.js + TypeScript by default; Python where the ML ecosystem is needed.

**Status**: empty. First inhabitant arrives in `BUILD_PLAN.md` Session 1 (`bnet-cli.ts`).

**Planned scripts**:

| Script | Session | Purpose |
|---|---|---|
| `bnet-cli.ts` | 1 | BNet OAuth + dump character JSON. The "auth works" proof. |
| `seed-mounts.ts` | 3 | Pull from wow.tools + upsert `mount_library` |
| `seed-pets.ts` | 3 | Same for pets |
| `seed-toys.ts` | 3 | Same for toys |
| `seed-transmog.ts` | 3 | Same for transmog appearances |
| `weekly-reset-job.ts` | 10 | Cron-triggered Edge Function; can be tested locally too |

**Conventions**:
- Each script is self-contained, takes `.env.local` via `dotenv`, runnable via `npx tsx scripts/<name>.ts`.
- Output that's gitignored goes in `../scratch/` (e.g., `scratch/volvainz.json`).
- Don't share state via globals — pass everything as args or env.
