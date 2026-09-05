// lib/logistics.ts — Faz 4: bayi → müşteri son-mil kargo takibi.
//
// DÜRÜSTLÜK NOTU: Yurtiçi/Aras/MNG kargo firmalarının hiçbiri herkese açık
// bir test/sandbox API'si sunmuyor — kurumsal bayilik sözleşmesi + özel
// kullanıcı adı/şifre gerektiriyor. Bu yüzden burada OTOMATİK durum
// senkronizasyonu yok; bayi/lojistik kullanıcısı takip bilgisini MANUEL
// giriyor. `updateShipmentStatusFromWebhook` fonksiyonu ileride gerçek
// bir kargo firması webhook'u bağlandığında kullanılmak üzere hazır
// duruyor (bkz. app/api/webhooks/shipping/route.ts).
import { supabase } from './supabase';

export const CARRIERS = [
  { value: 'manual', label: 'Kendi Aracımız / Elden Teslim' },
  { value: 'yurtici', label: 'Yurtiçi Kargo' },
  { value: 'aras', label: 'Aras Kargo' },
  { value: 'mng', label: 'MNG Kargo' },
  { value: 'ptt', label: 'PTT Kargo' },
  { value: 'surat', label: 'Sürat Kargo' },
] as const;

// Taşıyıcının halka açık takip ANA SAYFASI — belirli bir gönderiye derin
// link (deep link) URL formatları firmalar arasında farklılık gösteriyor
// ve resmi olarak doğrulanmadan yanlış bir link vermek istemedik. Müşteri
// takip numarasını kopyalayıp bu sayfada sorgulayabilir.
export const CARRIER_TRACKING_HOMEPAGE: Record<string, string> = {
  yurtici: 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula',
  aras: 'https://www.araskargo.com.tr/tr/cargo-tracking',
  mng: 'https://www.mngkargo.com.tr/gonderi-takip',
  ptt: 'https://gonderitakip.ptt.gov.tr/',
  surat: 'https://www.suratkargo.com.tr/KargoTakip',
  manual: '',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Shipment { id: string; order_id: string; carrier: string; tracking_number: string | null; status: string; [key: string]: any; }

export async function markOrderShipped(orderId: string, carrier: string, trackingNumber: string) {
  const { error } = await supabase.rpc('mark_order_shipped', {
    p_order_id: orderId,
    p_carrier: carrier,
    p_tracking_number: trackingNumber || null,
    p_tracking_url: null,
  });
  if (error) throw error;
}

// Kargoya vermeden ÖNCE bilinçli olarak irsaliye + fatura keser (bkz.
// fixes/fix_order_documents_before_shipping.sql). mark_order_shipped bu
// belgeler yoksa ORDER_STATUS_REQUIRES_INVOICE / _DELIVERY_NOTE hatası
// verir — dealer orders sayfası bu fonksiyonu önce çağırıp UI'ı buna
// göre iki adıma ayırır: 1) Belgeleri Oluştur → 2) Kargoya Ver.
// invoice_error/delivery_note_error doluysa o belge oluşturulamamış
// demektir (diğeri başarılı olsa bile) — UI bunu ayrı ayrı gösterir.
export interface OrderDocumentsResult {
  invoice_number: string | null;
  delivery_note_no: string | null;
  invoice_error: string | null;
  delivery_note_error: string | null;
}
export async function createOrderDocuments(
  orderId: string,
  invoiceNumber?: string,
  deliveryNoteNo?: string
): Promise<OrderDocumentsResult> {
  const { data, error } = await supabase.rpc('create_order_documents', {
    p_order_id: orderId,
    p_invoice_number: invoiceNumber?.trim() || null,
    p_delivery_note_no: deliveryNoteNo?.trim() || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    invoice_number: row?.invoice_number ?? null,
    delivery_note_no: row?.delivery_note_no ?? null,
    invoice_error: row?.invoice_error ?? null,
    delivery_note_error: row?.delivery_note_error ?? null,
  };
}

export async function markShipmentDelivered(orderId: string) {
  const { error } = await supabase.rpc('mark_shipment_delivered_manual', { p_order_id: orderId });
  if (error) throw error;
}

// Lojistik panosu: teslim edilmemiş tüm sevkiyatlar (platform geneli —
// logistics rolü tek bir mağazaya değil, tüm bayilere hizmet ediyor
// varsayıldı; store bazlı kısıtlamak istenirse burada .eq('store_id', ...)
// eklenebilir).
export async function loadActiveShipments() {
  const { data, error } = await supabase
    .from('store_order_shipments')
    .select('*, store_orders(id, delivery_address, total_amount, status, stores(name))')
    .neq('status', 'delivered')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
