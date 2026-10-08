// Maps booking flow error codes to human-friendly guidance: what went wrong
// (cause) and what the learner should do next (action). Every known code gets
// its own guidance; unknown/network errors fall back to a generic recovery
// message. Consumers pass a BookingApiError (or any object with .code/.message)
// and render <BookingErrorNotice error={...} />.

const GUIDES = {
  slot_conflict: {
    title: "That time was just taken",
    reason:
      "Another booking (or a booking rule) grabbed one of the times while you were choosing. Your previous choices were released.",
    action: "Pick fresh lesson times from the updated list and try again.",
  },
  hold_expired: {
    title: "Your reservation window expired",
    reason:
      "Lesson times are only held for a short window while you pay. That window passed, so we released the old times.",
    action: "Start again from the schedule step and pick fresh times — nothing has been charged.",
  },
  slot_not_found: {
    title: "That lesson is no longer available",
    reason: "The lesson you were changing was released or expired while you were working on it.",
    action: "Refresh the list and pick another time.",
  },
  payment_not_completed: {
    title: "Payment isn't confirmed yet",
    reason: "We couldn't find a completed payment for this booking.",
    action: "Complete your payment first, then come back and retry.",
  },
  payment_verification_failed: {
    title: "We couldn't verify your payment",
    reason: "The payment we received didn't match this booking's order.",
    action: "Try the payment again. If any amount was charged, it is automatically refunded.",
  },
  payment_failed: {
    title: "The payment didn't go through",
    reason: "Your payment for this booking was not completed.",
    action: "Check your payment method and try again, or contact us if the money was deducted.",
  },
  booking_abandoned: {
    title: "This booking was abandoned",
    reason: "The booking sat unpaid past its window and was closed automatically.",
    action: "Start a fresh booking — your previous choices are gone.",
  },
  booking_disabled: {
    title: "Online booking isn't available right now",
    reason: "We've paused online bookings at the moment.",
    action: "Check back soon, or call us and we'll set things up for you on a call.",
  },
  invalid_state: {
    title: "This booking is in a state we can't work with",
    reason: "The booking moved into a state that doesn't allow this action.",
    action: "Go back to the schedule step and restart, or contact support.",
  },
  amount_mismatch: {
    title: "The amount didn't match your plan",
    reason: "The price changed between your review and this payment.",
    action: "Go back, re-check your plan, and complete the payment again.",
  },
  area_not_found: {
    title: "We couldn't find that area",
    reason: "The area you picked is no longer in our booking list.",
    action: "Choose a different area from the list.",
  },
  course_not_found: {
    title: "We couldn't find that course",
    reason: "The course you picked is no longer available.",
    action: "Choose another course from the list.",
  },
  addon_not_found: {
    title: "We couldn't find that add-on",
    reason: "An add-on you selected is no longer offered.",
    action: "Re-check your add-ons and try again.",
  },
  course_not_configured: {
    title: "This course isn't ready for booking",
    reason: "The course is missing its lesson count configuration.",
    action: "Pick a different course, or contact us to book this one manually.",
  },
  gateway_unsupported: {
    title: "We can't take payment for this booking",
    reason: "The configured payment method isn't supported.",
    action: "Contact us and we'll arrange your payment.",
  },
  instructor_unavailable: {
    title: "The trainer isn't available anymore",
    reason: "The trainer assigned to your lesson is no longer taking bookings.",
    action: "Restart your booking to see current trainer availability.",
  },
  validation_error: {
    title: "Some details need a second look",
    reason: "One or more fields didn't pass our checks.",
    action: "Fix the highlighted details and try again.",
  },
  server_error: {
    title: "Something went wrong on our side",
    reason: "Our server hit a problem while handling your request.",
    action: "Wait a moment and try again. If it keeps happening, contact support.",
  },
  request_failed: {
    title: "Something went wrong on our side",
    reason: "We couldn't reach our booking service.",
    action: "Check your connection and try again in a moment.",
  },
};

const FALLBACK = {
  title: "Something went wrong",
  reason: "We couldn't complete this action.",
  action: "Please try again in a moment. If it keeps happening, contact our support team.",
};

export function guideForCode(code, message) {
  return GUIDES[code] || FALLBACK;
}

export function guideForError(error) {
  if (error && typeof error === "object" && error.code) {
    return guideForCode(error.code, error.message);
  }
  // No recognised code — could be a pure validation/field error ({ message })
  // thrown by the form, an unexpected server response, or a network blip. If
  // there IS a message, surface that message as the reason so nothing is
  // hidden; the generic recovery still supplies the title and the action.
  if (error && typeof error === "object" && error.message) {
    return { ...FALLBACK, reason: error.message };
  }
  return { ...FALLBACK, reason: null };
}

export function errorTitle(error) {
  if (error && typeof error === "object" && error.code) {
    const guide = GUIDES[error.code];
    if (guide) return guide.title;
  }
  return FALLBACK.title;
}