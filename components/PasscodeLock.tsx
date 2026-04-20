"use client";
import { useState } from "react";

export default function PasscodeLock() {
  const [pass, setPass] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Set a cookie that lasts for 1 year
    document.cookie = `family_auth=${pass}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload(); // Refresh to trigger the server check
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
      >
        <h2 className="text-xl font-bold mb-4">Enter Family Passcode</h2>
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className="border-2 border-black p-2 w-full mb-4 outline-none"
          placeholder="Password"
        />
        <button className="w-full bg-black text-white py-2 font-bold hover:bg-zinc-800">
          Unlock Archive
        </button>
      </form>
    </div>
  );
}
