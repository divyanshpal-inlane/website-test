// Pure pricing math. All arithmetic in integer paise to avoid float drift; the
// DB-facing rupee figures are emitted as two-decimal numbers / whole rupees.

export function rupeesToPaise(rupees: unknown): number {
  const n = Number(rupees);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export interface BookingAmounts {
  basePaise: number;
  addonsPaise: number;
  discountPaise: number;
  totalPaise: number;
  base: number;
  addons: number;
  discount: number;
  total: number;
}

export function computeBookingAmounts(
  coursePriceRupees: number | string,
  addonPricesRupees: Array<number | string>,
  discountRupees: number | string = 0,
): BookingAmounts {
  const basePaise = rupeesToPaise(coursePriceRupees);
  const addonsPaise = (addonPricesRupees || []).reduce(
    (acc, p) => acc + rupeesToPaise(p),
    0,
  );
  const discountPaise = Math.min(
    rupeesToPaise(discountRupees),
    basePaise + addonsPaise,
  );
  const totalPaise = basePaise + addonsPaise - discountPaise;
  return {
    basePaise,
    addonsPaise,
    discountPaise,
    totalPaise,
    base: paiseToRupees(basePaise),
    addons: paiseToRupees(addonsPaise),
    discount: paiseToRupees(discountPaise),
    total: paiseToRupees(totalPaise),
  };
}

export interface InstallmentSplit {
  installmentMode: "full" | "first_half";
  installment1Paise: number;
  installment2Paise: number;
  installment1: number;
  installment2: number;
}

export function splitInstallment(
  totalPaise: number,
  mode: string,
): InstallmentSplit {
  if (mode === "first_half") {
    const installment1Paise = Math.round(totalPaise / 2);
    const installment2Paise = totalPaise - installment1Paise;
    return {
      installmentMode: "first_half",
      installment1Paise,
      installment2Paise,
      installment1: paiseToRupees(installment1Paise),
      installment2: paiseToRupees(installment2Paise),
    };
  }
  return {
    installmentMode: "full",
    installment1Paise: totalPaise,
    installment2Paise: 0,
    installment1: paiseToRupees(totalPaise),
    installment2: 0,
  };
}

// Mirrors getHalfPaymentLessons in create-razorpay-order / complete-payment:
// 10h -> [1..8], 8h -> [1..6], 6h -> [1..4], 4h -> [1..2], 2h/1h -> [1].
export function getHalfPaymentLessons(totalHours: number): number[] {
  if (totalHours <= 2) return [1];
  const count = totalHours - 2;
  return Array.from({ length: count }, (_, i) => i + 1);
}