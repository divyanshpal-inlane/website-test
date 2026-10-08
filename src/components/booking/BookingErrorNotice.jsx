import { AlertCircle, RotateCcw } from "lucide-react";
import { guideForError, errorTitle } from "../../services/bookingErrorGuide";

// Friendly, structured error box for the booking flow. Instead of a bare
// "Something went wrong" it renders three parts drawn from the error guide:
//
//   title  — a short headline for the failure
//   reason — plain-language cause (the "why did this happen")
//   action — exactly what to do next (the "what should I do")
//
// If the error has no recognised code (network blips, unexpected server
// errors) the guide falls back to a generic recovery blurb and the original
// message is still shown underneath so nothing is hidden. A plain string is
// treated as the whole message.
//
// <BookingErrorNotice error={payError} onRetry={refetch} />
// <BookingErrorNotice error={formError} />

const FALLBACK_TITLE = "Something went wrong";
const FALLBACK_REASON =
  "We hit a problem while handling your request. This can happen when a "
  + "network request fails or the booking service is briefly unavailable.";
const FALLBACK_ACTION =
  "Please try again in a moment. If it keeps happening, contact support and "
  + "mention this error message so we can chase it down for you.";

export default function BookingErrorNotice({ error, onRetry, className = "" }) {
  if (!error) return null;

  const rawMessage = typeof error === "string" ? error : error?.message;

  if (typeof error === "string") {
    // Plain string — no code to look up. Render it as the reason with the
    // generic recovery header.
    return (
      <div
        role="alert"
        className={`rounded-2xl border border-red-200 bg-red-50 p-5 ${className}`}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{FALLBACK_TITLE}</p>
            <p className="mt-1 text-sm text-gray-700">{rawMessage || FALLBACK_REASON}</p>
            <p className="mt-2 text-sm font-medium text-gray-900">{FALLBACK_ACTION}</p>
          </div>
        </div>
      </div>
    );
  }

  const guide = guideForError(error);
  const title = errorTitle(error) || FALLBACK_TITLE;
  const reason = guide?.reason || error?.message || FALLBACK_REASON;
  const action = guide?.action || FALLBACK_ACTION;

  return (
    <div
      role="alert"
      className={`rounded-2xl border border-red-200 bg-red-50 p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-sm text-gray-700">{reason}</p>
          <p className="mt-2 text-sm font-medium text-gray-900">{action}</p>

          {error?.message && error?.message !== reason && (
            <p className="mt-2 rounded-lg bg-red-100/70 px-2.5 py-1.5 text-xs text-red-800">
              {error.message}
            </p>
          )}

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
