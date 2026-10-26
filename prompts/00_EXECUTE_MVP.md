# Copy/paste to Agent Mode — phase-driven execution

You are the principal engineer for CEKFAKTA. Read AGENTS.md, AI.md, TASKS.md, docs/01_PRD.md, docs/02_ARCHITECTURE.md, docs/03_VALIDATION_POLICY.md, docs/05_API_CONTRACT.md, docs/07_SECURITY_PRIVACY.md and docs/TEAM.md.

1. AUDIT existing starter (do not pretend Gemini/DB/admin are already implemented). Get `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` working; report actual results.
2. Choose earliest unblocked P0 issue from TASKS.md. Implement only one feature slice at a time with tests and clear failure behavior.
3. First priority: bootstrap repo & dev flow, then DB/RLS with admin auth, then approved evidence providers and safe URL fetching, then Gemini JSON analysis from evidence, then draft reports/admin publish and public report list.
4. Do not introduce unsupported true/hoax verdicts. No evidence => unverified, no automatic public publishing. No direct `fetch(userUrl)`.
5. After each slice, update TASKS.md and CHANGELOG.md, list actual commands/results, risks, next task, and owner.
6. If a third-party secret or Supabase project is needed, implement environment wiring with placeholders; proceed on offline tests/mocks in clearly marked dev-only mode, report the blocked live integration. NEVER invent credentials.

Start now with the earliest unblocked issue, not a large speculative rewrite.
