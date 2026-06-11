# UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the story locking model so stories stay editable all week, update the write page with a sepia theme and clearer state labels, and improve the archive page with a warm color theme and an in-progress banner.

**Architecture:** The locking logic moves from `is_used` (set on submit) to a newer-token check (set implicitly when the cron sends the next question). The submit API gains an update path for edits. The UI splits into three explicit states: fresh, saved-editable, and locked. Colors shift from black-and-white to a sepia/parchment palette applied via Tailwind inline styles (the codebase uses no separate CSS variables file).

**Tech Stack:** Next.js (App Router, server components), TypeScript, Tailwind CSS, Supabase (postgres), Resend (email)

---

## File Map

| File | Change |
|---|---|
| `app/api/stories/submit/route.ts` | Add update path for edits; add locked guard (409) |
| `app/write/[token]/page.tsx` | Replace `readOnly={is_used}` with newer-token check; pass new `isLocked` prop; sepia theme |
| `components/EntryForm.tsx` | Add `isLocked` prop; three UI states; sepia colors; new button/message copy |
| `app/page.tsx` | Fetch current token + its lock status; pass banner data to HistoryFeed; sepia theme |
| `components/HistoryFeed.tsx` | Accept + render in-progress banner; sepia colors on all elements |

---

## Task 1: Update the submit API to support edits and locked guard

**Files:**
- Modify: `app/api/stories/submit/route.ts`

This task changes the API to handle three cases:
1. Fresh token (`is_used === false`) — insert story, mark token used, send email. *(Same as today.)*
2. Used token, not locked (`is_used === true`, no newer token exists) — update the existing story's content. No email.
3. Used token, locked (a newer token exists) — return 409.

- [ ] **Step 1: Replace `app/api/stories/submit/route.ts` with the updated version**

```typescript
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    const { token, content } = await request.json();

    // 1. Fetch token row
    const { data: tokenData, error: tokenError } = await supabase
        .from('access_tokens')
        .select('question_id, is_used, expires_at, created_at')
        .eq('token', token)
        .single();

    if (tokenError || !tokenData) {
        return NextResponse.json({ error: 'Invalid link' }, { status: 403 });
    }

    // 2. Check if a newer token exists (means this story is locked)
    const { count } = await supabase
        .from('access_tokens')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', tokenData.created_at);

    const isLocked = (count ?? 0) > 0;

    if (isLocked) {
        return NextResponse.json({ error: 'This story has been locked.' }, { status: 409 });
    }

    // 3. Also reject expired tokens that have never been used
    if (!tokenData.is_used && new Date(tokenData.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 });
    }

    if (!tokenData.is_used) {
        // 4a. First submit: insert story, mark token used, send email
        const { error: storyError } = await supabase
            .from('stories')
            .insert([{ question_id: tokenData.question_id, content }]);

        if (storyError) return NextResponse.json({ error: 'Failed to save story' }, { status: 500 });

        await supabase
            .from('access_tokens')
            .update({ is_used: true })
            .eq('token', token);

        const familyEmails = process.env.FAMILY_EMAILS?.split(',') || [];
        await resend.emails.send({
            from: 'StoryPulse <onboarding@resend.dev>',
            to: familyEmails,
            subject: "✨ Babushka just shared a new story!",
            html: `
                <p>A new memory has been added to the family book:</p>
                <blockquote style="padding: 10px; border-left: 4px solid #ccc;">
                  ${content}
                </blockquote>
                <p>You can see it along with all past stories here:
                   <a href="${process.env.NEXT_PUBLIC_BASE_URL}">View Family Book</a>
                </p>
                <p>Use passcode: <strong>${process.env.FAMILY_PASSCODE}</strong> to unlock.</p>
              `
        });
    } else {
        // 4b. Edit: update existing story content, no email
        const { error: updateError } = await supabase
            .from('stories')
            .update({ content })
            .eq('question_id', tokenData.question_id);

        if (updateError) return NextResponse.json({ error: 'Failed to update story' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Start the dev server and manually verify the three cases behave correctly**

```bash
npm run dev
```

With a Supabase GUI or psql, find a token where `is_used = false` and POST to it:
```bash
curl -X POST http://localhost:3000/api/stories/submit \
  -H "Content-Type: application/json" \
  -d '{"token":"<fresh-token>","content":"Test story"}'
# Expected: {"success":true}  and is_used flips to true in DB
```

Then POST again to the same token (now `is_used = true`, no newer token):
```bash
curl -X POST http://localhost:3000/api/stories/submit \
  -H "Content-Type: application/json" \
  -d '{"token":"<same-token>","content":"Edited story"}'
# Expected: {"success":true}  and stories row content updated
```

Manually create a newer access_token row in Supabase, then POST again:
```bash
curl -X POST http://localhost:3000/api/stories/submit \
  -H "Content-Type: application/json" \
  -d '{"token":"<same-token>","content":"Should fail"}'
# Expected: 409 {"error":"This story has been locked."}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/stories/submit/route.ts
git commit -m "feat: submit API supports edits and locked guard"
```

---

## Task 2: Update the write page server component

**Files:**
- Modify: `app/write/[token]/page.tsx`

Replace `readOnly={tokenData.is_used}` with a newer-token check. Pass `isLocked` (true/false) and `isSaved` (`is_used`) as separate props to `EntryForm`. Apply sepia page background.

- [ ] **Step 1: Replace `app/write/[token]/page.tsx` with the updated version**

```tsx
import { supabase } from "@/lib/supabase";
import EntryForm from "@/components/EntryForm";
import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;

  const { data } = await supabase
    .from("access_tokens")
    .select("questions(prompt)")
    .eq("token", token)
    .single();

  const prompt = (data?.questions as any)?.prompt || "A new story prompt";

  return {
    title: `Babushka's Family Archive: ${prompt}`,
    description: "Share a memory with Babushka's family.",
    icons: {
      icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📖</text></svg>",
    },
    openGraph: {
      title: `Babushka, ${prompt.toLowerCase().replace("?", "")}?`,
      description: "Click here to add your story to the family book.",
      type: "website",
    },
  };
}

export default async function WritePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 1. Fetch current token/question
  const { data: tokenData, error: tokenError } = await supabase
    .from("access_tokens")
    .select("token, is_used, question_id, created_at, questions(prompt)")
    .eq("token", token)
    .single();

  if (tokenError || !tokenData) return <div className="p-10">Link Invalid</div>;

  // 2. Check if a newer token exists (means this story is locked)
  const { count } = await supabase
    .from("access_tokens")
    .select("*", { count: "exact", head: true })
    .gt("created_at", tokenData.created_at);

  const isLocked = (count ?? 0) > 0;

  // 3. Fetch existing story content if one has been submitted
  let existingStory = "";
  if (tokenData.is_used) {
    const { data: storyData } = await supabase
      .from("stories")
      .select("content")
      .eq("question_id", tokenData.question_id)
      .single();

    if (storyData) existingStory = storyData.content;
  }

  const prompt = (tokenData.questions as any)?.prompt;

  return (
    <main
      className="max-w-2xl mx-auto h-screen flex flex-col p-6 font-sans"
      style={{ backgroundColor: "#faf7f2", color: "#111" }}
    >
      <nav className="mb-8">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest"
          style={{ color: "#a08060" }}
        >
          ← View All Stories
        </a>
      </nav>

      <div className="mb-2" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#a08060" }}>
        {isLocked ? "Question from that week" : "This week's question"}
      </div>
      <h1 className="text-2xl font-serif mb-6 leading-tight font-semibold" style={{ color: "#111" }}>
        {prompt}
      </h1>

      <div className="flex-1 flex flex-col overflow-hidden">
        <EntryForm
          token={token}
          initialContent={existingStory}
          isSaved={tokenData.is_used}
          isLocked={isLocked}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Check the page renders without TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors (EntryForm will get new props in Task 3 — if tsc complains about unknown props there, that's expected and will be fixed next).

- [ ] **Step 3: Commit**

```bash
git add app/write/[token]/page.tsx
git commit -m "feat: write page uses newer-token lock check, passes isLocked/isSaved props"
```

---

## Task 3: Rewrite EntryForm with three states and sepia theme

**Files:**
- Modify: `components/EntryForm.tsx`

Remove the `readOnly` prop. Add `isSaved` and `isLocked` props. Implement three states:

- **Fresh** (`!isSaved && !localSaved`): empty textarea, black border, "Send to the Family" button
- **Saved-editable** (`(isSaved || localSaved) && !isLocked`): sepia-bordered textarea with content, "Save changes" button, saved message
- **Locked** (`isLocked`): plain `<p>` for story content, locked message, back link

`localSaved` is React state that flips to `true` after a successful first submit in the same browser session, bridging the gap between the fresh and saved-editable states before a page reload.

- [ ] **Step 1: Replace `components/EntryForm.tsx` with the updated version**

```tsx
"use client";
import { useState } from "react";

export default function EntryForm({
  token,
  initialContent = "",
  isSaved = false,
  isLocked = false,
}: {
  token: string;
  initialContent?: string;
  isSaved?: boolean;
  isLocked?: boolean;
}) {
  const [content, setContent] = useState(initialContent);
  const [localSaved, setLocalSaved] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const showSavedState = (isSaved || localSaved) && !isLocked;

  async function handleSubmit() {
    if (!content.trim()) return;
    setStatus("submitting");

    try {
      const res = await fetch("/api/stories/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, content }),
      });

      if (res.ok) {
        setStatus("success");
        setLocalSaved(true);
      } else {
        setStatus("error");
      }
    } catch (e) {
      setStatus("error");
    }
  }

  // --- Locked state ---
  if (isLocked) {
    return (
      <div className="flex flex-col flex-1 gap-6 pb-6">
        <p style={{ fontSize: "0.95rem", color: "#374151", lineHeight: "1.7", margin: 0 }}>
          {content}
        </p>
        <p style={{ fontSize: "0.75rem", color: "#a08060" }}>
          This story is locked and saved to the family archive.
        </p>
        <a
          href="/"
          style={{ fontSize: "0.85rem", color: "#7c5c35", textDecoration: "underline" }}
        >
          ← Back to family archive
        </a>
      </div>
    );
  }

  // --- Fresh and saved-editable states ---
  return (
    <div className="flex flex-col flex-1 gap-4 pb-6">
      <textarea
        className="w-full flex-1 p-4 text-xl rounded-none outline-none resize-none transition-colors duration-300"
        style={{
          border: showSavedState ? "2px solid #a0845c" : "2px solid #111",
          background: "#fff",
          color: "#111",
        }}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type your story here..."
      />

      {showSavedState && (
        <p style={{ fontSize: "0.75rem", color: "#7c5c35" }}>
          ✓ Saved — you can keep editing until Monday
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={status === "submitting" || !content.trim()}
        className="w-full py-4 text-xl font-bold transition-all shrink-0"
        style={{
          backgroundColor: showSavedState ? "#a0845c" : "#111",
          color: "#fff",
          opacity: status === "submitting" || !content.trim() ? 0.5 : 1,
          cursor: status === "submitting" || !content.trim() ? "not-allowed" : "pointer",
        }}
      >
        {status === "submitting"
          ? "Saving..."
          : showSavedState
          ? "Save changes"
          : "Send to the Family"}
      </button>

      {status === "error" && (
        <p className="text-red-600 font-bold text-center">
          Something went wrong. Please try again or text Olga!
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Visually verify all three states in the browser**

```bash
npm run dev
```

- Open a fresh token URL → should see empty textarea with black border and "Send to the Family" button
- After submitting → textarea gets sepia border, button changes to "Save changes", saved message appears
- Open a token URL for a locked story (one with a newer token in DB) → should see plain paragraph, locked message, back link

- [ ] **Step 4: Commit**

```bash
git add components/EntryForm.tsx
git commit -m "feat: EntryForm three states (fresh/saved-editable/locked) with sepia theme"
```

---

## Task 4: Update the archive page with in-progress banner and sepia theme

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/HistoryFeed.tsx`

The archive page needs to:
1. Fetch the most recent access token to determine whether the current week is still open
2. Fetch that token's question prompt
3. Determine the banner sub-state (no story yet vs. story saved)
4. Pass banner data down to `HistoryFeed`
5. Apply sepia page background

`HistoryFeed` needs to accept and render the banner, and apply sepia colors to dates, headings, and dividers.

- [ ] **Step 1: Replace `app/page.tsx` with the updated version**

```tsx
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";
import HistoryFeed from "@/components/HistoryFeed";
import PasscodeLock from "@/components/PasscodeLock";

export default async function Home() {
  const cookieStore = await cookies();
  const isAuthorized =
    cookieStore.get("family_auth")?.value === process.env.FAMILY_PASSCODE;

  if (!isAuthorized) {
    return <PasscodeLock />;
  }

  // Fetch all answered stories, newest first
  const { data: history } = await supabase
    .from("stories")
    .select(`content, created_at, questions ( prompt )`)
    .order("created_at", { ascending: false });

  // Fetch the most recent access token to determine banner state
  const { data: latestToken } = await supabase
    .from("access_tokens")
    .select("created_at, is_used, question_id, questions(prompt)")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Check if there's a token newer than the latest (would mean latest is locked)
  // Since we fetched the single latest, it can't have a newer one — it IS the latest.
  // So if latestToken exists, the current week is always open.
  // (The cron creates a new token each week; the previous one becomes locked automatically.)

  type BannerData = {
    prompt: string;
    storySaved: boolean;
  } | null;

  let banner: BannerData = null;
  if (latestToken) {
    banner = {
      prompt: (latestToken.questions as any)?.prompt ?? "",
      storySaved: latestToken.is_used,
    };
  }

  return (
    <main
      className="max-w-3xl mx-auto p-8 font-sans"
      style={{ backgroundColor: "#faf7f2", minHeight: "100vh" }}
    >
      <header className="mb-12 border-b pb-8" style={{ borderColor: "#e8dcc8" }}>
        <h1 className="text-4xl font-serif font-bold" style={{ color: "#111" }}>
          The Family Archive
        </h1>
        <p className="mt-2" style={{ color: "#a08060" }}>
          A collection of memories from Babushka.
        </p>
      </header>

      <HistoryFeed stories={history || []} banner={banner} />
    </main>
  );
}
```

- [ ] **Step 2: Replace `components/HistoryFeed.tsx` with the updated version**

```tsx
type BannerData = {
  prompt: string;
  storySaved: boolean;
} | null;

export default function HistoryFeed({
  stories,
  banner,
}: {
  stories: any[];
  banner?: BannerData;
}) {
  return (
    <div>
      {banner && (
        <div
          className="rounded mb-10 p-5"
          style={{
            border: "2px solid #a0845c",
            background: "#f5ede0",
          }}
        >
          <div
            style={{
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6b4f2a",
              marginBottom: "0.3rem",
            }}
          >
            This week · in progress
          </div>
          <div
            style={{ fontSize: "1rem", fontWeight: 600, color: "#111", marginBottom: "0.25rem" }}
          >
            {banner.prompt}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#7c5c35" }}>
            {banner.storySaved
              ? "Story saved — editable until Monday"
              : "No story yet this week"}
          </div>
        </div>
      )}

      <div className="space-y-10">
        {stories.map((story, i) => (
          <article
            key={i}
            style={{ borderBottom: "1px solid #e8dcc8", paddingBottom: "2.5rem" }}
          >
            <div className="flex flex-col gap-1 mb-4">
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#a08060",
                }}
              >
                {new Date(story.created_at).toLocaleDateString("en-US", {
                  timeZone: "America/Los_Angeles",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <h2
                className="text-2xl font-serif font-semibold leading-tight"
                style={{ color: "#111" }}
              >
                {story.questions.prompt}
              </h2>
            </div>
            <p
              style={{
                fontSize: "1rem",
                color: "#374151",
                lineHeight: "1.7",
                fontStyle: "italic",
                borderLeft: "4px solid #e8dcc8",
                paddingLeft: "1.5rem",
                paddingTop: "0.5rem",
                paddingBottom: "0.5rem",
                margin: 0,
              }}
            >
              "{story.content}"
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Visually verify the archive page in the browser**

```bash
npm run dev
```

- Open `http://localhost:3000` and enter the family passcode
- Should see sepia page background, parchment header border, warm text colors
- Banner should appear at top showing current week's question
- If `is_used = true` on the latest token → "Story saved — editable until Monday"
- If `is_used = false` → "No story yet this week"
- Past stories should have sepia date labels, serif headings, italic body text with parchment left border

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/HistoryFeed.tsx
git commit -m "feat: archive page in-progress banner and sepia theme"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Lock on next cron (newer-token check) | Task 1 (API), Task 2 (write page) |
| Submit API: insert on first submit, update on edit, 409 if locked | Task 1 |
| Write page: fresh / saved-editable / locked states | Task 2 + 3 |
| Sepia border on saved-editable textarea | Task 3 |
| "Save changes" button copy | Task 3 |
| "✓ Saved — you can keep editing until Monday" message | Task 3 |
| Locked state: plain `<p>`, locked message, back link | Task 3 |
| Archive: in-progress banner with two sub-states | Task 4 |
| Archive: full stories, no truncation | Task 4 (unchanged behavior, preserved) |
| Sepia/parchment color theme throughout | Tasks 2, 3, 4 |
| No schema changes | All tasks — confirmed, no migrations needed |
