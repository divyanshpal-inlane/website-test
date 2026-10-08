import { CarFront } from "lucide-react";

export default function LicenceDetails({ has_a_DL, onChange }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <CarFront className="h-5 w-5 text-[#00ce84]" />
        <h2 className="text-xl font-semibold">Do you have a 4-wheeler driving licence?</h2>
      </div>
      <p className="text-gray-500 text-sm mb-4 min-h-[1.25rem]">
        {has_a_DL
          ? "You'll be able to pick your own lesson slots in the next step."
          : "No problem — we'll assign your trainer and schedule your lessons after payment."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[true, false].map((value) => {
          const label = value ? "Yes, I have one" : "No, not yet";
          const note = value
            ? "You can pick concrete lesson slots."
            : "We'll assign a trainer for your lessons.";
          const active = has_a_DL === value;
          return (
            <button
              key={String(value)}
              type="button"
              onClick={() => onChange({ has_a_DL: value })}
              className={`text-left rounded-2xl border p-5 transition-all ${
                active
                  ? "border-[#00ce84] ring-2 ring-[#00ce84]/30 bg-white"
                  : "border-gray-200 bg-white hover:border-[#00ce84]/60"
              }`}
            >
              <p className="text-base font-semibold text-gray-900">{label}</p>
              <p className="text-sm text-gray-500 mt-1">{note}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}