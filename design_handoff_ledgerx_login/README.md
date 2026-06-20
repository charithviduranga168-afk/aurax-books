# Handoff: LedgerX ERP — Login Page

## Overview
A modern, animated login page for **LedgerX**, a cloud ERP. The screen is a two‑panel split: a marketing/product panel on the **left** and the **sign‑in form on the right**. The product panel showcases LedgerX's modules ("Tabs"): Sales, Purchasing, Inventory, Manufacturing, Accounting, HR & Payroll, Operations, Point of Sale.

Two design directions are included side by side in the prototype:
- **Variation A — Tab Rail (live):** an app‑window mockup with a vertical module rail and an **auto‑cycling active module** whose numbers count up and whose activity feed updates per module.
- **Variation B — Tab Launcher:** a static 3‑column grid of all 8 module tiles.

Pick **one** to ship (Variation A is the recommended hero — it best demonstrates the modular "Tabs" concept). Both share the same form, palette, and footer.

## About the Design Files
The file in this bundle (`LedgerX Login.dc.html`) is a **design reference created in HTML** — a prototype showing the intended look, motion, and behavior. It is **not production code to copy directly**. It uses an internal authoring runtime (`<x-dc>` / `support.js`, `React.createElement` in a logic class) that you should **not** reproduce.

Your task: **recreate this design in the target codebase's existing environment** (React, Vue, Svelte, etc.) using its established components, styling approach, and conventions. If no front end exists yet, implement it in the framework that best fits the project (a React + plain CSS / CSS‑modules / Tailwind setup is a natural fit).

The prototype renders **both variations side by side on a gray canvas** for comparison — that gray wrapper and the "Variation A/B" labels are presentation scaffolding, **not** part of the actual screen. The real screen is a single full‑viewport login (one white card, edge to edge).

## Fidelity
**High‑fidelity (hifi).** Final colors, typography, spacing, copy, and interactions are specified below. Recreate the UI pixel‑accurately using the codebase's libraries. Exact hex values, sizes, and easings are given in **Design Tokens**.

---

## Screens / Views

### Screen: Login (single view)
- **Purpose:** Authenticate an existing user; secondary CTA to sign up; Google SSO.
- **Overall layout:** Full‑viewport. A single white card fills the screen. Internally a horizontal flex row, height `760px` in the mock (in production make it `100vh`, min‑height ~`720px`):
  - **Left panel** — flexible width (`flex:1`), the product/marketing area.
  - **Right panel** — fixed width `540px`, the form.
  - Below the row: a full‑width **footer** bar.
- **Font:** Plus Jakarta Sans (weights 400/500/600/700/800), antialiased. Fallback `sans-serif`.

#### Right panel — Sign‑in form
Vertically centered column, max content width `392px`, horizontal padding `64px`.

Top to bottom:
1. **Logo** — `assets/ledgerx-logo.png`, height `62px`, auto width, `margin-bottom:30px`.
2. **Heading** `Welcome back` — 31px / 800 / color `#1d1a36` / letter‑spacing `-.02em`.
3. **Subtext** `Sign in to access your workspace` — 15px / `#85839c`, `margin-bottom:32px`.
4. **Email field**
   - Label `Email address` — 13px / 600 / `#46435f`, `margin-bottom:8px`.
   - Input: height `52px`, radius `13px`, border `1.5px solid #e7e6f1`, background `#fbfbfe`, left padding `46px` (room for icon), font 14.5px, text color `#2c2945`.
   - Leading **mail icon** absolutely positioned left `16px`, vertically centered, stroke `#9c9ab5`.
   - Placeholder/sample value: `you@company.com`.
   - **Focus:** border `#8b5cf6`, background `#ffffff`, box‑shadow `0 0 0 4px rgba(139,92,246,.12)`.
5. **Password field** — same input styling, left + right padding `46px`.
   - Leading **lock icon** (left).
   - Trailing **eye / eye‑off toggle button** (right `8px`, 34×34, transparent) that toggles `type` between `password` and `text`. Sample value `ledgerx2025`.
6. **Row:** `Remember me` checkbox (left) + `Forgot password?` link (right), `margin-bottom:26px`.
   - Checkbox: 19×19, radius `6px`. **On:** `linear-gradient(135deg,#7c5cf6,#a855f7)` with white check glyph. **Off:** white with `1.5px solid #cdc9e0`. Default = **on**.
   - "Remember me" label 13.5px / `#5a5872`. Link 13.5px / 600 / `#7c5cf6`, hover `#6d28d9`.
7. **Primary button** `Sign in →` — full width, height `54px`, radius `13px`, gradient `linear-gradient(105deg,#5b59f2 0%,#8b5cf6 52%,#a855f7 100%)`, white 15.5px / 700, shadow `0 12px 26px rgba(124,92,246,.34)`.
   - **Hover:** `translateY(-2px)`, shadow `0 16px 34px rgba(124,92,246,.46)`.
   - **Sheen:** a `::after` light streak sweeps across every ~3.4s (see Interactions).
8. **Divider** `or continue with` — centered label 12.5px `#9b99ad` between two 1px rules `#ebeaf3`, `margin:24px 0`.
9. **Google button** `Continue with Google` — full width, height `50px`, radius `12px`, white bg, border `1.5px solid #e9e8f2`, 14.5px / 600 `#3d3b54`, multicolor Google "G" icon. Hover: border `#cdc9e8`, bg `#fafaff`, `translateY(-1px)`. **(Note: Microsoft SSO was intentionally removed — Google only.)**
10. **Footer link** `Don't have an account? Sign up` — centered 14px `#85839c`; "Sign up" 700 / `#7c5cf6`.

#### Left panel — Variation A (Tab Rail, recommended)
- Background: `linear-gradient(155deg,#efedfc 0%,#e8ecfb 55%,#f1ecfa 100%)`, padding `54px 56px`, `overflow:hidden`, content vertically centered with `gap:28px`.
- **Decorative background (behind everything, non‑interactive):**
  - A **dotted pattern**: `radial-gradient(circle, rgba(124,92,246,.13) 1.3px, transparent 1.3px)` at `background-size:24px 24px`, faded with a radial mask `radial-gradient(120% 90% at 35% 45%, #000 40%, transparent 78%)`.
  - Two soft **blurred orbs** (purple top‑right ~300px, blue bottom‑left ~200px) gently pulsing (`lx-glow`).
  - Two tiny **drifting dots** and a **floating cloud** SVG (top‑right) bobbing (`lx-floatB`).
- **Headline:** `Everything in one workspace` — 34px / 800 / `#211d3d`; the word "one workspace" uses gradient text `linear-gradient(120deg,#6d5cf6,#a855f7)` (clip to text).
- **App window** (white card, radius `18px`, shadow `0 30px 70px rgba(70,55,140,.2)`), a horizontal flex of:
  - **Module rail** — fixed `206px`, bg `#faf9fe`, right border `1px #f0eff7`, padding `14px 12px`.
    - Small LedgerX logo at top (height `30px`).
    - 8 **rail items** (one per module), each a row: 26×26 rounded icon chip + label (12.5px). 
    - **Active item:** background `linear-gradient(100deg,#efe9fd,#eae6fc)`, inset ring `inset 0 0 0 1px rgba(124,92,246,.18)`, icon chip turns white, label 700 / `#5b3ec9`. Inactive label 600 / `#6f6d88`, inactive chip uses the module's tint color.
    - **Clickable:** clicking a rail item makes it the active module. Hover (inactive): `translateX(3px)`.
  - **Active module panel** (`flex:1`) — padding `18px 20px`:
    - **Header:** 32×32 tinted icon chip + module name (15px/800) + `Overview · <period>` sub (10.5px `#9794ad`); right side a pill `<period> ▾` (e.g. "This Month", "Today", "Live").
    - **Two stat cards** (flex, gap 11px): each bordered `1px #f0eff7`, radius 11px, padding 12px — label (10px `#9794ad`), big animated value (17px/800 `#1d1a36`) + green delta (10px/700 `#16a34a`), and a mini area **sparkline** tinted to the module color.
    - **Activity feed** card: header `Recent activity` + a pulsing green "● Live" badge, then **3 rows**. Each row: colored dot + primary label (12px/700) + sub (10.5px `#9794ad`) on the left, value on the right (12px/800, colored — green for inflow, red `#ef5e7a` for outflow, module color for neutral).

#### Left panel — Variation B (Tab Launcher, alternative)
- Background `linear-gradient(150deg,#ece8fb,#e6ecfc 50%,#f0e9fb)`, same dotted pattern + orbs + cloud.
- Headline `Your ERP, tab by tab` (33px/800; "tab by tab" gradient text).
- **3‑column grid** (`gap:12px`, max‑width `486px`) of 8 module tiles:
  - First tile (**Sales**) is the highlighted one: gradient `linear-gradient(135deg,#5b59f2,#8b5cf6)`, white text, white‑ish icon chip, pulsing green status dot.
  - Other 7 tiles: translucent white `rgba(255,255,255,.92)` w/ blur, border `1px rgba(255,255,255,.8)`, radius 15px, shadow `0 12px 30px rgba(70,55,140,.1)`. Each: 32×32 tinted icon chip, name (13.5px/800 `#1d1a36`), one stat line (11px `#86839c`).
  - Tiles **pop in** staggered on load (`lx-pop`, 60ms steps) and **lift** on hover (`translateY(-5px)` + deeper shadow).

#### Footer (both variations)
Full‑width bar, top border `1px #f0eff7` (A) / `#ecebf5` (B), padding `18px 64px` (A) / `18px 56px` (B), space‑between:
- **Left:** `© 2025 LedgerX` · then links `Privacy` `Terms` `Support` — all 12.5px `#8a889e`, hover `#7c5cf6`, separated from the copyright by a 3px dot `#cdcad9`.
- **Right:** `Powered by` (11.5px `#a3a0b5`) + **Aurax.dev** wordmark (13px/800 `#2c2945`, with ".dev" in `#7c5cf6`) + `by Aurax (Pvt) Ltd` (11px `#bdbacb`). The whole thing is a link; hover drops opacity to `.78`. **No icon/box** — wordmark only.

---

## Module data (for Variation A cycling + B tiles)
Each module has a name, accent color, icon‑chip tint, period label, two stats (label, target value, format, delta), and 3 activity rows.

| Module | Accent | Chip tint | Period | Stat 1 | Stat 2 |
|---|---|---|---|---|---|
| Sales | `#7c5cf6` | `#efe9fd` | This Month | Orders **1,428** (+8.4%) | Revenue **$248,600** (+12.5%) |
| Purchasing | `#2f6df6` | `#e7eefe` | This Month | Open POs **62** (+4) | Spend MTD **$84,200** (+9.1%) |
| Inventory | `#16a34a` | `#e7f6ec` | Live | SKUs tracked **1,284** (+38) | Stock value **$512,800** (+6.2%) |
| Manufacturing | `#e08a2b` | `#fdeede` | Today | Work orders **8** (+2) | Units produced **1,940** (+15.0%) |
| Accounting | `#5b59f2` | `#e9e9fd` | This Month | Net profit **$164,350** (+18.7%) | Cash balance **$128,250** (+16.3%) |
| HR & Payroll | `#ec5f8a` | `#fdeaf2` | This Month | Employees **214** (+6) | Payroll MTD **$86,500** (+3.4%) |
| Operations | `#0f9b8e` | `#d9f3f1` | Today | Tasks done **142** (+24) | On‑time rate **99.4%** (+0.3%) |
| Point of Sale | `#d6489a` | `#fce7f1` | Today | Today's sales **$9,840** (+22.0%) | Transactions **318** (+11.4%) |

Activity rows (left label / sub / right value / value color):
- **Sales:** Order #10428 / Acme Corp / +$1,240 / green · Order #10427 / Globex Ltd / +$865 / green · Order #10426 / Initech / +$2,310 / green
- **Purchasing:** PO‑2287 / Globex · Raw steel / $6,400 / blue · PO‑2286 / Umbrella · Packaging / $1,980 / blue · PO‑2285 / Stark · Components / $12,750 / blue
- **Inventory:** Widget A / Inbound · WH‑1 / +120 / green · Gadget B / Picked · Order #10428 / −32 / red · Module C / Inbound · WH‑2 / +540 / green
- **Manufacturing:** WO‑553 / Assembly line 2 / 78% / orange · WO‑552 / Paint shop / 45% / orange · WO‑551 / Packaging / 92% / green
- **Accounting:** JE‑1187 / Sales revenue / $12,400 Cr / green · JE‑1186 / Supplier payment / $6,400 Dr / red · JE‑1185 / Payroll accrual / $22,800 Dr / red
- **HR & Payroll:** June payroll / 214 employees / Processed / green · New hire / A. Patel · Sales / Onboarding / pink · Leave request / M. Chen / Approved / green
- **Operations:** Shipment #882 / Route 4 · Dispatched / On time / green · Task #4471 / QA check / Done / green · Delivery #771 / Route 2 / In transit / teal
- **Point of Sale:** Sale #4471 / Card · Register 1 / $42.50 / green · Sale #4470 / Cash · Register 3 / $18.00 / green · Sale #4469 / Card · Register 2 / $126.40 / green

> These figures are **illustrative sample data** for the marketing panel. In production, either keep them as static showcase content or wire them to a real demo/summary endpoint — they are not user‑specific and should not block login.

---

## Interactions & Behavior
- **Show/hide password:** eye button toggles input `type` (password ⇄ text). Independent per variation in the mock; in production it's one field.
- **Remember me:** toggles a boolean; default **on**.
- **Form submit:** `Sign in` validates email + password, then authenticates (wire to your auth). Email format validation; password required. Show inline error + error state on fields on failure; disable/show spinner on the button while pending.
- **Google SSO:** `Continue with Google` starts OAuth.
- **Primary button sheen:** a `::after` highlight strip animates left→right on a ~3.4s loop (`lx-sheen`, keyframes: translateX(-140%)→translateX(320%), skewX(-18deg), ease‑in‑out, infinite). Purely decorative.
- **Variation A auto‑cycle:** active module advances `(active + 1) % 8` on a timer (**4200ms**). Clicking a rail item jumps to it **and resets the timer**.
- **Count‑up animation:** when the active module changes, both stat values animate **from 0 → target** over **1100ms** using **easeOutCubic** (`1 - (1 - t)^3`), driven by `requestAnimationFrame`. Format per stat: integer (thousands‑separated), USD (`$` + thousands), or percent (one decimal).
- **Panel/feed entrance:** on module switch, the panel fades/translates in (`lx-swap`, ~0.45s) and the 3 feed rows slide in from the right (`lx-rowIn`, staggered ~130ms).
- **Ambient motion:** orbs pulse (`lx-glow` 8–11s), cloud bobs (`lx-floatB` 7–8s), small dots drift (`lx-drift` 9–11s). Entrance fades on load (`lx-fadeUp`, `lx-fadeL`).
- **Reduced motion:** honor `prefers-reduced-motion` — drop the auto‑cycle/count‑up to final values and disable ambient loops.
- **Hover states:** rail items, module tiles, both buttons, and all links have the hover treatments noted above.

## State Management
- `showPassword: boolean`
- `rememberMe: boolean` (default true)
- `email: string`, `password: string`
- `submitting: boolean`, `error: string | null`
- **Variation A only:** `activeModule: number (0–7)`, plus an animation progress value `p: 0→1` (transient, via rAF — does not need to live in app state). A timer ref for the auto‑cycle; clear on unmount and on manual jump.

## Design Tokens
**Brand / accent**
- Primary gradient: `#5b59f2 → #8b5cf6 → #a855f7`
- Primary purple `#7c5cf6`; deep `#5b3ec9` / `#6d28d9`; violet `#5b59f2`
- Gradient‑text: `linear-gradient(120deg,#6d5cf6,#a855f7)`

**Module accents:** Sales `#7c5cf6` · Purchasing `#2f6df6` · Inventory `#16a34a` · Manufacturing `#e08a2b` · Accounting `#5b59f2` · HR `#ec5f8a` · Operations `#0f9b8e` · POS `#d6489a`

**Text:** headings `#1d1a36` / `#211d3d` / `#2c2945`; body `#46435f` / `#5a5872`; muted `#85839c` / `#9794ad` / `#8a889e`; faint `#a3a0b5` / `#bdbacb`

**Status:** positive `#16a34a` (dot `#22c55e`); negative `#ef5e7a`

**Surfaces / borders:** white `#ffffff`; off‑white `#fbfbfe` / `#faf9fe` / `#fcfcff`; borders `#e7e6f1` / `#f0eff7` / `#e9e8f2` / `#ebeaf3`; chip tints `#efe9fd #e7eefe #e7f6ec #fdeede #e9e9fd #fdeaf2 #d9f3f1 #fce7f1`

**Left‑panel gradients:** A `linear-gradient(155deg,#efedfc,#e8ecfb 55%,#f1ecfa)` · B `linear-gradient(150deg,#ece8fb,#e6ecfc 50%,#f0e9fb)`

**Radii:** inputs/buttons `12–13px`; cards `11px`; window `18px`; tiles `15px`; icon chips `8–9px`; pills `999px`.

**Shadows:** button `0 12px 26px rgba(124,92,246,.34)` (hover `0 16px 34px rgba(124,92,246,.46)`); window `0 30px 70px rgba(70,55,140,.2)`; tile `0 12px 30px rgba(70,55,140,.1)`; card frame `0 18px 50px rgba(60,50,120,.14)`.

**Typography scale (px):** 34 / 31 / 26 (headings) · 17 / 15.5 / 15 (emphasis) · 14.5 / 14 / 13.5 / 13 / 12.5 (body & labels) · 11 / 10.5 / 10 (micro). Weights 800 (headings/values), 700 (labels/links), 600 (inputs/secondary), 500/400 (body). Heading letter‑spacing `-.02em`.

**Spacing:** panel padding `54px 56px` / `50px 52px`; form padding `0 64px`; footer padding `18px 56–64px`; common gaps 9–14px; field height `50–52px`; primary button `53–54px`.

**Motion:** count‑up 1100ms easeOutCubic · auto‑cycle 4200ms · sheen 3400ms · entrance fades .5–.8s · ambient loops 7–11s.

## Assets
- **`assets/ledgerx-logo.png`** — the LedgerX logo (transparent PNG), included in this bundle. Use the real brand SVG/asset from your repo if available; sizes used: 62px (form), 30px (rail).
- **Icons** are simple line icons (mail, lock, eye/eye‑off, check, shield, cloud, bolt, and one per module). Recreate with your icon library (Lucide/Heroicons are close matches) — don't copy the inline SVG path strings; match the visual.
- **Google "G"** — use the official multicolor Google mark from your SSO/button library.
- **Cloud + sparkline + area chart** are decorative inline SVGs; reproduce with your charting/illustration approach or simple SVGs.
- **Font:** Plus Jakarta Sans (Google Fonts).

## Files
- `LedgerX Login.dc.html` — the full interactive design reference (both variations). Open in a browser to see motion, hover states, and the auto‑cycling module panel. Treat as **reference only** (see "About the Design Files").
