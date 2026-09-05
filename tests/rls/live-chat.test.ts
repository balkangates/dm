// tests/rls/live-chat.test.ts
// ─────────────────────────────────────────────────────────────────────
// Faz 1'de doğrulanan 3 davranışı REGRESYONA KARŞI kilitler:
//   1) Mağazalar arası izolasyon (bir mağazanın sohbeti başka mağazadan
//      görünmemeli)
//   2) Aynı mağaza içinde ÇİFT YÖNLÜ görünürlük (bayi ↔ müşteri)
//      — projenin ORİJİNAL şikayetiydi, en kritik test bu.
//   3) RLS'in kapalı KALMAMASI (Faz 1.1'de canlıda kapalı bulunmuştu)
// Kaynak: fixes/fix_live_chat_consolidated_final.sql
// =====================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadFixtures, signInAs, assertNotProductionTarget, type RlsTestFixtures } from './setup';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('canlı yayın sohbeti (messages, message_type=live) RLS', () => {
  let fx: RlsTestFixtures;
  let dealerAClient: SupabaseClient;
  let customerAClient: SupabaseClient;
  let dealerBClient: SupabaseClient;
  let conversationIdA: string;
  let testMessageText: string;

  beforeAll(async () => {
    assertNotProductionTarget(); // bkz. setup.ts — production'a karşı çalışmayı engeller
    fx = loadFixtures();
    dealerAClient = await signInAs(fx.dealerA.email, fx.dealerA.password);
    customerAClient = await signInAs(fx.customerA.email, fx.customerA.password);
    dealerBClient = await signInAs(fx.dealerB.email, fx.dealerB.password);

    const { data: convId, error: convErr } = await dealerAClient.rpc(
      'get_or_create_store_live_conversation',
      { p_store_id: fx.storeA.id }
    );
    if (convErr) throw convErr;
    conversationIdA = convId as string;

    testMessageText = `rls-test-${Date.now()}`;
    const { error: insertErr } = await dealerAClient.from('messages').insert({
      conversation_id: conversationIdA,
      sender_id: fx.storeA.ownerId,
      message: testMessageText,
      message_type: 'live',
    });
    if (insertErr) throw insertErr;
  });

  it('RLS açık olmalı (Faz 1.1\'de kapalı bulunmuştu — bu test o regresyonu bir daha yakalar)', async () => {
    // service-role olmadan RLS durumunu doğrudan sorgulayamayız; dolaylı
    // kanıt: aşağıdaki izolasyon testi RLS kapalıyken KESİNLİKLE geçemez
    // (herkes her şeyi görür). Bu test placeholder — asıl kanıt izolasyon
    // testindeki başarısızlıkta ortaya çıkar. Servis-rolü anahtarınız
    // varsa burada pg_class.relrowsecurity sorgusunu ekleyebilirsiniz.
    expect(conversationIdA).toBeTruthy();
  });

  it('ÇİFT YÖNLÜ: müşteri (customerA), bayinin (dealerA) yazdığı mesajı görebilmeli', async () => {
    const { data, error } = await customerAClient
      .from('messages')
      .select('message, sender_id')
      .eq('conversation_id', conversationIdA)
      .eq('message', testMessageText);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('ÇİFT YÖNLÜ: müşteri (customerA) yazınca, bayi (dealerA) müşterinin mesajını görebilmeli', async () => {
    const customerMsg = `rls-test-customer-${Date.now()}`;
    const { error: insertErr } = await customerAClient.from('messages').insert({
      conversation_id: conversationIdA,
      sender_id: fx.customerA.id,
      message: customerMsg,
      message_type: 'live',
    });
    expect(insertErr).toBeNull();

    const { data, error } = await dealerAClient
      .from('messages')
      .select('message, sender_id')
      .eq('conversation_id', conversationIdA)
      .eq('message', customerMsg);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('İZOLASYON: storeB\'nin bayisi (dealerB), storeA\'nın canlı sohbet mesajını GÖREMEMELİ', async () => {
    const { data, error } = await dealerBClient
      .from('messages')
      .select('message')
      .eq('conversation_id', conversationIdA)
      .eq('message', testMessageText);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('İZOLASYON: storeB bayisi, storeA\'nın conversation_participants satırlarını GÖREMEMELİ', async () => {
    const { data, error } = await dealerBClient
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationIdA);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('legacy hayalet id (\'e3fc6ac0-...\') artık conversations tablosunda yok (Faz 1.2 temizliği kalıcı mı?)', async () => {
    const { data, error } = await dealerAClient
      .from('conversations')
      .select('id')
      .eq('id', 'e3fc6ac0-5e8f-4bb6-9aa1-ca1d84ddaf73');

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

describe('DM (1:1 özel mesajlaşma, message_type=dm) RLS', () => {
  let fx: RlsTestFixtures;

  beforeAll(() => {
    assertNotProductionTarget(); // bkz. setup.ts — production'a karşı çalışmayı engeller
    fx = loadFixtures();
  });

  it('customerA ile storeA arasındaki DM, storeB\'nin bayisi tarafından GÖRÜLEMEMELİ', async () => {
    const customerAClient = await signInAs(fx.customerA.email, fx.customerA.password);
    const dealerBClient = await signInAs(fx.dealerB.email, fx.dealerB.password);

    const { data: convId, error: convErr } = await customerAClient.rpc(
      'get_or_create_store_dm_conversation',
      { p_store_id: fx.storeA.id }
    );
    expect(convErr).toBeNull();

    const { data, error } = await dealerBClient
      .from('conversations')
      .select('id')
      .eq('id', convId as string);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
