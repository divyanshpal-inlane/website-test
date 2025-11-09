import React from "react";
import LandingPage from "./LandingPage";
import { seoData } from "../utils/seoData";
import { useSEO } from "../hooks/useSEO";

const Homepage = () => {
  const seo = { ...seoData['/'], canonical: '/' };
  useSEO(seo);
  
  return <LandingPage />;
};

export default Homepage;
