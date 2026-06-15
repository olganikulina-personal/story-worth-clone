# Submit Page Autosave Design

## Summary

Add draft autosave to the weekly story write page so in-progress text persists without triggering the family notification email. The autosaved content should always live in the existing `stories` table as the canonical text for the current week's prompt. The existing `access_tokens.is_used` flag should continue to mean "the first explicit submit already happened" and remain the email notification boundary.

## Goals

- Prevent story drafts from being lost on refresh, accidental navigation, or reopening the weekly link later.
- Keep the current explicit submit action as the only trigger for the first notification email.
- Preserve the current behavior where later submits update the same story without sending another email.
- Avoid introducing a separate draft service, draft table, or draft management UI.

## Non-Goals

- Multiple drafts per week or per user.
- Draft history, versioning, or manual recovery flows.
- Cross-week retention of drafts after the next prompt has been sent.
- Any change to story locking semantics after a newer weekly prompt exists.

## Current State

Today the write page only loads `stories.content` when `access_tokens.is_used = true`. The first explicit submit inserts a row into `stories`, flips `access_tokens.is_used` to `true`, and sends the email. Later submits update the existing story row without sending email again.

This means there is currently no persisted state for a draft before the first submit.

## Recommended Approach

Use the existing `stories` table as the single canonical record for the current week's text, whether the story is only a draft or has already been submitted. Autosave creates or updates the `stories` row for the current `question_id`. Explicit submit keeps its role as the email boundary by checking and flipping `access_tokens.is_used`.

This keeps the data model small:

- `stories.content` = latest saved text for the weekly story
- `access_tokens.is_used = false` = family notification has not been sent yet
- `access_tokens.is_used = true` = notification has already been sent

No separate draft state is stored outside the existing story row.

## Data Model Changes

### `stories`

Add constraints and metadata so `stories` can safely serve as the weekly draft record:

- Add a unique constraint on `question_id` so there is only one story row per weekly prompt.
- Add `updated_at timestamptz not null default now()` to support autosave updates and future observability.

### `access_tokens`

No schema change is required. `is_used` keeps its existing meaning:

- `false`: explicit submit has never completed for this token/question
- `true`: the first submit already happened, and the notification email must not be sent again

`is_used` should no longer be treated as the indicator that story content exists.

## Page Load Behavior

The write page should always try to load an existing story row for the token's `question_id`, regardless of `is_used`.

Behavior:

- If a story row exists, populate the textarea with `stories.content`.
- If no story row exists, start with an empty textarea.
- If the question is locked because a newer token exists, show the existing locked story if present and keep the form read-only as it is today.

There is no need for a "draft restored" message. A reopened draft should feel like normal editing continuity.

## Autosave UX

Keep the current textarea and explicit submit button.

Add a lightweight autosave status message near the form with these states:

- `Saving draft...` while a debounced autosave request is in flight
- `Draft saved` after a successful autosave, then hide after a short delay
- A concise error message if autosave fails

Autosave behavior:

- Trigger on textarea changes after a debounce window.
- Only save non-empty trimmed content.
- Avoid firing redundant saves when the content has not changed since the last successful save.
- Do not show persistent success UI once the short confirmation window has passed.

The explicit submit button remains visible before and after first submit to avoid confusing UI changes.

## Submit Button Behavior

The submit button remains the user's explicit "send/share" action, but its persistence responsibility changes slightly.

Behavior:

- Before first submit:
  - Ensure the latest content is saved.
  - If `is_used = false`, send the family notification email and flip `is_used` to `true`.
- After first submit:
  - Ensure the latest content is saved.
  - Do not send email again because `is_used = true`.

This preserves the current product behavior: first submit sends the notification, later submits only update the same weekly story.

## API Design

Split autosave and submit into separate routes so their responsibilities stay explicit.

### `POST /api/stories/draft`

Purpose:

- Validate the token.
- Reject locked or invalid requests using the same rules as submit.
- Upsert the `stories` row for the current `question_id`.
- Never send email.
- Never modify `access_tokens.is_used`.

Request body:

- `token`
- `content`

Response:

- success or error status only; no special draft entity is needed

### `POST /api/stories/submit`

Purpose:

- Validate the token.
- Reject locked or invalid requests using the same rules as draft save.
- Upsert the latest `stories.content` for the current `question_id`.
- If `access_tokens.is_used = false`, send the notification email and flip it to `true`.
- If `access_tokens.is_used = true`, skip email and return success.

Request body:

- `token`
- `content`

Response:

- success or error status only

## Concurrency and Consistency

The main race to handle is autosave vs submit.

Rule:

- The submit route must persist the request's `content` itself and not assume the most recent autosave finished first.

That guarantees clicking submit immediately after typing still stores the newest text and, on first submit, sends the notification exactly once.

The draft route and submit route should both upsert against the same `question_id` uniqueness boundary.

## Locking and Expiration Rules

Autosave should obey the same guardrails as submit:

- Invalid token: reject
- Locked story because a newer weekly token exists: reject
- Expired unused token: reject under the current semantics

Once a new prompt exists, the previous week's draft or story is effectively forgotten in the editing experience because the old page is already locked by the current token logic.

## Testing Plan

Add or update tests to cover:

- Draft save creates a `stories` row before first submit.
- Draft save updates an existing row without flipping `is_used`.
- Write page loads existing story content even when `is_used = false`.
- First submit on an autosaved draft sends email and flips `is_used` to `true`.
- Second submit updates content without sending another email.
- Locked and invalid-token cases are rejected by both draft save and submit.
- Submit persists the latest content even if an autosave is still in flight.

## Implementation Notes

- The current write page logic that only fetches `stories.content` when `is_used = true` must change.
- The current submit route should stop inserting-only on first submit and instead use an upsert-compatible pattern.
- Shared token validation and lock-check logic should be factored so draft and submit routes cannot drift.
- The autosave UI should be small and transient, not a new workflow surface.

## Open Decisions Resolved

- Draft content lives in `stories.content`.
- `access_tokens.is_used` remains the email-submitted boundary.
- Reopening a draft should feel seamless with no special recovery UI.
- The submit button stays visible even after the first submit.
