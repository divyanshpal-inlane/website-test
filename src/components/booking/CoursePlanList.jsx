import { useMemo } from "react";
import { Loader2, Clock, X } from "lucide-react";
import BookingErrorNotice from "./BookingErrorNotice";

const fmtLesson = (l) =>
  new Date(`${l.date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const fmtDay = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export default function CoursePlanList({
  lessons,
  loading,
  error,
  title,
  slotDurationMinutes,
  editingLesson,
  candidateSlots,
  candidateLoading,
  candidateError,
  onChangeLesson,
  onPickCandidate,
  onCancelEdit,
  disableEditLesson = null,
}) {
  const candidateDates = useMemo(() => {
    const seen = [];
    for (const s of candidateSlots || []) {
      if (!seen.some((d) => d.date === s.date)) {
        seen.push({ date: s.date, day: s.day, slots: [] });
      }
      seen.find((d) => d.date === s.date).slots.push(s);
    }
    return seen;
  }, [candidateSlots]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-semibold mb-4">{title || "Your full schedule"}</h3>
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Building your schedule…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h3 className="text-lg font-semibold mb-1">{title || "Your full schedule"}</h3>
        <BookingErrorNotice error={error} />
      </section>
    );
  }

  if (!lessons || lessons.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#D9FF7A] bg-[#F7FFE0] p-6">
      <h3 className="text-lg font-semibold mb-1">{title || "Your full schedule"}</h3>
      {/* TEMP-TEST (instructor name in slots) */}
      {lessons[0]?.instructorName && (
        <p className="text-sm font-semibold text-[#0B7A52] mb-1">
          Trainer: {lessons[0].instructorName}
        </p>
      )}
      <p className="text-sm text-gray-600 mb-4">
        {lessons.length}{slotDurationMinutes ? ` ${slotDurationMinutes}-minute` : ""} lessons with a
        single trainer. Change any lesson here before you book, or after we hold your spot.
      </p>
      <ul className="space-y-2">
        {lessons.map((l) => {
          const isEditing = editingLesson === l.lesson;
          return (
            <li key={`${l.date}|${l.start_time}`} className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 text-sm border border-[#E8F7BE]">
                <span className="flex items-center gap-3">
                  <span className="grid place-items-center h-6 w-6 rounded-full bg-gray-900 text-white text-xs font-semibold">
                    {l.lesson}
                  </span>
                  <span className="font-medium text-gray-900">
                    Lesson {l.lesson} · {fmtLesson(l)}
                  </span>
                  {/* TEMP-TEST (instructor name in slots) */}
                  {l.instructorName && (
                    <span className="text-xs text-gray-500 truncate max-w-[10rem]" title={l.instructorName}>
                      {l.instructorName}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold text-gray-700">
                    {l.start_time} – {l.end_time}
                  </span>
                  <button
                    type="button"
                    onClick={() => (isEditing ? onCancelEdit() : onChangeLesson(l.lesson))}
                    disabled={
                      candidateLoading ||
                      loading ||
                      (disableEditLesson != null && l.lesson === disableEditLesson)
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-[#00ce84] hover:text-[#00ce84] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEditing ? (
                      <>
                        <X className="h-3 w-3" /> Cancel
                      </>
                    ) : (
                      "Change slot"
                    )}
                  </button>
                </span>
              </div>

              {isEditing && (
                <div className="rounded-xl bg-white px-4 py-3 border border-[#00ce84]">
                  {candidateLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Finding other free times for this
                      lesson…
                    </div>
                  ) : candidateError ? (
                    <BookingErrorNotice error={candidateError} />
                  ) : candidateDates.length === 0 ? (
                    <p className="text-sm text-gray-600">
                      There are no other free times for this lesson right now. Please try again
                      shortly.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Pick a new time for Lesson {editingLesson}
                      </p>
                      {candidateDates.map((d) => (
                        <div key={d.date}>
                          <p className="text-xs font-medium text-gray-700 mb-1.5">{fmtDay(d.date)}</p>
                          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                            {d.slots.map((s) => (
                              <button
                                key={`${s.date}|${s.start}`}
                                type="button"
                                onClick={() => onPickCandidate(editingLesson, s)}
                                className="rounded-lg border border-gray-300 px-2 py-2 flex flex-col items-center justify-center gap-0.5 text-sm font-medium text-gray-700 hover:border-[#00ce84] hover:text-[#00ce84] transition-all"
                              >
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {s.start}
                                </span>
                                {/* TEMP-TEST (instructor name in slots) */}
                                {s.instructorName && (
                                  <span className="text-[10px] font-normal text-gray-500 truncate max-w-full" title={s.instructorName}>
                                    {s.instructorName}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}