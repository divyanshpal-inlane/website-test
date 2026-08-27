import React from "react";
import { Container, Typography, Box } from "@mui/material";
import { useLocation } from "react-router-dom";
import SEOHead from "../components/SEOHead";

const PageTemplate = ({ title, description, children }) => {
  const { pathname } = useLocation();

  return (
    <>
      <SEOHead
        title={`${title} | Lane Driving School`}
        description={description || `${title} - Lane Driving School's legal information and policies.`}
        ogImage="/LANE_LOGO.svg"
        canonical={pathname}
      />
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            mt: 4,
            mb: 4,
          }}
        >
          <Typography
            variant="h2"
            component="h1"
            gutterBottom
            fontFamily="Bricolage Grotesque"
            sx={{ fontWeight: "bold", textAlign: "center" }}
          >
            {title}
          </Typography>
          <Box sx={{ maxWidth: "800px", width: "100%", textAlign: "justify" }}>
            {children}
          </Box>
        </Box>
      </Container>
    </>
  );
};

export default PageTemplate;
