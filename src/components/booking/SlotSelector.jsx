import { useMemo, useState } from "react";
import { CalendarDays, Clock, ListOrdered } from "lucide-react";

const fmtDay = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
const fmtDateShort = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const RANK_LABEL = ["1st choice", "2nd choice", "3rd choice"];

// ---------------------------------------------------------------------------
// "3 preferred slots" flow: pick a Start Date, then rank up to 3 preferred
// daily times from that date's offerings. Preference #1 is tried on every
// course day from the Start Date onward; #2 and #3 are the fallback times for
// a day where #1 is taken; a day where none of the picks are free is skipped
// entirely rather than falling back to some other, un-chosen time.
// ---------------------------------------------------------------------------
export default function SlotSelector({
  result,
  startDate,
  preferredSlots = [],
  loading,
  onPickStartDate,
  onTogglePreferred,
  onClear,
}) {
  const [activeDate, setActiveDate] = useState(null);

  const dates = useMemo(() => (result?.dates || []).slice(), [result]);
  const firstAvailableDate = dates.find((d) => d.slots.length > 0)?.date || null;
  const currentDate = activeDate || startDate || firstAvailableDate;
  const active = dates.find((d) => d.date === currentDate);

  const rankOf = (start) => preferredSlots.indexOf(start);

  const pickDate = (date) => {
    setActiveDate(date);
    onPickStartDate(date);
  };

  if (loading) {
    return (
      <section>
        <h2 className="text-xl font-semibold mb-4">Finding open lessons…</h2>
        <div className="animate-pulse h-24 rounded-2xl bg-gray-100" />
      </section>
    );
  }

  if (result?.schedulingMode === "assign_later" || dates.length === 0) {
    return (
      <section className="rounded-2xl border border-[#D9FF7A] bg-[#F7FFE0] p-5">
        <h2 className="text-lg font-semibold mb-1">Choose your own time? No problem.</h2>
        <p className="text-gray-600 text-sm">
          {result?.message ||
            "We'll assign you a trainer based on your area and availability once your booking is confirmed — and book your first lesson for you."}
        </p>
      </section>
    );
  }

  const totalLessons = Number(result?.totalLessons) || null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays className="h-5 w-5 text-[#00ce84]" />
        <h2 className="text-xl font-semibold">Pick your start date & preferred times</h2>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        {result?.legend?.slotDurationMinutes && `Each lesson is ${result.legend.slotDurationMinutes} minutes. `}
        Pick a start date, then rank up to 3 preferred times (1st, 2nd, 3rd choice). We'll try your
        1st choice on every lesson day
        {totalLessons ? ` of your ${totalLessons}-lesson course` : ""}; if it's ever taken we'll use
        your 2nd or 3rd choice that day, or move that lesson to the next open day.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {dates.map((d) => {
          const isActive = d.date === currentDate;
          const isStart = d.date === startDate;
          const hasSlots = d.slots.length > 0;
          return (
            <button
              key={d.date}
              type="button"
              disabled={!hasSlots}
              onClick={() => pickDate(d.date)}
              className={`shrink-0 px-4 py-2 rounded-xl border text-center transition-colors ${
                isStart
                  ? "bg-[#00ce84] border-[#00ce84] text-white"
                  : isActive
                    ? "bg-gray-900 border-gray-900 text-white"
                    : hasSlots
                      ? "bg-white border-gray-300 text-gray-700 hover:border-gray-900"
                      : "bg-gray-50 border-gray-200 text-gray-400"
              }`}
            >
              <p className="text-xs uppercase tracking-wide">{fmtDay(d.date)}</p>
              <p className="text-sm font-semibold">{fmtDateShort(d.date)}</p>
              {isStart && <p className="text-[10px] font-semibold uppercase mt-0.5">Start</p>}
            </button>
          );
        })}
      </div>

      {active?.slots.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
          {active.slots.map((slot) => {
            const rank = rankOf(slot.start);
            const picked = rank >= 0;
            const disabled = !picked && preferredSlots.length >= 3;
            return (
              <button
                key={`${slot.date}|${slot.start}`}
                type="button"
                disabled={disabled}
                onClick={() => onTogglePreferred(slot.start)}
                className={`relative rounded-xl border px-2 py-3 flex flex-col items-center justify-center gap-1 text-sm font-medium transition-all ${
                  picked
                    ? "bg-[#00ce84] border-[#00ce84] text-white"
                    : disabled
                      ? "bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed"
                      : "bg-white border-gray-300 text-gray-700 hover:border-[#00ce84]"
                }`}
              >
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {slot.start}
                </span>
                {/* TEMP-TEST (instructor name in slots) */}
                {slot.instructorName && (
                  <span
                    className={`text-[10px] font-normal leading-tight truncate max-w-full ${
                      picked ? "text-white/80" : "text-gray-500"
                    }`}
                    title={slot.instructorName}
                  >
                    {slot.instructorName}
                  </span>
                )}
                {picked && (
                  <span className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-gray-900 text-white text-[10px] font-bold grid place-items-center">
                    {rank + 1}
                  </span>
                )}
                {slot.femaleCovered && !picked && (
                  <span className="absolute -top-2 -right-1 text-[9px] font-semibold uppercase tracking-wide bg-[#D9FF7A] text-gray-800 px-1.5 py-0.5 rounded-full">
                    F
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : startDate ? (
        <p className="text-sm text-gray-500 mb-4">No times available on this day in your area. Pick another start date.</p>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <ListOrdered className="h-4 w-4 text-gray-500" />
          <p className="text-sm font-semibold text-gray-900">
            {preferredSlots.length} of 3 preferred times picked
          </p>
        </div>
        {preferredSlots.length > 0 ? (
          <ul className="space-y-1 mb-1">
            {preferredSlots.map((start, i) => (
              <li key={start} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{RANK_LABEL[i]}</span>
                <span className="font-semibold text-gray-900">{start}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No preferred time picked yet</p>
        )}
        {preferredSlots.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-sm font-medium text-red-600 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
    </section>
  );
}
