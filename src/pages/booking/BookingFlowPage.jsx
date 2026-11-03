import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Button } from "@mui/material";
import { useBooking } from "../../context/BookingContext";
import { useBookingConfig } from "../../hooks/useBookingConfig";
import { bookingStep2Label } from "../../services/bookingSteps";
import BookingStepper from "../../components/booking/BookingStepper";
import BookingLocationSelector from "../../components/booking/BookingLocationSelector";
import LicenceDetails from "../../components/booking/LicenceDetails";
import RtoLicenceDetails from "../../components/booking/RtoLicenceDetails";
import CourseSelector from "../../components/booking/CourseSelector";
import { trackFunnelEvent } from "../../utils/funnelTracking";

// ---------------------------------------------------------------------------
// Step 1 follows this exact decision tree — nothing outside it is offered:
//
//   4W Licence?
//   |- Yes -> Select Plan -> (step 2) Add-on -> Slot -> Payment
//   `- No  -> Ask 2W Licence?
//             |- Yes -> Ask K/A Licence?
//             |        |- Yes -> Select Plan -> (step 2) Add-on -> Payment
//             |        `- No  -> Educate (address change + migration) ->
//             |                  Select Plan -> (step 2) Add-on -> Payment
//             `- No  -> Select Plan -> (step 2) Add-on -> Payment
//
// "Select Plan" (the course) always happens here, on step 1. "Select
// Add-on" always happens on step 2 (SchedulePage); "Select Slot" only
// happens there too, and only for 4W-licence holders.
// ---------------------------------------------------------------------------
export default function BookingFlowPage() {
  const { config, loading: configLoading, error: configError, refetch } = useBookingConfig();
  const { form, setForm } = useBooking();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = location.state?.notice;

  // ---------------------------------------------------------------------------
  // Funnel instrumentation (fire-and-forget; a tracking failure must never
  // break the booking flow).
  //
  // `home_viewed` — the funnel's step-1 surface. The deterministic
  // `client_event_id` collapses a StrictMode double-render / re-mount into a
  // single row on the server.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    void trackFunnelEvent("home_viewed", { page_type: "booking_flow" });
  }, []);

  // `course_list_viewed` — once the plan catalogue is known. The course ids
  // are stored as a comma-separated string (the event log rejects arrays).
  const courseListKey = (config?.courses || []).map((c) => String(c.id)).join(",");
  const courseListTracked = useRef(false);
  useEffect(() => {
    if (courseListTracked.current || !courseListKey) return;
    courseListTracked.current = true;
    const courses = config.courses || [];
    void trackFunnelEvent(
      "course_list_viewed",
      {
        course_count: courses.length,
        course_ids: courseListKey,
        dl_status:
          form.has_a_DL === true
            ? "has_dl"
            : form.has_a_DL === false
              ? "no_dl"
              : "unknown",
      },
      { target: courseListKey },
    );
  }, [courseListKey, config, form.has_a_DL]);

  const handleArea = (patch) => {
    setForm(patch);
  };

  // Changing an earlier licence answer can invalidate later answers in the
  // tree (e.g. switching back to "Yes, I have a 4W licence" drops the whole
  // 2W/K/A sub-tree) and any RTO add-ons already picked for the old branch.
  const handleLicenceChange = (patch) => {
    if (patch.has_a_DL !== undefined) {
      setForm({
        ...patch,
        twoWheelerLicenseState: null,
        kaLicence: null,
        addonIds: [],
      });
      return;
    }
    if (patch.twoWheelerLicenseState !== undefined || patch.kaLicence !== undefined) {
      setForm({ ...patch, addonIds: [] });
      return;
    }
    setForm(patch);
  };

  const handleCourse = (course) => {
    setForm({
      courseId: course.id,
      courseName: course.name,
      coursePrice: course.price,
      course,
    });
  };

  // Follows the tree exactly:
  //   4W No -> Ask 2W Licence? -> (if yes) Ask K/A Licence?
  const needsTwoWheeler = form.has_a_DL === false;
  const twoWheelerAnswered = needsTwoWheeler ? form.twoWheelerLicenseState != null : true;
  const needsKaFor2W =
    needsTwoWheeler &&
    (form.twoWheelerLicenseState === "ll_only" || form.twoWheelerLicenseState === "active_dl");
  const kaAnswered = needsKaFor2W ? form.kaLicence !== null && form.kaLicence !== undefined : true;

  const ready =
    form.serviceable === true &&
    form.has_a_DL !== null &&
    twoWheelerAnswered &&
    kaAnswered &&
    Boolean(form.courseId);

  const empty =
    !configLoading &&
    !configError &&
    config &&
    Array.isArray(config.areas) &&
    config.areas.length === 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Choose your plan</h1>
        <p className="text-gray-500 mt-2">
          Tell us where and how you’d like to learn — then pick a plan and pay online.
        </p>
      </div>

      <BookingStepper step={1} step2Label={bookingStep2Label(form.has_a_DL)} />

      {notice && (
        <Alert severity="info" className="mb-6">
          {notice}
        </Alert>
      )}

      {configLoading ? (
        <Loading />
      ) : configError ? (
        <StateCard
          title="We couldn't load booking"
          message="Please check your connection and try again."
          actionLabel="Try again"
          onAction={refetch}
        />
      ) : !config || config.enabled === false ? (
        <StateCard
          title="Online booking coming soon"
          message="You can still reach out to us and we'll set everything up for you on a call."
        />
      ) : empty ? (
        <StateCard
          title="We're not accepting bookings in any area yet"
          message="Check back soon, or talk to our team to get started today."
        />
      ) : (
        <>
          <div className="space-y-10">
            <BookingLocationSelector form={form} onChange={handleArea} />

            <LicenceDetails
              has_a_DL={form.has_a_DL}
              onChange={handleLicenceChange}
            />

            {form.has_a_DL === false && (
              <RtoLicenceDetails form={form} onChange={handleLicenceChange} />
            )}

            <CourseSelector courses={config.courses} courseId={form.courseId} onChange={handleCourse} />
          </div>

          <div className="mt-10 flex flex-col items-center gap-3">
            <Button
              variant="contained"
              disabled={!ready}
              onClick={() => navigate("/book/schedule")}
              sx={{
                bgcolor: "#00ce84",
                "&:hover": { bgcolor: "#00B97A" },
                textTransform: "none",
                fontWeight: 600,
                px: 6,
                py: 1.5,
                borderRadius: "12px",
              }}
            >
              Continue
            </Button>
            {!form.serviceable && (
              <p className="text-sm text-gray-500">Pick your location to get started.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center py-24">
      <div className="animate-pulse text-gray-400">Loading booking…</div>
    </div>
  );
}

function StateCard({ title, message, actionLabel, onAction }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="text-gray-500 mt-2 max-w-md mx-auto">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-xl bg-[#00ce84] px-6 py-2.5 font-semibold text-white hover:bg-[#00B97A]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
