import { UploadCard, type ProductOption } from "./upload-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const supabase = await createClient();
  const [recentRes, productsRes] = await Promise.all([
    supabase
      .from("videos")
      .select("id, filename, status, created_at, error_message")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("products")
      .select("id, name, brands(name)")
      .order("name"),
  ]);
  const recent = recentRes.data;
  const products: ProductOption[] = (productsRes.data ?? []).map((p) => {
    const brand = p.brands as { name: string } | { name: string }[] | null;
    const brandName = Array.isArray(brand) ? brand[0]?.name : brand?.name;
    return {
      id: p.id as string,
      name: p.name as string,
      brand: brandName ?? "(no brand)",
    };
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Upload a TikTok</h1>
          <Link href="/knowledge" className="text-sm text-muted-foreground hover:underline">
            Knowledge →
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          MP4 / MOV / WebM. The pipeline transcribes via Groq, extracts frames,
          and asks Claude for a structured breakdown.
        </p>
      </div>

      <UploadCard products={products} />

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
