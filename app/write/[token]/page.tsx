import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import EntryForm from "./EntryForm";

export default async function WritePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 1. Fetch current token/question
  const { data: tokenData, error: tokenError } = await supabase
    .from("access_tokens")
    .select("token, is_used, expires_at, question_id, questions(prompt)")
    .eq("token", token)
    .single();

  if (tokenError || !tokenData) return <div>Link Invalid</div>;

  // 2. Fetch ALL answered stories for the history menu
  // We'll order them by date so the most recent is at the top
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

  const prompt = (tokenData.questions as any)?.prompt;

  // Find if THIS specific question has an answer yet
  const existingStory =
    history?.find((s: any) => s.questions.prompt === prompt)?.content || "";

  return (
    <main className="max-w-2xl mx-auto min-h-screen p-6 bg-white text-black">
      <div className="mb-12">
        <h1 className="text-3xl font-serif mb-8 leading-tight">{prompt}</h1>
        <EntryForm
          token={token}
          initialContent={existingStory}
          readOnly={tokenData.is_used}
        />
      </div>

      {/* History Section */}
      {history?.map((item: any, i: number) => {
        // Convert UTC string to a Date object
        const date = new Date(item.created_at);

        // Format to PST (America/Los_Angeles)
        const formattedDate = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(date);

        return (
          <div key={i} className="group">
            <div className="flex justify-between items-baseline mb-2">
              <h3 className="text-lg font-medium text-gray-900 leading-tight">
                {item.questions.prompt}
              </h3>
              <span className="text-sm font-medium text-gray-400 whitespace-nowrap ml-4 uppercase tracking-tighter">
                {formattedDate}
              </span>
            </div>
            <p className="text-gray-600 leading-relaxed italic border-l-2 border-gray-100 pl-4 py-1">
              "{item.content}"
            </p>
          </div>
        );
      })}
    </main>
  );
}
