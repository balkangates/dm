import { getCurrentUser, getMyStore } from "@/lib/auth";
import { analyzeCsv, createPreviewToken } from "@/lib/csv-import";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const store = user ? await getMyStore(user.id) : null;
  if (!store || store.status !== "approved") return Response.json({ error: "Onaylı mağaza hesabı gereklidir." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return Response.json({ error: "Geçersiz kaynak." }, { status: 403 });
  try {
    const body = await request.json() as { csv?: string };
    const csv = body.csv || "";
    const preview = await analyzeCsv(csv, store.id);
    return Response.json({ ...preview, token: createPreviewToken(store.id, csv) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "CSV okunamadı." }, { status: 400 });
  }
}
