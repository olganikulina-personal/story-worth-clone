import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import EntryForm from "./EntryForm";

// Notice we keep 'async' here
export default async function WritePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // STEP 1: Unwrap the params promise
  const { token } = await params;

  // 1. Fetch the token and the question prompt
  const { data: tokenData, error: tokenError } = await supabase
    .from("access_tokens")
    .select(
      `
      token,
      is_used,
      expires_at,
      question_id,
      questions ( prompt )
    `,
    )
    .eq("token", token)
    .single();

  if (tokenError || !tokenData) return <div>Link Invalid</div>;

  // 2. Fetch the story separately using the question_id
  let existingStory = "";
  if (tokenData.is_used) {
    const { data: storyData } = await supabase
      .from("stories")
      .select("content")
      .eq("question_id", tokenData.question_id)
      .single();

    if (storyData) {
      existingStory = storyData.content;
    }
  }

  // If token is missing or expired, we still show the error
  if (tokenError || !tokenData || new Date(tokenData.expires_at) < new Date()) {
    // Note: We only show error if it's actually missing or expired.
    // If it's just 'is_used', we proceed to show the read-only view.
    if (!tokenData?.is_used) {
      return <div>Link Invalid or Expired</div>;
    }
  }

  // Handle the TypeScript typing for the joined question data
  const prompt = (tokenData.questions as any)?.prompt || "Tell us a story!";

  return (
    <main className="max-w-2xl mx-auto min-h-screen p-6 flex flex-col justify-center bg-white text-black">
      <h1 className="text-3xl font-serif mb-8 leading-tight">{prompt}</h1>

      <EntryForm
        token={token}
        readOnly={tokenData.is_used}
        initialContent={existingStory}
      />
    </main>
  );
}
