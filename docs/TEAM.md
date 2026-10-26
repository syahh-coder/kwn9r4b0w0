# Team responsibilities & collaboration

| Nama | Role | Scope | Primary issues |
|---|---|---|---|
| **Yudha** | UI/UX | Figma, responsive screens, accessibility, design tokens | UX-01 |
| **Erge** | Backend | API, Supabase DB+RLS, admin auth, Gemini integration | BE-01/02/03, AI-01 |
| **Ukas** | Project Manager + integrator | GitHub repo, milestone, integration, testing, deploy/demo | SETUP-01, INT-01, QA-01 |
| **Joshev** | Data/Fetch | Source research & permissions, safe URL extraction, evidence retrieval | DATA-01/02/03, AI-01 |
| **Bg FedoIllahi** | Frontend + backup | Implement Figma with reusable components, admin UI, integration | FE-01/02 |

## GitHub rules
- `main`: integration only after successful checks/review.
- `feature/UX-01-figma`, `feature/BE-01-db`, etc.
- One issue = one PR; owner responsible; another member reviews.
- Never create two divergent production websites; fallback version stays a branch or reproducible snapshot.

## Coordination meeting template
- Yesterday / done / blocker / next / dependency.
- Each member updates TASKS.md and evidence; Ukas resolves conflicts.

## Dependencies
UI design → FE. DB/auth → admin. Data sources → evidence retrieval → AI → report. QA after integrated slice.
