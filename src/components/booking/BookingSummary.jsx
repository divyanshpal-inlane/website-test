import { CalendarDays, CheckCircle2 } from "lucide-react";
import { formatINR } from "../../services/bookingApi";

const fmtSlot = (s) =>
  `${new Date(`${s.date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })}, ${s.start} – ${s.end}`;

export default function BookingSummary({ config, form, heldSlots }) {
  const isRtoOnly = form.caseType === "rto_only";
  const course = (config?.courses || []).find((c) => c.id === form.courseId);
  const addons = (config?.addons || []).filter((a) => (form.addonIds || []).includes(a.id));
  const included = (config?.courseAddons || [])
    .filter((ca) => ca.courseId === form.courseId && ca.included)
    .map((ca) => (config?.addons || []).find((a) => a.id === ca.addonId))
    .filter(Boolean);

  const base = course?.price || 0;
  const addonsTotal = addons.reduce((sum, a) => sum + Number(a.price || 0), 0);
  const total = base + addonsTotal;
  const half = total / 2;

  // Schedule source of truth: held (reserved) lessons first, then the plan
  // preview from the schedule step, then the legacy client-side selection.
  const planned = (heldSlots && heldSlots.length > 0
    ? heldSlots
    : form.planPreview?.lessons || form.selectedSlots || []
  ).map((s) => ({
    lesson: s.lesson,
    date: s.date,
    start: s.start || s.start_time,
    end: s.end || s.end_time,
  }));
  const slots = planned
    .filter((s) => s.date && s.start)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold mb-4">Your plan</h3>

      <div className="space-y-4 text-sm">
        {course ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">{course.name}</p>
              <p className="text-gray-500">
                {course.duration} hours · {course.totalLessons || course.duration || "—"} lessons
              </p>
            </div>
            <p className="font-semibold">{formatINR(course.price)}</p>
          </div>
        ) : isRtoOnly ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">RTO paperwork</p>
              <p className="text-gray-500">Application + document handling by our team</p>
            </div>
            <p className="font-semibold">{formatINR(addonsTotal)}</p>
          </div>
        ) : (
          <p className="font-semibold text-gray-900">—</p>
        )}

        {addons.length > 0 && (
          <div>
            {addons.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3">
                <p className="text-gray-700">{a.name}</p>
                <p className="font-medium">{formatINR(a.price)}</p>
              </div>
            ))}
          </div>
        )}

        {included.length > 0 && (
          <div className="rounded-xl bg-[#F1FFCF] p-3 text-gray-600">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">
              Included with your course
            </p>
            {included.map((a) => (
              <p key={a.id} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#00ce84]" />
                {a.name}
              </p>
            ))}
          </div>
        )}

        <div className="h-px bg-gray-200" />

        {isRtoOnly ? (
          <p className="rounded-xl bg-gray-50 p-3 text-gray-600">
            RTO paperwork: our team will reach out to collect your documents and start the
            application.
          </p>
        ) : slots.length > 0 ? (
          <div>
            <p className="flex items-center gap-1.5 font-medium text-gray-900 mb-1.5">
              <CalendarDays className="h-4 w-4 text-[#00ce84]" />
              Your lessons ({slots.length})
            </p>
            <ul className="space-y-1 text-gray-600">
              {slots.map((s) => (
                <li key={`${s.date}|${s.start}`}>
                  {typeof s.lesson === "number" ? `Lesson ${s.lesson} · ` : ""}
                  {fmtSlot(s)}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-xl bg-gray-50 p-3 text-gray-600">
            Scheduling: our team will assign your trainer and book your lessons after payment.
          </p>
        )}

        {form.femalePreference && (
          <p className="text-gray-600">
            Preferred trainer: <span className="font-medium">female instructor</span>
          </p>
        )}

        <div className="h-px bg-gray-200" />

        {form.installmentMode === "first_half" ? (
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">First installment (today)</span>
              <span className="font-semibold">{formatINR(Math.round(half))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Second installment (later)</span>
              <span className="font-medium">{formatINR(total - Math.round(half))}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="font-semibold">Plan total</span>
              <span className="font-semibold">{formatINR(total)}</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-between text-base">
            <span className="font-semibold">Total</span>
            <span className="font-bold">{formatINR(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}