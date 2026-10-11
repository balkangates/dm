/**
 * KARAKTERİZASYON TESTİ — mevcut finans hesaplarının davranışını dondurur.
 * Amaç "doğru olanı" kanıtlamak değil, migration sonrası AYNI sonucu garanti etmektir.
 * Snapshot değişirse migration davranışı değiştirmiş demektir (FINANCE PARITY = FAIL).
 */
import { describe, expect, it } from "vitest";
import {
  commissionBaseFor,
  discountFor,
  priceTransaction,
  validateCampaignUsage,
  type CampaignRow,
  type ContractRow,
} from "@/lib/finance";

const FIXED_START = new Date("2026-01-01T00:00:00.000Z");

function campaign(over: Partial<CampaignRow> = {}): CampaignRow {
  return {
    id: "c-1",
    businessId: "b-1",
    code: "TEST",
    title: "t",
    description: null,
    type: "PERCENT",
    discountPercent: 0,
    discountAmountCents: 0,
    minBasketCents: 0,
    maxDiscountCents: 0,
    usageLimit: null,
    perCustomerLimit: 1,
    startsAt: FIXED_START,
    endsAt: null,
    timeStart: null,
    timeEnd: null,
    days: [],
    status: "PUBLISHED",
    qrEnabled: true,
    views: 0,
    clicks: 0,
    redemptions: 0,
    createdAt: FIXED_START,
    ...over,
  } as CampaignRow;
}

function contract(over: Partial<ContractRow> = {}): ContractRow {
  return {
    id: "k-1",
    businessId: "b-1",
    commissionRate: 0.045,
    commissionBase: "AFTER_DAMPING",
    fixedFeeCents: 0,
    perCustomerFeeCents: 0,
    referralRate: 0.01,
    poolContributionRate: 0.03,
    dampingRewardRate: 0.02,
    packageCode: "PRO",
    active: true,
    ...over,
  } as ContractRow;
}

const CAMPAIGNS: Record<string, CampaignRow | null> = {
  none: null,
  percent15_min25000: campaign({ type: "PERCENT", discountPercent: 15, minBasketCents: 25000 }),
  percent15_max1500: campaign({ type: "PERCENT", discountPercent: 15, maxDiscountCents: 1500 }),
  fixed5000: campaign({ type: "FIXED", discountAmountCents: 5000 }),
  product3000: campaign({ type: "PRODUCT", discountAmountCents: 3000 }),
  hour20: campaign({ type: "HOUR", discountPercent: 20 }),
};

const GROSS = [0, 999, 10000, 24999, 25000, 25001, 100000];
const DAMPING = [0, 2500, 999999];
const BASES = ["GROSS", "NET_AFTER_DISCOUNT", "AFTER_DAMPING"];

describe("priceTransaction (karakterizasyon matrisi)", () => {
  it("tüm kombinasyonlar için çıktı değişmez", () => {
    const rows: string[] = [];
    for (const [cname, c] of Object.entries(CAMPAIGNS)) {
      for (const base of BASES) {
        for (const g of GROSS) {
          for (const d of DAMPING) {
            const r = priceTransaction({
              grossAmountCents: g,
              campaign: c,
              contract: contract({ commissionBase: base, fixedFeeCents: base === "GROSS" ? 50 : 0 }),
              dampingUsedCents: d,
            });
            rows.push(`${cname}|${base}|g=${g}|d=${d} => ${JSON.stringify(r)}`);
          }
        }
      }
    }
    expect(rows.length).toBe(6 * 3 * 7 * 3);
    expect(rows).toMatchSnapshot();
  });

  it("değişmezler: net = brüt − indirim − damping, hiçbir tutar negatif değil", () => {
    for (const c of Object.values(CAMPAIGNS)) {
      for (const g of GROSS) {
        for (const d of DAMPING) {
          const r = priceTransaction({
            grossAmountCents: g,
            campaign: c,
            contract: contract(),
            dampingUsedCents: d,
          });
          expect(r.netAmountCents).toBe(r.grossAmountCents - r.discountCents - r.dampingUsedCents);
          for (const v of Object.values(r)) expect(v).toBeGreaterThanOrEqual(0);
          expect(r.dampingUsedCents).toBeLessThanOrEqual(r.grossAmountCents - r.discountCents);
        }
      }
    }
  });

  it("negatif ve kesirli girdiler normalize edilir", () => {
    const r = priceTransaction({
      grossAmountCents: -500,
      campaign: null,
      contract: contract(),
      dampingUsedCents: -10,
    });
    expect(r.grossAmountCents).toBe(0);
    expect(r).toMatchSnapshot();
    const f = priceTransaction({
      grossAmountCents: 1000.6,
      campaign: null,
      contract: contract(),
      dampingUsedCents: 0.4,
    });
    expect(f).toMatchSnapshot();
  });
});

describe("discountFor / commissionBaseFor", () => {
  it("indirim kuralları", () => {
    const out = Object.entries(CAMPAIGNS).map(([n, c]) => [n, GROSS.map((g) => discountFor(c, g))]);
    expect(out).toMatchSnapshot();
  });
  it("komisyon tabanı", () => {
    const out = BASES.map((b) => commissionBaseFor(contract({ commissionBase: b }), 10000, 1500, 2000));
    expect(out).toEqual([10000, 8500, 6500]);
    expect(commissionBaseFor(contract({ commissionBase: "UNKNOWN" }), 10000, 1500, 2000)).toBe(6500);
  });
});

describe("validateCampaignUsage (sabit 'şimdi')", () => {
  // 14 Ekim 2026 Çarşamba 09:30 (yerel saat) — getDay() = 3
  const NOW = new Date(2026, 9, 14, 9, 30, 0);
  const codes = (c: CampaignRow | null, used = 0) => validateCampaignUsage(c, used, NOW).map((i) => i.code);

  it("senaryolar", () => {
    const cases: Record<string, string[]> = {
      kampanyaYok: codes(null),
      gecerli: codes(campaign()),
      taslak: codes(campaign({ status: "DRAFT" })),
      baslamadi: codes(campaign({ startsAt: new Date(2027, 0, 1) })),
      bitti: codes(campaign({ endsAt: new Date(2026, 0, 1) })),
      limitDolu: codes(campaign({ usageLimit: 5 }), 5),
      limitAlti: codes(campaign({ usageLimit: 5 }), 4),
      saatIci: codes(campaign({ timeStart: "08:00", timeEnd: "10:00" })),
      saatDisi: codes(campaign({ timeStart: "14:00", timeEnd: "17:00" })),
      gunIci: codes(campaign({ days: [3] })),
      gunDisi: codes(campaign({ days: [1, 2] })),
      cokluIhlal: codes(
        campaign({ status: "ENDED", timeStart: "14:00", timeEnd: "17:00", days: [0], usageLimit: 1 }),
        9
      ),
    };
    expect(cases.kampanyaYok).toEqual([]);
    expect(cases.gecerli).toEqual([]);
    expect(cases).toMatchSnapshot();
  });
});
