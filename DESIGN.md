# DESIGN.md — CekFakta Dark Intelligence UI

> Status: approved implementation direction for the CekFakta MVP. Owner: frontend / UI, with review by project manager.
> Priority: follow product requirements and actual data contracts; this document governs presentation and UX, not fact-check verdict logic.

## 0. Agent instructions (read first)

Implement a **dark-first, evidence-led civic-tech interface** inspired by the investigative clarity of [Chainabuse](https://chainabuse.com/) (report discovery, prominent search, structured reports), **not a pixel-perfect clone**. Other inspiration: [VirusTotal](https://www.virustotal.com/) for readable technical results, [Linear](https://linear.app/) for restrained dark UI, [GitHub Security](https://github.com/security) for trustworthy security-data presentation. These are inspiration links, not claims about exact current styling.

Read `AGENTS.md`, `AI.md`, `docs/01_PRD.md`, `docs/03_VALIDATION_POLICY.md`, `docs/05_API_CONTRACT.md`, `docs/08_UI_SCREENS.md`, and relevant code **before making changes**. This spec supersedes the *visual palette and layout* in `docs/08_UI_SCREENS.md` and the existing light-theme CSS; it does not supersede that document's route and behavioral requirements. Do not alter business logic, API contracts, authentication, database schemas, or verdict criteria merely to implement the redesign.

**Implementation strategy:** first inspect components and routes; adapt shared tokens/layout; build home + check form; then report list + detail; finally admin shell. Implement real empty/error/loading states. For absent backend functionality, show honest UI (`Belum tersedia` / `Belum dapat diverifikasi`) rather than fake successful checks. Avoid placeholder numbers masquerading as live statistics.

## 1. Product and visual direction

**Brand:** CekFakta — *Periksa klaim. Baca bukti. Ambil keputusan.*

**Personality:** credible, deliberate, modern, public-interest, investigation-oriented. Like a serious trust-and-safety tool, **not** a crypto exchange, cyberpunk landing page, news portal, or AI chatbot demo.

**North-star screen:** a large and functional claim-check input above a clear recent-report table. Users should understand what to do in under five seconds.

**Differentiation from Chainabuse:** Chainabuse centers crypto scams and reporting; CekFakta centers *news claims* in Education, Politics and Nature Conservation, with evidence and editorial review. Use analogous information architecture, but original brand, copy, colors, spacing, component design and layout.

## 2. Design principles

1. **Evidence before verdict.** A result must lead with status and explain what evidence supports it; source citations, publisher, dates, and limitations are easy to inspect.
2. **Dark, not black-on-black.** Layer near-black canvas, raised navy/charcoal surfaces and quiet borders. Restrained cyan is for actions and focus, not every card.
3. **Dense where useful, calm elsewhere.** Structured report rows over a wall of giant cards. Strong typography; ample reading width for long-form analysis.
4. **No false certainty.** Clear distinction between `Hoaks`, `Valid`, `Belum dapat diverifikasi`, and verification/review workflow status. A loading state is never a verdict.
5. **Accessible and responsive.** Semantic controls, visible keyboard focus, sufficiently high contrast, responsive layouts and motion reduction.
6. **Indonesian-first.** Natural short Indonesian labels; avoid invented English jargon in public UI.

## 3. Design tokens

Use CSS custom properties (or Tailwind theme variables, if already configured). Exact primary base palette:

```css
:root {
  color-scheme: dark;
  --bg: #090D15;
  --surface-1: #101723;
  --surface-2: #151E2C;
  --surface-3: #1B2738;
  --border: #2A3648;
  --border-strong: #41526A;
  --text: #F1F5F9;
  --text-secondary: #BAC6D6;
  --text-muted: #93A4B8;
  --accent: #57C9DC;
  --accent-hover: #85E0ED;
  --accent-on: #06151C;
  --success: #63D4A2;
  --success-bg: #10362D;
  --danger: #FF8895;
  --danger-bg: #411F2B;
  --warning: #F6C76A;
  --warning-bg: #3D301A;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --content-width: 1200px;
}
```

Use accent for primary button, active navigation and focus states. `Hoaks` / `Valid` / `Belum dapat diverifikasi` labels must always include **text + icon**, not color alone. Maintain WCAG AA text contrast (4.5:1 for normal text), 3:1 for major controls/non-text indicators. Check final combinations in code; do not assume token names guarantee contrast.

Typography: `Inter` or `Geist` if locally available/installed in project; otherwise use `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Avoid fetching a font solely for aesthetics. Display: 48–60px desktop / 34–40px mobile; H1 interior 34–40px desktop / 28–32px mobile; body 15–16px; secondary 13–14px; line-height 1.5–1.7 for articles. Numbers, timestamps and URLs may use a subdued monospace face, selectively.

Spacing based on 4/8px rhythm; common gaps 8, 12, 16, 24, 32, 48, 64. Layout max-width 1200px, content padding 24px desktop / 16px mobile; readable prose max-width 72ch. Cards border 1px and subtle elevation; avoid oversized blur shadows. Rounded corners 12–18px; controls 10–12px.

## 4. Information architecture & navigation

Public routes (no login):
- `/` — landing + dominant check CTA, trust explanation and recent published reports.
- `/check` — URL/text input, category selection, analysis state, results when available.
- `/reports` — searchable, filterable **published** report list.
- `/reports/[id]` — report detail with evidence and editorial status.

Admin routes (login mandatory):
- `/admin/login` — minimal login page; no fake authentication.
- `/admin` — protected dashboard: review queue, create/edit/publish/retract/delete. Not publicly linkable as a privileged dashboard; footer login link is okay if requested by team.

Global desktop navbar: logotype (left) / **Cek Berita**, **Laporan**, **Cara Kerja** (middle or right) / primary CTA **Periksa Berita**. `Cara Kerja` may anchor to a home section rather than creating a new route. Mobile: compact brand + menu toggle; visible CTA is preferred. Sticky header with dark translucent surface only if it doesn't impair legibility.

## 5. Screens and detailed layout

### A. Landing `/`

Above fold:
- slim eyebrow label, e.g. `VERIFIKASI INFORMASI PUBLIK` with a small intentional signal mark;
- hero heading: **`Jangan hanya baca beritanya. Periksa faktanya.`** Emphasize only one phrase with accent, not gradient text;
- supporting line: `Periksa klaim tentang pendidikan, politik, dan konservasi alam berdasarkan sumber yang dapat ditelusuri.`;
- a prominent input container with two tabs `Tautan berita` and `Teks berita`, category dropdown, clear submit `Periksa Sekarang`;
- note: `Hasil AI bersifat bantuan analisis, bukan keputusan final. Laporan publik ditinjau admin.`;
- adjacent compact side panel (desktop, optional) showing **how validation works**: `Input → Cari sumber → Analisis bukti → Tinjauan laporan`; on mobile stack below form.

Below fold:
- recent published reports as clean rows/table with status, category, title, publication date, evidence link; if none, honest empty state (no fake metrics);
- category quick access: `Pendidikan`, `Politik`, `Konservasi Alam` (three restrained cards/chips);
- `Bagaimana CekFakta bekerja` 3-step explanation and editorial disclaimer;
- slim footer: project context, privacy/disclaimer, sources are credited.

### B. Check `/check`

Desktop: centered layout at max 860px; optional right rail for explainer. Input mode segmented control (`Tautan / Teks`); URL input or large textarea (300–600 character-friendly), category select, privacy and responsible-input hint; validation near fields. Example placeholder should be explicitly fictional and NOT become demo evidence.

Progress UI shows honest step states: `Memproses input`, `Mencari referensi`, `Menganalisis bukti`, `Menyiapkan laporan`. Do not fake progression based on timers if the backend doesn't provide progress. Prefer a single indeterminate loading indicator plus descriptive text otherwise.

Result: verdict icon + full text label, explanation in plain Indonesian, claim summary, evidence/source list with URL, publisher and date where known, caveats, last checked timestamp, and explicit `Menunggu tinjauan admin` if report is unpublished. `Belum dapat diverifikasi` is a first-class state. On API failure, show retry path instead of pretending result exists.

### C. Reports `/reports`

Desktop: headline + explanation; compact search row; filters (status, topic, date if supported); results as dense but readable rows or table (title, status, category, published/updated date); 10–20 items per page if pagination exists. Show only published reports; do not fabricate counts. Mobile: cards with same critical metadata. Empty-results includes `Hapus filter` action; no-data includes explanation, not misleading samples.

### D. Report detail `/reports/[id]`

Breadcrumb `Laporan / Kategori / Judul`; prominent claim, verdict badge, editorial verification/review tag (only if true), last updated. Two-column desktop main content (claim + analysis + sources) and side panel (metadata, category, reported source, related items if real). Mobile: single column.

Source list: title, publisher, article URL and published/checked date where available. Use visible external-link affordances and `rel="noopener noreferrer"` for new tabs. Add a small `Tentang hasil ini` block explaining uncertainty and that similar phrases don't establish truth. For corrections or retractions display clear banner.

### E. Admin `/admin/login` and `/admin`

Login: compact centered panel, labeled email/password fields, show/hide password, proper error message, disabled submit while pending; no public signup.

Dashboard: dark application shell with left sidebar on desktop, top navigation on mobile. Review queue table with filtering and clear workflow `Draft → Review → Published` (and retracted). Detail/edit screen permits editing evidence and reason before approval. Require confirmation for destructive delete/retract actions. Every admin operation must be authorized server-side; visuals are not access control.

## 6. Component library

Implement or refactor reusable pieces only as needed:
- `SiteHeader`, `SiteFooter`, `Button`, `Input`, `TextArea`, `Select`, `SegmentedControl`, `StatusBadge`, `TopicBadge`, `ReportRow`, `ReportFilters`, `SourceList`, `EvidencePanel`, `EmptyState`, `ErrorState`, `LoadingState`, `AdminShell`.
- One primary CTA per view. Secondary actions outlined/quiet.
- Button height >= 44px for touch; focus ring at least 2px visible; disabled states remain legible.
- Badges pair icon, short label and accessible text.
- Tables show labels/header associations; horizontal overflow handled deliberately on narrow screens; avoid microscopic font.

## 7. Microcopy and status language

Use these exact public verdict labels consistently:
- `HOAX` (or `Hoaks` in user-visible language; prefer **Hoaks**) — **only** when credible evidence supports it.
- `Valid` — only when independently supported by reliable matching evidence.
- `Belum dapat diverifikasi` — when references are absent, inconsistent or insufficient.

**Separate editorial statuses**: `Draft`, `Menunggu tinjauan`, `Dipublikasikan`, `Ditarik`. Do not equate `Dipublikasikan` with `Valid`. Do not present LLM confidence as a factual probability unless calibrated and validated.

Example neutral UI messages:
- Missing source: `Kami belum menemukan referensi yang cukup untuk menyimpulkan klaim ini.`
- API down: `Pemeriksaan belum berhasil. Silakan coba lagi nanti.`
- Private draft: `Hasil pemeriksaan sedang menunggu peninjauan admin.`
- Empty reports: `Belum ada laporan yang dipublikasikan.`

## 8. Interaction and responsiveness

### Revisi pengguna — 24 Oktober 2026

Pengguna meminta animasi komet dan penyempurnaan gerak. Hero boleh menampilkan tiga komet cyan tipis dalam satu rangkaian di bawah empat detik, tanpa pengulangan terus-menerus. Pada mobile jumlah komet dikurangi; `prefers-reduced-motion` menonaktifkan komet dan animasi masuk. Lapisan dekorasi tidak boleh menangkap pointer atau masuk accessibility tree. Efek hover kartu/tombol tetap ringan. Revisi ini mengizinkan dekorasi tersebut secara khusus; batas desain lainnya tetap berlaku.

Breakpoints as guidance: mobile <640px, tablet 640–1023px, desktop >=1024px. Test at 360px, 390px, 768px, 1280px and 1440px. Never require horizontal page scroll. Header remains navigable with keyboard and touch. Mobile buttons full width where appropriate; desktop max-width input remains readable.

Animations: 120–200ms subtle fade/hover, no page-scroll theatrical sequences, parallax, floating blobs or perpetual glowing orbs. Respect `prefers-reduced-motion`. Skeleton or spinner only when waiting on real data.

## 9. Strict anti-AI-slop rules

**Do not:**
- use purple/blue gradient blobs, neon grids, randomly glowing cards, massive glassmorphism, decorative charts, giant hero stock photos, emojis as primary iconography, generic ‘AI-powered future’ copy;
- invent review counts, user testimonials, media logos, live metrics, report data, sources or screenshots;
- build 12 generic marketing sections instead of functional check/report paths;
- add a fake `98% accurate` score or false claims of independent fact verification;
- install a heavy component framework or animation library without clear need;
- replace existing routing/data logic with hardcoded demo data;
- silently change design constraints or admin access requirements.

**Do:** use a small consistent icon set (e.g. Lucide if already available), constrained palette, compelling typographic hierarchy, trustworthy source visibility, clear content density, and testable UI.

## 10. Implementation acceptance checklist

- [ ] Dark tokens consistently applied across all existing routes; no accidental white flash / inaccessible white-on-white elements.
- [ ] Navbar, main check CTA, report discovery work with keyboard and on mobile.
- [ ] Home visual hierarchy puts checking a claim above decorative marketing.
- [ ] Verdict is readable without relying on badge color; unverifiable is not styled as valid/hoax.
- [ ] Existing `/check` input workflow and API integration are preserved (no invented verdicts).
- [ ] `/reports` only renders real published data or honest empty state; report detail handles missing IDs.
- [ ] Admin placeholder remains explicitly marked until auth/CRUD are really implemented.
- [ ] Empty, loading, error, rate-limited, no-evidence, unauthorized, and retracted states are handled where relevant.
- [ ] Contrast, focus visibility, heading hierarchy, labeling and responsive layout checked.
- [ ] `npm run lint`, available tests, typecheck/build run; report actual outputs and any blocker.
- [ ] Final agent report includes changed files, before/after summary, actual test outputs, and remaining work.

## 11. Codex execution prompt

> Read `DESIGN.md`, `AGENTS.md`, `docs/08_UI_SCREENS.md`, and the current frontend code. Implement the CekFakta dark UI defined in `DESIGN.md` using GPT-6 Medium. Start with existing shared CSS/tokens, layout/navigation, `/`, and `/check`; only then address `/reports`, report detail and admin shells. Respect all existing business logic and no-fabricated-verdict rules. Do not redesign the product or create needless components. If an endpoint does not yet deliver data, show accurate unavailable/empty UI instead of fake data. Run available lint, tests and build, review the diff for AI slop, and report exactly what you changed and what still requires backend implementation.

## 12. Reference links

- Chainabuse (report discovery and structured public reports): https://chainabuse.com/
- Chainabuse report flow: https://chainabuse.com/report
- VirusTotal (evidence-oriented analysis presentation): https://www.virustotal.com/
- Linear (restrained typography, layout and dark product UI): https://linear.app/
- GitHub Security (developer-facing security information structure): https://github.com/security

All visual references are **inspiration, not UI assets to copy**; use original CekFakta assets and styling.
