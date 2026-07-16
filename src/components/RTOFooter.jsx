import React from "react";
import {
  FaInstagram,
  FaXTwitter,
  FaLinkedinIn,
  FaWhatsapp,
  FaPhone,
  FaEnvelope,
} from "react-icons/fa6";

/**
 * RTOFooter
 * ---------------------------------------------------------------------------
 * Footer for the RTO pages (Figma node 1920:18752).
 *
 * Layers, bottom → top:
 *   1. Decorative graphic (/rto-footer.svg): the green band with the faint LANE
 *      watermark, the dashed road strip, and the winding road that curves down
 *      through the footer. Pure decoration — no text is baked in.
 *   2. A little red car (/svg/car.png, flipped to face left) that drives right →
 *      left along the road strip, looping.
 *   3. The footer content: LANE logo + socials, and the Information / Quick
 *      Links / Contact Us columns (shared with the Buyer footer).
 * ---------------------------------------------------------------------------
 */

const socialLinks = [
  {
    Icon: FaInstagram,
    href: "https://www.instagram.com/inlane.in/",
    label: "Instagram",
  },
  { Icon: FaXTwitter, href: "https://x.com/inlane_in/", label: "X" },
  {
    Icon: FaLinkedinIn,
    href: "https://www.linkedin.com/company/in-lane/",
    label: "LinkedIn",
  },
];

const footerColumns = [
  {
    title: "Information",
    links: [
      { text: "About Us", href: "/about-us" },
      { text: "Courses", href: "/courses" },
      { text: "FAQs", href: "/faqs" },
      { text: "Lane Journal", href: "/blog" },
    ],
  },
  {
    title: "Quick Links",
    links: [
      { text: "Support", href: "/support" },
      { text: "Privacy Policy", href: "/privacy-policy" },
      { text: "Terms & Conditions", href: "/terms-and-conditions" },
    ],
  },
];

const contactLinks = [
  { Icon: FaPhone, text: "+91 9748439881", href: "tel:+919748439881" },
  { Icon: FaEnvelope, text: "info@inlane.in", href: "mailto:info@inlane.in" },
  {
    Icon: FaWhatsapp,
    text: "WhatsApp",
    href: "https://wa.me/919748439881",
    external: true,
  },
];

/** Column heading with the Tag5.svg lime brush behind it (per Figma). */
function FooterHeading({ children }) {
  return (
    <h3 className="relative mb-4 inline-block md:mb-5">
      <span
        aria-hidden="true"
        className="absolute inset-x-[-12px] bottom-[-4px] top-[-4px] -z-0"
        style={{
          backgroundImage: "url('/Tag5.svg')",
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      />
      <span className="relative z-10 font-['Bricolage_Grotesque'] font-bold tracking-[-0.01em] text-[#111111] text-[clamp(18px,1.7vw,22px)]">
        {children}
      </span>
    </h3>
  );
}

export default function RTOFooter() {
  return (
    <footer className="relative w-full overflow-hidden bg-white pt-[46px] md:pt-[62px]">
      {/* Car drives right → left along the road strip. */}
      <style>{`
        @keyframes rtoFooterCar {
          0%   { transform: translateX(0) scaleX(1); }
          100% { transform: translateX(calc(-100vw - 160px)) scaleX(1); }
        }
      `}</style>

      {/* ---------- Full-width dashed road strip (on white) + car ---------- */}
      <div className="relative z-10 h-[14px] w-full bg-[#141414] md:h-[16px]">
        <div
          className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right,#fff 0 20px,transparent 20px 38px)",
          }}
        />
        {/* Two red cars driving right → left, staggered half a cycle apart */}
        <img
          src="/svg/car.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-[2px] right-[-140px] z-20 w-[34px] md:bottom-[3px] md:w-[54px]"
          style={{ animation: "rtoFooterCar 9s linear infinite" }}
        />
        <img
          src="/svg/car.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-[2px] right-[-140px] z-20 w-[34px] md:bottom-[3px] md:w-[54px]"
          style={{
            animation: "rtoFooterCar 9s linear infinite",
            animationDelay: "-4.5s",
          }}
        />
      </div>

      {/* ---------- Winding road: curves down from the strip and runs along the bottom (desktop) ---------- */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[62px] z-0 hidden select-none lg:block"
        style={{
          backgroundImage: "url('/footer-road.svg')",
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* ---------- Content ---------- */}
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-5 pb-10 pt-10 md:pb-12 md:pt-12 lg:min-h-[320px]">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-x-10 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-x-6">
          {/* Logo + socials */}
          <div className="flex flex-col items-center text-center md:items-start md:text-left sm:col-span-2 lg:col-span-1">
            <img
              src="/Lane_Footer_Logo.svg"
              alt="LANE — By Your Side, Every Ride"
              className="h-auto w-[clamp(120px,15.6vw,200px)] p-3"
            />
            <div className="mt-5 flex items-center justify-center gap-3 md:mt-6 md:justify-start">
              {socialLinks.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-black text-white transition-transform duration-300 hover:scale-110 sm:h-[40px] sm:w-[40px]"
                >
                  <Icon className="text-[16px] sm:text-[18px]" />
                </a>
              ))}
            </div>
            <p className="mt-5 font-['Bricolage_Grotesque'] font-semibold text-black text-[clamp(18px,1.72vw,22px)] md:mt-6">
              We do cool things here!
            </p>
          </div>

          {/* Information / Quick Links */}
          {footerColumns.map((col) => (
            <div
              key={col.title}
              className="flex flex-col items-center text-center md:items-start md:text-left"
            >
              <FooterHeading>{col.title}</FooterHeading>
              <ul className="flex flex-col gap-3 md:gap-3.5">
                {col.links.map((link) => (
                  <li key={link.text}>
                    <a
                      href={link.href}
                      className="font-['Bricolage_Grotesque'] font-medium text-black transition-colors duration-200 hover:text-[#00CE84] text-[clamp(15px,1.25vw,16px)]"
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact Us */}
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <FooterHeading>Contact Us</FooterHeading>
            <ul className="flex flex-col gap-3 md:gap-3.5">
              {contactLinks.map(({ Icon, text, href, external }) => (
                <li key={text}>
                  <a
                    href={href}
                    target={external ? "_blank" : "_self"}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="flex items-center justify-center gap-2.5 font-['Bricolage_Grotesque'] font-medium text-black transition-colors duration-200 hover:text-[#00CE84] text-[clamp(15px,1.25vw,16px)] md:justify-start"
                  >
                    <Icon className="shrink-0 text-[16px] text-[#00CE84] xl:text-[18px]" />
                    {text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
