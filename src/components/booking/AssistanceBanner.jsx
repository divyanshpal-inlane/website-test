import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LifeBuoy, X } from "lucide-react";
import { trackFunnelEvent } from "../../utils/funnelTracking";

const IDLE_MS = 60_000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "touchstart", "scroll", "click"];

/**
 * Inline assistance prompt for the slot-booking page: shown after a period of
 * inactivity, or immediately when the customer uses the in-app "Back" link
 * (via the `trigger` prop set by the caller). Never blocks navigation or
 * interaction — purely an additive offer of help.
 */
export default function AssistanceBanner({ trigger = 0 }) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (dismissed) return undefined;
    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(true), IDLE_MS);
    };
    resetTimer();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [dismissed]);

  useEffect(() => {
    if (trigger > 0 && !dismissed) setVisible(true);
  }, [trigger, dismissed]);

  useEffect(() => {
    if (visible) {
      void trackFunnelEvent("expert_contact_requested", {
        cta_location: "schedule_assistance_banner",
        page_type: "booking_schedule",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible || dismissed) return null;

  return (
    <div
      role="status"
      className="rounded-2xl border border-[#D9FF7A] bg-[#F7FFE0] p-4 flex items-start gap-3"
    >
      <LifeBuoy className="h-5 w-5 text-[#00ce84] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">Need a hand picking your lessons?</p>
        <p className="text-sm text-gray-600 mt-0.5">
          If none of the times work for you, our team can help you find a schedule that fits.
        </p>
        <Link
          to="/signup"
          className="inline-block mt-2 text-sm font-semibold text-[#00B97A] hover:underline"
        >
          Talk to an expert
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-gray-400 hover:text-gray-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
