import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@mui/material";
import { useBooking } from "../../context/BookingContext";
import { useBookingConfig } from "../../hooks/useBookingConfig";
import { useBookingSlots } from "../../hooks/useBookingSlots";
import { getBookingSlots } from "../../services/bookingApi";
import { getBookingRules } from "../../services/bookingRules";
import { bookingStep2Label, bookingStep2Headline } from "../../services/bookingSteps";
import BookingStepper from "../../components/booking/BookingStepper";
import InstructorPreference from "../../components/booking/InstructorPreference";
import SlotSelector from "../../components/booking/SlotSelector";
import CoursePlanList from "../../components/booking/CoursePlanList";
import RtoServiceSelector from "../../components/booking/RtoServiceSelector";
import RtoLicenceDetails from "../../components/booking/RtoLicenceDetails";
import BookingErrorNotice from "../../components/booking/BookingErrorNotice";

export default function SchedulePage() {
  const navigate = useNavigate();
  const { config, loading: configLoading } = useBookingConfig();
  const { form, setForm } = useBooking();
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState(null);
  const [editingLesson, setEditingLesson] = useState(null);
  const [planEditSlots, setPlanEditSlots] = useState([]);
  const [planEditLoading, setPlanEditLoading] = useState(false);
  const [planEditError, setPlanEditError] = useState(null);

  const isRtoOnly = form.caseType === "rto_only";
  const assignLaterRto = !form.has_a_DL && form.caseType === "course_rto";
  const maySelectRtoOnly = isRtoOnly || assignLaterRto;

  const hasInputs =
    form.serviceable === true &&
    (isRtoOnly || Boolean(form.courseId)) &&
    typeof form.has_a_DL === "boolean";

  const rules = getBookingRules(config);

  useEffect(() => {
    if (!configLoading && config) {
      if (!hasInputs) {
        navigate("/book", { replace: true });
      } else if (form.has_a_DL !== true && !isRtoOnly && form.caseType !== "course_rto") {
        navigate("/book/review", { replace: true });
      }
    }
  }, [
    configLoading,
    config,
    hasInputs,
    form.has_a_DL,
    form.caseType,
    isRtoOnly,
    navigate,
  ]);

  const { result, loading, error, refetch } = useBookingSlots({
    areaId: form.areaId,
    courseId: maySelectRtoOnly ? undefined : form.courseId,
    has_a_DL: form.has_a_DL,
    femaleInstructorPreference: form.femalePreference,
    learnerLat: form.latitude,
    learnerLng: form.longitude,
  });

  const femalePreferenceAvailable =
    result?.femaleInstructorAvailable === true &&
    (rules.femaleInstructorMode === "preference" || rules.femaleInstructorMode === "mandatory");

  const editRequestBase = () => ({
    areaId: form.areaId,
    courseId: form.courseId,
    has_a_DL: form.has_a_DL,
    femaleInstructorPreference: Boolean(form.femalePreference),
    learnerLat: form.latitude,
    learnerLng: form.longitude,
  });

  const selectFirstSlot = async (slot) => {
    setEditingLesson(null);
    setPlanEditSlots([]);
    setPlanEditError(null);
    setForm({ firstSlot: slot, planPreview: null });
    setPlanError(null);
    setPlanLoading(true);
    try {
      const data = await getBookingSlots({
        ...editRequestBase(),
        firstSlot: { date: slot.date, start: slot.start },
      });
      setForm({
        planPreview: data.plan || { ok: false, totalLessons: 0, lessons: [] },
      });
      if (data.plan && data.plan.ok === false) {
        setPlanError(
          data.message ||
            "We couldn't build a full schedule starting from that lesson. Please pick another time.",
        );
      }
    } catch (e) {
      setPlanError(e?.message || "Something went wrong while building your schedule. Try again.");
      setForm({ planPreview: null });
    } finally {
      setPlanLoading(false);
    }
  };

  const openChangeSlot = async (lesson) => {
    if (editingLesson === lesson) {
      setEditingLesson(null);
      setPlanEditSlots([]);
      setPlanEditError(null);
      return;
    }
    setEditingLesson(lesson);
    setPlanEditSlots([]);
    setPlanEditError(null);
    setPlanEditLoading(true);
    try {
      const data = await getBookingSlots({
        ...editRequestBase(),
        firstSlot: form.firstSlot
          ? { date: form.firstSlot.date, start: form.firstSlot.start }
          : undefined,
        editLesson: lesson,
      });
      setPlanEditSlots(data?.planEdit?.slots || []);
      if (data?.planEdit?.slots?.length === 0) {
        setPlanEditError(data?.message || "No other free times for this lesson right now.");
      }
    } catch (e) {
      setPlanEditError(e?.message || "Couldn't load other free times. Please try again.");
    } finally {
      setPlanEditLoading(false);
    }
  };

  const applyChangeSlot = async (lesson, slot) => {
    setPlanEditError(null);
    setPlanEditLoading(true);
    try {
      const data = await getBookingSlots({
        ...editRequestBase(),
        firstSlot: { date: form.firstSlot.date, start: form.firstSlot.start },
        editLesson: lesson,
        editDate: slot.date,
        editStart: slot.start,
      });
      if (data?.plan?.ok === true && Array.isArray(data.plan.lessons) && data.plan.lessons.length > 0) {
        const updated = data.plan.lessons;
        const firstLesson = updated[0];
        setForm({
          planPreview: data.plan,
          firstSlot: { date: firstLesson.date, start: firstLesson.start_time },
        });
        setEditingLesson(null);
        setPlanEditSlots([]);
      } else {
        setPlanEditError(
          data?.message || "That time was just taken. Please pick another slot.",
        );
      }
    } catch (e) {
      setPlanEditError(e?.message || "We couldn't change that slot. Please try another time.");
    } finally {
      setPlanEditLoading(false);
    }
  };

  const closeChangeSlot = () => {
    setEditingLesson(null);
    setPlanEditSlots([]);
    setPlanEditError(null);
  };

  const clearFirstSlot = () => {
    setEditingLesson(null);
    setPlanEditSlots([]);
    setForm({ firstSlot: null, planPreview: null });
  };

  const plan = form.planPreview;
  const planReady = form.firstSlot && plan?.ok && Array.isArray(plan.lessons) && plan.lessons.length > 0;

  const toggleAddon = (addonId) => {
    const current = form.addonIds || [];
    setForm({
      addonIds: current.includes(addonId)
        ? current.filter((id) => id !== addonId)
        : [...current, addonId],
    });
  };

  const step2Label = bookingStep2Label(form.caseType);
  const headline = bookingStep2Headline(form.caseType, form.has_a_DL);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{headline.title}</h1>
        <p className="text-gray-500 mt-2">{headline.subtitle}</p>
      </div>

      <BookingStepper step={2} step2Label={step2Label} />

      <button
        type="button"
        onClick={() => navigate("/book")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to plan
      </button>

      <div className="space-y-10">
        {maySelectRtoOnly ? (
          <>
            {assignLaterRto && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full bg-[#00ce84] shrink-0 mt-2"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-gray-600">
                    Driving classes start after your <span className="font-semibold text-gray-800">learner's licence (LL)</span>{" "}
                    is issued — you can't take the road without it. We'll get your LL sorted first,
                    then assign your trainer and schedule your lessons once it's ready.
                  </p>
                </div>
              </div>
            )}
            {form.caseType === "classes_only" && form.has_a_DL !== true && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <div className="flex items-start gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0 mt-1.5" aria-hidden="true" />
                  <p className="text-sm text-blue-800">
                    <span className="font-semibold">Driving classes only:</span> Since you don't have a learner's licence yet,
                    your lessons will be scheduled after your LL is issued. Our team will contact you to
                    arrange the LL test and then book your lessons.
                  </p>
                </div>
              </div>
            )}
            <RtoLicenceDetails form={form} onChange={setForm} />
            <RtoServiceSelector
              form={form}
              addons={config?.addons}
              addonIds={form.addonIds || []}
              onChange={toggleAddon}
            />
          </>
        ) : (
          <>
            <InstructorPreference
              available={femalePreferenceAvailable}
              value={Boolean(form.femalePreference)}
              onChange={(value) => setForm({ femalePreference: value, firstSlot: null, planPreview: null })}
            />
            {error ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
                <BookingErrorNotice error={error} onRetry={refetch} />
              </div>
            ) : (
              <div className="space-y-6">
                <SlotSelector
                  result={result}
                  firstSlot={form.firstSlot}
                  loading={loading}
                  onSelect={selectFirstSlot}
                  onClear={clearFirstSlot}
                />

                <CoursePlanList
                  lessons={plan?.lessons}
                  loading={planLoading}
                  error={planError}
                  slotDurationMinutes={rules.slotDurationMinutes}
                  editingLesson={editingLesson}
                  candidateSlots={planEditSlots}
                  candidateLoading={planEditLoading}
                  candidateError={planEditError}
                  onChangeLesson={openChangeSlot}
                  onPickCandidate={applyChangeSlot}
                  onCancelEdit={closeChangeSlot}
                />
              </div>
            )}

            {form.caseType === "course_rto" && (
              <>
                <RtoLicenceDetails form={form} onChange={setForm} />
                <RtoServiceSelector
                  form={form}
                  addons={config?.addons}
                  addonIds={form.addonIds || []}
                  onChange={toggleAddon}
                />
              </>
            )}
          </>
        )}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          variant="contained"
          disabled={
            isRtoOnly
              ? form.twoWheelerLicenseState == null || (form.addonIds || []).length === 0
              : assignLaterRto
                ? false
                : loading || planLoading || !planReady
          }
          onClick={() => navigate("/book/review")}
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
          {isRtoOnly ? "Review your selection" : "Continue to Review"}
        </Button>
      </div>
    </div>
  );
}