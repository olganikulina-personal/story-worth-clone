export type BannerData = {
  prompt: string;
  storySaved: boolean;
} | null;

export default function HistoryFeed({
  stories,
  banner,
}: {
  stories: any[];
  banner?: BannerData;
}) {
  return (
    <div>
      {banner && (
        <div
          className="rounded mb-10 p-5"
          style={{
            border: "2px solid #a0845c",
            background: "#f5ede0",
          }}
        >
          <div
            style={{
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6b4f2a",
              marginBottom: "0.3rem",
            }}
          >
            This week · {banner.storySaved ? "saved" : "in progress"}
          </div>
          <div
            style={{ fontSize: "1rem", fontWeight: 600, color: "#111", marginBottom: "0.25rem" }}
          >
            {banner.prompt}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#7c5c35" }}>
            {banner.storySaved
              ? "Story saved — editable until Monday"
              : "No story yet this week"}
          </div>
        </div>
      )}

      <div className="space-y-10">
        {stories.map((story, i) => (
          <article
            key={i}
            style={{ borderBottom: "1px solid #e8dcc8", paddingBottom: "2.5rem" }}
          >
            <div className="flex flex-col gap-1 mb-4">
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#a08060",
                }}
              >
                {new Date(story.created_at).toLocaleDateString("en-US", {
                  timeZone: "America/Los_Angeles",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <h2
                className="text-2xl font-serif font-semibold leading-tight"
                style={{ color: "#111" }}
              >
                {story.questions?.prompt ?? "Untitled"}
              </h2>
            </div>
            <p
              style={{
                fontSize: "1rem",
                color: "#374151",
                lineHeight: "1.7",
                fontStyle: "italic",
                borderLeft: "4px solid #e8dcc8",
                paddingLeft: "1.5rem",
                paddingTop: "0.5rem",
                paddingBottom: "0.5rem",
                margin: 0,
              }}
            >
              "{story.content}"
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
