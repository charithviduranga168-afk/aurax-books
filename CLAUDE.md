# LedgerX — Project Context for Claude Code

## What this project is
Full ERP system for Sri Lankan businesses. Product name: **LedgerX**.  
Stack: **React + TypeScript + Vite + Supabase**.  
Repo: `https://github.com/charithviduranga168-afk/aurax-books`  
Owner: Sahan Gunasekara (life.aurax@gmail.com)

---

## Critical rules (ALWAYS follow, no exceptions)

1. **Commit + push after every single change** — never wait to be asked. `git add ... && git commit && git push origin main`
2. **Update CLAUDE.md after EVERY single change** — new features, bug fixes, design decisions, UI changes, architectural changes, anything discussed in chat. Do it immediately in the same commit as the code change. This is the living hand-off document between ALL chat sessions — it must always reflect the true current state so a new chat can pick up exactly where the last one left off. Never batch or defer this.
3. **Never ask permission** for anything in this project — user said "everything is allowed, don't ask again"
4. **Never commit secrets** — PAT token, PayHere credentials must stay out of git
5. Use **PowerShell heredoc** for git commits: `git commit -m @' ... '@` (not bash `cat <<EOF`)

---

## Architecture

- **Non-router SPA** — `App.tsx` holds `page` state + `userType` + `moduleMode`
- **Module mode**: when `page !== 'dashboard'`, `moduleMode = true`, topbar shows ← back button + breadcrumb. Sidebar does NOT hide — it stays in icon-only state.
- **Navigation**: `nav(p: Page)` sets page + moduleMode; `exitModule()` goes back to dashboard
- **Sidebar**: always folded (icon-only, no labels) by default — `sidebarOpen` starts `false`, hamburger in topbar can expand it. Never uses `module-hidden`. White background, section labels uppercase gray, active pill = `#ede9fe` bg + `#7c3aed` text
- **Icons**: Dual system — `ICON_PATHS` dict in App.tsx + `NavIcon` for sidebar navigation icons (SVG stroke, size 15); `lucide-react` for all in-page icons (empty states, KPI cards, search inputs, action buttons, status badges, contact chips). All emojis have been removed from the codebase.
- **CSS vars**: `--brand: #7c3aed`, `--bg: #f7f8fc`, `--sidebar-w: 216px`
- **Font**: Plus Jakarta Sans (login page), Inter (rest of app)

---

## Page/module list → file map

| Page key | File |
|----------|------|
| dashboard | src/pages/Dashboard.tsx |
| customers | src/pages/Customers.tsx ✓ list→detail |
| salesorders | src/pages/SalesOrders.tsx ✓ list→detail |
| invoices | src/pages/Invoices.tsx ✓ list→detail |
| receipts | src/pages/Receipts.tsx ✓ list→detail |
| ecommerce | src/pages/ECommerce.tsx ✓ list→detail |
| suppliers | src/pages/Suppliers.tsx ✓ list→detail |
| purchaseorders | src/pages/PurchaseOrders.tsx ✓ list→detail |
| bills | src/pages/Bills.tsx ✓ list→detail |
| payments | src/pages/Payments.tsx ✓ list→detail |
| grn | src/pages/GRN.tsx ✓ list→detail |
| products | src/pages/Products.tsx ✓ list→detail |
| categories | src/pages/Categories.tsx ✓ list→detail |
| inventory | src/pages/Inventory.tsx ✓ list→detail (click product → movements) |
| journal | src/pages/JournalEntries.tsx ✓ list→detail |
| hr | src/pages/HR.tsx ✓ list→detail (employee detail in Employees tab) |
| mrp | src/pages/MRP.tsx ✓ list→detail (click PO → BOM explosion) |
| stockadjustments | src/pages/StockAdjustments.tsx ✓ list→detail (click row → before/after/reason detail) |
| coa | src/pages/ChartOfAccounts.tsx ✓ list→detail (click account → journal entry lines) |
| expenses | src/pages/Expenses.tsx ✓ list→detail (click expense → details, KPIs, PDF) |
| qc | src/pages/QualityControl.tsx ✓ list→detail (click inspection → pass-fail bar, KPIs, details) |
| projects | src/pages/Projects.tsx ✓ list→detail (click project → kanban board, budget bar, tasks) |
| manufacturing | src/pages/Manufacturing.tsx (production orders — may be done) |
| pos | src/pages/PointOfSale.tsx |
| bankreconciliation | src/pages/BankReconciliation.tsx |
| reports | src/pages/Reports.tsx |
| analytics | src/pages/Analytics.tsx |
| settings | src/pages/Settings.tsx |
| userroles | src/pages/UserRoles.tsx |
| subscription | src/pages/Subscription.tsx |

---

## Pending work

### List→detail pattern — ALL STEPS COMPLETE ✓

All 21 modules now have list→detail navigation. No pending steps remain.

### Other potential tasks:
- Customer portal improvements
- Reports/Analytics enhancements
- Settings page
- Any new modules the user requests

---

## List→detail pattern (how every module is built)

Every module follows this exact pattern — reference `src/pages/Customers.tsx` as the gold standard:

```tsx
// State
const [view, setView] = useState<'list'|'detail'>('list');
const [selected, setSelected] = useState<T|null>(null);

// Shared components (inline in each file)
function Avatar({ name, size=36 }) { /* colored initials circle */ }
function BackBtn({ label, onClick }) { /* ← arrow button */ }
const fmt = (n: number) => 'Rs. ' + (n||0).toLocaleString('en-LK', {minimumFractionDigits:2});
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

// List: rows have cursor:pointer, onClick sets selected+view
// Detail: BackBtn + hero card + 4 KPI cards + tabs for related data
```

---

## Key design decisions

- **Sidebar accordion** — `sidebarOpen` defaults to `true` (full width with labels). Groups (Sales, Purchasing, etc.) are collapsible with a chevron header; all collapsed by default. Clicking a group header expands/collapses it. Navigating to a page auto-expands that group. Active group label turns brand purple. **Sidebar hides (`module-hidden`) when inside any module** — full page width for module content, back button + breadcrumb in topbar. Hamburger toggles full sidebar vs icon-only when on dashboard. Group headers: 11px, `#9ca3af` gray (brand when active). Sub-items: 13px, icon size 14.
- **Back button is in the TOPBAR** (App.tsx), not in individual page files — so all modules get it automatically
- **In-page BackBtn** only for internal navigation (e.g. list→detail within a module)
- **No React Router** — all navigation is state-based in App.tsx
- **Supabase RLS**: all queries filter by `user_id` from `supabase.auth.getUser()`
- **Currency**: Sri Lankan Rupees (Rs.), formatted with `en-LK` locale
- **All 21 modules** have Odoo-style list→detail: click row → hero card + 4 KPI cards + related data. Reference: `src/pages/Customers.tsx`

---

## Login page

File: `src/pages/Login.tsx`  
Design: "Tab Rail" variation from design handoff — light lavender left panel with animated mini ERP sidebar cycling through 8 modules, white right panel with form.  
Font: Plus Jakarta Sans (imported via Google Fonts in a `<style>` tag inside the component)  
Key colors: button gradient `linear-gradient(105deg,#5b59f2,#8b5cf6,#a855f7)`

---

## Logo

File: `public/logo.png`  
Type: Stacked logo — gradient "S" icon on top, "LedgerX" text below  
Sizes used:
- Sidebar open: 52px height
- Sidebar closed: 30px height  
- Login right panel: 72px height
- Mini ERP (login left): 30px height
- Splash/loading: 80px height
- Customer portal (white): 36px height + `filter: brightness(0) invert(1)`

---

## Supabase tables (main ones)

customers, suppliers, sales_orders, so_lines, invoices, invoice_lines, receipts,
purchase_orders, po_lines, bills, bill_lines, payments, grns (grn_headers + grn_lines),
products, categories, inventory_adjustments, chart_of_accounts, journal_entries,
journal_entry_lines, expenses, employees, payroll_runs, payslips, leave_requests,
production_orders, bom_headers, bom_lines, company_settings, ecom_settings,
ecom_products, store_orders, quality_checks, projects, project_tasks

---

## Security (never commit these)

- Supabase PAT token — Management API only, stored locally, never in git
- PayHere Merchant ID + Secret — hardcoded in PointOfSale.tsx, do not expose or commit separately
