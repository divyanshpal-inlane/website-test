import "./App.css";
import { useEffect } from "react";
import Homepage from "./pages/Homepage";
import { captureUTMsOnLoad } from "./utils/utmTracking";
import {
  createBrowserRouter,
  Outlet,
  Router,
  RouterProvider,
} from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Navbar from "./components/Navbar";
import Navbar2 from "./components/Navbar2";
import Footer from "./components/Footer";
import CoursesPage from "./pages/Courses";
// import ContactUs from "./pages/ContactUs";
import AboutUs from "./components/AboutUs/AboutUs";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsAndConditions from "./pages/TermsAndConditions";
import Disclaimer from "./pages/Disclaimer";
import PaymentPolicy from "./pages/PaymentPolicy";
import ReschedulePolicy from "./pages/ReschedulePolicy";
import Blog from "./blog/Blog";
import BlogPage from "./blog/BlogPage";
import NewCoursePage from "./components/Courses/NewCoursePage";
import { HelmetProvider } from "react-helmet-async";
import SignupPopup from "./components/SignupPopup";
import BuyerFAQs from "./components/FAQ/BuyerFAQs";

import FAQPage from "./components/FAQ/FAQPage"; // Fixed casing to match actual file

// import FAQPage from "./components/FAQ/FAQpage";
// >>>>>>> 4b53845195cbc11865d309db0c13d02b675bf843
import ThankYou from "./pages/ThankYouPage";
import LocationPage from "./pages/LocationPage";
import Page from "./pages/SignupForm";
import Sell from "./pages/Sell";
import Reviews from "./pages/Reviews";
import Admin from "./pages/Admin";
import Buyer from "./pages/Buyer";
import RTO from "./pages/RTO";
import RTOServiceDetailPage from "./pages/RTOServiceDetailPage";
import RefundPolicy from "./pages/RefundPolicy";
import { BookingProvider } from "./context/BookingContext";
import BookingFlowPage from "./pages/booking/BookingFlowPage";
import SchedulePage from "./pages/booking/SchedulePage";
import ReviewPaymentPage from "./pages/booking/ReviewPaymentPage";
import BookingSuccess from "./pages/booking/BookingSuccess";
import BookingErrorPage from "./pages/booking/BookingErrorPage";
import ScrollToTop from "./components/ScrollToTop";

const Layout = () => {
  return (
    <div className="bg-logoYellow">
      <Navbar />
      <Outlet />
      <Footer />
    </div>
  );
};

const Layout2 = () => {
  return (
    <div className="bg-logoWhite">
      <Navbar
        backgroundColor="#FFFFFF"
        logo="./LANE_LOGO.svg"
        burgerMenu="/PurpleHamburger.png"
      />
      <ScrollToTop />
      <Outlet />
      <Footer />
    </div>
  );
};

const Layout3 = () => {
  return (
    <div className="">
      <Navbar
        backgroundColor="#FFFFFF"
        logo="/LANE_LOGO.svg"
        burgerMenu="/PurpleHamburger.png"
      />
      <BlogPage />
      <Footer />
    </div>
  );
};

const router = createBrowserRouter(
  [
    {
      path: "/about-us",
      element: <AboutUs />,
    },
    {
      path: "/book",
      element: <Layout2 />,
      children: [
        {
          path: "/book",
          element: <BookingFlowPage />,
        },
        {
          path: "/book/schedule",
          element: <SchedulePage />,
        },
        {
          path: "/book/review",
          element: <ReviewPaymentPage />,
        },
        {
          path: "/book/success",
          element: <BookingSuccess />,
        },
        {
          path: "/book/slot-conflict",
          element: <BookingErrorPage />,
        },
      ],
    },
    {
      path: "/courses",
      element: <NewCoursePage />,
    },
    {
      path: "/faqs", // Standalone route with integrated header/footer
      element: <FAQPage />,
    },
    {
      path: "/buyer/faqs",
      element: <BuyerFAQs />,
    },
    {
      path: "/thank-you",
      element: <ThankYou />,
    },
    {
      path: "/driving-school-in/:location",
      element: <LocationPage />,
    },
    {
      path: "/blog",
      element: <Layout2 />,
      children: [
        {
          path: "/blog",
          element: <Blog />,
        },
      ],
    },
    {
      path: "/reviews",
      element: <Layout2 />,
      children: [
        {
          path: "/reviews",
          element: <Reviews />,
        },
      ],
    },
    {
      path: "/blog/:slug",
      element: <Layout3 />,
    },
    {
      path: "/",
      element: <Layout />,
      children: [
        {
          path: "/",
          element: <Homepage />,
        },

        {
          path: "/terms-and-conditions",
          element: <TermsAndConditions />,
        },
        {
          path: "/privacy-policy",
          element: <PrivacyPolicy />,
        },
        {
          path: "/disclaimer",
          element: <Disclaimer />,
        },
        {
          path: "/payment-policy",
          element: <PaymentPolicy />,
        },
        {
          path: "/rescheduling-policy",
          element: <ReschedulePolicy />,
        },
        {
          path: "/refund-policy",
          element: <RefundPolicy />,
        },
      ],
    },
    {
      path: "/login",
      element: <Login />,
    },
    {
      path: "/signup",
      element: <Signup />,
    },
    {
      path: "/signup-form",
      element: <Page />,
    },
    {
      path: "/sell-used-car",
      element: <Sell />,
    },
    {
      path: "/admin",
      element: <Admin />,
    },
    {
      path: "/buyer",
      element: <Buyer />,
    },
    {
      // Alias of the catalogue so the detail page's "All services" back-links resolve.
      path: "/rto-services",
      element: <RTO />,
    },
    {
      path: "/rto-services/:serviceSlug",
      element: <RTOServiceDetailPage />,
    },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
    // Instant scroll to top on every navigation (fixes "lands at bottom of next page")
    scrollRestoration: () => ({ position: 0, behavior: "instant" }),
  },
);

function App() {
  // Capture attribution on every entry route, not just the landing page —
  // ads can land on /rto, course pages, etc.
  useEffect(() => {
    captureUTMsOnLoad();
  }, []);

  return (
    <HelmetProvider>
      <SignupPopup />
      <BookingProvider>
        <RouterProvider router={router} />
      </BookingProvider>
    </HelmetProvider>
  );
}

export default App;
