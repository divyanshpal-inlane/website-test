import React, { useState } from "react";
import { Box, Button, TextField, Typography, Alert, AlertTitle } from "@mui/material";
import { Send, CheckCircle, AlertCircle } from "lucide-react";
import { trackFunnelEvent, captureFunnelLead } from "../utils/funnelTracking";

const OutOfAreaModal = ({ open, onClose, locationData }) => {
  const [formData, setFormData] = useState({ name: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "phone") {
      const numericValue = value.replace(/[^0-9]/g, "");
      setFormData((prev) => ({ ...prev, [name]: numericValue.slice(0, 10) }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    setError("");
  };

  const isPhoneValid = (phone) => phone.length === 10;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      setError("Please fill in both fields");
      return;
    }
    if (!isPhoneValid(formData.phone)) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Capture lead with blocked_reason = out_of_area
      const result = await captureFunnelLead({
        phone: formData.phone,
        country_code: "+91",
        name: formData.name,
        email: "",
        city: "",
        area: "",
        license: "no",
        source: "homepage_popup",
        ad_name: "Out of Area Notification",
        sheets_target: "none",
        dl_status: "unknown",
        area_id: locationData?.areaId || null,
        state: "Karnataka",
        blocked_reason: "out_of_area",
        marketing_consent: false,
        page_path: window.location.pathname,
      });

      if (result.ok) {
        setSubmitted(true);
        trackFunnelEvent("lead_capture_started", {
          form: "out_of_area",
          page_type: "marketing_home",
          blocked_reason: "out_of_area",
        });
      } else {
        setError(result.response?.error?.message || "Could not register. Please try again.");
      }
    } catch (err) {
      console.error("Out of area capture error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.6)",
          zIndex: 1300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
          onClick: () => !submitted && onClose(),
        }}
      />
      <Box
        sx={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1301,
          width: "100%",
          maxWidth: 440,
          backgroundColor: "white",
          borderRadius: 4,
          boxShadow: 24,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ position: "absolute", top: 16, right: 16, zIndex: 1 }}>
          <Button
            onClick={() => !submitted && onClose()}
            disabled={submitting || submitted}
            sx={{ backgroundColor: "rgba(0,0,0,0.1)", "&:hover": { backgroundColor: "rgba(0,0,0,0.2)" } }}
            aria-label="Close"
          >
            <AlertCircle sx={{ width: 24, height: 24, color: "#37474F" }} />
          </Button>
        </Box>

        <Box sx={{ p: { xs: 3, sm: 4 }, textAlign: "center" }}>
          {submitted ? (
            <Box>
              <CheckCircle sx={{ color: "#00CE84", width: 64, height: 64, mb: 2, mx: "auto" }} />
              <Typography variant="h5" sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, color: "#006B3E", mb: 1 }}>
                You're on the list!
              </Typography>
              <Typography variant="body1" sx={{ color: "#6B7280", mb: 3 }}>
                We'll notify you when Lane launches in your area.
              </Typography>
              <Button
                onClick={onClose}
                variant="contained"
                fullWidth
                sx={{
                  borderRadius: "50px",
                  background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                  color: "white",
                  fontWeight: 700,
                  fontFamily: "Bricolage Grotesque",
                  textTransform: "none",
                  py: 1.5,
                }}
              >
                Done
              </Button>
            </Box>
          ) : (
            <>
              <AlertCircle sx={{ color: "#E53935", width: 64, height: 64, mb: 2, mx: "auto" }} />
              <Typography variant="h5" sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, color: "#3C4856", mb: 1 }}>
                We're not in your area yet
              </Typography>
              <Typography variant="body1" sx={{ color: "#6B7280", mb: 3 }}>
                Lane currently operates in Bengaluru. Leave your details and we'll let you know when we expand to your location.
              </Typography>

              <Alert severity="info" sx={{ mb: 3, textAlign: "left", borderRadius: 2 }}>
                <AlertTitle>How it works</AlertTitle>
                <Typography variant="body2" sx={{ color: "#1E88E5" }}>
                  We'll only contact you about launch updates in your area — no marketing calls.
                </Typography>
              </Alert>

              <form onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                <TextField
                  fullWidth
                  label="Your Name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  size="small"
                  placeholder="Enter your name"
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
                />
                <TextField
                  fullWidth
                  label="Mobile Number"
                  type="tel"
                  inputMode="numeric"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  size="small"
                  placeholder="10-digit number"
                  inputProps={{ maxLength: 10 }}
                  helperText={error || (formData.phone && !/^\d{10}$/.test(formData.phone) ? "Enter a valid 10-digit number" : "")}
                  error={!!error || (formData.phone && !/^\d{10}$/.test(formData.phone))}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
                />

                {error && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    {error}
                  </Alert>
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={submitting ? <Box component="span" sx={{ display: "flex" }}><Box sx={{ width: 20, height: 20, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} /></Box> : <Send sx={{ width: 20, height: 20 }} />}
                  sx={{
                    borderRadius: "50px",
                    background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                    color: "white",
                    fontWeight: 700,
                    fontFamily: "Bricolage Grotesque",
                    textTransform: "none",
                    py: 2,
                    "&:disabled": { cursor: "not-allowed" },
                  }}
                >
                  {submitting ? "Registering..." : "Notify Me"}
                </Button>
              </form>
            </>
          )}
        </Box>
      </Box>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default OutOfAreaModal;