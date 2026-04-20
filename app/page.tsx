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

  // Fetch all answered stories for the public-ish feed
  const { data: history } = await supabase
    .from("stories")
    .select(
      `
      content,
      created_at,
      questions ( prompt )
    `,
    )
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <header className="mb-12 border-b pb-8">
        <h1 className="text-4xl font-serif font-bold">The Family Archive</h1>
        <p className="text-zinc-500 mt-2">
          A collection of memories from Babushka.
        </p>
      </header>

      <HistoryFeed stories={history || []} />
    </main>
  );
}
