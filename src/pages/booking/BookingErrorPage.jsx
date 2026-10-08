import { useNavigate, Link } from "react-router-dom";
import { CalendarX2, AlertTriangle, RotateCcw } from "lucide-react";

export default function BookingErrorPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
        <CalendarX2 className="h-9 w-9 text-amber-600" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Those slots were just taken</h1>
      <p className="text-gray-500 mt-3">
        Someone else grabbed them while you were completing your booking (they're held for only 30
        minutes). No payment was taken — pick fresh slots and carry on.
      </p>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 text-left text-sm text-gray-600 space-y-2">
        <p className="flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          Slots you had picked are no longer guaranteed.
        </p>
        <p className="flex gap-2">
          <RotateCcw className="h-4 w-4 shrink-0 text-[#00ce84] mt-0.5" />
          Your course and add-on selections are still saved.
        </p>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/book")}
          className="w-full sm:w-auto rounded-xl bg-[#00ce84] px-8 py-3 font-semibold text-white hover:bg-[#00B97A]"
        >
          Pick new slots
        </button>
        <Link
          to="/"
          className="w-full sm:w-auto rounded-xl border border-gray-300 px-8 py-3 font-semibold text-gray-700 hover:border-gray-900 text-center"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}