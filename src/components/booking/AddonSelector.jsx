import { Check } from "lucide-react";
import { formatINR } from "../../services/bookingApi";

export default function AddonSelector({ addons, addonIds, onChange }) {
  if (!addons || addons.length === 0) return null;
  return (
    <section>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {addons.map((addon) => {
          const active = addonIds.includes(addon.id);
          return (
            <button
              key={addon.id}
              type="button"
              onClick={() => onChange(addon.id)}
              className={`text-left rounded-2xl border p-5 transition-all ${
                active
                  ? "border-[#00ce84] ring-2 ring-[#00ce84]/30 bg-white"
                  : "border-gray-200 bg-white hover:border-[#00ce84]/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">{addon.name}</h3>
                  {addon.description && (
                    <p className="text-sm text-gray-500 mt-1">{addon.description}</p>
                  )}
                </div>
                {active ? (
                  <span className="h-6 w-6 rounded-full bg-[#00ce84] text-white grid place-items-center shrink-0">
                    <Check className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="h-6 w-6 rounded-full border-2 border-gray-300 shrink-0" />
                )}
              </div>
              <p className="mt-3 text-lg font-bold text-gray-900">
                {addon.price > 0 ? `+${formatINR(addon.price)}` : "Included"}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}