export function bookingStep2Label(caseType) {
  return caseType === "course_rto" ? "Schedule & RTO" : "Schedule";
}

export function bookingStep2Headline(caseType, has_a_DL) {
  if (caseType === "rto_only") {
    return {
      title: "Choose your RTO services",
      subtitle: "Select the paperwork you need — we'll take care of the application and documents.",
    };
  }
  if (caseType === "course_rto") {
    return {
      title: "Pick your schedule & RTO services",
      subtitle: has_a_DL
        ? "Choose when your first lesson starts, and add any RTO paperwork you need."
        : "Add any RTO paperwork you need — we'll schedule your driving lessons after payment.",
    };
  }
  return {
    title: "Pick your schedule",
    subtitle: has_a_DL
      ? "Choose when your first lesson starts — we'll take care of the rest."
      : "We'll assign your trainer and book your lessons after payment.",
  };
}