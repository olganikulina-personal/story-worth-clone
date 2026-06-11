# UI/UX Redesign — Locking Model, Write Page Polish, Archive Improvements

**Date:** 2026-06-11  
**Status:** Approved

---

## Problem

The current UI has two issues:

1. **Broken locking UX.** After clicking "Send to family", the story textarea immediately becomes read-only and grayed out. There is no way to edit it again. This burned grandma when a test submission was made and the box locked — she stopped trusting the page altogether.
2. **Utilitarian feel.** The color theme is stark black-and-white, which doesn't match the warm, personal nature of a family memoir.

---

## Decisions Made

| Question | Decision |
|---|---|
| When does a story lock? | On the next weekly cron run — i.e., when the next question is sent, the previous story locks. |
| What happens visually after first submit? | Soft "received but still editable" state: sepia/amber border + "Saved — you can keep editing until Monday" message. |
| How does grandma get back to edit? | The email magic link still works all week. No extra affordance needed. |
| Archive: full stories or truncated previews? | Full stories, keep scrolling. No click-in required. |
| Color theme? | Sepia / parchment — warm, memoir-like. |

---

## Scope

Three areas of change:

1. **Locking model** — backend + API change
2. **Write page** — UI state redesign
3. **Archive page** — in-progress banner + sepia theme

---

## 1. Locking Model

### Current behavior
`POST /api/stories/submit` inserts the story and immediately sets `access_tokens.is_used = true`. The write page reads `is_used` on load and passes `readOnly={true}` to `EntryForm` if the token is used.

### New behavior
`is_used` no longer means "locked." It means "a story has been submitted for this token." A story is editable as long as no *newer* access token exists for the same grandma (i.e., until the next question is sent).

**Concrete change:** The write page (`app/write/[token]/page.tsx`) determines `readOnly` by checking whether a *newer* access token exists, not by checking `is_used` on the current token.

```
readOnly = there exists an access_token row with a created_at > current token's created_at
```

This requires no schema changes. `is_used` continues to mean "story has been submitted" (used to decide whether to show existing content).

**Submit API (`POST /api/stories/submit`):**
- If `is_used === false`: insert new story row, set `is_used = true`. (Same as today.)
- If `is_used === true` and story is not locked: update existing story row's `content`. Do not re-send the family notification email on edits — only on first submit.
- If `is_used === true` and story is locked (newer token exists): return `409 Conflict` with a message "This story has been locked." The write page already prevents submission in this state, but the API must guard against direct calls.

**Cron job (`GET /api/cron/send-prompt`):** No changes needed. The act of creating a new access token naturally locks the previous story under the new read logic.

---

## 2. Write Page (`app/write/[token]/page.tsx` + `components/EntryForm.tsx`)

### States

The page has three states:

| State | Condition | UI |
|---|---|---|
| **Fresh** | `is_used === false` | Empty textarea, "Send to family" button |
| **Saved, editable** | `is_used === true`, not locked | Sepia-bordered textarea with existing content, "Save changes" button, "✓ Saved — you can keep editing until Monday" message |
| **Locked** | `is_used === true`, locked (newer token exists) | Plain `<p>` with story text (no textarea), "This story is locked and saved to the family archive." message, "← Back to family archive" link |

### Visual design

- **Page background:** `#faf7f2` (parchment)
- **Question label:** small uppercase, `#a08060`
- **Question text:** `font-size: 1.1rem`, `font-weight: 600`, `color: #111`
- **Textarea (editable):** `border: 2px solid #a0845c`, `background: #fff`
- **Textarea (fresh, unsaved):** `border: 2px solid #111`, `background: #fff` — keep the current stark border to signal "write here"
- **Saved message:** `color: #7c5c35`, `font-size: 0.75rem` — "✓ Saved — you can keep editing until Monday"
- **Button (save/submit):** `background: #a0845c`, `color: #fff`
- **Locked story text:** plain `<p>`, `color: #374151`, `line-height: 1.7`
- **Locked message:** `color: #a08060`, `font-size: 0.75rem`
- **Back link:** `color: #7c5c35`, underline — only shown in locked state

### EntryForm props change

Add a new `isLocked` prop (distinct from `readOnly` / `internalReadOnly`):

- `isLocked = false` → textarea rendered, editable or saved-editable
- `isLocked = true` → `<p>` rendered instead of textarea, back link shown

The server component passes `isLocked` based on the newer-token check. `EntryForm` no longer needs to manage `internalReadOnly` state for the locked case — that's purely server-determined. It still manages a local `saved` boolean to switch between "fresh" and "saved, editable" states after a successful submit within the same session.

---

## 3. Archive Page (`app/page.tsx` + `components/HistoryFeed.tsx`)

### In-progress banner

The archive page fetches the most recent `access_tokens` row (by `created_at`). If no newer token exists after it, the current week is still open. Show a banner at the top of the feed in two sub-states:

- **Story submitted:** `is_used === true` on the most recent token → banner reads "Story saved — editable until Monday"
- **No story yet:** `is_used === false` on the most recent token → banner reads "No story yet this week"

```
[ This week · in progress                                    ]
[ What was your favourite game to play as a child...?        ]
[ Story saved — editable until Monday                        ]
```

If the most recent token is locked (a newer one exists), no banner is shown — the archive is just the list.

The banner is not a link — it's purely informational for family members browsing the archive.

### Full stories (unchanged)

Stories render in full, newest first. No truncation. Keep scrolling to read.

### Visual design

- **Page background:** `#faf7f2`
- **Page heading:** e.g. "Grandma's Stories" — `font-weight: 600`, `color: #111`
- **In-progress banner:** `border: 2px solid #a0845c`, `background: #f5ede0`, label `color: #6b4f2a`
- **Story date:** small uppercase, `color: #a08060`
- **Story question heading:** `font-weight: 600`, `color: #111`
- **Story body text:** `color: #374151`, `line-height: 1.7`
- **Divider between stories:** `border-bottom: 1px solid #e8dcc8`

---

## What Is Not Changing

- No new routes or pages
- No changes to the cron job logic
- No changes to `PasscodeLock`
- No changes to the email notification content
- No changes to the Supabase schema
- The magic link email flow is unchanged

---

## Color Token Reference

| Token | Hex | Usage |
|---|---|---|
| `parchment-bg` | `#faf7f2` | Page background |
| `parchment-card` | `#f5ede0` | Banner / card background |
| `parchment-border` | `#e8dcc8` | Dividers |
| `sepia-border` | `#a0845c` | Active textarea border, banner border |
| `sepia-dark` | `#7c5c35` | Links, saved message text |
| `sepia-label` | `#a08060` | Date labels, locked message |
| `sepia-banner-text` | `#6b4f2a` | Banner label text |
| `body-text` | `#374151` | Story body paragraphs |
| `heading-text` | `#111` | Question headings |
