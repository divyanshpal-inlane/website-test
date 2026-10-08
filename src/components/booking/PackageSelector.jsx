import { CarFront, CarTaxiFront, FileCheck2 } from "lucide-react";

const PACKAGES = [
  {
    value: "classes_only",
    title: "Driving Classes",
    Icon: CarTaxiFront,
    badge: null,
    footnote: "Pick your driving course below.",
    description: (has4W, notLicensed) =>
      has4W
        ? "Just the lessons — brush up or get comfortable in a new car."
        : notLicensed
          ? "Just the lessons. We'll assign your trainer and get you driving."
          : "Just the lessons. Pick a course and we'll schedule everything.",
  },
  {
    value: "course_rto",
    title: "Driving Classes + RTO",
    Icon: CarFront,
    badge: "Recommended",
    footnote: "Pick your course below — RTO services are chosen on the next step.",
    description: (has4W, notLicensed) =>
      has4W
        ? "Lessons plus RTO paperwork — like a bike licence or migrating your DL to Karnataka."
        : notLicensed
          ? "Lessons plus all the licence paperwork — LL, DL, or transferring from another state."
          : "Lessons plus RTO paperwork handled by our team.",
  },
  {
    value: "rto_only",
    title: "RTO Services only",
    Icon: FileCheck2,
    badge: null,
    footnote: "No classes needed — you'll choose your RTO services next.",
    description: (has4W, notLicensed) =>
      has4W
        ? "No classes — just RTO paperwork, like a bike licence or a Karnataka licence transfer."
        : notLicensed
          ? "No classes — just get your licences and all the paperwork sorted from scratch."
          : "No classes — just have our team take care of your RTO paperwork.",
  },
];

export default function PackageSelector({ value, onChange, has_a_DL }) {
  const current = value || "course_rto";
  const has4W = has_a_DL === true;
  const notLicensed = has_a_DL === false;
  const answered = has4W || notLicensed;

  const subtitle = answered
    ? has4W
      ? "You already drive — pick classes, paperwork, or both."
      : "Classes, getting your licence sorted, or both."
    : "Pick the package that fits — you can fine-tune it on the next steps.";

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-xl font-semibold">What do you need?</h2>
      </div>
      <p className="text-gray-500 text-sm mb-4 min-h-[1.25rem]">{subtitle}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PACKAGES.map(({ value: v, title, description, Icon, badge, footnote }) => {
          const active = current === v;
          const featured = v === "course_rto";
          const desc = description(has4W, notLicensed);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={active}
              className={`relative text-left rounded-2xl border p-5 transition-all ${
                active
                  ? "border-[#00ce84] ring-2 ring-[#00ce84]/30 bg-white"
                  : featured
                    ? "border-[#00ce84]/40 bg-white hover:border-[#00ce84]"
                    : "border-gray-200 bg-white hover:border-[#00ce84]/60"
              } ${
                featured ? "md:origin-bottom md:scale-[1.05] md:z-10 md:shadow-xl" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <Icon
                  className={`h-6 w-6 shrink-0 ${active ? "text-[#00ce84]" : "text-gray-400"}`}
                />
                <span
                  className={`h-5 w-5 rounded-full border-2 grid place-items-center shrink-0 ${
                    active ? "border-[#00ce84]" : "border-gray-300"
                  }`}
                  aria-hidden="true"
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-[#00ce84]" />}
                </span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-gray-900 flex flex-wrap items-center gap-2">
                {title}
                {badge && (
                  <span className="inline-flex items-center rounded-full bg-[#00ce84] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                    {badge}
                  </span>
                )}
              </h3>
              <p className="mt-1 text-sm leading-snug text-gray-500 min-h-[42px]">{desc}</p>
              <div className="mt-3 min-h-[16px]">
                {footnote && <p className="text-[11px] font-medium leading-none text-[#00B97A]">{footnote}</p>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}