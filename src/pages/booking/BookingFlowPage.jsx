import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Button } from "@mui/material";
import { useBooking } from "../../context/BookingContext";
import { useBookingConfig } from "../../hooks/useBookingConfig";
import { bookingStep2Label } from "../../services/bookingSteps";
import BookingStepper from "../../components/booking/BookingStepper";
import BookingLocationSelector from "../../components/booking/BookingLocationSelector";
import PackageSelector from "../../components/booking/PackageSelector";
import LicenceDetails from "../../components/booking/LicenceDetails";
import CourseSelector from "../../components/booking/CourseSelector";
import { offeredRtoAddons } from "../../components/booking/RtoServiceSelector";

export default function BookingFlowPage() {
  const { config, loading: configLoading, error: configError, refetch } = useBookingConfig();
  const { form, setForm } = useBooking();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = location.state?.notice;

  const isRtoOnly = form.caseType === "rto_only";

  const handleArea = (patch) => {
    setForm(patch);
  };

  const handleLicenceChange = (patch) => {
    const licenceTouched =
      patch.has_a_DL !== undefined ||
      patch.twoWheelerLicenseState !== undefined ||
      patch.kaLicence !== undefined ||
      patch.kaLicence4w !== undefined;
    if (!licenceTouched) {
      setForm(patch);
      return;
    }
    const next = { ...form, ...patch };
    const keptIds = (form.addonIds || []).filter((id) => {
      const addon = (config?.addons || []).find((a) => a.id === id);
      return addon && offeredRtoAddons(next, [addon]).length > 0;
    });
    setForm(
      keptIds.length === (form.addonIds || []).length
        ? patch
        : { ...patch, addonIds: keptIds },
    );
  };

  const handleCaseType = (caseType) => {
    const switchingToRtoOnly = caseType === "rto_only";
    setForm({
      caseType,
      ...(switchingToRtoOnly
        ? {
            courseId: null,
            course: null,
            courseName: null,
            coursePrice: null,
            firstSlot: null,
            planPreview: null,
          }
        : {}),
      addonIds: [],
      firstSlot: null,
      planPreview: null,
    });
  };

  const handleCourse = (course) => {
    setForm({
      courseId: course.id,
      courseName: course.name,
      coursePrice: course.price,
      course,
    });
  };

  const ready =
    form.serviceable === true &&
    form.has_a_DL !== null &&
    (isRtoOnly || Boolean(form.courseId));

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

      <BookingStepper step={1} step2Label={bookingStep2Label(form.caseType)} />

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

            <PackageSelector
              value={form.caseType}
              onChange={handleCaseType}
              has_a_DL={form.has_a_DL}
            />

            {!isRtoOnly && (
              <CourseSelector courses={config.courses} courseId={form.courseId} onChange={handleCourse} />
            )}
          </div>

          <div className="mt-10 flex flex-col items-center gap-3">
            <Button
              variant="contained"
              disabled={!ready}
              onClick={() => {
                navigate(
                  form.has_a_DL === true ||
                    isRtoOnly ||
                    form.caseType === "course_rto"
                    ? "/book/schedule"
                    : "/book/review",
                );
              }}
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









