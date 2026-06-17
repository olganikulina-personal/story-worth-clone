"use client";
import { useEffect, useRef, useState } from "react";

export function shouldSkipAutosaveTransition(contentToSave: string, lastSavedContent: string) {
  if (contentToSave === lastSavedContent) {
    return true;
  }

  return !contentToSave.trim() && !lastSavedContent.trim();
}

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
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftError, setDraftError] = useState("");

  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef(initialContent);
  const pendingAutosaveContentRef = useRef<string | null>(null);
  const autosavePromiseRef = useRef<Promise<void> | null>(null);
  const latestInitialContentRef = useRef(initialContent);

  const showSavedState = (isSaved || localSaved) && !isLocked;

  function clearDebounceTimer() {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }

  function clearSavedMessageTimer() {
    if (savedMessageTimeoutRef.current) {
      clearTimeout(savedMessageTimeoutRef.current);
      savedMessageTimeoutRef.current = null;
    }
  }

  function showDraftSavedMessage() {
    clearSavedMessageTimer();
    setDraftStatus("saved");
    savedMessageTimeoutRef.current = setTimeout(() => {
      setDraftStatus((current) => (current === "saved" ? "idle" : current));
      savedMessageTimeoutRef.current = null;
    }, 1500);
  }

  function shouldSkipAutosave(contentToSave: string) {
    return shouldSkipAutosaveTransition(contentToSave, lastSavedContentRef.current);
  }

  async function saveDraft(contentToSave: string) {
    if (shouldSkipAutosave(contentToSave)) {
      return;
    }

    setDraftStatus("saving");
    setDraftError("");

    try {
      const res = await fetch("/api/stories/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, content: contentToSave }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setDraftStatus("error");
        setDraftError(body?.error || "Draft save failed.");
        return;
      }

      lastSavedContentRef.current = contentToSave;

      if (pendingAutosaveContentRef.current && pendingAutosaveContentRef.current !== contentToSave) {
        return;
      }

      showDraftSavedMessage();
    } catch {
      setDraftStatus("error");
      setDraftError("Draft save failed.");
    }
  }

  async function flushAutosaveQueue() {
    if (autosavePromiseRef.current) {
      return autosavePromiseRef.current;
    }

    const run = async () => {
      while (pendingAutosaveContentRef.current) {
        if (status === "submitting") {
          return;
        }

        const nextContent = pendingAutosaveContentRef.current;
        pendingAutosaveContentRef.current = null;

        if (shouldSkipAutosave(nextContent)) {
          continue;
        }

        await saveDraft(nextContent);
      }
    };

    autosavePromiseRef.current = run().finally(() => {
      autosavePromiseRef.current = null;
    });

    return autosavePromiseRef.current;
  }

  useEffect(() => {
    if (initialContent === latestInitialContentRef.current) {
      return;
    }

    latestInitialContentRef.current = initialContent;
    lastSavedContentRef.current = initialContent;
    pendingAutosaveContentRef.current = null;
    clearDebounceTimer();
    clearSavedMessageTimer();
    setContent(initialContent);
    setDraftStatus("idle");
    setDraftError("");
  }, [initialContent]);

  useEffect(() => {
    if (isLocked) {
      clearDebounceTimer();
      return;
    }

    if (status === "submitting") {
      clearDebounceTimer();
      return;
    }

    if (draftStatus === "saved" && content !== lastSavedContentRef.current) {
      clearSavedMessageTimer();
      setDraftStatus("idle");
    }

    if (shouldSkipAutosave(content)) {
      clearDebounceTimer();
      return;
    }

    clearDebounceTimer();
    debounceTimeoutRef.current = setTimeout(() => {
      pendingAutosaveContentRef.current = content;

      if (!autosavePromiseRef.current) {
        void flushAutosaveQueue();
      }
    }, 1000);

    return () => {
      clearDebounceTimer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, draftStatus, isLocked, status]);

  useEffect(() => {
    return () => {
      clearDebounceTimer();
      clearSavedMessageTimer();
    };
  }, []);

  async function handleSubmit() {
    if (!content.trim()) return;
    clearDebounceTimer();
    clearSavedMessageTimer();
    pendingAutosaveContentRef.current = content;
    setStatus("submitting");

    if (autosavePromiseRef.current) {
      await autosavePromiseRef.current;
    }

    try {
      const res = await fetch("/api/stories/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, content }),
      });

      if (res.ok) {
        lastSavedContentRef.current = content;
        setLocalSaved(true);
        pendingAutosaveContentRef.current = null;
        setDraftStatus("idle");
        setDraftError("");
        setStatus("idle");
      } else {
        pendingAutosaveContentRef.current = content;
        setStatus("error");
        if (!autosavePromiseRef.current) {
          void flushAutosaveQueue();
        }
      }
    } catch {
      pendingAutosaveContentRef.current = content;
      setStatus("error");
      if (!autosavePromiseRef.current) {
        void flushAutosaveQueue();
      }
    }
  }

  // --- Locked state ---
  if (isLocked) {
    return (
      <div className="flex flex-col flex-1 gap-6 pb-6">
        <p style={{ fontSize: "0.95rem", color: "#374151", lineHeight: "1.7", margin: 0 }}>
          {content || "No story was submitted for this period."}
        </p>
        <p style={{ fontSize: "0.75rem", color: "#a08060" }}>
          {showSavedState
            ? "This story is locked and saved to the family archive."
            : "This draft is locked because a new weekly question has been sent."}
        </p>
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
        disabled={status === "submitting"}
        placeholder="Type your story here..."
      />

      {showSavedState && (
        <p style={{ fontSize: "0.75rem", color: "#7c5c35" }}>
          ✓ Saved — you can keep editing until Monday
        </p>
      )}

      {draftStatus === "saving" && (
        <p style={{ fontSize: "0.75rem", color: "#7c5c35" }}>
          Saving draft...
        </p>
      )}

      {draftStatus === "saved" && (
        <p style={{ fontSize: "0.75rem", color: "#7c5c35" }}>
          Draft saved
        </p>
      )}

      {draftStatus === "error" && draftError && (
        <p className="text-red-600 font-bold">
          {draftError}
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
