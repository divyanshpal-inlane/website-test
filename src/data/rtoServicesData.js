// rtoServicesData.js
// ---------------------------------------------------------------------------
// Card-level metadata for every RTO service. This is the "list" layer used by
// RTOServicesSection.jsx to render the filterable grid (tabs + search).
// Full step-by-step detail lives in rtoServiceContent.js, keyed by the same
// `slug` used here — same split as locations.js / locationContent.js.
// ---------------------------------------------------------------------------

export const SERVICE_CATEGORIES = [
  "Driving Licence",
  "Car Services",
  "Bike Services",
];

export const rtoServices = [
  // ───────────────────────── DRIVING LICENCE ─────────────────────────
  {
    slug: "dl-renewal",
    category: "Driving Licence",
    icon: "🪪",
    title: "DL Renewal in bangalore",
    subtitle: "Renew your driving licence before or after expiry",
    tags: ["DL", "Form 1A", "Address Proof"],
    features: [
      "Check & prepare documents",
      "Govt application process",
      "Medical (if needed, age 40+)",
    ],
    price: "₹2,699",
    timeline: "18–30 business days",
    note: "Govt fees included",
    metaTitle: "Online Driving Licence Renewal in Bangalore | Fast RTO Service",
    metaDescription:
      "Renew your driving licence online in Bangalore with Lane. End-to-end RTO assistance, document support, transparent pricing and hassle-free processing.",
  },
  {
    slug: "dl-address-change-ka",
    category: "Driving Licence",
    icon: "📍",
    title: "DL Address Change (KA → KA) in bangalore",
    subtitle: "Update the address on your DL within Karnataka",
    tags: ["DL", "Address Proof"],
    features: [
      "Documents verified",
      "Govt application process",
      "New RTO zone processes the update",
    ],
    price: "₹2,699",
    timeline: "18–30 business days",
    note: "Govt fees included",
    metaTitle: "Driving Licence Address Change in Bangalore | Online RTO Help",
    metaDescription:
      "Update your driving licence address online in Bangalore. Lane manages documents, application filing and RTO processing with expert support.",
  },
  {
    slug: "dl-name-change",
    category: "Driving Licence",
    icon: "✏️",
    title: "DL Name Change in bangalore",
    subtitle: "Update your name on your driving licence",
    tags: ["DL", "Affidavit", "Aadhaar"],
    features: [
      "Name proof & affidavit verified",
      "Application filed at RTO",
      "RTO processes endorsement",
    ],
    price: "₹3,999",
    timeline: "30–40 days",
    note: "Govt fees included",
    metaTitle: "Driving Licence Name Change Online in Bangalore | Lane",
    metaDescription:
      "Change your name on your driving licence in Bangalore with complete document verification and end-to-end RTO assistance from Lane.",
  },
  {
    slug: "dl-address-change-other-state",
    category: "Driving Licence",
    icon: "🚚",
    title: "DL Address Change (Other State → KA) in bangalore",
    subtitle: "Bring your out-of-state DL address to Bengaluru",
    tags: ["Inter-state DL", "Address Proof"],
    features: [
      "Inter-state DL verified",
      "New Bengaluru address filed",
      "Approvals obtained at KA RTO",
    ],
    price: "₹3,799",
    timeline: "18–30 business days",
    note: "TAT may vary",
    noteStar: true,
    metaTitle: "Transfer Driving Licence to Karnataka Online | Bangalore RTO",
    metaDescription:
      "Moving to Bangalore? Transfer your driving licence from another state to Karnataka with expert RTO support and easy online processing.",
  },
  {
    slug: "duplicate-dl",
    category: "Driving Licence",
    icon: "📋",
    title: "Duplicate DL in bangalore",
    subtitle: "Replace a lost, stolen, or damaged DL",
    tags: ["DL", "FIR/NCR copy", "Aadhaar"],
    features: [
      "FIR/NCR filed online — Lane can do this for you",
      "Affidavit drafted and notarised",
      "Duplicate DL dispatched by post",
    ],
    price: "₹2,699",
    timeline: "18–30 business days",
    note: "TAT may vary",
    noteStar: true,
    metaTitle: "Duplicate Driving Licence Online in Bangalore | Lost DL Help",
    metaDescription:
      "Lost your driving licence? Apply for a duplicate driving licence online in Bangalore with complete documentation and RTO assistance.",
  },
  {
    slug: "dl-backlog-digitisation",
    category: "Driving Licence",
    icon: "⚖️",
    title: "DL Backlog / Digitisation in bangalore",
    subtitle: "Get an old paper DL digitised into the system",
    tags: ["Paper DL", "Aadhaar"],
    features: [
      "Check DL status & eligibility",
      "Retrieve or digitise DL record",
      "Update details on govt portal",
    ],
    price: "₹2,699",
    timeline: "18–30 business days",
    note: "TAT may vary",
    noteStar: true,
    metaTitle: "Driving Licence Digitisation in Bangalore | DL Backlog Service",
    metaDescription:
      "Digitise your old driving licence records online in Bangalore. Lane handles backlog verification, documentation and RTO processing.",
  },
  {
    slug: "dl-2w-4w-new-addon",
    category: "Driving Licence",
    icon: "🏍️",
    title: "2W & 4W DL (New / Add-on) in bangalore",
    subtitle: "Apply for a new licence or add a vehicle class",
    tags: ["New DL", "LL", "Driving Test"],
    features: [
      "Learner's Licence + online LL test",
      "Driving test slot booked at RTO",
      "New DL dispatched by post",
    ],
    price: "2W: ₹3,000 / 4W: ₹4,000",
    timeline: "45–60 days",
    note: "Includes LL + driving test stages",
    noteStar: true,
    metaTitle: "Apply for New Driving Licence Online in Bangalore | Lane",
    metaDescription:
      "Get your new driving licence in Bangalore with expert guidance, documentation support and smooth RTO processing from Lane.",
  },
  {
    slug: "international-driving-permit",
    category: "Driving Licence",
    icon: "✈️",
    title: "International DL Permit in bangalore",
    subtitle: "Get an IDP to drive abroad",
    tags: ["Valid DL", "Visa copy", "Passport copy"],
    features: [
      "Document verification",
      "Priority filing at RTO",
      "IDP printed and issued",
    ],
    price: "₹6,999",
    timeline: "5–7 business days",
    note: "TAT may vary",
    noteStar: true,
    metaTitle: "International Driving Permit in Bangalore | Apply Online",
    metaDescription:
      "Apply for an International Driving Permit (IDP) in Bangalore with complete documentation, fast processing and RTO assistance.",
  },

  // ───────────────────────────── RC — CAR ─────────────────────────────
  {
    slug: "rc-name-transfer-car",
    category: "Car Services",
    icon: "🚗",
    title: "RC Name Transfer — Car",
    subtitle: "Transfer car ownership to a new owner",
    tags: ["RC", "Ownership Transfer"],
    features: [
      "Pending challans cleared first",
      "MVI inspection booked",
      "New Smart Card RC dispatched",
    ],
    price: "₹3,999",
    timeline: "18–30 business days",
    note: "Vehicle must have no active loan",
    noteStar: true,
    metaTitle: "Car RC Transfer Online in Bangalore | Ownership Transfer",
    metaDescription:
      "Transfer your car RC online in Bangalore with complete paperwork, ownership transfer support and hassle-free RTO processing.",
  },
  {
    slug: "rc-fitness-car",
    category: "Car Services",
    icon: "🔧",
    title: "RC Fitness Certificate — Car",
    subtitle: "Get a fitness certificate for a 15+ year old car",
    tags: ["FC", "15+ yrs"],
    features: [
      "FC inspection slot booked",
      "PUC, insurance & tax verified",
      "RC renewal filed same visit",
    ],
    price: "Talk to an expert",
    timeline: "18–30 business days",
    note: "Cost depends on RC expiry / vehicle age",
    noteStar: true,
    metaTitle: "Car Fitness Certificate Renewal in Bangalore | Online FC Service",
    metaDescription:
      "Renew your car fitness certificate in Bangalore with expert inspection guidance, documentation and complete RTO support.",
  },
  {
    slug: "rc-transfer-other-state-car",
    category: "Car Services",
    icon: "🌍",
    title: "RC Transfer — Other State to KA (Car)",
    subtitle: "Re-register your out-of-state car in Karnataka",
    tags: ["Re-registration", "NOC"],
    features: [
      "NOC obtained from origin state",
      "Road tax paid & MVI inspection",
      "New KA registration + HSRP issued",
    ],
    price: "Talk to an expert",
    timeline: "30–45 days",
    note: "Road tax calculated on age & invoice value",
    noteStar: true,
    metaTitle: "Vehicle Registration Transfer to Karnataka | Bangalore RTO",
    metaDescription:
      "Transfer your car registration from another state to Karnataka with complete RTO documentation and expert assistance.",
  },
  {
    slug: "non-migration-certificate-car",
    category: "Car Services",
    icon: "📄",
    title: "Non-Migration Certificate (Car)",
    subtitle: "Regularise a car with a lapsed origin-state NOC",
    tags: ["Expired NOC", "Insurance", "PUC"],
    features: [
      "Expired NOC & RC reviewed",
      "Application filed at Bengaluru RTO",
      "Certificate collected & handed over",
    ],
    price: "₹4,499",
    timeline: "Depends on RTO & vehicle specifics",
    note: "Needed when original state NOC has lapsed",
    metaTitle: "Non Migration Certificate for Car in Bangalore | Online Service",
    metaDescription:
      "Apply for a Non Migration Certificate for your car in Bangalore with complete documentation and end-to-end RTO support.",
  },
  {
    slug: "noc-4w-other-state",
    category: "Car Services",
    icon: "📤",
    title: "NOC — Car (KA → Other State)",
    subtitle: "Get an NOC to move your car to another state",
    tags: ["NOC", "Relocation"],
    features: [
      "Pending dues checked on Parivahan",
      "Form 28 filed online",
      "NOC handed over to customer",
    ],
    price: "Talk to an expert",
    timeline: "18–30 business days",
    note: "Required before re-registering in new state",
    metaTitle: "Car NOC from Karnataka Online | Bangalore RTO Service",
    metaDescription:
      "Get a No Objection Certificate (NOC) for your car when relocating from Karnataka with complete documentation and RTO assistance.",
  },
  {
    slug: "rc-address-change-car",
    category: "Car Services",
    icon: "🏠",
    title: "RC Address Change (Inside Bengaluru — Car) in bangalore",
    subtitle: "Update your car's RC address within Bengaluru",
    tags: ["RC", "Address Proof"],
    features: [
      "New address proof verified",
      "Application filed on Parivahan",
      "Updated RC dispatched by post",
    ],
    price: "₹4,199",
    timeline: "18–30 business days",
    note: "Govt fees included",
    metaTitle: "Car RC Address Change Online in Bangalore | Lane",
    metaDescription:
      "Update your car RC address online in Bangalore with complete documentation, verification and hassle-free RTO processing.",
  },

  // ──────────────────────────── RC — BIKE ─────────────────────────────
  {
    slug: "rc-name-transfer-bike",
    category: "Bike Services",
    icon: "🏍️",
    title: "RC Name Transfer — Bike",
    subtitle: "Transfer bike ownership to a new owner",
    tags: ["RC", "Ownership Transfer"],
    features: [
      "Pending challans cleared first",
      "No CC needed across KA districts",
      "New RC dispatched within 30 days",
    ],
    price: "₹2,699",
    timeline: "18–30 business days",
    note: "Vehicle must have no active loan",
    noteStar: true,
    metaTitle: "Bike RC Transfer Online in Bangalore | Ownership Transfer",
    metaDescription:
      "Transfer bike ownership online in Bangalore with complete RC transfer documentation and expert RTO assistance.",
  },
  {
    slug: "rc-fitness-bike",
    category: "Bike Services",
    icon: "🔧",
    title: "RC Fitness Certificate — Bike",
    subtitle: "Get a fitness certificate for a 15+ year old bike",
    tags: ["FC", "15+ yrs"],
    features: [
      "Backlog / history correction if needed",
      "Physical inspection at RTO",
      "New Smart Card RC with FC endorsement",
    ],
    price: "Talk to an expert",
    timeline: "18–30 business days",
    note: "Cost depends on RC expiry / vehicle age",
    noteStar: true,
    metaTitle: "Bike Fitness Certificate Renewal in Bangalore | Online FC",
    metaDescription:
      "Renew your bike fitness certificate online in Bangalore with complete RTO support, inspections and documentation.",
  },
  {
    slug: "rc-transfer-other-state-bike",
    category: "Bike Services",
    icon: "🌍",
    title: "RC Transfer — Other State to KA (Bike)",
    subtitle: "Re-register your out-of-state bike in Karnataka",
    tags: ["Re-registration", "NOC"],
    features: [
      "NOC obtained from origin state",
      "Road tax paid & MVI inspection",
      "New KA registration + HSRP issued",
    ],
    price: "Talk to an expert",
    timeline: "30–45 days",
    note: "Road tax calculated on age & invoice value",
    noteStar: true,
    metaTitle: "Bike Registration Transfer to Karnataka | Bangalore RTO",
    metaDescription:
      "Transfer your bike registration from another state to Karnataka with complete documentation and online RTO assistance.",
  },
  {
    slug: "non-migration-certificate-bike",
    category: "Bike Services",
    icon: "📄",
    title: "Non-Migration Certificate (Bike)",
    subtitle: "Regularise a bike with a lapsed origin-state NOC",
    tags: ["Expired NOC", "Insurance", "PUC Certificate"],
    features: [
      "Expired NOC & RC reviewed",
      "Application filed at Bengaluru RTO",
      "Certificate collected & handed over",
    ],
    price: "Talk to an expert",
    timeline: "Depends on RTO & vehicle specifics",
    note: "Needed when original state NOC has lapsed",
    metaTitle: "Bike Non Migration Certificate in Bangalore | Apply Online",
    metaDescription:
      "Apply for a bike Non Migration Certificate in Bangalore with expert documentation support and smooth RTO processing.",
  },
  {
    slug: "noc-2w-other-state",
    category: "Bike Services",
    icon: "📤",
    title: "NOC — Bike (KA → Other State)",
    subtitle: "Get an NOC to move your bike to another state",
    tags: ["NOC", "Relocation"],
    features: [
      "Pending dues checked on Parivahan",
      "Form 28 filed online",
      "NOC handed over to customer",
    ],
    price: "₹3,699",
    timeline: "18–30 business days",
    note: "Required before re-registering in new state",
    metaTitle: "Bike NOC from Karnataka Online | Bangalore RTO Service",
    metaDescription:
      "Get a bike NOC when relocating from Karnataka to another state with complete documentation and end-to-end RTO support.",
  },
  {
    slug: "rc-address-change-bike",
    category: "Bike Services",
    icon: "🏠",
    title: "RC Address Change (Inside Bengaluru — Bike) in bangalore",
    subtitle: "Update your bike's RC address within Bengaluru",
    tags: ["RC", "Address Proof"],
    features: [
      "New address proof verified",
      "Application filed on Parivahan",
      "Updated RC dispatched by post",
    ],
    price: "₹3,199",
    timeline: "18–30 business days",
    note: "Govt fees included",
    metaTitle: "Bike RC Address Change Online in Bangalore | Lane",
    metaDescription:
      "Update your bike RC address online in Bangalore with complete paperwork, verification and expert RTO assistance.",
  },
];

// Group by category — same shape the old inline SERVICES object had, so the
// existing tab-rendering code in RTOServicesSection barely has to change.
export const servicesByCategory = SERVICE_CATEGORIES.reduce((acc, cat) => {
  acc[cat] = rtoServices.filter((s) => s.category === cat);
  return acc;
}, {});

// Quick lookup by slug — used by the card grid to build the `Start now` link
// and by the detail page as a fallback if content is missing.
export const getServiceBySlug = (slug) =>
  rtoServices.find((s) => s.slug === slug) || null;
