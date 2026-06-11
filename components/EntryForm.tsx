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
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");

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
          {content || "No story was submitted for this period."}
        </p>
        <p style={{ fontSize: "0.75rem", color: "#a08060" }}>
          This story is locked and saved to the family archive.
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
