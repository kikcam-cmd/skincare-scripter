import { UploadCard } from "./upload-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function UploadPage() {
  const supabase = await createClient();
  const { data: recent } = await supabase
    .from("videos")
    .select("id, filename, status, created_at, error_message")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Upload a TikTok</h1>
        <p className="text-sm text-muted-foreground">
          MP4 / MOV / WebM. The pipeline transcribes via Groq, extracts frames,
          and asks Claude for a structured breakdown.
        </p>
      </div>

      <UploadCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent uploads</CardTitle>
        </CardHeader>
        <CardContent>
          {!recent || recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((v) => (
                <li key={v.id} className="py-2 flex items-center justify-between text-sm">
                  <Link href={`/videos/${v.id}`} className="hover:underline truncate max-w-[60%]">
                    {v.filename}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    {v.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
