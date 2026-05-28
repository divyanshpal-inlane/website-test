import React, { useState, useEffect, useRef } from "react";
import { X, ArrowRight } from "lucide-react";
import { supabase } from "../supabaseClient";
/**
 * LetsChatModal
 * --------------------------------------------------------------------------
 * A pop-up (modal) lead-capture form for the Buyer page.
 *
 * Opens when the "Let's Chat" CTA is clicked. Self-contained:
 *   - Renders nothing when `open` is false.
 *   - Locks body scroll while open.
 *   - Closes on backdrop click, Escape key, or the X button.
 *   - "Add more details" is collapsed by default (matches the design).
 *
 * Props:
 *   open       : boolean  — whether the modal is visible
 *   onClose    : ()=>void — called when the user dismisses the modal
 *   onSubmit   : (data)=>void (optional) — receives the collected form data
 * --------------------------------------------------------------------------
 */

const BUDGET_OPTIONS = [
  "Under ₹5 Lakh",
  "₹5–10 Lakh",
  "₹10–15 Lakh",
  "₹15–20 Lakh",
  "₹20 Lakh+",
];
const BODY_TYPES = ["Hatchback", "Sedan", "SUV", "MUV"];
const FUEL_OPTIONS = ["Any", "Petrol", "Diesel", "CNG", "Electric"];
const TRANSMISSION_OPTIONS = ["Any", "Automatic", "Manual"];

export default function LetsChatModal({ open, onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [budget, setBudget] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [bodyTypes, setBodyTypes] = useState([]);
  const [fuel, setFuel] = useState("Any");
  const [transmission, setTransmission] = useState("Any");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

  const dialogRef = useRef(null);

  // Lock body scroll + handle Escape key while the modal is open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  // Reset to a clean state whenever the modal is freshly opened
  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setErrors({});
    }
  }, [open]);

  if (!open) return null;

  const toggleBodyType = (type) => {
    setBodyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleSubmit = async () => {
    const newErrors = {};

    // Name Validation
    if (!name.trim()) {
      newErrors.name = "Name is required";
    }

    // Phone Validation
    if (!phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (!/^[6-9]\d{9}$/.test(phone.replace(/\s/g, ""))) {
      newErrors.phone = "Enter a valid 10-digit phone number";
    }

    // Budget Validation
    if (!budget) {
      newErrors.budget = "Please select your budget";
    }

    // IF Errors Exist → Stop Submit
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      // Start Loading
      setLoading(true);
      // Clear Errors
      setErrors({});

      // Insert into Supabase
      // const data = { name, phone, budget, bodyTypes, fuel, transmission };
      const { error } = await supabase.from("buyer_request").insert([
        {
          name,
          phone,
          budget,
          body_types: bodyTypes,
          fuel,
          transmission,
        },
      ]);

      // Handle Error
      if (error) {
        console.error("Supabase Error:", error);
        // alert("Something went wrong");
        return;
      }

      // Success
      //   alert("Lead submitted successfully");
      setSubmitted(true);

      // Reset Form
      setName("");
      setPhone("");
      setBudget("");
      setBodyTypes([]);
      setFuel("Any");
      setTransmission("Any");
      setShowMore(false);
    } catch (err) {
      console.error("Submission Error:", err);
      alert("Oops! Unexpected error occurred");
    } finally {
      // Stop Loading
      setLoading(false);
    }

    // onSubmit?.(data);
    // Success State
  };

  const handleBackdropClick = (e) => {
    // Only close if the click landed on the backdrop itself, not the dialog
    if (e.target === e.currentTarget) onClose?.();
  };

  const inputClass =
    "w-full rounded-[10px] border-[1.5px] border-[#EDEFEB] bg-white " +
    "px-[13px] py-[11px] font-['Bricolage_Grotesque'] text-[15px] font-medium " +
    "text-[#111] outline-none transition-colors focus:border-[#00CE84]";

  const labelClass =
    "mb-1 block font-['Bricolage_Grotesque'] text-[11px] font-bold " +
    "uppercase tracking-[0.06em] text-[#3D4038]";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center
                 bg-black/50 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Tell us what car you need"
    >
      <div
        ref={dialogRef}
        className="relative max-h-[90vh] w-full max-w-[480px] overflow-y-auto
                   rounded-[16px] border border-[rgba(217,255,122,0.5)]
                   bg-[#F2FFD9] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]
                   sm:p-7"
      >
        {/* ---------- CLOSE BUTTON ---------- */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center
                     justify-center rounded-full bg-white/70 text-[#3D4038]
                     transition-colors hover:bg-white hover:text-black"
        >
          <X className="h-5 w-5" strokeWidth={2.5} />
        </button>

        {submitted ? (
          /* ---------- SUCCESS STATE ---------- */
          <div className="py-8 text-center">
            <div className="mb-3 text-[44px] leading-none">🎉</div>
            <h3
              className="font-['Bricolage_Grotesque'] text-[20px] font-extrabold
                         text-[#111]"
            >
              Got it{name ? `, ${name.split(" ")[0]}` : ""}!
            </h3>
            <p
              className="mx-auto mt-2 max-w-[320px] font-['Bricolage_Grotesque']
                         text-[14px] font-medium leading-[1.5] text-[#7A7F75]"
            >
              We'll call you within 24 hours with car picks that match your
              budget. No pressure, just options.
            </p>
            <button
              onClick={onClose}
              className="mt-5 inline-flex items-center justify-center
                         rounded-[12px] bg-[#00CE84] px-7 py-3
                         font-['Bricolage_Grotesque'] text-[15px] font-bold
                         text-white transition-colors hover:bg-[#00b574]"
            >
              Done
            </button>
          </div>
        ) : (
          /* ---------- FORM STATE ---------- */
          <>
            <h2
              className="pr-8 font-['Bricolage_Grotesque'] text-[20px]
                         font-extrabold leading-[1.15] tracking-[-0.02em]
                         text-[#111] sm:text-[22px]"
            >
              Tell us what you need
            </h2>
            <p
              className="mb-4 mt-1 font-['Bricolage_Grotesque'] text-[13px]
                         font-medium text-[#7A7F75]"
            >
              Name, number, budget — that's enough to get started. We'll call
              you.
            </p>

            {/* NAME */}
            <div className="mb-3">
              <label className={labelClass} htmlFor="lcm-name">
                Name
              </label>
              <input
                id="lcm-name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: "" }));
                }}
                className={`${inputClass} ${
                  errors.name ? "border-red-500" : ""
                }`}
              />
              {errors.name && (
                <p className="mt-1 text-[12px] font-medium text-red-500">
                  {errors.name}
                </p>
              )}
            </div>

            {/* PHONE */}
            <div className="mb-3">
              <label className={labelClass} htmlFor="lcm-phone">
                Phone
              </label>
              <input
                id="lcm-phone"
                type="tel"
                placeholder="98XXX XXXXX"
                value={phone}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  setPhone(value);
                  setErrors((prev) => ({ ...prev, phone: "" }));
                }}
                className={`${inputClass} ${
                  errors.phone ? "border-red-500" : ""
                }`}
              />
              {errors.phone && (
                <p className="mt-1 text-[12px] font-medium text-red-500">
                  {errors.phone}
                </p>
              )}
            </div>

            {/* BUDGET */}
            <div className="mb-3">
              <label className={labelClass} htmlFor="lcm-budget">
                Budget
              </label>
              <select
                id="lcm-budget"
                value={budget}
                onChange={(e) => {
                  setBudget(e.target.value);
                  setErrors((prev) => ({ ...prev, budget: "" }));
                }}
                className={`${inputClass} ${
                  errors.budget ? "border-red-500" : ""
                }`}
              >
                <option value="">What's your range?</option>
                {BUDGET_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              {errors.budget && (
                <p className="mt-1 text-[12px] font-medium text-red-500">
                  {errors.budget}
                </p>
              )}
            </div>

            {/* ADD MORE DETAILS (collapsible) */}
            <button
              type="button"
              onClick={() => setShowMore((s) => !s)}
              className="mb-3 mt-1 font-['Bricolage_Grotesque'] text-[13px]
                         font-semibold text-[#00b574]"
            >
              {showMore ? "−" : "+"} Add more details (optional)
            </button>

            {showMore && (
              <div className="mb-1">
                {/* BODY TYPE */}
                <div className="mb-3">
                  <label className={labelClass}>Body Type</label>
                  <div className="flex flex-wrap gap-[5px]">
                    {BODY_TYPES.map((type) => {
                      const active = bodyTypes.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleBodyType(type)}
                          className={
                            "rounded-full border-[1.5px] px-[14px] py-[6px] " +
                            "font-['Bricolage_Grotesque'] text-[13px] " +
                            "font-semibold transition-colors " +
                            (active
                              ? "border-[#00CE84] bg-[#00CE84] text-white"
                              : "border-[#EDEFEB] bg-white text-[#111] hover:border-[#00CE84]")
                          }
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* FUEL + TRANSMISSION */}
                <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="lcm-fuel">
                      Fuel
                    </label>
                    <select
                      id="lcm-fuel"
                      value={fuel}
                      onChange={(e) => setFuel(e.target.value)}
                      className={inputClass}
                    >
                      {FUEL_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="lcm-trans">
                      Transmission
                    </label>
                    <select
                      id="lcm-trans"
                      value={transmission}
                      onChange={(e) => setTransmission(e.target.value)}
                      className={inputClass}
                    >
                      {TRANSMISSION_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* SUBMIT */}
            <button
              type="button"
              onClick={handleSubmit}
              className="mt-4 flex w-full items-center justify-center gap-2
                         rounded-[12px] bg-[#00CE84] py-[13px]
                         font-['Bricolage_Grotesque'] text-[15px] font-bold
                         text-white transition-colors hover:bg-[#00b574] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Submitting..." : "Submit"}
              {!loading && <ArrowRight className="h-4 w-4" strokeWidth={3} />}
            </button>

            <p
              className="mt-[6px] font-['Bricolage_Grotesque'] text-[11px]
                         text-[#7A7F75]"
            >
              We'll call within 24 hours. No spam, no pressure.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
