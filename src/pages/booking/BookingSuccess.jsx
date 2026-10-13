import { useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, CalendarDays, FileUp, MessageCircle } from "lucide-react";
import { useBooking } from "../../context/BookingContext";

const APP_SIGNUP_URL = "https://inlane.in/signup";

export default function BookingSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const { reset } = useBooking();
  const rtoOnly = state.rtoOnly === true;

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#00ce84]/15">
        <CheckCircle2 className="h-9 w-9 text-[#00ce84]" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">You're booked! 🎉</h1>
      <p className="text-gray-500 mt-3">
        {rtoOnly
          ? "Your payment was successful — our team will start your RTO paperwork."
          : state.confirmed === false
            ? "Your payment was received. We're confirming your lesson slots now."
            : "Your payment was successful and your lesson slots are locked in."}
      </p>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
          What happens next
        </p>
        <ul className="space-y-4 text-sm text-gray-700">
          <li className="flex gap-3">
            <CalendarDays className="h-5 w-5 shrink-0 text-[#00ce84]" />
            <span>
              {rtoOnly
                ? "Upload your documents on the app so our team can start your RTO application."
                : "Our team will reach out on WhatsApp to confirm your pickup address and trainer."}
            </span>
          </li>
          {!rtoOnly && (
            <li className="flex gap-3">
              <MessageCircle className="h-5 w-5 shrink-0 text-[#00ce84]" />
              <span>
                Keep an eye out for reminders — a lesson a day keeps the potholes away.
              </span>
            </li>
          )}
        </ul>
      </div>

      <div className="mt-6 rounded-2xl border border-[#00ce84]/40 bg-[#00ce84]/5 p-6 text-left">
        <div className="flex items-start gap-3">
          <FileUp className="h-5 w-5 shrink-0 text-[#00ce84]" />
          <div>
            <p className="font-semibold text-gray-900">
              {rtoOnly
                ? "Upload your documents in the Lane app"
                : "Have your licence ready to upload in the Lane app"}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {rtoOnly
                ? "Sign in with the same phone number to upload the documents needed for your RTO application."
                : "Sign in with the same phone number to upload your licence so we can verify it before your lessons go live."}
            </p>
            <button
              type="button"
              onClick={() => window.open(APP_SIGNUP_URL, "_blank")}
              className="mt-4 w-full sm:w-auto rounded-xl bg-[#00ce84] px-6 py-2.5 font-semibold text-white hover:bg-[#00B97A]"
            >
              Open the Lane app
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="w-full sm:w-auto rounded-xl bg-[#00ce84] px-8 py-3 font-semibold text-white hover:bg-[#00B97A]"
        >
          {rtoOnly ? "Go to homepage" : "Browse more courses"}
        </button>
        <Link
          to="/blog/reschedule-policy"
          className="w-full sm:w-auto rounded-xl border border-gray-300 px-8 py-3 font-semibold text-gray-700 hover:border-gray-900 text-center"
        >
          View reschedule policy
        </Link>
      </div>

      {state.bookingId && (
        <p className="mt-8 text-xs text-gray-400">Booking ref: {state.bookingId}</p>
      )}
    </div>
  );
}