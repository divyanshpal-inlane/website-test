import { useState } from "react";
import { Alert, CircularProgress } from "@mui/material";
import { Lock } from "lucide-react";
import { formatINR } from "../../services/bookingApi";
import BookingErrorNotice from "./BookingErrorNotice";

export default function PaymentSection({
  totalAmount,
  installmentMode,
  modes,
  onInstallmentChange,
  onPay,
  paying,
  error,
  payLabel,
}) {
  const [agreed, setAgreed] = useState(false);

  const payNow = installmentMode === "first_half" ? Math.round(totalAmount / 2) : totalAmount;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-semibold mb-1">How would you like to pay?</h2>
      <p className="text-gray-500 text-sm mb-4">
        You can pay the full amount now, or 50% today and the rest later.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {modes.map((mode) => {
          const active = installmentMode === mode;
          const isHalf = mode === "first_half";
          return (
            <button
              key={mode}
              type="button"
              disabled={paying}
              onClick={() => onInstallmentChange(mode)}
              className={`text-left rounded-2xl border p-4 transition-all ${
                active
                  ? "border-[#00ce84] ring-2 ring-[#00ce84]/30 bg-white"
                  : "border-gray-200 bg-white hover:border-[#00ce84]/60"
              }`}
            >
              <p className="text-base font-semibold text-gray-900">
                {isHalf ? "Pay 50% now" : "Pay full now"}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                {isHalf
                  ? `${formatINR(Math.round(totalAmount / 2))} today · ${formatINR(totalAmount - Math.round(totalAmount / 2))} later`
                  : `${formatINR(totalAmount)} in one go`}
              </p>
            </button>
          );
        })}
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-600 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#00ce84]"
          disabled={paying}
        />
        <span>
          I agree to the{" "}
          <a href="/terms-and-conditions" target="_blank" rel="noreferrer" className="underline">
            Terms
          </a>
          ,{" "}
          <a href="/payment-policy" target="_blank" rel="noreferrer" className="underline">
            Payment policy
          </a>{" "}
          and{" "}
          <a href="/refund-policy" target="_blank" rel="noreferrer" className="underline">
            Refund policy
          </a>
          .
        </span>
      </label>

      {error && <BookingErrorNotice error={error} className="mb-4" />}

      <button
        type="button"
        disabled={!agreed || paying}
        onClick={onPay}
        className={`w-full rounded-xl px-6 py-3.5 font-semibold text-white transition-colors ${
          agreed && !paying
            ? "bg-[#00ce84] hover:bg-[#00B97A]"
            : "bg-gray-300 cursor-not-allowed"
        }`}
      >
        {paying ? (
          <span className="inline-flex items-center gap-2">
            <CircularProgress size={18} color="inherit" /> Processing…
          </span>
        ) : (
          <>{payLabel || <>Pay {formatINR(payNow)} via UPI/Card/NetBanking</>}</>
        )}
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <Lock className="h-3.5 w-3.5" /> Secure payments through Razorpay
      </p>
    </section>
  );
}