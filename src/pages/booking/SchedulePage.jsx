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
import BookingErrorNotice from "../../components/booking/BookingErrorNotice";
import AssistanceBanner from "../../components/booking/AssistanceBanner";

// ---------------------------------------------------------------------------
// Step 2 — universal "Select Add-on" (+ "Select Slot" for 4W licence
// holders only), per the flow:
//   4W Yes -> Add-on -> Slot -> Payment
//   4W No  -> Add-on -> Payment   (no slot selection — a trainer is
//                                  assigned and lessons are scheduled after
//                                  payment, once the required licence/LL is
//                                  in place)
// ---------------------------------------------------------------------------
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
  const [assistanceTrigger, setAssistanceTrigger] = useState(0);

  // Only 4W-licence holders select a concrete slot.
  const direct = form.has_a_DL === true;

  const needsTwoWheeler = form.has_a_DL === false;
  const twoWheelerAnswered = needsTwoWheeler ? form.twoWheelerLicenseState != null : true;
  const needsKaFor2W =
    needsTwoWheeler &&
    (form.twoWheelerLicenseState === "ll_only" || form.twoWheelerLicenseState === "active_dl");
  const kaAnswered = needsKaFor2W ? form.kaLicence !== null && form.kaLicence !== undefined : true;

  const hasInputs =
    form.serviceable === true &&
    Boolean(form.courseId) &&
    typeof form.has_a_DL === "boolean" &&
    twoWheelerAnswered &&
    kaAnswered;

  const rules = getBookingRules(config);

  useEffect(() => {
    if (!configLoading && config && !hasInputs) {
      navigate("/book", { replace: true });
    }
  }, [configLoading, config, hasInputs, navigate]);

  const { result, loading, error, refetch } = useBookingSlots({
    areaId: form.areaId,
    courseId: direct ? form.courseId : undefined,
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

  const pickStartDate = (date) => {
    setEditingLesson(null);
    setPlanEditSlots([]);
    setPlanEditError(null);
    setPlanError(null);
    setForm({ startDate: date, preferredSlots: [], planPreview: null });
  };

  const togglePreferredSlot = (start) => {
    const current = Array.isArray(form.preferredSlots) ? [...form.preferredSlots] : [];
    const idx = current.indexOf(start);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else if (current.length < 3) {
      current.push(start);
    }
    setEditingLesson(null);
    setPlanEditSlots([]);
    setPlanEditError(null);
    setPlanError(null);
    setForm({ preferredSlots: current, planPreview: null });
  };

  const clearPreferredSlots = () => {
    setEditingLesson(null);
    setPlanEditSlots([]);
    setPlanEditError(null);
    setPlanError(null);
    setForm({ preferredSlots: [], planPreview: null });
  };

  const buildSchedule = async () => {
    const startDate = form.startDate;
    const preferredSlots = Array.isArray(form.preferredSlots) ? form.preferredSlots : [];
    if (!startDate || preferredSlots.length === 0 || preferredSlots.length > 3) {
      setPlanError("Pick a start date and at least one preferred time.");
      return;
    }
    setEditingLesson(null);
    setPlanEditSlots([]);
    setPlanEditError(null);
    setPlanError(null);
    setPlanLoading(true);
    try {
      console.log("[buildSchedule] sending", { startDate, preferredSlots });
      const data = await getBookingSlots({
        ...editRequestBase(),
        startDate,
        preferredTimes: preferredSlots,
      });
      console.log("[buildSchedule] got FULL response", JSON.stringify(data, null, 2));
      setForm({
        planPreview: data.plan || { ok: false, totalLessons: 0, lessons: [] },
      });
      if (data.plan && data.plan.ok === false) {
        setPlanError(
          data.message ||
            "We couldn't build a full schedule with those preferences. Please try a different start date or preferred times.",
        );
      } else if (data.plan?.ok === true && Array.isArray(data.plan.lessons) && data.plan.lessons.length > 0) {
        setPlanError(null);
      } else {
        console.warn("[buildSchedule] Unexpected response shape:", {
          planOk: data.plan?.ok,
          planLessons: data.plan?.lessons,
          totalLessons: data.plan?.totalLessons,
          schedulingMode: data.schedulingMode,
        });
        setPlanError("Unexpected response from server. Please try again.");
      }
    } catch (e) {
      console.error("[buildSchedule] failed", e);
      setPlanError(e?.message || "Something went wrong while building your schedule. Try again.");
      setForm({ planPreview: null });
    } finally {
      setPlanLoading(false);
    }
  };

  const openChangeSlot = async (lesson) => {
    if (lesson === 1) {
      setAssistanceTrigger((t) => t + 1);
      setPlanEditError(
        "To change your first lesson, go back and pick a different start date or preferred times.",
      );
      return;
    }
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
        startDate: form.startDate || undefined,
        preferredTimes: Array.isArray(form.preferredSlots) ? form.preferredSlots : undefined,
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
        startDate: form.startDate || undefined,
        preferredTimes: Array.isArray(form.preferredSlots) ? form.preferredSlots : undefined,
        editLesson: lesson,
        editDate: slot.date,
        editStart: slot.start,
      });
      if (data?.plan?.ok === true && Array.isArray(data.plan.lessons) && data.plan.lessons.length > 0) {
        setForm({
          planPreview: data.plan,
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
    setForm({ startDate: null, preferredSlots: [], planPreview: null });
  };

  const plan = form.planPreview;
  const planReady =
    form.startDate &&
    Array.isArray(form.preferredSlots) &&
    form.preferredSlots.length > 0 &&
    plan?.ok &&
    Array.isArray(plan.lessons) &&
    plan.lessons.length > 0;

  const toggleAddon = (addonId) => {
    const current = form.addonIds || [];
    setForm({
      addonIds: current.includes(addonId)
        ? current.filter((id) => id !== addonId)
        : [...current, addonId],
    });
  };

  const step2Label = bookingStep2Label(form.has_a_DL);
  const headline = bookingStep2Headline(form.has_a_DL);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{headline.title}</h1>
        <p className="text-gray-500 mt-2">{headline.subtitle}</p>
      </div>

      <BookingStepper step={2} step2Label={step2Label} />

      <button
        type="button"
        onClick={() => {
          setAssistanceTrigger((t) => t + 1);
          navigate("/book");
        }}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to plan
      </button>

      <div className="space-y-10">
        {/* Select Add-on — always shown (optional); renders nothing when no
            RTO service applies to the licence answers from step 1. */}
        <RtoServiceSelector
          form={form}
          addons={config?.addons}
          addonIds={form.addonIds || []}
          onChange={toggleAddon}
        />

        {/* Select Slot — only for 4W licence holders. */}
        {direct ? (
          <>
            <InstructorPreference
              available={femalePreferenceAvailable}
              value={Boolean(form.femalePreference)}
              onChange={(value) => setForm({ femalePreference: value, startDate: null, preferredSlots: [], planPreview: null })}
            />
            {error ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
                <BookingErrorNotice error={error} onRetry={refetch} />
              </div>
            ) : (
              <div className="space-y-6">
                <SlotSelector
                  result={result}
                  startDate={form.startDate}
                  preferredSlots={Array.isArray(form.preferredSlots) ? form.preferredSlots : []}
                  loading={loading}
                  onPickStartDate={pickStartDate}
                  onTogglePreferred={togglePreferredSlot}
                  onClear={clearPreferredSlots}
                />
                <div className="flex flex-col items-center gap-2">
                  <Button
                    variant="contained"
                    disabled={
                      !form.startDate ||
                      !Array.isArray(form.preferredSlots) ||
                      form.preferredSlots.length === 0 ||
                      planLoading
                    }
                    onClick={buildSchedule}
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
                    {planLoading ? "Building your schedule…" : "Build my schedule"}
                  </Button>
                  {planError && <div className="w-full"><BookingErrorNotice error={planError} /></div>}
                  <p className="text-xs text-gray-500">
                    Uses your ranked preferences across every course day from the start date.
                  </p>
                </div>

                <CoursePlanList
                  lessons={plan?.lessons}
                  loading={planLoading}
                  error={null}
                  slotDurationMinutes={rules.slotDurationMinutes}
                  editingLesson={editingLesson}
                  candidateSlots={planEditSlots}
                  candidateLoading={planEditLoading}
                  candidateError={planEditError}
                  onChangeLesson={openChangeSlot}
                  onPickCandidate={applyChangeSlot}
                  onCancelEdit={closeChangeSlot}
                  disableEditLesson={1}
                />

                <AssistanceBanner trigger={assistanceTrigger} />
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full bg-[#00ce84] shrink-0 mt-2"
                aria-hidden="true"
              />
              <p className="text-sm text-gray-600">
                We'll assign your trainer and schedule your lessons after payment — no slot to
                pick right now.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          variant="contained"
          disabled={direct ? loading || planLoading || !planReady : false}
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
          Continue to Review
        </Button>
      </div>
    </div>
  );
}
