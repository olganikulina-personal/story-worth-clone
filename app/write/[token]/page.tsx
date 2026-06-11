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
    .select("token, is_used, question_id, expires_at, questions(prompt)")
    .eq("token", token)
    .single();

  if (tokenError || !tokenData) return <div className="p-10">Link Invalid</div>;

  // 2. Check if a newer token exists (means this story is locked)
  const { count } = await supabase
    .from("access_tokens")
    .select("*", { count: "exact", head: true })
    .eq("question_id", tokenData.question_id)
    .gt("expires_at", tokenData.expires_at);

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

  const prompt = (tokenData.questions as any)?.prompt ?? "A story prompt";

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
