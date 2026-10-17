import { EVENT_KINDS, trackEvent } from "@/lib/queries";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const ALLOWED = new Set<string>(EVENT_KINDS);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  if (!ALLOWED.has(kind)) return Response.json({ ok: false, error: "Geçersiz olay türü." }, { status: 400 });

  const user = await currentUser();
  await trackEvent(kind, {
    businessId: body.businessId ?? null,
    campaignId: body.campaignId ?? null,
    // Olay sahipliği sunucudaki oturumdan alınır; istemcinin gönderdiği userId kullanılmaz.
    userId: user?.id ?? null,
    meta: typeof body.meta === "object" && body.meta ? body.meta : {},
  });
  return Response.json({ ok: true });
}
