import { useState } from "react";
import { CalendarDays, Loader2, PencilLine, X } from "lucide-react";
import { changeBookingSlot, isSlotConflict } from "../../services/bookingApi";
import BookingErrorNotice from "./BookingErrorNotice";

const fmtLesson = (l) =>
  new Date(`${l.date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export default function ScheduleReview({ bookingId, heldSlots, holdMinutes, onChanged, onHoldExpired }) {
  const [editingId, setEditingId] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState(null);

  const sorted = [...(heldSlots || [])].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time),
  );

  const openEditor = async (scheduleId) => {
    setEditingId(scheduleId);
    setCandidates(null);
    setError(null);
    setCandidatesLoading(true);
    try {
      const data = await changeBookingSlot({ bookingId, scheduleId });
      setCandidates(data?.slots || []);
    } catch (e) {
      if (e?.code === "hold_expired") {
        onHoldExpired?.(e.message);
        return;
      }
      setError(e?.message || "Couldn't load alternative times. Please try again.");
      setEditingId(null);
    } finally {
      setCandidatesLoading(false);
    }
  };

  const closeEditor = () => {
    setEditingId(null);
    setCandidates(null);
    setError(null);
  };

  const pickCandidate = async (slot) => {
    setChanging(true);
    setError(null);
    try {
      const data = await changeBookingSlot({
        bookingId,
        scheduleId: editingId,
        date: slot.date,
        start: slot.start_time,
      });
      if (Array.isArray(data?.heldSlots)) onChanged(data.heldSlots);
      closeEditor();
    } catch (e) {
      if (e?.code === "hold_expired") {
        onHoldExpired?.(e.message);
        return;
      }
      if (isSlotConflict(e)) {
        setError(e.message);
        // Refresh candidates — the picked time may have just been taken.
        const fresh = await changeBookingSlot({ bookingId, scheduleId: editingId }).catch(() => null);
        setCandidates(fresh?.slots || candidates || []);
        return;
      }
      setError(e?.message || "Couldn't change this lesson. Please try again.");
    } finally {
      setChanging(false);
    }
  };

  const byDate = new Map();
  for (const c of candidates || []) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date).push(c);
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="flex items-center gap-1.5 text-lg font-semibold mb-1">
        <CalendarDays className="h-5 w-5 text-[#00ce84]" /> Your lessons
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        One trainer teaches the whole course. You can change any lesson here — the new time must
        fit the same trainer.
      </p>

      {error && <BookingErrorNotice error={error} className="mb-4" />}

      <ul className="space-y-2">
        {sorted.map((l) => {
          const editing = editingId === l.scheduleId;
          return (
            <li key={l.scheduleId} className="rounded-xl border border-gray-200">
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-3">
                  <span className="grid place-items-center h-6 w-6 rounded-full bg-gray-900 text-white text-xs font-semibold">
                    {l.lesson}
                  </span>
                  <span className="font-medium text-gray-900">
                    Lesson {l.lesson} · {fmtLesson(l)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold text-gray-700">
                    {l.start_time} – {l.end_time}
                  </span>
                  {!editing && (
                    <button
                      type="button"
                      onClick={() => openEditor(l.scheduleId)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#00ce84] hover:text-[#00B97A]"
                    >
                      <PencilLine className="h-3.5 w-3.5" /> Change
                    </button>
                  )}
                </span>
              </div>

              {editing && (
                <div className="border-t border-gray-100 px-4 py-4">
                  {candidatesLoading ? (
                    <p className="flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading alternative times…
                    </p>
                  ) : candidates && candidates.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                        Move this lesson to
                      </p>
                      {[...byDate.entries()].map(([date, slots]) => (
                        <div key={date} className="mb-3">
                          <p className="text-xs font-medium text-gray-600 mb-1">{fmtLesson({ date })}</p>
                          <div className="flex flex-wrap gap-2">
                            {slots.map((c) => (
                              <button
                                key={`${date}|${c.start_time}`}
                                type="button"
                                disabled={changing}
                                onClick={() => pickCandidate(c)}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-[#00ce84] hover:text-[#00ce84] disabled:opacity-50"
                              >
                                {c.start_time}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No alternative times are free with your trainer right now. Try again later.
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={closeEditor}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                    {changing && (
                      <span className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                      </span>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {typeof holdMinutes === "number" && (
        <p className="text-xs text-gray-400 mt-3">
          Times are held for ~{holdMinutes} minutes while you pay. If the hold expires, we'll release
          the lessons and you can pick fresh times.
        </p>
      )}
    </section>
  );
}