import { eq } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import { db } from "@/db";
import { callRequests, stores } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Giriş gerekli." }, { status: 401 });
  const { id } = await context.params;
  const [call] = await db.select({ customerId: callRequests.customerId, ownerId: stores.ownerId, status: callRequests.status,
    storeId: callRequests.storeId, storeProductId: callRequests.storeProductId }).from(callRequests)
    .innerJoin(stores, eq(callRequests.storeId, stores.id)).where(eq(callRequests.id, id));
  if (!call || (user.id !== call.customerId && user.id !== call.ownerId && user.role !== "admin")) return Response.json({ error: "Bu görüşmeye erişim izniniz yok." }, { status: 403 });
  if (call.status === "closed") return Response.json({ error: "Görüşme sona erdi." }, { status: 409 });
  const apiKey = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET, serverUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !secret || !serverUrl) return Response.json({ error: "Video görüşme hizmeti henüz yapılandırılmadı. Mesajlaşmayı kullanabilirsiniz." }, { status: 503 });
  const token = new AccessToken(apiKey, secret, { identity: user.id, name: user.name, metadata: JSON.stringify({ callId: id, storeId: call.storeId, productId: call.storeProductId }) });
  token.addGrant({ roomJoin: true, room: `dv-${id}`, canPublish: true, canSubscribe: true });
  return Response.json({ token: await token.toJwt(), serverUrl }, { headers: { "Cache-Control": "no-store" } });
}
