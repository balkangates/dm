// tests/rls/invoices-delivery-notes.test.ts
// ─────────────────────────────────────────────────────────────────────
// Faz 0'da düzeltilen "fatura oluşuyor ama görünmüyor" (GRANT eksikliği)
// ve "RLS kapalıyken herkes her mağazanın faturasını okuyabiliyordu"
// (güvenlik açığı) sorunlarını REGRESYONA KARŞI kilitler.
// Kaynak: fixes/fix_invoice_delivery_note_rls_v2.sql
// =====================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import { loadFixtures, signInAs, anonClient, assertNotProductionTarget, type RlsTestFixtures } from './setup';

describe('store_order_invoices / delivery_notes RLS', () => {
  let fx: RlsTestFixtures;

  beforeAll(() => {
    assertNotProductionTarget(); // bkz. setup.ts — production'a karşı çalışmayı engeller
    fx = loadFixtures();
  });

  it('müşteri KENDİ siparişinin faturasını/irsaliyesini okuyabilmeli (işlevsellik — Faz 0 asıl fix)', async () => {
    const client = await signInAs(fx.customerA.email, fx.customerA.password);

    const { data, error } = await client
      .from('store_order_invoices')
      .select('invoice_number, order_id')
      .eq('order_id', fx.orderIdStoreA);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('storeA sahibi (dealerA) KENDİ mağazasının faturasını okuyabilmeli', async () => {
    const client = await signInAs(fx.dealerA.email, fx.dealerA.password);

    const { data, error } = await client
      .from('store_order_invoices')
      .select('invoice_number, order_id')
      .eq('order_id', fx.orderIdStoreA);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('storeB sahibi (dealerB), storeA\'nın faturasını OKUYAMAMALI (izolasyon — asıl güvenlik testi)', async () => {
    const client = await signInAs(fx.dealerB.email, fx.dealerB.password);

    const { data, error } = await client
      .from('store_order_invoices')
      .select('invoice_number, order_id')
      .eq('order_id', fx.orderIdStoreA);

    // RLS satırı gizler — hata DEĞİL, 0 satır döner. İkisini de kontrol ediyoruz.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('customerB, storeA\'nın faturasını OKUYAMAMALI (izolasyon)', async () => {
    const client = await signInAs(fx.customerB.email, fx.customerB.password);

    const { data, error } = await client
      .from('store_order_invoices')
      .select('invoice_number, order_id')
      .eq('order_id', fx.orderIdStoreA);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('anon (girişsiz) kullanıcı HİÇBİR faturayı okuyamamalı', async () => {
    const client = anonClient();

    const { data } = await client
      .from('store_order_invoices')
      .select('invoice_number, order_id')
      .eq('order_id', fx.orderIdStoreA);

    expect(data ?? []).toHaveLength(0);
  });

  it('delivery_notes için de aynı izolasyon geçerli olmalı', async () => {
    const ownClient = await signInAs(fx.customerA.email, fx.customerA.password);
    const otherClient = await signInAs(fx.customerB.email, fx.customerB.password);

    const own = await ownClient.from('delivery_notes').select('document_no').eq('order_id', fx.orderIdStoreA);
    const other = await otherClient.from('delivery_notes').select('document_no').eq('order_id', fx.orderIdStoreA);

    expect((own.data ?? []).length).toBeGreaterThan(0);
    expect(other.data ?? []).toHaveLength(0);
  });

  it('authenticated rolü store_order_invoices/delivery_notes tablosuna doğrudan INSERT YAPAMAMALI (yazma sadece SECURITY DEFINER RPC üzerinden olmalı)', async () => {
    const client = await signInAs(fx.dealerA.email, fx.dealerA.password);

    const { error } = await client.from('store_order_invoices').insert({
      order_id: fx.orderIdStoreA,
      invoice_number: 'HACK-TEST-0001',
    });

    // GRANT verilmediği için bu ya PostgREST 42501 (yetki hatası) ya da
    // benzeri bir hata ile reddedilmeli — sessizce başarılı OLMAMALI.
    expect(error).not.toBeNull();
  });
});
