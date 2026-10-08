import { createClient } from "@/lib/supabase/server";

/* ------------------------------------------------------------------ *
 * DampingVar finans motoru - Supabase RPC wrapper
 * Kural: frontend'den gelen hiçbir finansal orana güvenilmez.
 * İndirim, komisyon, havuz katkısı ve ödül SUNUCUDA hesaplanır.
 * ------------------------------------------------------------------ */

export type ValidationIssue = { code: string; message: string };

export type SaleInput = {
  businessId: string;
  campaignId?: string | null;
  code?: string | null;
  grossAmountCents: number;
  dampingUseCents?: number;
  paymentMethod?: string;
  actorEmail: string;
  actorRole?: string;
  note?: string;
};

export type SaleResult = {
  ok: boolean;
  issues: ValidationIssue[];
  receiptNo?: string;
  transactionId?: string;
  dampingRemainingCents?: number;
  referralRewardCents?: number;
};

export async function completeSale(input: SaleInput): Promise<SaleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_sale", {
    p_business_id: input.businessId,
    p_campaign_id: input.campaignId ?? null,
    p_code: input.code ?? null,
    p_gross_amount_cents: input.grossAmountCents,
    p_damping_use_cents: input.dampingUseCents ?? 0,
    p_payment_method: input.paymentMethod ?? "NAKIT",
    p_actor_email: input.actorEmail,
    p_actor_role: input.actorRole ?? "CASHIER",
    p_note: input.note ?? null,
  });

  if (error) {
    return {
      ok: false,
      issues: [{ code: "RPC_ERROR", message: error.message }],
    };
  }

  const row = data?.[0];
  if (!row || !row.ok) {
    const issues = row?.issues ? JSON.parse(row.issues) : [];
    return {
      ok: false,
      issues: issues.map((i: any) => ({ code: i.code, message: i.message })),
    };
  }

  return {
    ok: true,
    issues: [],
    receiptNo: row.receipt_no,
    transactionId: row.transaction_id,
    dampingRemainingCents: row.damping_remaining_cents,
    referralRewardCents: row.referral_reward_cents,
  };
}

export async function reverseTransaction(transactionId: string, actor: string, reason: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_transaction", {
    p_transaction_id: transactionId,
    p_actor: actor,
    p_reason: reason,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const row = data?.[0];
  if (!row || !row.ok) {
    return { ok: false, message: row?.message || "İade başarısız." };
  }

  return { ok: true, message: row.message };
}

export async function logAudit(
  actor: string,
  role: string,
  action: string,
  entityType: string,
  entityId: string,
  meta: Record<string, unknown>
) {
  const supabase = await createClient();
  await supabase.from("audit_logs").insert({
    actor,
    role,
    action,
    entity_type: entityType,
    entity_id: entityId,
    meta,
  });
}
            refId: transactionId,
            description: `İade: ${(row.receipt_no as string)} kazancı geri alındı`,
          });
        }
        if (dampingUsed > 0) {
          await tx.insert(walletLedger).values({
            walletId: wallet.id,
            userId: row.customer_id as string,
            entryType: "REVERSE",
            status: "AVAILABLE",
            amountCents: dampingUsed,
            refType: "TRANSACTION",
            refId: transactionId,
            description: `İade: ${(row.receipt_no as string)} harcaması iade edildi`,
          });
        }
        const available = wallet.availableCents + dampingUsed - dampingEarned;
        if (available < 0) throw new Error("NEGATIVE_BALANCE");
        await tx
          .update(dampingWallets)
          .set({
            availableCents: available,
            lifetimeEarnedCents: wallet.lifetimeEarnedCents - dampingEarned,
            lifetimeSpentCents: wallet.lifetimeSpentCents - dampingUsed,
            updatedAt: new Date(),
          })
          .where(eq(dampingWallets.id, wallet.id));
      }
    }

    // Havuz düzeltmesi: katkı geri alınır, havuzdan karşılanan ödül iade edilir.
    // REVERSE satırları kendi işaretini taşır (+/-), toplam her zaman ledger ile aynıdır.
    const poolDelta = -poolContribution + dampingEarned;
    if (poolContribution !== 0) {
      await tx.insert(poolLedger).values({
        businessId: row.business_id as string,
        direction: "REVERSE",
        amountCents: -poolContribution,
        refType: "TRANSACTION",
        refId: transactionId,
        description: `İade: ${(row.receipt_no as string)} havuz katkısı geri alındı`,
      });
    }
    if (dampingEarned !== 0) {
      await tx.insert(poolLedger).values({
        businessId: row.business_id as string,
        direction: "REVERSE",
        amountCents: dampingEarned,
        refType: "TRANSACTION",
        refId: transactionId,
        description: `İade: ${(row.receipt_no as string)} havuz ödülü iade edildi`,
      });
    }
    if (poolDelta !== 0) {
      await tx
        .update(dampingPool)
        .set({
          balanceCents: sql`${dampingPool.balanceCents} + ${poolDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(dampingPool.key, "GLOBAL"));
    }

    await tx
      .update(referralRewards)
      .set({ status: "CANCELLED" })
      .where(eq(referralRewards.transactionId, transactionId));

    if (row.qr_code_id) {
      await tx.update(qrCodes).set({ status: "ACTIVE", redeemedAt: null }).where(eq(qrCodes.id, row.qr_code_id as string));
    }

    await tx.insert(auditLogs).values({
      actor,
      role: "MANAGER",
      action: "TRANSACTION_REVERSED",
      entityType: "store_transactions",
      entityId: transactionId,
      meta: { reason, reversalId: rev.id },
    });

    return { ok: true, message: "İade kaydı oluşturuldu.", reversalId: rev.id };
  });
}

export async function logAudit(
  actor: string,
  role: string,
  action: string,
  entityType: string,
  entityId: string | null,
  meta: Record<string, unknown> = {}
) {
  await db.insert(auditLogs).values({ actor, role, action, entityType, entityId, meta });
}

export async function latestTransactions(businessId: string, limit = 8) {
  return await db
    .select()
    .from(transactions)
    .where(eq(transactions.businessId, businessId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);
}
