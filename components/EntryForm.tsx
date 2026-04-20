"use client";
import { useState } from "react";

export default function EntryForm({
  token,
  initialContent = "",
  readOnly = false,
}: {
  token: string;
  initialContent?: string;
  readOnly?: boolean;
}) {
  const [content, setContent] = useState(initialContent);
  // We track "internalReadOnly" so we can flip it after a successful submit
  const [internalReadOnly, setInternalReadOnly] = useState(readOnly);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");

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
        setInternalReadOnly(true); // This triggers the UI "lock"
      } else {
        setStatus("error");
      }
    } catch (e) {
      setStatus("error");
    }
  }

  return (
    /* Ensure the container is a flex column that takes up 100% of the parent height */
    <div className="flex flex-col flex-1 gap-6 pb-6">
      {(internalReadOnly || status === "success") && (
        <div className="bg-green-50 p-4 border border-green-200 text-green-800 animate-in fade-in duration-500">
          <p className="font-bold">✨ Story saved!</p>
          <p className="text-sm">
            Added to the family book. You can safely close this page.
          </p>
        </div>
      )}

      {/* flex-1 makes the textarea fill all remaining space */}
      <textarea
        className={`w-full flex-1 p-4 text-xl border-2 rounded-none transition-colors duration-300 outline-none resize-none ${
          internalReadOnly
            ? "border-gray-200 bg-gray-50 text-gray-500"
            : "border-black bg-white text-black focus:ring-2 focus:ring-blue-500"
        }`}
        value={content}
        onChange={(e) => !internalReadOnly && setContent(e.target.value)}
        readOnly={internalReadOnly}
        placeholder="Type your story here..."
      />

      <div className="flex flex-col gap-4">
        {!internalReadOnly && (
          <button
            onClick={handleSubmit}
            disabled={status === "submitting" || !content.trim()}
            className="w-full bg-black text-white py-4 text-xl font-bold hover:bg-gray-800 disabled:bg-gray-400 transition-all shrink-0"
          >
            {status === "submitting" ? "Saving..." : "Send to the Family"}
          </button>
        )}

        {internalReadOnly && (
          <a
            href="/"
            className="w-full text-center bg-white border-2 border-black px-6 py-4 font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
          >
            Open the Family Archive →
          </a>
        )}

        {status === "error" && (
          <p className="text-red-600 font-bold text-center">
            Something went wrong. Please try again or text Olga!
          </p>
        )}
      </div>
    </div>
  );
}
