import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useBooking } from "../../context/BookingContext";
import { useBookingConfig } from "../../hooks/useBookingConfig";
import { useCreateBooking } from "../../hooks/useCreateBooking";
import { useRazorpayCheckout } from "../../hooks/useRazorpayCheckout";
import {
  confirmBooking,
  createRazorpayOrder,
  verifyRazorpayPayment,
  approveBookingPayment,
  sendBookingOnboardingEmail,
  isSlotConflict,
  isHoldExpired,
} from "../../services/bookingApi";
import { getBookingRules } from "../../services/bookingRules";
import { bookingStep2Label } from "../../services/bookingSteps";
import BookingStepper from "../../components/booking/BookingStepper";
import BookingSummary from "../../components/booking/BookingSummary";
import CustomerDetails from "../../components/booking/CustomerDetails";
import PaymentSection from "../../components/booking/PaymentSection";
import ScheduleReview from "../../components/booking/ScheduleReview";

const PHONE_RE = /^\d{10}$/;

export default function ReviewPaymentPage() {
  const { config, loading: configLoading } = useBookingConfig();
  const { form, setForm, setCustomer, setBookingResult, bookingResult } = useBooking();
  const { create, creating, resetKey } = useCreateBooking();
  const { openCheckout } = useRazorpayCheckout();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [payError, setPayError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);

  if (configLoading) {
    return <div className="grid place-items-center py-32 text-gray-400">Loading…</div>;
  }

  const isRtoOnly = form.caseType === "rto_only";
  const direct = form.has_a_DL === true && !isRtoOnly;
  const isDirect = direct;
  const booking = bookingResult?.booking || null;
  const heldSlots = booking?.heldSlots || null;

  // Compute effective installment mode early so it can be used in handlers
  const modes = getBookingRules(config).installmentModes || [];
  const effectiveInstallmentMode = modes.includes(form.installmentMode)
    ? form.installmentMode
    : modes[0] || null;

  const validate = () => {
    if (!form.customer.name || form.customer.name.trim().length < 2) {
      return "Please enter your full name.";
    }
    const phone = (form.customer.phone || "").replace(/\D/g, "");
    if (!PHONE_RE.test(phone)) {
      return "Please enter a valid 10-digit phone number.";
    }
    const email = (form.customer.email || "").trim();
    if (!email) {
      return "Please enter your email address — it is required for your booking.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return "Please enter a valid email address.";
    }
    return null;
  };

  const totalAmount =
    (config?.courses?.find((c) => c.id === form.courseId)?.price || 0) +
    (config?.addons || [])
      .filter((a) => (form.addonIds || []).includes(a.id))
      .reduce((sum, a) => sum + Number(a.price || 0), 0);

  const redirectOnConflict = (e) => {
    if (isSlotConflict(e)) {
      resetKey();
      navigate("/book", { replace: true, state: { notice: e.message } });
      return true;
    }
    if (isHoldExpired(e)) {
      resetKey();
      navigate("/book", { replace: true, state: { notice: e.message } });
      return true;
    }
    return false;
  };

  const buildCustomer = () => ({
    name: form.customer.name.trim(),
    email: form.customer.email.trim(),
    phone: form.customer.phone.replace(/\D/g, ""),
    city: form.customer.city?.trim() || null,
    address: form.customer.address?.trim() || null,
    lat: form.latitude,
    lng: form.longitude,
  });

  // Stage A: hold the entire course schedule (licensed learners). Creates the
  // booking + reserves all lessons for the hidden same-instructor plan.
  const handleReserve = async () => {
    setPayError(null);
    setFormError(null);
    setNotice(null);

    const invalid = validate();
    if (invalid) {
      setFormError(invalid);
      return;
    }

    setReserving(true);
    try {
      const created = await create({
        areaId: form.areaId,
        courseId: form.courseId,
        caseType: form.caseType,
        customer: buildCustomer(),
        has_a_DL: form.has_a_DL,
        twoWheelerLicenseState: form.twoWheelerLicenseState,
        kaLicence: form.kaLicence,
        kaLicence4w: form.kaLicence4w,
        femaleInstructorPreference: form.femalePreference,
        addonIds: form.addonIds,
        installmentMode: form.installmentMode,
        latitude: form.latitude,
        longitude: form.longitude,
        locationName: form.locationName,
        firstSlot: form.firstSlot
          ? { date: form.firstSlot.date, start: form.firstSlot.start }
          : undefined,
        slots:
          form.planPreview?.ok === true && Array.isArray(form.planPreview.lessons)
            ? form.planPreview.lessons.map((l) => ({
                date: l.date,
                start_time: l.start_time,
                end_time: l.end_time,
              }))
            : undefined,
      });
      setBookingResult({ booking: created, customer: buildCustomer(), status: "awaiting_payment", at: Date.now() });
      setNotice("Your lesson times are held while you complete payment.");
    } catch (e) {
      if (redirectOnConflict(e)) return;
      setPayError(e);
    } finally {
      setReserving(false);
    }
  };

  const handlePay = async () => {
    setPayError(null);
    setFormError(null);
    setNotice(null);

    const invalid = validate();
    if (invalid) {
      setFormError(invalid);
      return;
    }

    setPaying(true);
    try {
      // Already paid but confirmation crashed mid-way (e.g. network) —
      // re-run confirmation only; never creates a second order.
      if (bookingResult?.status === "paid" && booking) {
        const confirmed = await confirmBooking(booking.bookingId);
        navigate("/book/success", {
          replace: true,
          state: { bookingId: booking.bookingId, confirmed: confirmed.success !== false, rtoOnly: isRtoOnly },
        });
        return;
      }

      let customer = bookingResult?.customer;
      let booking = bookingResult?.booking;

      if (!booking) {
        customer = buildCustomer();
        booking = await create({
          areaId: form.areaId,
          courseId: form.courseId,
          caseType: form.caseType,
          customer,
          has_a_DL: form.has_a_DL,
          twoWheelerLicenseState: form.twoWheelerLicenseState,
          kaLicence: form.kaLicence,
          kaLicence4w: form.kaLicence4w,
          femaleInstructorPreference: form.femalePreference,
          addonIds: form.addonIds,
          installmentMode: effectiveInstallmentMode,
          latitude: form.latitude,
          longitude: form.longitude,
          locationName: form.locationName,
          firstSlot: form.firstSlot
            ? { date: form.firstSlot.date, start: form.firstSlot.start }
            : undefined,
          slots:
            form.planPreview?.ok === true && Array.isArray(form.planPreview.lessons)
              ? form.planPreview.lessons.map((l) => ({
                  date: l.date,
                  start_time: l.start_time,
                  end_time: l.end_time,
                }))
              : undefined,
        });
      }

      setBookingResult({
        booking,
        customer,
        status: "awaiting_payment",
        at: Date.now(),
      });

      // Payment gateway is deliberately skipped while the booking is in test
      // payment mode: the payment is auto-approved and the booking finalized
      // without any gateway credentials or checkout modal. The live path
      // (Razorpay order -> checkout -> verify) below stays untouched for when
      // live keys are supplied.
      if (getBookingRules(config).paymentMode === "test") {
        const approved = await approveBookingPayment(booking.bookingId);
        setBookingResult({
          booking,
          customer,
          status: "paid",
          orderId: approved?.paymentId,
          at: Date.now(),
        });
        const confirmed = await confirmBooking(booking.bookingId);
        try {
          await sendBookingOnboardingEmail({ bookingId: booking.bookingId });
        } catch (emailError) {
          console.error("Onboarding email failed:", emailError);
        }
        navigate("/book/success", {
          replace: true,
          state: { bookingId: booking.bookingId, confirmed: confirmed.success !== false },
        });
        return;
      }

      // Reuse any existing Razorpay order so retries never create a second
      // charge; if the last modal attempt never paid, the order is still open.
      let order =
        typeof bookingResult?.orderPaymentId === "string"
          ? {
              orderId: bookingResult.orderId,
              paymentId: bookingResult.orderPaymentId,
              keyId: bookingResult.orderKeyId,
              currency: bookingResult.orderCurrency,
            }
          : null;

      if (!order) {
        const created = await createRazorpayOrder({
          learnerId: booking.learnerId,
          courseId: booking.courseId,
          amount: Number(booking.amounts.total),
          email: customer.email || "",
          phone: customer.phone,
          paymentType: isRtoOnly ? "custom" : "course",
          name: customer.name,
          installmentType: booking.installment.mode === "first_half" ? "first_half" : "full",
          totalAmount: Number(booking.amounts.total),
          installment1Amount: Number(booking.installment.installment1),
          installment2Amount: Number(booking.installment.installment2),
        });
        order = {
          orderId: created.orderId,
          paymentId: created.paymentId,
          keyId: created.keyId,
          currency: created.currency || "INR",
        };
        setBookingResult({
          booking,
          customer,
          status: "order_created",
          orderId: order.orderId,
          orderPaymentId: order.paymentId,
          orderKeyId: order.keyId,
          orderCurrency: order.currency,
          at: Date.now(),
        });
      }

      const payment = await openCheckout({
        key: order.keyId,
        orderId: order.orderId,
        amount: Number(booking.amounts.total),
        currency: order.currency || "INR",
        name: "Lane Driving School",
        description: isRtoOnly ? "RTO Services" : booking.courseName,
        prefill: { name: customer.name, email: customer.email, phone: customer.phone },
        mode: getBookingRules(config).paymentMode,
      });

      await verifyRazorpayPayment({
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_signature: payment.razorpay_signature,
        paymentId: order.paymentId,
      });

      setBookingResult({
        booking,
        customer,
        status: "paid",
        orderId: order.orderId,
        orderPaymentId: order.paymentId,
        orderKeyId: order.keyId,
        orderCurrency: order.currency,
        at: Date.now(),
      });

      const confirmed = await confirmBooking(booking.bookingId);

      navigate("/book/success", {
        replace: true,
        state: { bookingId: booking.bookingId, confirmed: confirmed.success !== false, rtoOnly: isRtoOnly },
      });
    } catch (e) {
      if (redirectOnConflict(e)) return;
      setPayError(e);
    } finally {
      setPaying(false);
    }
  };

  const updateHeldSlots = (updated) => {
    setBookingResult({
      ...bookingResult,
      booking: { ...bookingResult.booking, heldSlots: updated },
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Almost done!</h1>
        <p className="text-gray-500 mt-2">
          {isRtoOnly
            ? "Review your RTO services, add your details, and pay online."
            : isDirect && !booking
              ? "Review your plan, add your details, and hold your lesson times."
              : "Review your schedule, then pay online."}
        </p>
      </div>

      <BookingStepper step={3} step2Label={bookingStep2Label(form.caseType)} />

      <button
        type="button"
        onClick={() =>
          navigate(
            isDirect || isRtoOnly || form.caseType === "course_rto"
              ? "/book/schedule"
              : "/book",
          )
        }
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to{" "}
        {isDirect
          ? "schedule"
          : isRtoOnly
            ? "RTO services"
            : form.caseType === "course_rto"
              ? "schedule & RTO"
              : "plan"}
      </button>

      {bookingResult?.booking?.replay === true && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3 mb-6">
          We found your earlier booking and kept it as-is — you can continue paying for it.
        </p>
      )}

      {notice && (
        <p className="text-sm text-green-700 bg-green-50 rounded-xl p-3 mb-6">{notice}</p>
      )}

      {/* LL-scheduling note for non-DL classes_only learners */}
      {form.caseType === "classes_only" && form.has_a_DL !== true && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 mb-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <BookingSummary config={config} form={form} heldSlots={heldSlots} />
        </div>
        <div className="space-y-6">
          {!isDirect ? (
            <>
              <CustomerDetails
                areaName={form.areaName}
                customer={form.customer}
                onChange={setCustomer}
              />
              <PaymentSection
                totalAmount={totalAmount}
                installmentMode={effectiveInstallmentMode}
                modes={modes}
                onInstallmentChange={(installmentMode) => {
                  setBookingResult(null);
                  setPayError(null);
                  setForm({ installmentMode });
                }}
                onPay={handlePay}
                paying={paying || creating}
                error={payError || (formError ? { message: formError } : null)}
              />
            </>
          ) : booking ? (
            <>
              <ScheduleReview
                bookingId={booking.bookingId}
                heldSlots={heldSlots}
                holdMinutes={getBookingRules(config).holdMinutes}
                onChanged={updateHeldSlots}
                onHoldExpired={(message) => {
                  resetKey();
                  setForm({ firstSlot: null, planPreview: null });
                  navigate("/book", { replace: true, state: { notice: message } });
                }}
              />
              <PaymentSection
                totalAmount={totalAmount}
                installmentMode={effectiveInstallmentMode}
                modes={modes}
                onInstallmentChange={(installmentMode) => {
                  setBookingResult(null);
                  setPayError(null);
                  setForm({ installmentMode });
                }}
                onPay={handlePay}
                paying={paying || creating}
                error={payError || (formError ? { message: formError } : null)}
              />
            </>
          ) : (
            <>
              <CustomerDetails
                areaName={form.areaName}
                customer={form.customer}
                onChange={setCustomer}
              />
              <PaymentSection
                totalAmount={totalAmount}
                installmentMode={form.installmentMode}
                modes={modes}
                onInstallmentChange={(installmentMode) => {
                  setBookingResult(null);
                  setPayError(null);
                  setForm({ installmentMode });
                }}
                onPay={handleReserve}
                payLabel="Review & hold my lessons"
                paying={reserving || creating}
                error={payError || (formError ? { message: formError } : null)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}