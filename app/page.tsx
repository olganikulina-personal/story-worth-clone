import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";
import HistoryFeed, { BannerData } from "@/components/HistoryFeed";
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
  const { data: latestToken, error: tokenError } = await supabase
    .from("access_tokens")
    .select("token, expires_at, is_used, questions(prompt)")
    .order("expires_at", { ascending: false })
    .limit(1)
    .single();

  if (tokenError && tokenError.code !== "PGRST116") {
    console.error("[page] failed to fetch latest token:", tokenError.message);
  }

  // The latest token is always the current week's token.
  // is_used tells us if a story has been submitted.
  let banner: BannerData = null;
  if (latestToken) {
    banner = {
      prompt: (latestToken.questions as any)?.prompt ?? "",
      storySaved: latestToken.is_used,
      token: latestToken.token,
    };
  }

  return (
    <main
      className="max-w-4xl mx-auto p-8 font-sans"
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
