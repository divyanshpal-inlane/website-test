import { BadgeCheck, Bike, CarFront, FileSignature, Check } from "lucide-react";
import { formatINR } from "../../services/bookingApi";

const ICONS = {
  rto_2w_ll_dl: Bike,
  rto_2w_dl: Bike,
  rto_4w_ll_dl: CarFront,
  rto_dl_address_change: FileSignature,
};

// Which RTO services each licence branch is offered. The section itself only
// appears for course_rto (optional paperwork) and rto_only (required paperwork)
// packages — classes_only is driving classes only and never shows RTO services.
const OFFER_WHEN = {
  rto_2w_ll_dl: (f) => f.twoWheelerLicenseState === "none",
  rto_2w_dl: (f) => f.twoWheelerLicenseState === "ll_only",
  rto_4w_ll_dl: (f) => f.has_a_DL === false,
  rto_dl_address_change: (f) =>
    (f.has_a_DL === true && f.kaLicence4w === false) ||
    (f.has_a_DL === false && f.kaLicence === false),
};

export function offeredRtoAddons(form, addons) {
  const catalogue = addons || [];
  return catalogue.filter((addon) => {
    const rule = OFFER_WHEN[addon.code];
    return rule && rule(form);
  });
}

export default function RtoServiceSelector({ form, addons, addonIds = [], onChange }) {
  const required = form.caseType === "rto_only";
  if (!required && form.caseType !== "course_rto") return null;

  const offers = offeredRtoAddons(form, addons);

  if (offers.length === 0) {
    if (!required) return null;
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">RTO services</h2>
        <p className="text-gray-500 text-sm mt-1">
          No RTO services are available for your licence answers above. Please review your
          two-wheeler and licence-origin details.
        </p>
      </section>
    );
  }

  return (
    <div className="booking-collapse open">
      <div>
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <BadgeCheck className="h-5 w-5 text-[#00ce84]" />
            <h2 className="text-lg font-semibold">
              RTO services{required ? "" : " (optional)"}
            </h2>
            {required && (
              <span className="inline-flex items-center rounded-full bg-[#00ce84]/10 px-2 py-0.5 text-[11px] font-semibold text-[#00B97A]">
                Required
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mb-4">
            Let our team handle the paperwork for you — add any of these services and we&apos;ll
            take care of the application, documents and RTO support.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {offers.map((addon) => {
              const Icon = ICONS[addon.code] || BadgeCheck;
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
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-[#00ce84] shrink-0" />
                        <h3 className="text-base font-semibold text-gray-900">{addon.name}</h3>
                      </div>
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
                    {Number(addon.price) > 0 ? `+${formatINR(addon.price)}` : "Included"}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}