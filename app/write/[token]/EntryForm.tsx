"use client";
import { useState } from "react";

export default function EntryForm({ token }: { token: string }) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");

  async function handleSubmit() {
    if (!content.trim()) return;
    setStatus("submitting");

    const res = await fetch("/api/stories/submit", {
      method: "POST",
      body: JSON.stringify({ token, content }),
    });

    if (res.ok) setStatus("success");
    else setStatus("error");
  }

  if (status === "success") {
    return (
      <div className="bg-green-50 p-6 rounded-lg border border-green-200">
        <h2 className="text-xl font-bold text-green-800">Story Saved!</h2>
        <p className="text-green-700 mt-2">
          Thank you for sharing that memory. You can close this window now.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <textarea
        className="w-full h-64 p-4 text-xl border-2 border-black rounded-none focus:ring-2 focus:ring-blue-500 outline-none"
        placeholder="Type your story here..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={status === "submitting"}
      />

      <button
        onClick={handleSubmit}
        disabled={status === "submitting" || !content.trim()}
        className="w-full bg-black text-white py-4 text-xl font-bold hover:bg-gray-800 disabled:bg-gray-400"
      >
        {status === "submitting" ? "Saving..." : "Send to the Family"}
      </button>

      {status === "error" && (
        <p className="text-red-600 font-bold">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
