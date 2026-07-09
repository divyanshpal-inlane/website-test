import React, { useState, useEffect, useRef } from "react";
import { X, ArrowRight } from "lucide-react";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
/**
 * RTOLeadModal
 * --------------------------------------------------------------------------
 * A pop-up (modal) lead-capture form for the RTO pages.
 *
 * Opens from the "Get a callback" CTA on the RTO landing page and the
 * "Start now" buttons on the service detail page. Captures only the four
 * lead fields the RTO flow needs: Name, Email, Phone, Location.
 *
 * Self-contained:
 *   - Renders nothing when `open` is false.
 *   - Locks body scroll while open.
 *   - Closes on backdrop click, Escape key, or the X button.
 *
 * Props:
 *   open     : boolean  — whether the modal is visible
 *   onClose  : ()=>void — called when the user dismisses the modal
 *   service  : string   — (optional) service the lead is interested in
 *   onSubmit : (data)=>void (optional) — receives the collected form data
 * --------------------------------------------------------------------------
 */

/**
 * LocationAutocompleteInput
 * ---------------------------------------------------------------------------
 * Wires Google Places Autocomplete onto a plain, Tailwind-styled <input> —
 * same city/area mapping used by components/locationSelector.jsx (the
 * homepage SignupPopup's location field). Must render inside <APIProvider>
 * so useMapsLibrary can resolve the "places" library.
 *
 * Left uncontrolled (defaultValue, not value) so React never fights Google's
 * own DOM writes to the input while the user types or picks a suggestion.
 * --------------------------------------------------------------------------
 */
function LocationAutocompleteInput({
  id,
  defaultValue,
  onChange,
  className,
  placeholder,
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const places = useMapsLibrary("places");

  // Keep the latest onChange in a ref so the setup effect below (which attaches
  // Google's Autocomplete widget) only needs to run once places/input are ready
  // — not on every parent re-render. Without this, retyping in ANY field (since
  // that re-renders the parent and creates a new inline onChange) would tear
  // down and recreate the whole widget on every keystroke, which is what caused
  // the freeze/flicker.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!inputRef.current || !places || autocompleteRef.current) return;

    autocompleteRef.current = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "IN" },
      fields: ["address_components", "formatted_address"],
    });

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current?.getPlace();
      if (!place?.address_components) return;

      // Same city (locality) + area (sublocality_level_1) extraction as
      // components/locationSelector.jsx.
      let city = "";
      let area = "";
      place.address_components.forEach((component) => {
        if (component.types.includes("locality")) city = component.long_name;
        if (component.types.includes("sublocality_level_1"))
          area = component.long_name;
      });

      onChangeRef.current(
        [area, city].filter(Boolean).join(", ") ||
          place.formatted_address ||
          "",
      );
    });

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [places]);

  return (
    <input
      id={id}
      ref={inputRef}
      type="text"
      autoComplete="on"
      placeholder={placeholder}
      defaultValue={defaultValue}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}

export default function RTOLeadModal({ open, onClose, service, onSubmit }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [serviceInterest, setServiceInterest] = useState("");
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

  const handleSubmit = async () => {
    const newErrors = {};

    // Name Validation
    if (!name.trim()) {
      newErrors.name = "Name is required";
    }

    // Email Validation
    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "Enter a valid email address";
    }

    // Phone Validation
    if (!phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (!/^[6-9]\d{9}$/.test(phone.replace(/\s/g, ""))) {
      newErrors.phone = "Enter a valid 10-digit phone number";
    }

    // Location Validation
    if (!location.trim()) {
      newErrors.location = "Location is required";
    }

    // IF Errors Exist → Stop Submit
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setLoading(true);
      setErrors({});

      // No backend call yet — lead submission will be wired up to the Cratio
      // webhook. For now this just validates and shows the success state.

      onSubmit?.({
        name,
        email,
        phone,
        location,
        service: service || null,
        serviceInterest: serviceInterest.trim() || null,
      });
      setSubmitted(true);

      // Reset Form
      setName("");
      setEmail("");
      setPhone("");
      setLocation("");
      setServiceInterest("");
    } catch (err) {
      console.error("Submission Error:", err);
      alert("Oops! Unexpected error occurred");
    } finally {
      setLoading(false);
    }
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
      aria-label="Request a callback"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-[480px] overflow-hidden
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
              We'll call you within 24 hours to get your RTO work started. No
              queues, no confusion.
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
              Get a callback
            </h2>
            <p
              className="mb-4 mt-1 font-['Bricolage_Grotesque'] text-[13px]
                         font-medium text-[#7A7F75]"
            >
              {service
                ? `Leave your details for ${service} and we'll call you.`
                : "Leave your details and we'll call you to get started."}
            </p>

            {/* NAME */}
            <div className="mb-3">
              <label className={labelClass} htmlFor="rto-name">
                Name
              </label>
              <input
                id="rto-name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: "" }));
                }}
                className={`${inputClass} ${errors.name ? "border-red-500" : ""}`}
              />
              {errors.name && (
                <p className="mt-1 text-[12px] font-medium text-red-500">
                  {errors.name}
                </p>
              )}
            </div>

            {/* EMAIL */}
            <div className="mb-3">
              <label className={labelClass} htmlFor="rto-email">
                Email
              </label>
              <input
                id="rto-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: "" }));
                }}
                className={`${inputClass} ${errors.email ? "border-red-500" : ""}`}
              />
              {errors.email && (
                <p className="mt-1 text-[12px] font-medium text-red-500">
                  {errors.email}
                </p>
              )}
            </div>

            {/* PHONE */}
            <div className="mb-3">
              <label className={labelClass} htmlFor="rto-phone">
                Phone
              </label>
              <input
                id="rto-phone"
                type="tel"
                placeholder="98XXX XXXXX"
                value={phone}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  setPhone(value);
                  setErrors((prev) => ({ ...prev, phone: "" }));
                }}
                className={`${inputClass} ${errors.phone ? "border-red-500" : ""}`}
              />
              {errors.phone && (
                <p className="mt-1 text-[12px] font-medium text-red-500">
                  {errors.phone}
                </p>
              )}
            </div>

            {/* SERVICE INTEREST (free text, manually typed) */}
            <div className="mb-3">
              <label className={labelClass} htmlFor="rto-service-interest">
                What service are you looking for?
              </label>
              <input
                id="rto-service-interest"
                type="text"
                placeholder="e.g. DL Renewal, RC Transfer, Duplicate DL..."
                value={serviceInterest}
                onChange={(e) => setServiceInterest(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* LOCATION */}
            <div className="mb-3">
              <label className={labelClass} htmlFor="rto-location">
                Location
              </label>
              <APIProvider
                apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                libraries={["places"]}
              >
                <LocationAutocompleteInput
                  id="rto-location"
                  placeholder="City / RTO area"
                  defaultValue={location}
                  onChange={(value) => {
                    setLocation(value);
                    setErrors((prev) => ({ ...prev, location: "" }));
                  }}
                  className={`${inputClass} ${errors.location ? "border-red-500" : ""}`}
                />
              </APIProvider>
              {errors.location && (
                <p className="mt-1 text-[12px] font-medium text-red-500">
                  {errors.location}
                </p>
              )}
            </div>

            {/* SUBMIT */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
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
