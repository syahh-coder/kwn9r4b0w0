# UI/UX spec (owner: Yudha; frontend: Bg FedoIllahi)

## Pages
1. `/` — hero, why fact-check, category examples, CTA Check, Report.
2. `/check` — toggle Text/URL, category dropdown, help hints, progressive loading, clear result states.
3. `/reports` — published-only list and empty state; filter verdict and category, search.
4. `/reports/[id]` — claim, verdict, sources with publish dates, admin-reviewed badge, timestamp, correction notice.
5. `/admin/login` — true Supabase Auth login, form labels, error & lockout. Current scaffold = placeholder without auth form.
6. `/admin` — protected queue, create, edit, approve, retract, delete; current scaffold deliberately NOT implemented.

## Visual
Neutral trustworthy civic-tech design, NOT alarmist. Hoax label uses accessible color + icon/text; yellow/neutral unverified. Red/green never only indicator. Display source and timestamp prominently.

## Required states
Empty reports, invalid input, pending, evidence not found, network/AI quota error, verification incomplete, admin unauthorized, report retracted.

## Figma deliverables
Desktop & mobile mockups for all screens, component tokens, interactions, loading and validation/error states, handoff notes & screenshot in PR.
