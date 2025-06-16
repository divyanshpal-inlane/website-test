import React from "react";
import PageTemplate from "./PageTemplate";
import { Typography, Box } from "@mui/material";

<link rel="canonical" href="https://inlane.in/about-us" />


const AboutUs = () => {
  return (
    <PageTemplate title="About Us">
      <Typography
        variant="body1"
        paragraph
        fontFamily="Bricolage Grotesque"
        fontSize={30}
      >
        Welcome to our company! We are dedicated to providing the best service
        possible. Our mission is to deliver high-quality products that meet the
        needs of our customers.
      </Typography>
      <Typography
        variant="body1"
        paragraph
        fontFamily="Bricolage Grotesque"
        fontSize={30}
      >
        Our team is composed of talented professionals who are passionate about
        what they do. We believe in innovation, integrity, and excellence.
      </Typography>
    </PageTemplate>
  );
};

export default AboutUs;
