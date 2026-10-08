import { Bike, CarFront, Info } from "lucide-react";

const TWO_WHEELER_OPTIONS = [
  { value: "none", label: "No 2-wheeler licence" },
  { value: "ll_only", label: "Learner's licence" },
  { value: "active_dl", label: "Full 2-wheeler DL" },
];

const KA_OPTIONS = [
  { value: true, label: "Yes, from Karnataka" },
  { value: false, label: "No, from another state" },
];

export default function RtoLicenceDetails({ form, onChange }) {
  const { has_a_DL, twoWheelerLicenseState, kaLicence, kaLicence4w } = form || {};

  const has2W =
    twoWheelerLicenseState === "ll_only" || twoWheelerLicenseState === "active_dl";
  const showKA4W = has_a_DL === true;
  const showKA2W = has_a_DL === false && has2W;
  const showCard = (showKA4W && kaLicence4w === false) || (showKA2W && kaLicence === false);

  const migration4W = showKA4W && kaLicence4w === false;
  const migration2W = showKA2W && kaLicence === false;

  const setTwoWheeler = (state) =>
    onChange({
      twoWheelerLicenseState: state,
      kaLicence: state === "none" ? null : kaLicence,
    });

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1">
          <Bike className="h-5 w-5 text-[#00ce84]" />
          <h2 className="text-lg font-semibold">Your two-wheeler licence (optional)</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4">
          These answers decide which RTO services we can offer below.
        </p>
        <div className="flex flex-wrap gap-2">
          {TWO_WHEELER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setTwoWheeler(o.value)}
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

      {showKA4W && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <CarFront className="h-5 w-5 text-[#00ce84]" />
            <h2 className="text-lg font-semibold">Is your 4-wheeler licence from Karnataka?</h2>
          </div>
          <p className="text-gray-500 text-sm mb-4">
            If it's from another state, our team can help migrate it to Karnataka after you book.
          </p>
          <div className="flex flex-wrap gap-2">
            {KA_OPTIONS.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => onChange({ kaLicence4w: o.value })}
                className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                  kaLicence4w === o.value
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

      {showKA2W && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <Bike className="h-5 w-5 text-[#00ce84]" />
            <h2 className="text-lg font-semibold">Is your 2-wheeler licence from Karnataka?</h2>
          </div>
          <p className="text-gray-500 text-sm mb-4">
            This lets us know whether your licence needs to be migrated to your current state.
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

      {(migration4W || migration2W) && (
        <div className="booking-collapse open">
          <div>
            <div className="rounded-2xl border border-[#F2C14E] bg-[#FFF8E6] p-5">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900">Address change & licence migration</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Since your {migration4W ? "4-wheeler" : "2-wheeler"} licence is from another
                    state, you'll need to migrate it to Karnataka (address change / transfer). There
                    are applicable RTO fees and migration charges for this. Our team will guide you
                    through the process after you book — and our{" "}
                    <span className="font-semibold">DL Address Change</span> service below will
                    handle the whole application for you.
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