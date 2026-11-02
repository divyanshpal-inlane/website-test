import React, { useState, useEffect } from "react";
import { Box, Button, Typography, RadioGroup, Radio, FormControlLabel, IconButton } from "@mui/material";
import { X, ArrowRight } from "lucide-react";
import { trackFunnelEvent } from "../utils/funnelTracking";

const DLQualificationModal = ({ open, onClose, onContinue, locationData }) => {
  const [dlStatus, setDlStatus] = useState("unknown"); // "has_dl" | "no_dl" | "unknown"
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (open && !dismissed) {
      trackFunnelEvent("dl_status_selected", {
        dl_status: "unknown",
        dismissed: false,
        page_type: "marketing_home",
      });
    }
  }, [open, dismissed]);

  const handleClose = () => {
    if (!dismissed) {
      setDismissed(true);
      // Track dismissal with unknown status
      trackFunnelEvent("dl_status_selected", {
        dl_status: "unknown",
        dismissed: true,
        page_type: "marketing_home",
      });
    }
    onClose();
  };

  const handleSelect = (status) => {
    setDlStatus(status);
    trackFunnelEvent("dl_status_selected", {
      dl_status: status,
      dismissed: false,
      page_type: "marketing_home",
    });
  };

  const handleContinue = () => {
    onContinue(dlStatus, locationData);
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
          onClick: handleClose,
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
          <IconButton
            onClick={handleClose}
            sx={{ backgroundColor: "rgba(0,0,0,0.1)", "&:hover": { backgroundColor: "rgba(0,0,0,0.2)" } }}
            aria-label="Close"
          >
            <X sx={{ width: 24, height: 24, color: "#37474F" }} />
          </IconButton>
        </Box>

        <Box sx={{ p: { xs: 3, sm: 4 }, textAlign: "center" }}>
          <Typography
            variant="h5"
            sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, color: "#3C4856", mb: 1 }}
          >
            Do you already hold a 4-wheeler driving licence?
          </Typography>
          <Typography variant="body1" sx={{ color: "#6B7280", mb: 3 }}>
            This helps us show you the right courses.
          </Typography>

          <RadioGroup
            value={dlStatus}
            onChange={(e) => handleSelect(e.target.value)}
            sx={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left", mb: 3 }}
          >
            <FormControlLabel
              value="has_dl"
              control={<Radio sx={{ color: "#00CE84" }} />}
              label={
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 600, color: "#3C4856" }}>
                    Yes, I have a 4W licence
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#6B7280" }}>
                    I'll see courses where I can book slots immediately
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="no_dl"
              control={<Radio sx={{ color: "#00CE84" }} />}
              label={
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 600, color: "#3C4856" }}>
                    No, I don't have a 4W licence yet
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#6B7280" }}>
                    I'll see beginner courses (trainer assigned after payment)
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Button
              onClick={handleContinue}
              disabled={dlStatus === "unknown"}
              variant="contained"
              size="large"
              fullWidth
              sx={{
                borderRadius: "50px",
                background: dlStatus === "unknown"
                  ? "rgba(0,206,132,0.4)"
                  : "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                color: "white",
                fontWeight: 700,
                fontFamily: "Bricolage Grotesque",
                textTransform: "none",
                py: 2,
                "&:hover": {
                  background: dlStatus === "unknown"
                    ? "rgba(0,206,132,0.4)"
                    : "linear-gradient(90deg, #00BC78 0%, #00CE84 100%)",
                },
                "&:disabled": { cursor: "not-allowed" },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
                Continue
                <ArrowRight sx={{ width: 20, height: 20 }} />
              </Box>
            </Button>
            <Button
              onClick={handleClose}
              variant="text"
              fullWidth
              sx={{
                fontFamily: "Bricolage Grotesque",
                fontWeight: 600,
                color: "#6B7280",
                "&:hover": { backgroundColor: "rgba(0,0,0,0.04)" },
              }}
            >
              Skip for now
            </Button>
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default DLQualificationModal;