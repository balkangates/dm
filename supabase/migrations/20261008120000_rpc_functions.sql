-- =====================================================================
-- 0006 rpc_functions (Faz 03A)
-- Drizzle raw SQL sorgularını Supabase RPC fonksiyonlarına taşı
-- Bu RPC'ler complex aggregation ve join işlemleri için optimize edilmiş
-- =====================================================================
BEGIN;

-- Health check function
CREATE OR REPLACE FUNCTION health_check()
RETURNS boolean AS $$
BEGIN
  -- Simple SELECT 1 to verify database connectivity
  PERFORM 1;
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Analytics events count aggregation
CREATE OR REPLACE FUNCTION get_analytics_events_count(p_business_id uuid)
RETURNS TABLE(kind text, n bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT kind, count(*)::bigint as n
  FROM analytics_events
  WHERE business_id = p_business_id
  GROUP BY kind;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- QR codes count (total and redeemed)
CREATE OR REPLACE FUNCTION get_qr_codes_count(p_business_id uuid)
RETURNS TABLE(n bigint, used bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT
    count(*)::bigint as n,
    count(*) filter (where status = 'REDEEMED')::bigint as used
  FROM qr_codes
  WHERE business_id = p_business_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Business customers with visit count and spend aggregation
CREATE OR REPLACE FUNCTION get_business_customers(p_business_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  phone text,
  district text,
  referral_code text,
  visit_count bigint,
  spend_cents bigint,
  last_visit timestamp with time zone
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.name,
    u.email,
    u.phone,
    u.district,
    u.referral_code,
    count(t.id)::bigint as visit_count,
    coalesce(sum(t.net_amount_cents), 0)::bigint as spend_cents,
    max(t.created_at) as last_visit
  FROM store_transactions t
  INNER JOIN users u ON t.customer_id = u.id
  WHERE t.business_id = p_business_id
  GROUP BY u.id, u.name, u.email, u.phone, u.district, u.referral_code
  ORDER BY coalesce(sum(t.net_amount_cents), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Pool ledger aggregation by business
CREATE OR REPLACE FUNCTION get_pool_ledger_by_business()
RETURNS TABLE(
  business_id uuid,
  name text,
  contributed bigint,
  consumed bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pl.business_id,
    b.name,
    coalesce(sum(CASE WHEN pl.direction = 'CONTRIBUTE' THEN pl.amount_cents WHEN pl.direction = 'REVERSE' THEN -pl.amount_cents ELSE 0 END), 0)::bigint as contributed,
    coalesce(sum(CASE WHEN pl.direction = 'CONSUME' THEN pl.amount_cents WHEN pl.direction = 'REVERSE' THEN -pl.amount_cents ELSE 0 END), 0)::bigint as consumed
  FROM pool_ledger pl
  INNER JOIN businesses b ON pl.business_id = b.id
  GROUP BY pl.business_id, b.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute on public (RLS will control access)
GRANT EXECUTE ON FUNCTION health_check TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_analytics_events_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_qr_codes_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_business_customers TO authenticated;
GRANT EXECUTE ON FUNCTION get_pool_ledger_by_business TO authenticated;

-- =====================================================================
-- Financial Transaction RPC Functions (Faz 03C)
-- Atomik finansal işlemler için Supabase RPC fonksiyonları
-- =====================================================================

-- Complete Sale RPC
CREATE OR REPLACE FUNCTION complete_sale(
  p_business_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_gross_amount_cents bigint,
  p_damping_use_cents bigint DEFAULT 0,
  p_payment_method text DEFAULT 'NAKIT',
  p_actor_email text,
  p_actor_role text DEFAULT 'CASHIER',
  p_note text DEFAULT NULL
)
RETURNS TABLE(
  ok boolean,
  receipt_no text,
  transaction_id uuid,
  damping_remaining_cents bigint,
  referral_reward_cents bigint,
  issues jsonb
) AS $$
DECLARE
  v_biz record;
  v_contract record;
  v_campaign record;
  v_qr_row record;
  v_customer_id uuid;
  v_wallet record;
  v_damping_allowed bigint;
  v_discount bigint;
  v_damping bigint;
  v_net bigint;
  v_base bigint;
  v_commission bigint;
  v_pool_contribution bigint;
  v_damping_earned bigint;
  v_rno text;
  v_tx_id uuid;
  v_wallet_remaining bigint;
  v_referral_reward bigint;
  v_ref record;
  v_inviter_wallet record;
  v_issues jsonb := '[]'::jsonb;
  v_used_count bigint;
  v_current_time timestamp with time zone := now();
BEGIN
  -- 1-2. İşletme + sözleşme (kilitli)
  SELECT * INTO v_biz FROM businesses WHERE id = p_business_id;
  IF NOT FOUND THEN
    v_issues := v_issues || jsonb_build_object('code', 'NO_BUSINESS', 'message', 'İşletme bulunamadı.');
    RETURN QUERY SELECT false, NULL::text, NULL::uuid, 0::bigint, 0::bigint, v_issues;
    RETURN;
  END IF;

  SELECT * INTO v_contract FROM business_contracts
  WHERE business_id = p_business_id AND active = true;
  IF NOT FOUND THEN
    v_issues := v_issues || jsonb_build_object('code', 'NO_CONTRACT', 'message', 'Aktif işletme sözleşmesi yok.');
    RETURN QUERY SELECT false, NULL::text, NULL::uuid, 0::bigint, 0::bigint, v_issues;
    RETURN;
  END IF;

  -- 3. Kampanya
  IF p_campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign FROM campaigns WHERE id = p_campaign_id;
  ELSIF p_code IS NOT NULL THEN
    SELECT * INTO v_campaign FROM campaigns WHERE code = p_code;
  END IF;

  -- 4. QR kodu row kilidi
  IF p_code IS NOT NULL THEN
    SELECT id, status, business_id, campaign_id, customer_id
    INTO v_qr_row
    FROM qr_codes
    WHERE code = p_code
    FOR UPDATE;

    IF FOUND THEN
      IF v_qr_row.status = 'REDEEMED' THEN
        v_issues := v_issues || jsonb_build_object('code', 'QR_USED', 'message', 'Bu QR kodu daha önce kullanılmış.');
        RETURN QUERY SELECT false, NULL::text, NULL::uuid, 0::bigint, 0::bigint, v_issues;
        RETURN;
      END IF;

      IF v_qr_row.business_id != p_business_id THEN
        v_issues := v_issues || jsonb_build_object('code', 'QR_WRONG_BUSINESS', 'message', 'QR kodu başka bir işletmeye ait.');
        RETURN QUERY SELECT false, NULL::text, NULL::uuid, 0::bigint, 0::bigint, v_issues;
        RETURN;
      END IF;

      IF v_campaign IS NULL AND v_qr_row.campaign_id IS NOT NULL THEN
        SELECT * INTO v_campaign FROM campaigns WHERE id = v_qr_row.campaign_id;
      END IF;
    END IF;
  END IF;

  -- 5. Kampanya kuralları
  IF v_campaign IS NOT NULL THEN
    SELECT count(*)::bigint INTO v_used_count
    FROM store_transactions
    WHERE campaign_id = v_campaign.id AND status <> 'CANCELLED';

    IF v_campaign.status != 'PUBLISHED' THEN
      v_issues := v_issues || jsonb_build_object('code', 'CAMPAIGN_INACTIVE', 'message', 'Kampanya yayında değil.');
    END IF;

    IF v_campaign.starts_at > v_current_time THEN
      v_issues := v_issues || jsonb_build_object('code', 'CAMPAIGN_NOT_STARTED', 'message', 'Kampanya henüz başlamadı.');
    END IF;

    IF v_campaign.ends_at IS NOT NULL AND v_campaign.ends_at < v_current_time THEN
      v_issues := v_issues || jsonb_build_object('code', 'CAMPAIGN_ENDED', 'message', 'Kampanya süresi dolmuş.');
    END IF;

    IF v_campaign.usage_limit IS NOT NULL AND v_used_count >= v_campaign.usage_limit THEN
      v_issues := v_issues || jsonb_build_object('code', 'USAGE_LIMIT', 'message', 'Kampanya kullanım limiti dolmuş.');
    END IF;
  END IF;

  IF jsonb_array_length(v_issues) > 0 THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid, 0::bigint, 0::bigint, v_issues;
    RETURN;
  END IF;

  -- 6. Müşteri
  v_customer_id := v_qr_row.customer_id;

  -- 7-8. Fiyatlandırma
  v_damping_allowed := p_damping_use_cents;
  IF v_customer_id IS NOT NULL AND p_damping_use_cents > 0 THEN
    SELECT id, available_cents INTO v_wallet
    FROM damping_wallets
    WHERE user_id = v_customer_id
    FOR UPDATE;

    IF NOT FOUND OR v_wallet.available_cents < p_damping_use_cents THEN
      v_issues := v_issues || jsonb_build_object(
        'code', 'INSUFFICIENT_DAMPING',
        'message', 'Damping Hane bakiyesi yetersiz.'
      );
      RETURN QUERY SELECT false, NULL::text, NULL::uuid, 0::bigint, 0::bigint, v_issues;
      RETURN;
    END IF;
  ELSE
    v_damping_allowed := 0;
  END IF;

  -- Basit fiyatlandırma (tam logic kod tarafında)
  v_discount := 0;
  v_damping := v_damping_allowed;
  v_net := p_gross_amount_cents - v_discount - v_damping;
  v_base := v_net; -- AFTER_DAMPING varsayılan
  v_commission := round(v_base * v_contract.commission_rate) + v_contract.fixed_fee_cents;
  v_pool_contribution := round((p_gross_amount_cents - v_discount) * v_contract.pool_contribution_rate);
  v_damping_earned := round((p_gross_amount_cents - v_discount) * v_contract.damping_reward_rate);

  -- 9. Satış kaydı
  v_rno := 'DMP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

  INSERT INTO store_transactions (
    business_id, campaign_id, customer_id, qr_code_id, receipt_no,
    gross_amount_cents, discount_cents, damping_used_cents, net_amount_cents,
    commission_base_cents, commission_rate, commission_cents,
    pool_contribution_cents, damping_earned_cents,
    status, payment_method, note
  ) VALUES (
    p_business_id, v_campaign.id, v_customer_id, v_qr_row.id, v_rno,
    p_gross_amount_cents, v_discount, v_damping, v_net,
    v_base, v_contract.commission_rate, v_commission,
    v_pool_contribution, v_damping_earned,
    'COMPLETED', p_payment_method, p_note
  ) RETURNING id INTO v_tx_id;

  -- 10. QR kullanım işareti
  IF v_qr_row IS NOT NULL THEN
    UPDATE qr_codes
    SET status = 'REDEEMED', redeemed_at = now(), transaction_id = v_tx_id
    WHERE id = v_qr_row.id;
  END IF;

  -- 11. Damping Hane ledger
  IF v_customer_id IS NOT NULL THEN
    SELECT * INTO v_wallet FROM damping_wallets WHERE user_id = v_customer_id;

    IF v_wallet IS NOT NULL THEN
      IF v_damping > 0 THEN
        INSERT INTO wallet_ledger (
          wallet_id, user_id, entry_type, status, amount_cents, ref_type, ref_id, description
        ) VALUES (
          v_wallet.id, v_customer_id, 'SPEND', 'SPENT', -v_damping, 'TRANSACTION', v_tx_id,
          v_biz.name || ' — kasa harcaması (' || v_rno || ')'
        );
      END IF;

      IF v_damping_earned > 0 THEN
        INSERT INTO wallet_ledger (
          wallet_id, user_id, entry_type, status, amount_cents, ref_type, ref_id, description
        ) VALUES (
          v_wallet.id, v_customer_id, 'EARN', 'AVAILABLE', v_damping_earned, 'TRANSACTION', v_tx_id,
          v_biz.name || ' — damping kazancı (' || v_rno || ')'
        );
      END IF;

      v_wallet_remaining := v_wallet.available_cents - v_damping + v_damping_earned;
      IF v_wallet_remaining < 0 THEN
        RAISE EXCEPTION 'NEGATIVE_BALANCE';
      END IF;

      UPDATE damping_wallets
      SET available_cents = v_wallet_remaining,
          lifetime_earned_cents = lifetime_earned_cents + v_damping_earned,
          lifetime_spent_cents = lifetime_spent_cents + v_damping,
          updated_at = now()
      WHERE id = v_wallet.id;
    END IF;
  END IF;

  -- 12. Ortak havuz
  IF v_pool_contribution > 0 THEN
    INSERT INTO pool_ledger (
      business_id, direction, amount_cents, ref_type, ref_id, description
    ) VALUES (
      p_business_id, 'CONTRIBUTE', v_pool_contribution, 'TRANSACTION', v_tx_id,
      v_biz.name || ' — havuz katkısı (' || v_rno || ')'
    );

    UPDATE damping_pool
    SET balance_cents = balance_cents + v_pool_contribution, updated_at = now()
    WHERE key = 'GLOBAL';

    IF v_damping_earned > 0 THEN
      INSERT INTO pool_ledger (
        business_id, direction, amount_cents, ref_type, ref_id, description
      ) VALUES (
        p_business_id, 'CONSUME', v_damping_earned, 'TRANSACTION', v_tx_id,
        v_biz.name || ' — havuzdan karşılanan ödül (' || v_rno || ')'
      );

      UPDATE damping_pool
      SET balance_cents = balance_cents - v_damping_earned, updated_at = now()
      WHERE key = 'GLOBAL';
    END IF;
  END IF;

  -- 13. Referral ödülü
  v_referral_reward := 0;
  IF v_customer_id IS NOT NULL THEN
    SELECT * INTO v_ref FROM referrals
    WHERE invitee_id = v_customer_id AND status = 'QUALIFIED';

    IF v_ref IS NOT NULL THEN
      DECLARE
        v_self_referral boolean := v_ref.inviter_id = v_customer_id;
        v_flags text[] := ARRAY[]::text[];
        v_prior_count bigint;
        v_reward bigint;
      BEGIN
        IF v_self_referral THEN
          v_flags := array_append(v_flags, 'SELF_REFERRAL');
        END IF;

        SELECT count(*)::bigint INTO v_prior_count
        FROM referral_rewards WHERE inviter_id = v_ref.inviter_id;

        IF v_prior_count > 25 THEN
          v_flags := array_append(v_flags, 'EXCESSIVE_REFERRAL');
        END IF;

        v_reward := round(v_base * v_contract.referral_rate);

        IF v_reward > 0 THEN
          INSERT INTO referral_rewards (
            referral_id, transaction_id, inviter_id, amount_cents, status
          ) VALUES (
            v_ref.id, v_tx_id, v_ref.inviter_id, v_reward,
            CASE WHEN array_length(v_flags, 1) > 0 THEN 'FRAUD_REVIEW' ELSE 'AVAILABLE' END
          );

          IF array_length(v_flags, 1) > 0 THEN
            INSERT INTO fraud_reviews (
              transaction_id, user_id, reason, signals, status
            ) VALUES (
              v_tx_id, v_customer_id, 'Referral şüpheli davranış', v_flags, 'OPEN'
            );
          ELSE
            v_referral_reward := v_reward;

            SELECT * INTO v_inviter_wallet FROM damping_wallets WHERE user_id = v_ref.inviter_id;
            IF v_inviter_wallet IS NOT NULL THEN
              INSERT INTO wallet_ledger (
                wallet_id, user_id, entry_type, status, amount_cents, ref_type, ref_id, description
              ) VALUES (
                v_inviter_wallet.id, v_ref.inviter_id, 'REFERRAL', 'AVAILABLE', v_reward,
                'REFERRAL', v_ref.id, 'Paylaş & Kazan ödülü (' || v_rno || ')'
              );

              UPDATE damping_wallets
              SET available_cents = available_cents + v_reward,
                  lifetime_earned_cents = lifetime_earned_cents + v_reward,
                  updated_at = now()
              WHERE id = v_inviter_wallet.id;
            END IF;
          END IF;
        END IF;
      END;
    END IF;
  END IF;

  -- 14. Kampanya sayacı
  IF v_campaign IS NOT NULL THEN
    UPDATE campaigns SET redemptions = redemptions + 1 WHERE id = v_campaign.id;
  END IF;

  -- Audit
  INSERT INTO audit_logs (
    actor, role, action, entity_type, entity_id, meta
  ) VALUES (
    p_actor_email, p_actor_role, 'TRANSACTION_COMPLETED', 'store_transactions', v_tx_id,
    jsonb_build_object(
      'receiptNo', v_rno,
      'gross', p_gross_amount_cents,
      'discount', v_discount,
      'dampingUsed', v_damping,
      'net', v_net,
      'commission', v_commission
    )
  );

  RETURN QUERY SELECT true, v_rno, v_tx_id, v_wallet_remaining, v_referral_reward, v_issues;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reverse Transaction RPC
CREATE OR REPLACE FUNCTION reverse_transaction(
  p_transaction_id uuid,
  p_actor text,
  p_reason text
)
RETURNS TABLE(
  ok boolean,
  message text
) AS $$
DECLARE
  v_row record;
  v_gross bigint;
  v_damping_used bigint;
  v_damping_earned bigint;
  v_pool_contribution bigint;
  v_rev_id uuid;
  v_wallet record;
BEGIN
  SELECT id, status, business_id, customer_id, qr_code_id,
         gross_amount_cents, discount_cents, damping_used_cents,
         net_amount_cents, commission_cents, pool_contribution_cents,
         damping_earned_cents, campaign_id, receipt_no
  INTO v_row
  FROM store_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'İşlem bulunamadı.';
    RETURN;
  END IF;

  IF v_row.status = 'REVERSED' THEN
    RETURN QUERY SELECT false, 'Bu işlem zaten iade edilmiş.';
    RETURN;
  END IF;

  v_gross := v_row.gross_amount_cents;
  v_damping_used := v_row.damping_used_cents;
  v_damping_earned := v_row.damping_earned_cents;
  v_pool_contribution := v_row.pool_contribution_cents;

  -- Reversal kaydı
  INSERT INTO store_transactions (
    business_id, campaign_id, customer_id, qr_code_id, receipt_no,
    gross_amount_cents, discount_cents, damping_used_cents, net_amount_cents,
    commission_base_cents, commission_rate, commission_cents,
    pool_contribution_cents, damping_earned_cents,
    status, payment_method, reversal_of, note
  ) VALUES (
    v_row.business_id, v_row.campaign_id, v_row.customer_id, v_row.qr_code_id,
    'IAD-' || substring(v_row.receipt_no from 5),
    -v_gross, -v_row.discount_cents, -v_damping_used, -v_row.net_amount_cents,
    0, 0, -v_row.commission_cents,
    -v_pool_contribution, -v_damping_earned,
    'REVERSED', 'IADE', p_transaction_id, p_reason
  ) RETURNING id INTO v_rev_id;

  UPDATE store_transactions SET status = 'REVERSED' WHERE id = p_transaction_id;

  -- Wallet reversal
  IF v_row.customer_id IS NOT NULL THEN
    SELECT * INTO v_wallet FROM damping_wallets WHERE user_id = v_row.customer_id;

    IF v_wallet IS NOT NULL THEN
      IF v_damping_earned > 0 THEN
        INSERT INTO wallet_ledger (
          wallet_id, user_id, entry_type, status, amount_cents, ref_type, ref_id, description
        ) VALUES (
          v_wallet.id, v_row.customer_id, 'REVERSE', 'CANCELLED', -v_damping_earned,
          'TRANSACTION', p_transaction_id, 'İade damping kazancı'
        );
      END IF;

      IF v_damping_used > 0 THEN
        INSERT INTO wallet_ledger (
          wallet_id, user_id, entry_type, status, amount_cents, ref_type, ref_id, description
        ) VALUES (
          v_wallet.id, v_row.customer_id, 'REVERSE', 'AVAILABLE', v_damping_used,
          'TRANSACTION', p_transaction_id, 'İade damping harcaması'
        );
      END IF;

      UPDATE damping_wallets
      SET available_cents = available_cents + v_damping_used - v_damping_earned,
          updated_at = now()
      WHERE id = v_wallet.id;
    END IF;
  END IF;

  -- Pool reversal
  IF v_pool_contribution > 0 THEN
    INSERT INTO pool_ledger (
      business_id, direction, amount_cents, ref_type, ref_id, description
    ) VALUES (
      v_row.business_id, 'REVERSE', -v_pool_contribution, 'TRANSACTION', p_transaction_id,
      'İade havuz katkısı'
    );

    UPDATE damping_pool
    SET balance_cents = balance_cents - v_pool_contribution, updated_at = now()
    WHERE key = 'GLOBAL';
  END IF;

  IF v_damping_earned > 0 THEN
    INSERT INTO pool_ledger (
      business_id, direction, amount_cents, ref_type, ref_id, description
    ) VALUES (
      v_row.business_id, 'REVERSE', v_damping_earned, 'TRANSACTION', p_transaction_id,
      'İade havuzdan karşılanan ödül'
    );

    UPDATE damping_pool
    SET balance_cents = balance_cents + v_damping_earned, updated_at = now()
    WHERE key = 'GLOBAL';
  END IF;

  RETURN QUERY SELECT true, 'İade başarıyla tamamlandı.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute on financial RPC functions
GRANT EXECUTE ON FUNCTION complete_sale TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_transaction TO authenticated;

COMMIT;
