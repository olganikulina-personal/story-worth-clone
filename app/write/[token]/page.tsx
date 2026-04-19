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

  // STEP 2: Use the token to fetch data as before
  const { data: tokenData, error } = await supabase
    .from("access_tokens")
    .select(
      `
      token,
      is_used,
      expires_at,
      questions ( prompt )
    `,
    )
    .eq("token", token)
    .single();

  if (
    error ||
    !tokenData ||
    tokenData.is_used ||
    new Date(tokenData.expires_at) < new Date()
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
        <h1 className="text-2xl font-bold">
          This link has expired or has already been used.
        </h1>
        <p className="mt-2 text-gray-600">
          Contact the family if you need a new link!
        </p>
      </div>
    );
  }

  // Handle the TypeScript typing for the joined question data
  const prompt = (tokenData.questions as any)?.prompt || "Tell us a story!";

  return (
    <main className="max-w-2xl mx-auto min-h-screen p-6 flex flex-col justify-center bg-white text-black">
      <h1 className="text-3xl font-serif mb-8 leading-tight">{prompt}</h1>

      <EntryForm token={token} />
    </main>
  );
}
