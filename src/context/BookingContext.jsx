import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "lane_booking_v2";

const initialForm = {
  areaId: null,
  areaName: null,
  latitude: null,
  longitude: null,
  locationName: null,
  serviceable: false,
  caseType: "course_rto",
  courseId: null,
  course: null,
  courseName: null,
  coursePrice: null,
  addonIds: [],
  femalePreference: false,
  has_a_DL: null,
  twoWheelerLicenseState: null,
  kaLicence: null,
  kaLicence4w: null,
  firstSlot: null,
  planPreview: null,
  selectedSlots: [],
  customer: {
    name: "",
    email: "",
    phone: "",
    city: "",
    address: "",
    lat: null,
    lng: null,
  },
  installmentMode: null,
};

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { form: { ...initialForm, customer: { ...initialForm.customer } }, bookingResult: null };
    const parsed = JSON.parse(raw);
    return {
      form: { ...initialForm, ...parsed.form, customer: { ...initialForm.customer, ...(parsed.form?.customer || {}) } },
      bookingResult: parsed.bookingResult || null,
    };
  } catch (_) {
    return { form: { ...initialForm, customer: { ...initialForm.customer } }, bookingResult: null };
  }
}

const BookingContext = createContext(null);

export function BookingProvider({ children }) {
  const [{ form, bookingResult }, setState] = useState(loadState);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ form, bookingResult }));
    } catch (_) {
      // storage may be unavailable (private mode) — state still works in-memory
    }
  }, [form, bookingResult]);

  const setForm = (patch) => {
    setState((prev) => ({ ...prev, form: { ...prev.form, ...patch } }));
  };

  const setCustomer = (patch) => {
    setState((prev) => ({
      ...prev,
      form: { ...prev.form, customer: { ...prev.form.customer, ...patch } },
    }));
  };

  const reset = () => {
    setState({ form: { ...initialForm, customer: { ...initialForm.customer } }, bookingResult: null });
  };

  const value = useMemo(
    () => ({ form, bookingResult, setForm, setCustomer, setBookingResult: (r) => setState((p) => ({ ...p, bookingResult: r })), reset }),
    [form, bookingResult],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within a BookingProvider");
  return ctx;
}