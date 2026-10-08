import { GraduationCap } from "lucide-react";
import { formatINR } from "../../services/bookingApi";

export default function CourseSelector({ courses, courseId, onChange }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap className="h-5 w-5 text-[#00ce84]" />
        <h2 className="text-xl font-semibold">Available plans</h2>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        Pick the plan that fits your goals. All plans include pickup &amp; drop and all our support.
      </p>

      {courses.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
          No plans are available right now. Please check back later.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {courses.map((course) => {
            const active = courseId === course.id;
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => onChange(course)}
                className={`text-left rounded-2xl border p-5 transition-all ${
                  active
                    ? "border-[#00ce84] ring-2 ring-[#00ce84]/30 bg-white"
                    : "border-gray-200 bg-white hover:border-[#00ce84]/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                      {course.name}
                      {course.isRecommended && (
                        <span className="inline-flex items-center rounded-full bg-[#00ce84]/10 px-2 py-0.5 text-[11px] font-semibold text-[#00B97A]">
                          Recommended
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {course.description ||
                        `${course.totalLessons || course.duration} lessons${
                          course.duration ? ` · ${course.duration} hours` : ""
                        }`}
                    </p>
                    {course.description && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {course.totalLessons || course.duration} lessons
                        {course.duration ? ` · ${course.duration} hours` : ""}
                      </p>
                    )}
                  </div>
                  {active && (
                    <span className="h-5 w-5 rounded-full bg-[#00ce84] text-white grid place-items-center text-xs shrink-0">
                      ✓
                    </span>
                  )}
                </div>
                <p className="mt-3 text-lg font-bold text-gray-900">
                  {course.price > 0 ? formatINR(course.price) : "Price on request"}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}