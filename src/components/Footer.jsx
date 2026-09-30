import React, { useEffect, useState } from "react";
import { Box, Typography, Link, useMediaQuery, useTheme } from "@mui/material";
import {
  Instagram as InstagramIcon,
  X as XIcon,
  LinkedIn as LinkedInIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  WhatsApp as WhatsAppIcon,
  LocationOn as LocationIcon,
} from "@mui/icons-material";

const Footer = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 },
    );

    const footerElement = document.getElementById("animated-footer");
    if (footerElement) {
      observer.observe(footerElement);
    }

    return () => {
      if (footerElement) {
        observer.unobserve(footerElement);
      }
    };
  }, []);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const socialIcons = [
    { Icon: InstagramIcon, href: "https://www.instagram.com/inlane.in/" },
    { Icon: XIcon, href: "https://x.com/inlane_in/" },
    { Icon: LinkedInIcon, href: "https://www.linkedin.com/company/in-lane/" },
  ];

  const contactInfo = [
    { Icon: PhoneIcon, text: "+91 63662 12914", href: "tel:+916366212914" },
    {
      Icon: WhatsAppIcon,
      text: "WhatsApp",
      href: "https://wa.me/916366212914",
    },
    { Icon: EmailIcon, text: "team@inlane.in", href: "mailto:team@inlane.in" },
  ];

  const contactSections = [
    {
      title: "Customer Support",
      items: [
        { Icon: PhoneIcon, text: "+91 80402 66972", href: "tel:08040266972" },
        {
          Icon: EmailIcon,
          text: "support@inlane.in",
          href: "mailto:support@inlane.in",
        },
      ],
    },
  ];

  const locationInfo = {
    Icon: LocationIcon,
    text: "3rd floor, Akruti Chambers, Stage 2, Hoysala Nagar, Indiranagar, Bengaluru, Karnataka 560038",
    href: "https://maps.google.com/?q=3rd+floor,+Akruti+Chambers,+Stage+2,+Hoysala+Nagar,+Indiranagar,+Bengaluru,+Karnataka+560038",
  };

  const companyLinks = [
    { text: "About us", href: "/about-us" },
    { text: "Sell Your Car", href: "/sell-used-car" },
    { text: "Courses", href: "/courses" },
    { text: "Reviews & Ratings", href: "/reviews" },
    { text: "FAQs", href: "/faqs" },
    { text: "Lane Journal", href: "/blog" },
    { text: "Privacy Policy", href: "/privacy-policy" },
    { text: "Terms & Conditions", href: "/terms-and-conditions" },
    { text: "Disclaimer", href: "/disclaimer" },
    { text: "Payment Policy", href: "/payment-policy" },
  ];

  const drivingSchoolLinks = [
    { text: "HSR Layout", href: "/driving-school-in/hsr-layout" },
    { text: "KR Puram Near Me", href: "/driving-school-in/kr-puram" },
    { text: "Mahadevapura Near Me", href: "/driving-school-in/mahadevapura" },
    { text: "Whitefield Near Me", href: "/driving-school-in/whitefield" },
    { text: "Marathahalli Near Me", href: "/driving-school-in/marathahalli" },
    { text: "Kudlu Gate Near Me", href: "/driving-school-in/kudlu-gate" },
    { text: "Kudlu Near Me", href: "/driving-school-in/kudlu" },
    { text: "Begur Near Me", href: "/driving-school-in/begur" },
    { text: "Indiranagar Near Me", href: "/driving-school-in/indiranagar" },
    {
      text: "Benniganahalli Near Me",
      href: "/driving-school-in/benniganahalli",
    },
    { text: "Banaswadi Near Me", href: "/driving-school-in/banaswadi" },
    {
      text: "Swami Vivekananda Road Near Me",
      href: "/driving-school-in/swami-vivekananda-road",
    },
    { text: "TC Palya Near Me", href: "/driving-school-in/tc-palya" },
    {
      text: "Ramamurthy Nagar Near Me",
      href: "/driving-school-in/ramamurthy-nagar",
    },
    { text: "Kasturi Nagar Near Me", href: "/driving-school-in/kasturi-nagar" },
    { text: "Hoodi Near Me", href: "/driving-school-in/hoodi" },
    { text: "ITPL Near Me", href: "/driving-school-in/itpl" },
    // { text: "Hebbal Near Me", href: "/driving-school-in/hebbal" },
    // { text: "Yelahanka Near Me", href: "/driving-school-in/yelahanka" },
    // { text: "MG Road Near Me", href: "/driving-school-in/mg-road" },
    // { text: "BTM Layout Near Me", href: "/driving-school-in/btm-layout" },
    // { text: "Rajajinagar Near Me", href: "/driving-school-in/rajajinagar" },
  ];

  const latestPostsLinks = [
    {
      text: "Driving License Address Change",
      href: "/blog/how-to-change-address-in-your-driving-license-online-in-india",
    },
    {
      text: "Upload DL & RC in DigiLocker",
      href: "/blog/how-to-upload-a-driving-license-and-rc-in-the-digilocker-and-mparivahan-apps",
    },
    {
      text: "Name Change on Driving License",
      href: "/blog/how-to-change-your-name-on-an-indian-driving-license-complete-guide-2024",
    },
    {
      text: "Check Your Driving License Status",
      href: "/blog/check-driving-license-status-online-via-parivahan-driving-schools-guide",
    },
    {
      text: "Apply for a Learners License Online in Bangalore",
      href: "/blog/how-to-apply-for-a-learners-licence-online-in-bangalore-step-by-step-process-2025-update",
    },
    {
      text: "Required Documents for every stage of Driving License Application in Bangalore",
      href: "/blog/documents-required-for-every-stage-of-driving-license-application-in-bangalore-2024-guide",
    },
    {
      text: "Bangalore DL Test Slot Booking",
      href: "/blog/how-to-book-a-driving-test-slot-in-bangalore-step-by-step-guide",
    },
    {
      text: "Driving Test Bangalore",
      href: "/blog/driving-test-in-bangalore-complete-guide-2026",
    },
    {
      text: "What to Do When You Misplace Your DL",
      href: "/blog/how-to-find-vehicle-engine-number-chassis-number-online",
    },
    {
      text: "Beginner Driving Mistakes & Tips",
      href: "/blog/10-common-driving-mistakes-beginners-make-and-how-to-avoid-them-driving-lessons-tips",
    },
    {
      text: "Manual vs Automatic: Find Your Fit",
      href: "/blog/manual-vs-automatic-driving-lessons-which-one-suits-you-best",
    },
  ];

  const styles = {
    footerContainer: {
      bgcolor: "background.paper",
      paddingTop: { xs: 3, sm: 4, md: 6 },
      backgroundImage: `url("/NavbarRoad.svg")`,
      backgroundRepeat: "no-repeat",
      backgroundSize: "100% auto",
      backgroundPosition: "top center",
      minHeight: isMobile ? "100%" : "470px",
      paddingBottom: { xs: 1.5, sm: 2, md: 2 },
    },
    footerSecondContainer: {
      display: "flex",
      flexDirection: { xs: "column", md: "row" },
      justifyContent: "space-between",
      alignItems: "flex-start",
      px: { xs: 2, sm: 4, md: 6 },
      gap: { xs: 0, md: 3 },
    },
    footerHeadingImage: {
      display: "inline-block",
      borderBottom: "3px solid #00CE84",
      mb: 2,
      pb: 0.5,
    },
    footerHeading: {
      fontWeight: "bold",
      fontSize: { xs: "18px", sm: "20px", md: "20px" },
      color: "#000000",
      fontFamily: "Bricolage Grotesque",
    },
    footerLinks: {
      textDecoration: "none",
      color: "#000000",
      fontWeight: "500",
      fontSize: { xs: "14px", sm: "15px", md: "15px" },
      fontFamily: "Bricolage Grotesque",
      mb: 0.5,
      display: "block",
      lineHeight: { xs: "26px", sm: "26px", md: "26px" },
      "&:hover": { color: "#00CE84" },
    },
    footerIcons: {
      backgroundColor: "black",
      color: "white",
      borderRadius: "50%",
      mt: "20px",
      mb: "10px",
      padding: "5px",
      fontSize: { xs: "36px", sm: "42px", md: "38px" },
      transition: "transform 0.3s ease-in-out",
      "&:hover": { transform: "scale(1.1)" },
    },
    footerContact: {
      display: "flex",
      alignItems: "flex-start",
      mb: 1,
      fontSize: { xs: "14px", sm: "15px", md: "15px" },
      fontFamily: "Bricolage Grotesque",
      lineHeight: { xs: "26px", sm: "26px", md: "26px" },
    },
    footerContactSubHeading: {
      fontWeight: 600,
      fontSize: { xs: "14px", sm: "15px", md: "15px" },
      color: "#000000",
      fontFamily: "Bricolage Grotesque",
      mt: 1.5,
      mb: 0.5,
    },
    carAnimation: {
      position: "absolute",
      animation: isVisible ? "carMove 4s linear infinite" : "none",
      transform: "scaleX(-1)",
    },
  };

  const keyframes = `
    @keyframes carMove {
      0% { transform: translateX(0); }
      100% { transform: translateX(${isMobile ? "calc(-100vw - 100px)" : "calc(-110vw - 100px)"}); }
    }
  `;

  // Reusable contact item renderer
  const ContactItem = ({ Icon, text, href }) => (
    <Typography variant="body2" sx={styles.footerContact}>
      <Icon sx={{ mr: 1, color: "#00CE84", mt: "4px", flexShrink: 0 }} />
      <Link
        sx={{ textDecoration: "none", color: "#000000" }}
        href={href}
        target={text === "WhatsApp" ? "_blank" : "_self"}
        rel={text === "WhatsApp" ? "noopener noreferrer" : ""}
      >
        {text}
      </Link>
    </Typography>
  );

  // Reusable Contact Us content (shared by mobile & desktop layouts)
  const ContactContent = () => (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {contactInfo.map((item, i) => (
        <ContactItem key={i} {...item} />
      ))}

      {contactSections.map(({ title, items }, i) => (
        <Box key={i}>
          <Typography variant="subtitle2" sx={styles.footerContactSubHeading}>
            {title}
          </Typography>
          {items.map((item, j) => (
            <ContactItem key={j} {...item} />
          ))}
        </Box>
      ))}

      <Box sx={{ mt: 1.5 }}>
        <ContactItem {...locationInfo} />
      </Box>
    </Box>
  );

  // Reusable link column renderer
  const LinkColumn = ({ title, links, flex = 1 }) => (
    <Box flex={flex} mb={4} mt={6}>
      <Box sx={styles.footerHeadingImage}>
        <Typography variant="h4" sx={styles.footerHeading}>
          {title}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {links.map(({ text, href }, i) => (
          <Link key={i} href={href} sx={styles.footerLinks}>
            {text}
          </Link>
        ))}
      </Box>
    </Box>
  );

  return (
    <>
      <style>{keyframes}</style>
      <Box
        id="animated-footer"
        sx={{ ...styles.footerContainer, position: "relative" }}
      >
        {isVisible && (
          <img
            src="/svg/car.png"
            alt="Moving car"
            className="w-[30px] h-[30px] md:w-[60px] md:h-[60px] top-[-25px] right-[-100px] md:top-[-50px] md:right-[-100px]"
            style={{ ...styles.carAnimation, animationDelay: "0s" }}
          />
        )}

        {isMobile ? (
          /* ── MOBILE LAYOUT ── */
          <Box sx={{ px: 2, pt: 2 }}>
            {/* Logo + Social */}
            <Box mb={3}>
              <Box sx={{ maxWidth: "187px" }}>
                <img
                  src="/Lane_Footer_Logo.svg"
                  alt="Logo"
                  style={{ width: "100%", height: "auto" }}
                />
              </Box>
              <Box mt={2} display="flex" flexDirection="row">
                {socialIcons.map(({ Icon, href }, i) => (
                  <Link
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ mr: 1 }}
                  >
                    <Icon sx={styles.footerIcons} />
                  </Link>
                ))}
              </Box>
              <Typography
                variant="h5"
                fontWeight={600}
                fontSize="18px"
                color="#000000"
                fontFamily="Bricolage Grotesque"
                sx={{ mt: 2 }}
              >
                We do cool things here!
              </Typography>
            </Box>

            {/* Company */}
            <Box mb={3}>
              <Box sx={styles.footerHeadingImage}>
                <Typography variant="h4" sx={styles.footerHeading}>
                  Company
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                {companyLinks.map(({ text, href }, i) => (
                  <Link key={i} href={href} sx={styles.footerLinks}>
                    {text}
                  </Link>
                ))}
              </Box>
            </Box>

            {/* Driving School In */}
            <Box mb={3}>
              <Box sx={styles.footerHeadingImage}>
                <Typography variant="h4" sx={styles.footerHeading}>
                  Driving School in
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                {drivingSchoolLinks.map(({ text, href }, i) => (
                  <Link key={i} href={href} sx={styles.footerLinks}>
                    {text}
                  </Link>
                ))}
              </Box>
            </Box>

            {/* Latest Posts */}
            <Box mb={3}>
              <Box sx={styles.footerHeadingImage}>
                <Typography variant="h4" sx={styles.footerHeading}>
                  Latest Posts
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                {latestPostsLinks.map(({ text, href }, i) => (
                  <Link key={i} href={href} sx={styles.footerLinks}>
                    {text}
                  </Link>
                ))}
              </Box>
            </Box>

            {/* Contact Us */}
            <Box mb={3}>
              <Box sx={styles.footerHeadingImage}>
                <Typography variant="h4" sx={styles.footerHeading}>
                  Contact Us
                </Typography>
              </Box>
              <ContactContent />
            </Box>
          </Box>
        ) : (
          /* ── DESKTOP LAYOUT ── */
          <Box sx={styles.footerSecondContainer}>
            {/* Logo + Social */}
            <Box flex={1.5} mb={4} mt={6}>
              <Box>
                <img
                  src="/Lane_Footer_Logo.svg"
                  style={{ maxWidth: "173px", height: "auto" }}
                  alt="Logo"
                />
              </Box>
              <Box mt={2} display="flex" flexDirection="row">
                {socialIcons.map(({ Icon, href }, i) => (
                  <Link
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ mr: 1 }}
                  >
                    <Icon sx={styles.footerIcons} />
                  </Link>
                ))}
              </Box>
              <Typography
                variant="h5"
                fontWeight={600}
                fontSize={{ xs: "20px", sm: "24px", md: "22px" }}
                color="#000000"
                fontFamily="Bricolage Grotesque"
                sx={{ mt: 2 }}
              >
                We do cool things here!
              </Typography>
            </Box>

            {/* Company */}
            <LinkColumn title="Company" links={companyLinks} flex={1} />

            {/* Driving School In */}
            <LinkColumn
              title="Driving School in"
              links={drivingSchoolLinks}
              flex={1.3}
            />

            {/* Latest Posts */}
            <LinkColumn
              title="Latest Posts"
              links={latestPostsLinks}
              flex={1.5}
            />

            {/* Contact Us */}
            <Box flex={1.2} mt={6} mb={4}>
              <Box sx={styles.footerHeadingImage}>
                <Typography variant="h4" sx={styles.footerHeading}>
                  Contact Us
                </Typography>
              </Box>
              <ContactContent />
            </Box>
          </Box>
        )}
        {/* Company Legal Information */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            mt: 2,
            pt: 2,
            borderTop: "1px solid rgba(0, 0, 0, 0.1)",
            mx: { xs: 2, sm: 4, md: 12 },
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontFamily: "Bricolage Grotesque",
              fontSize: { xs: "12px", sm: "14px", md: "14px" },
              color: "#000000",
              textAlign: "center",
              mb: 0.5,
            }}
          >
            Inlane Technologies Private Limited
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontFamily: "Bricolage Grotesque",
              fontSize: { xs: "11px", sm: "12px", md: "12px" },
              color: "#666666",
              textAlign: "center",
            }}
          >
            CIN: U62099WB2024PTC269670
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontFamily: "Bricolage Grotesque",
              fontSize: { xs: "11px", sm: "12px", md: "12px" },
              color: "#666666",
              textAlign: "center",
              mt: 1,
              maxWidth: "900px",
              lineHeight: 1.6,
            }}
          >
            INLANE MOTOR DRIVING SCHOOL is authorized to impart motor vehicle
            driving instruction under License No. KA032026DSL00004.
          </Typography>
        </Box>
      </Box>
    </>
  );
};

export default Footer;
