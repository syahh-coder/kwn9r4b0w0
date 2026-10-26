# AI Context Map — CekFakta

## Purpose
"Cek klaim berita berdasarkan sumber bukti, tampilkan report, beri kontrol moderasi admin" — project tugas Kewarganegaraan. Dua fitur publik, satu back-office.

## Agent startup
Read `AGENTS.md` first, then `TASKS.md` and `START_HERE.md`. The docs describe required design. All missing functionality is explicitly TODO, NOT secretly implemented.

## System map
- App UI/routes: `src/app/`
- API contracts: `docs/05_API_CONTRACT.md`
- Evidence/verdict rules: `docs/03_VALIDATION_POLICY.md`
- Database & RLS migration: `supabase/migrations/0001_schema.sql`
- Member ownership: `docs/TEAM.md`
- Execution prompt: `prompts/00_EXECUTE_MVP.md`

## Dependency chain
`UI foundation → DB+Auth → safe fetch/search → Gemini evidence synthesis → reports/admin publish → tests & deploy`.

## Definition of Done
Features MUST be demonstrated through automated checks and at least one acceptance walkthrough; honest error states; correct access; no false verdict; no exposed secrets.

## First instruction to agent
Open `prompts/00_EXECUTE_MVP.md` and start with SETUP-01. Show changes and tests each phase.
