import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SimilarVideo = {
  video_id: string;
  similarity: number;
  filename: string;
  niche_tag: string | null;
  thumbnail_url: string | null;
};

export function SimilarVideos({ items }: { items: SimilarVideo[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Similar videos</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No similar videos yet — embed at least one other video to compare.
          </p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((it) => (
              <li key={it.video_id}>
                <Link
                  href={`/videos/${it.video_id}`}
                  className="block group rounded-lg ring-1 ring-foreground/10 overflow-hidden hover:ring-foreground/30 transition"
                >
                  {it.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.thumbnail_url}
                      alt=""
                      className="w-full aspect-video object-cover bg-muted"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-muted" />
                  )}
                  <div className="p-2 space-y-1">
                    <div className="text-xs font-mono truncate" title={it.filename}>
                      {it.filename}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {it.niche_tag ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {it.niche_tag}
                        </Badge>
                      ) : (
                        <span />
                      )}
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {Math.round(it.similarity * 100)}%
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
