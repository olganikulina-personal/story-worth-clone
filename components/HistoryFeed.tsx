export default function HistoryFeed({ stories }: { stories: any[] }) {
  return (
    <div className="space-y-16">
      {stories.map((story, i) => (
        <article key={i} className="group">
          <div className="flex flex-col gap-1 mb-4">
            <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
              {new Date(story.created_at).toLocaleDateString("en-US", {
                timeZone: "America/Los_Angeles",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <h2 className="text-2xl font-serif font-semibold text-zinc-900 leading-tight">
              {story.questions.prompt}
            </h2>
          </div>
          <div className="prose prose-zinc prose-lg max-w-none text-zinc-700 leading-relaxed italic border-l-4 border-zinc-100 pl-6 py-2">
            "{story.content}"
          </div>
        </article>
      ))}
    </div>
  );
}
