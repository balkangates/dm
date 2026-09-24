import { csvHeader } from "@/lib/csv-import";
import { getCurrentUser, getMyStore } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !(await getMyStore(user.id))) return Response.json({ error: "Yetkisiz" }, { status: 403 });
  return new Response("\ufeff" + csvHeader, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=dampingvar-urun-sablonu.csv", "Cache-Control": "private, no-store" } });
}
