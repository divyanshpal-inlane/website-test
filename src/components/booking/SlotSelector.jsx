import { useMemo, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";

const fmtDay = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
const fmtDateShort = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function SlotSelector({ result, firstSlot, loading, onSelect, onClear }) {
  const [activeDate, setActiveDate] = useState(null);

  const dates = useMemo(() => (result?.dates || []).slice(), [result]);
  const firstAvailableDate = dates.find((d) => d.slots.length > 0)?.date || null;
  const currentDate = activeDate || firstAvailableDate;
  const active = dates.find((d) => d.date === currentDate);

  const selected = firstSlot || null;
  const isSelected = (date, start) =>
    selected && selected.date === date && selected.start === start;

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
        <h2 className="text-xl font-semibold">Pick the time of your first lesson</h2>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        {result?.legend?.slotDurationMinutes && `Each lesson is ${result.legend.slotDurationMinutes} minutes.`}
        {totalLessons
          ? ` Your ${totalLessons}-lesson course is taught by one trainer — pick where to start and we'll line up the rest of your lessons.`
          : " Pick where to start and we'll line up the rest of your lessons with one trainer."}
      </p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {dates.map((d) => {
          const isActive = d.date === active?.date;
          const hasSlots = d.slots.length > 0;
          return (
            <button
              key={d.date}
              type="button"
              disabled={!hasSlots}
              onClick={() => setActiveDate(d.date)}
              className={`shrink-0 px-4 py-2 rounded-xl border text-center transition-colors ${
                isActive
                  ? "bg-gray-900 border-gray-900 text-white"
                  : hasSlots
                    ? "bg-white border-gray-300 text-gray-700 hover:border-gray-900"
                    : "bg-gray-50 border-gray-200 text-gray-400"
              }`}
            >
              <p className="text-xs uppercase tracking-wide">{fmtDay(d.date)}</p>
              <p className="text-sm font-semibold">{fmtDateShort(d.date)}</p>
            </button>
          );
        })}
      </div>

      {active?.slots.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {active.slots.map((slot) => {
            const picked = isSelected(slot.date, slot.start);
            return (
              <button
                key={`${slot.date}|${slot.start}`}
                type="button"
                onClick={() => onSelect(slot)}
                className={`relative rounded-xl border px-2 py-3 flex flex-col items-center justify-center gap-1 text-sm font-medium transition-all ${
                  picked
                    ? "bg-[#00ce84] border-[#00ce84] text-white"
                    : "bg-white border-gray-300 text-gray-700 hover:border-[#00ce84]"
                }`}
              >
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {slot.start}
                </span>
                {slot.femaleCovered && !picked && (
                  <span className="absolute -top-2 -right-1 text-[9px] font-semibold uppercase tracking-wide bg-[#D9FF7A] text-gray-800 px-1.5 py-0.5 rounded-full">
                    F
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No first-lesson times available on this day in your area.</p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {selected ? (
            <>
              <span className="font-semibold text-gray-900">1</span> first lesson picked
            </>
          ) : (
            "No first lesson picked yet"
          )}
        </p>
        {selected && (
          <button
            type="button"
            onClick={onClear}
            className="text-sm font-medium text-red-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </section>
  );
}
