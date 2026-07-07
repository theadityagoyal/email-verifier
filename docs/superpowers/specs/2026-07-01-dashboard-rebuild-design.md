# Dashboard Rebuild Design

**Date**: 2026-07-01

## Overview
Rebuild the dashboard with new backend logic for status-to-bucket mapping, trust score, flagged counts, top domains, daily volume, and active job. Redesign the frontend DashboardPage.jsx with a new layout. Apply design system changes across the entire app. Fix pending bugs.

## Backend Changes
**Endpoint**: `GET /dashboard/stats` (in `backend/api/v1/endpoints/dashboard.py`)

### New Logic:
1. **Status Buckets** (based on Email.status):
   - Safe = verified + deliverable + trusted + probably_valid
   - Risky = risky + unconfirmed + uncertain
   - Unsafe = invalid + undeliverable
   - Processing = processing (kept separate, excluded from trust score denominator)
2. **Flag Overrides** (checked in order, using Email model boolean columns):
   - If `disposable == true` → bucket = Unsafe (overrides any status)
   - Else if `(role_based == true OR catch_all == true)` AND current bucket == Safe → downgrade to Risky (if already Risky/Unsafe, stay)
3. **Trust Score**:
   - `trust_score = round((safe_count / (safe_count + risky_count + unsafe_count)) * 100)`
   - Integer percentage; processing excluded from denominator.
4. **Response Fields**:
   - `total_emails`: total count of emails
   - `per_status_counts`: exact counts for each of the 10 statuses (verified, deliverable, trusted, probably_valid, risky, unconfirmed, uncertain, invalid, undeliverable, processing)
   - `bucket_counts`: counts for each bucket (safe, risky, unsafe, processing)
   - `trust_score`: integer percentage (0-100)
   - `flagged_counts`: counts of boolean flags (disposable, role_based, catch_all) from Email table (independent of status)
   - `top_domains`: list of objects with domain and bucket_counts (safe, risky, unsafe, processing) for each domain (return top domains by volume, e.g., top 20-30, to give frontend sufficient data; frontend will filter/sort by % unsafe/risky for worst domains section)
   - `daily_volume`: array of last 7 days, each with date and bucket_counts (using Email.created_at or verified_at for grouping)
   - `active_job`: if any Job with status='processing', return `{ job_id, file_name, progress_percent, processed, total }`; else null

### Implementation Notes:
- Use SQLAlchemy with async session.
- Perform aggregations efficiently (consider grouping in SQL).
- Ensure accurate counts for flags (disposable, role_based, catch_all) from Email table.
- Top domains: get top domains by volume (e.g., top 20-30) from Domain table or Email aggregation, return domain and bucket_counts (safe, risky, unsafe, processing) for each to give frontend sufficient data for worst-domains calculation.
- Daily volume: group by date (last 7 days) and status, then bucket.
- Active job: query Job table for status='processing', order by started_at desc, take first.

## Frontend Redesign
**Component**: `frontend/src/pages/DashboardPage.jsx`

### Structure (top to bottom):
1. **Header**:
   - Text: "Dashboard" + subtitle: "Overview of your email verification activity"
   - No badge
2. **Trust Score Card** (hero, full width):
   - Left: label "Trust score", large percentage number (color: green if >=60%, amber if 40-59%, red if <40%), badge text "safe to send" (if >=60%) or "needs review" (if <60%)
   - Right: circular progress ring (SVG) showing trust_score% fill
   - Bottom: 4-column row: Total emails, Safe, Risky, Unsafe (from bucket_counts)
3. **Action Strip** (3 columns):
   - Left: Active job progress card (if active_job exists: show progress bar with label "Processing: [file_name]" and percent; else: "No active jobs")
   - Middle: Credits left card (if credits/usage tracking exists; else skip)
   - Right: "Verify email" button (primary, indigo)
4. **Do-Column Row** (two columns):
   - Left: **Status Breakdown**
     - List all 10 statuses with count and percentage (of total_emails)
     - Visually grouped: Safe group (verified, deliverable, trusted, probably_valid), divider, Risky group (risky, unconfirmed, uncertain), divider, Unsafe group (invalid, undeliverable), divider, Processing
     - Within each group, sorted descending by count
   - Right: **Verification Volume**
     - Stacked bar chart (last 7 days) using daily_volume data
     - Each day's bar stacked: safe (green), risky (amber), unsafe (red)
     - X-axis: date labels (MM/DD)
5. **Do-Column Row** (two columns):
   - Left: **Flagged Emails**
     - Three mini cards (Disposable, Role-based, Catch-all) with counts from flagged_counts
     - Left-border accent style (color based on flag type)
   - Right: **Needs cleanup — worst domains**
     - Frontend receives top_domains from backend (top domains by volume, e.g., top 20-30), calculates % unsafe/risky for each domain as ((risky+unsafe)/total)*100, selects top 3-5 domains with highest % unsafe/risky, displays each as domain name + "% unsafe/risky" badge

### Implementation Notes:
- Use React Query (tanstack) for data fetching.
- Reuse existing UI components (StatCard, StatusBadge, charts) where applicable; create new components as needed (circular progress, stacked bar chart).
- Ensure responsive layout (grid CSS).

## Design System Changes (apply app-wide)
- **Page background**: `#F8F9FC` (light mode); avoid pure white `#FFFFFF`
- **Cards**:
  - Background: white
  - Border: none
  - Box-shadow: `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`
  - Border-radius: `12px` (increase from current)
- **Icon backgrounds**: tinted (e.g., `#6366F115` for indigo icons), not flat solid
- **Text colors**:
  - Heading: `#0F172A`
  - Body/secondary: `#64748B`
  - Avoid pure black `#000000`
- **Status colors** (consistent app-wide):
  - Safe group: `#10B981` (verified/deliverable), `#059669` (trusted), `#6EE7B7` (probably_valid)
  - Risky group: `#F59E0B` (risky), `#FBBF24` (uncertain), `#FCD34D` (unconfirmed)
  - Unsafe group: `#EF4444` (invalid), `#DC2626` (undeliverable)
  - Processing: `#94A3B8`
- **Checkboxes** (Email List, Domains pages):
  - Border: `#CBD5E1`
  - Accent color: `#6366F1`
  - Visible background/border in light mode

## Bug Fixes
1. **Button.jsx sizeMap temporal dead zone crash**:
   - Fix the temporal dead zone in the sizeMap lookup (likely on EmailListPage/DomainsPage).
2. **TrendsChart .map() missing unique key prop**:
   - Add unique `key` prop to each mapped element in the TrendsChart component.
3. **Bulk Upload flow**:
   - Verify network calls and polling are working correctly (check Network tab in dev tools).

## Open Questions
- None; all specifications confirmed.

## Next Steps
1. Implement backend changes and verify output via console.log.
2. Rebuild frontend DashboardPage.jsx per design.
3. Apply design system changes globally.
4. Fix the three pending bugs.
5. Test in both light and dark modes.