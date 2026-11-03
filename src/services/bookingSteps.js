// Step 2 is universal: "Select Add-on" always happens, "Select Slot" only
// happens for 4-wheeler licence holders (has_a_DL === true), per the flow:
//   4W? Yes -> Plan -> Add-on -> Slot -> Payment
//   4W? No  -> Plan -> Add-on -> Payment
export function bookingStep2Label(has_a_DL) {
  return has_a_DL === true ? "Add-ons & Schedule" : "Add-ons";
}

export function bookingStep2Headline(has_a_DL) {
  if (has_a_DL === true) {
    return {
      title: "Add RTO services & pick your schedule",
      subtitle: "Add any RTO paperwork you need, then choose when your first lesson starts.",
    };
  }
  return {
    title: "Add any RTO services you need",
    subtitle: "We'll assign your trainer and schedule your driving lessons after payment.",
  };
}
