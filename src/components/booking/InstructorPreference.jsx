import { UserRound } from "lucide-react";

/**
 * Only rendered when the slots response indicates a female instructor serves
 * the chosen area (decision: never show the option when there is none).
 */
export default function InstructorPreference({ available, value, onChange }) {
  if (!available) return null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserRound className="h-5 w-5 text-[#00ce84]" />
        <h2 className="text-xl font-semibold">Do you have a preference?</h2>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        Some learners feel more comfortable with a female instructor. Happy to arrange it.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
            !value
              ? "bg-gray-900 border-gray-900 text-white"
              : "bg-white border-gray-300 text-gray-700 hover:border-gray-900"
          }`}
        >
          No preference
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
            value
              ? "bg-[#00ce84] border-[#00ce84] text-white"
              : "bg-white border-gray-300 text-gray-700 hover:border-[#00ce84]"
          }`}
        >
          Prefer a female instructor
        </button>
      </div>
    </section>
  );
}