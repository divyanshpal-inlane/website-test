import "./App.css";
import Homepage from "./pages/Homepage";
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
import { HelmetProvider } from 'react-helmet-async';
// import FAQPage from "./components/FAQ/FAQpage";
import ThankYou from "./pages/ThankYouPage";
import LocationPage from "./pages/LocationPage";
import Page from "./pages/SignupForm";

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
      <Navbar backgroundColor='#FFFFFF' logo='./LANE_LOGO.svg' burgerMenu='/PurpleHamburger.png' />
      <Outlet />
      <Footer />
    </div>
  );
};

const Layout3 = () => {
  return (
    <div className="">
      <Navbar backgroundColor='#FFFFFF' logo='/LANE_LOGO.svg' burgerMenu='/PurpleHamburger.png' />
      <BlogPage />
      <Footer />
    </div>
  );
};

const router = createBrowserRouter([
  {
    path: "/about-us",
    element: <AboutUs />,
  },
  {
    path: "/courses",
    element: <NewCoursePage />,
  },
  // {
  //   path: "/faqs", // Standalone route with integrated header/footer
  //   element: <FAQPage />,
  // },
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
     
      // {
      //   path: "/courses",
      //   element: <CoursesPage />,
      // },
     
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
  }
]);

function App() {
  return (
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>
  );
}

export default App;
