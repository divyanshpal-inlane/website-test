import { Bike, Info } from "lucide-react";
import { trackFunnelEvent } from "../../utils/funnelTracking";

// This section only exists on the "No 4-wheeler licence" branch of the
// flow: 4W? No -> Ask 2W licence? -> (if yes) Ask K/A licence? -> (if no)
// educate about address/licence migration. It renders nothing for 4W-licence
// holders — that branch goes straight from the 4W question to the plan,
// with no further licence questions.
const TWO_WHEELER_OPTIONS = [
  { value: "none", label: "No 2-wheeler licence", dlStatus: "no_dl" },
  { value: "ll_only", label: "Learner's licence", dlStatus: "two_wheeler_ll_only" },
  { value: "active_dl", label: "Full 2-wheeler DL", dlStatus: "two_wheeler_active_dl" },
];

const KA_OPTIONS = [
  { value: true, label: "Yes, from Karnataka" },
  { value: false, label: "No, from another state" },
];

export default function RtoLicenceDetails({ form, onChange }) {
  const { has_a_DL, twoWheelerLicenseState, kaLicence } = form || {};

  // Only asked when the customer has no 4-wheeler licence.
  if (has_a_DL !== false) return null;

  const has2W =
    twoWheelerLicenseState === "ll_only" || twoWheelerLicenseState === "active_dl";
  const showKA = has2W;
  const showEducationCard = showKA && kaLicence === false;

  const setTwoWheeler = (state, dlStatus) => {
    onChange({
      twoWheelerLicenseState: state,
      kaLicence: state === "none" ? null : kaLicence,
    });
    // Funnel: `dl_status_selected` — the 2-wheeler branch of the coarse DL
    // qualification. Distinct idempotency target from the 4-wheeler answer.
    void trackFunnelEvent(
      "dl_status_selected",
      { dl_status: dlStatus },
      { target: dlStatus },
    );
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1">
          <Bike className="h-5 w-5 text-[#00ce84]" />
          <h2 className="text-lg font-semibold">Do you have a two-wheeler licence?</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4">
          This helps us offer the right RTO paperwork on the next step.
        </p>
        <div className="flex flex-wrap gap-2">
          {TWO_WHEELER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setTwoWheeler(o.value, o.dlStatus)}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                twoWheelerLicenseState === o.value
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-white border-gray-300 text-gray-700 hover:border-gray-900"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {showKA && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <Bike className="h-5 w-5 text-[#00ce84]" />
            <h2 className="text-lg font-semibold">Is your 2-wheeler licence from Karnataka?</h2>
          </div>
          <p className="text-gray-500 text-sm mb-4">
            This lets us know whether your licence needs to be migrated to Karnataka.
          </p>
          <div className="flex flex-wrap gap-2">
            {KA_OPTIONS.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => onChange({ kaLicence: o.value })}
                className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                  kaLicence === o.value
                    ? "bg-gray-900 border-gray-900 text-white"
                    : "bg-white border-gray-300 text-gray-700 hover:border-gray-900"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {showEducationCard && (
        <div className="booking-collapse open">
          <div>
            <div className="rounded-2xl border border-[#F2C14E] bg-[#FFF8E6] p-5">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900">Address change & licence migration</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Since your 2-wheeler licence is from another state, your address/licence records
                    will likely need to be updated to Karnataka before you can apply for a 4-wheeler
                    Learner's Licence (LL) and Driving Licence (DL). There are applicable RTO fees and
                    migration charges for this. Our team will guide you through the process after you
                    book — and our <span className="font-semibold">DL Address Change</span> service
                    below can handle the whole application for you.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
