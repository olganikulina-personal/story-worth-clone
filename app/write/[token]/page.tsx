import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import EntryForm from "@/components/EntryForm";

export default async function WritePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 1. Fetch current token/question
  const { data: tokenData, error: tokenError } = await supabase
    .from("access_tokens")
    .select("token, is_used, question_id, questions(prompt)")
    .eq("token", token)
    .single();

  if (tokenError || !tokenData) return <div className="p-10">Link Invalid</div>;

  // 2. Fetch only THIS specific story if it's already been answered
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
    /* min-h-screen and flex-col are key here */
    <main className="max-w-2xl mx-auto h-screen flex flex-col p-6 bg-white text-black font-sans">
      <nav className="mb-8">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-400"
        >
          ← View All Stories
        </a>
      </nav>

      <h1 className="text-3xl font-serif mb-6 leading-tight">{prompt}</h1>

      {/* Wrap the form in a flex-1 container to push it to fill space */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <EntryForm
          token={token}
          initialContent={existingStory}
          readOnly={tokenData.is_used}
        />
      </div>
    </main>
  );
}
