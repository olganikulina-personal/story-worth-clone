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
    <div className="space-y-6">
      {/* Visual confirmation that it worked */}
      {(internalReadOnly || status === "success") && (
        <div className="bg-green-50 p-4 border border-green-200 text-green-800 animate-in fade-in duration-500">
          <p className="font-bold">✨ Story saved!</p>
          <p className="text-sm">
            This has been added to the family book. You can safely close this
            page.
          </p>
        </div>
      )}

      <textarea
        className={`w-full h-64 p-4 text-xl border-2 rounded-none transition-colors duration-300 outline-none ${
          internalReadOnly
            ? "border-gray-200 bg-gray-50 text-gray-500"
            : "border-black bg-white text-black focus:ring-2 focus:ring-blue-500"
        }`}
        value={content}
        onChange={(e) => !internalReadOnly && setContent(e.target.value)}
        readOnly={internalReadOnly}
        placeholder="Type your story here..."
      />

      {!internalReadOnly && (
        <button
          onClick={handleSubmit}
          disabled={status === "submitting" || !content.trim()}
          className="w-full bg-black text-white py-4 text-xl font-bold hover:bg-gray-800 disabled:bg-gray-400 transition-all"
        >
          {status === "submitting" ? "Saving..." : "Send to the Family"}
        </button>
      )}

      {status === "error" && (
        <p className="text-red-600 font-bold">
          Something went wrong. Please try again or text Olga!
        </p>
      )}
    </div>
  );
}
