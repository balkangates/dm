import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cents } from "@/lib/core";

type IyzicoResponse = {
  status: string; errorMessage?: string; token?: string; signature?: string; paymentPageUrl?: string;
  paymentStatus?: string; paymentId?: string; currency?: string; basketId?: string; conversationId?: string;
  paidPrice?: number | string; price?: number | string; fraudStatus?: number;
};

export function isCardConfigured() {
  return !!(process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY && process.env.IYZICO_BASE_URL);
}

async function iyzicoRequest(path: string, payload: Record<string, unknown>): Promise<IyzicoResponse> {
  const apiKey = process.env.IYZICO_API_KEY;
  const secret = process.env.IYZICO_SECRET_KEY;
  const baseUrl = process.env.IYZICO_BASE_URL;
  if (!apiKey || !secret || !baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error("Kart ödemesi henüz yapılandırılmadı.");
  const randomKey = `${Date.now()}${randomBytes(8).toString("hex")}`;
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(randomKey + path + body).digest("hex");
  const encoded = Buffer.from(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`).toString("base64");
  const response = await fetch(new URL(path, baseUrl).toString(), {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `IYZWSv2 ${encoded}`, "x-iyzi-rnd": randomKey },
    body, cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Ödeme hizmetine ulaşılamadı.");
  const result = await response.json() as IyzicoResponse;
  if (result.status !== "success") throw new Error(result.errorMessage || "Ödeme hizmeti isteği reddetti.");
  return result;
}

export async function initializeCardPayment(args: {
  orderId: string; orderNumber: string; total: string; name: string; email: string; phone: string;
  identityNumber: string; city: string; address: string; ip: string; callbackOrigin: string;
  items: { id: string; name: string; price: string; category: string }[];
}) {
  const words = args.name.trim().split(/\s+/);
  const firstName = words.shift() || args.name;
  const surname = words.join(" ") || firstName;
  const address = { contactName: args.name, city: args.city, country: "Turkey", address: args.address };
  const result = await iyzicoRequest("/payment/iyzipos/checkoutform/initialize/auth/ecom", {
    locale: "tr", conversationId: args.orderId, price: args.total, paidPrice: args.total, currency: "TRY",
    basketId: args.orderNumber, paymentGroup: "PRODUCT", enabledInstallments: [1],
    callbackUrl: `${args.callbackOrigin}/api/payments/iyzico/callback`,
    buyer: { id: args.orderId, name: firstName, surname, email: args.email, gsmNumber: args.phone,
      identityNumber: args.identityNumber, registrationAddress: args.address, city: args.city, country: "Turkey", ip: args.ip },
    shippingAddress: address, billingAddress: address,
    basketItems: args.items.map((item) => ({ id: item.id, name: item.name.slice(0, 100), category1: item.category, itemType: "PHYSICAL", price: item.price })),
  });
  if (!result.token || !result.paymentPageUrl || !/^https:\/\//.test(result.paymentPageUrl)) throw new Error("Ödeme sayfası oluşturulamadı.");
  return { token: result.token, url: result.paymentPageUrl };
}

export async function retrieveCardPayment(token: string, expected: { orderId: string; orderNumber: string; total: string }) {
  const result = await iyzicoRequest("/payment/iyzipos/checkoutform/auth/ecom/detail", { locale: "tr", conversationId: expected.orderId, token });
  if (!result.signature || !result.paymentId || !result.currency || !result.basketId || !result.conversationId || !result.paidPrice || !result.price || !result.paymentStatus || result.token !== token) throw new Error("Ödeme yanıtı eksik.");
  const signatureValues = [result.paymentStatus, result.paymentId, result.currency, result.basketId, result.conversationId,
    String(Number(result.paidPrice)), String(Number(result.price)), result.token];
  const calculated = createHmac("sha256", process.env.IYZICO_SECRET_KEY!).update(signatureValues.join(":")).digest("hex");
  const actual = Buffer.from(result.signature.toLowerCase(), "hex");
  const expectedSignature = Buffer.from(calculated, "hex");
  if (actual.length !== expectedSignature.length || !timingSafeEqual(actual, expectedSignature)) throw new Error("Ödeme imzası doğrulanamadı.");
  if (result.conversationId !== expected.orderId || result.basketId !== expected.orderNumber || result.currency !== "TRY" || cents(result.price) !== cents(expected.total) || cents(result.paidPrice) !== cents(expected.total)) throw new Error("Ödeme tutarı veya sipariş eşleşmiyor.");
  if (result.paymentStatus !== "SUCCESS" || Number(result.fraudStatus) !== 1) throw new Error("Ödeme başarılı veya risk kontrolü onaylı değil.");
  return result.paymentId;
}
