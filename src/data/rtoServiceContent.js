// rtoServiceContent.js
// ---------------------------------------------------------------------------
// Detail-page content for every RTO service, keyed by slug (same key used in
// rtoServicesData.js). Mirrors the getLocationContent(name) pattern from
// locationContent.js: one lookup object + a safe getter.
// ---------------------------------------------------------------------------

const rtoServiceContent = {
  "dl-renewal": {
    whenApplicable: [
      "DL is expiring within 1 year (can apply up to 1 year before expiry)",
      "DL has already expired (within 1 year of expiry)",
      "If expired more than 1 year, a DL test must be taken by the customer",
      "Non-transport DL (valid 20 yrs / till age 50): renewal at expiry",
    ],
    documentsRequired: [
      "Original DL (expiring / expired)",
      "Aadhaar / Passport / Voter ID (address + age proof)",
      "Form 1A — Medical Certificate signed by a govt. doctor (mandatory if age > 40)",
    ],
    process: [
      "Apply on Parivahan Sarathi portal → DL Services → Renewal of DL",
      "Enter DL number + DOB to fetch details",
      "Enter the OTP to start the application",
      "Upload docs (DL scan, Form 1A PDF, address proof)",
      "Pay fee online",
      "Book RTO slot for biometric / photo if prompted",
      "Visit RTO with originals if required",
      "Renewed DL dispatched by Speed Post to your registered address",
    ],
    timeline: "18–30 business days",
    note: "For some old DLs, details may not be available in the central govt. repository. A backlog application will be needed first — additional charges may apply.",
    eligibility: {
      question: "When does your DL expire?",
      // Shown before the user picks an option.
      defaultResult: {
        title: "Apply only within 1 year of expiry",
        body: "RTO rejects applications submitted more than 1 year before expiry. We verify your window automatically.",
      },
      options: [
        {
          label: "More than 1 year away",
          tone: "warn",
          result: {
            title: "A little early to apply",
            body: "RTO rejects applications submitted more than 1 year before expiry. We'll flag when your window opens — or start now and we'll hold it.",
          },
        },
        {
          label: "Within 1 year",
          tone: "ok",
          result: {
            title: "You're eligible to renew now",
            body: "Applications are accepted up to 1 year before expiry. Lane handles the full renewal online — 18–30 days.",
          },
        },
        {
          label: "Already expired (within 1 year)",
          tone: "ok",
          result: {
            title: "Still renewable online",
            body: "A DL expired within the last year can be renewed online. Lane handles the entire process in 18–30 days.",
          },
        },
        {
          label: "Expired over 1 year",
          tone: "warn",
          result: {
            title: "A driving test is required",
            body: "If your DL expired more than a year ago, you'll need to take a driving test at the RTO. Contact us and we'll guide you through it.",
          },
        },
      ],
    },
    documents: [
      { name: "Original DL", status: "REQUIRED" },
      { name: "Aadhaar Card", status: "REQUIRED" },
      { name: "Passport Photos x2", status: "REQUIRED" },
      { name: "Form 1", status: "LANE FILLS THIS" },
      { name: "Medical Cert. (Form 1A)", status: "IF APPLICABLE" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Eligibility & document check", day: "Day 1" },
      { actor: "LANE", desc: "Application filed on Sarathi portal", day: "Day 1-2" },
      { actor: "YOU", desc: "Medical form (if 40+)", day: "Day 2-3" },
      { actor: "RTO", desc: "RTO processes renewal", day: "Day 3-12" },
      { actor: "DONE", desc: "New DL dispatched to your address", day: "Day 10-15" },
    ],
  },

  "dl-address-change-ka": {
    whenApplicable: [
      "Applicant has shifted to a new address within Karnataka",
      "New address falls under a different RTO zone within Karnataka",
      "DL must be valid and not suspended / cancelled",
      "No pending traffic challans on the DL",
    ],
    documentsRequired: [
      "Original DL",
      "Self-attested copy of existing DL",
      "Address proof of new address (Aadhaar / Passport / Voter ID / Bank Passbook / Electricity or Water bill)",
      "If none of the above are available: Rental agreement + recent utility bill (govt.-issued, last 3 months) + Aadhaar",
    ],
    process: [
      "Apply on Sarathi portal → Services on DL → Change of Address",
      "Enter DL number + DOB to fetch details; you share the OTP to begin the application",
      "Select the new RTO zone based on the new pincode",
      "Upload new address proof + DL copy",
      "Pay fee online",
      "Hand over the Original DL to the Lane team",
      "Lane submits the Original DL and application at the RTO to obtain approvals",
      "New DL card with updated address dispatched by post",
    ],
    timeline: "18–30 business days",
    note: "For some old DLs, details may not be available in the central govt. repository. A backlog application will be needed first — additional charges may apply.",
    eligibility: {
      question: "Where's your new address?",
      defaultTone: "info",
      defaultResult: {
        title: "Karnataka-to-Karnataka moves only",
        body: "This service updates a DL address within Karnataka. Pick your case to confirm.",
      },
      options: [
        {
          label: "Same RTO zone in Karnataka",
          tone: "ok",
          result: {
            title: "Straightforward update",
            body: "Lane files the address change on Sarathi — 18–30 days. Your DL must be valid with no pending challans.",
          },
        },
        {
          label: "A different RTO zone in Karnataka",
          tone: "ok",
          result: {
            title: "Covered by this service",
            body: "The new RTO zone processes the update. Lane submits your original DL and gets approvals — 18–30 days.",
          },
        },
        {
          label: "I moved from another state",
          tone: "warn",
          result: {
            title: "You need the inter-state version",
            body: "Use ‘DL Address Change (Other State → KA)’ instead — we'll route you there.",
          },
        },
        {
          label: "I'm leaving Karnataka",
          tone: "info",
          result: {
            title: "Updating is optional",
            body: "Your DL stays valid across India. Update the address only if a future service needs it.",
          },
        },
      ],
    },
    documents: [
      { name: "Original DL", status: "REQUIRED" },
      { name: "Self-attested DL Copy", status: "REQUIRED" },
      { name: "New Address Proof", status: "REQUIRED" },
      { name: "Rental Agreement + Utility Bill", status: "IF APPLICABLE" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Eligibility & document check", day: "Day 1" },
      { actor: "LANE", desc: "Address change filed on Sarathi", day: "Day 1-2" },
      { actor: "LANE", desc: "Original DL submitted at new RTO zone", day: "Day 2-4" },
      { actor: "RTO", desc: "RTO processes the update", day: "Day 4-25" },
      { actor: "DONE", desc: "Updated DL dispatched to your address", day: "Day 18-30" },
    ],
  },

  "dl-name-change": {
    whenApplicable: [
      "Change of name due to marriage (gazette + marriage certificate required)",
      "Legal name change via court order / gazette notification",
      "Correction of spelling errors in an existing DL",
      "DL must be valid and not expired",
    ],
    documentsRequired: [
      "Original DL",
      "Aadhaar / Passport reflecting the new name",
      "Gazette notification (mandatory for legal name change)",
      "Affidavit on stamp paper declaring the name change",
      "Marriage certificate (if the name change is due to marriage)",
    ],
    process: [
      "Apply on Sarathi portal → Services on DL → Change of Name → OTP",
      "Upload all name-change supporting documents",
      "Lane arranges the newspaper ad about the name change if required (a copy must be uploaded to the portal)",
      "Pay applicable fee",
      "Lane collects the Original DL from you to submit at the RTO for approval",
      "New DL printed with updated name, dispatched by India Post",
    ],
    timeline: "30–40 days",
    note: "For some old DLs, details may not be available in the central govt. repository. A backlog application will be needed first — additional charges may apply.",
    eligibility: {
      question: "Why are you changing the name on your DL?",
      defaultTone: "info",
      defaultResult: {
        title: "Valid DL required",
        body: "Your DL must be valid (not expired). Pick your reason to see what's needed.",
      },
      options: [
        {
          label: "Marriage",
          tone: "ok",
          result: {
            title: "Covered",
            body: "You'll need your marriage certificate plus a gazette/affidavit. Lane handles filing — 30–40 days.",
          },
        },
        {
          label: "Legal name change",
          tone: "ok",
          result: {
            title: "Covered",
            body: "A gazette notification is mandatory for a legal name change. Lane files it — 30–40 days.",
          },
        },
        {
          label: "Spelling correction",
          tone: "ok",
          result: {
            title: "Covered",
            body: "Lane corrects the spelling on Sarathi with supporting ID — 30–40 days.",
          },
        },
        {
          label: "My DL is expired",
          tone: "warn",
          result: {
            title: "Renew first",
            body: "A name change needs a valid DL. Let's renew it first, then update the name.",
          },
        },
      ],
    },
    documents: [
      { name: "Original DL", status: "REQUIRED" },
      { name: "ID with New Name", status: "REQUIRED" },
      { name: "Gazette Notification", status: "IF APPLICABLE" },
      { name: "Affidavit", status: "LANE FILLS THIS" },
      { name: "Marriage Certificate", status: "IF APPLICABLE" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Documents & affidavit verified", day: "Day 1-2" },
      { actor: "LANE", desc: "Name change filed on Sarathi", day: "Day 2-3" },
      { actor: "LANE", desc: "Newspaper ad + original DL submitted", day: "Day 3-6" },
      { actor: "RTO", desc: "RTO processes the endorsement", day: "Day 6-35" },
      { actor: "DONE", desc: "New DL with updated name dispatched", day: "Day 30-40" },
    ],
  },

  "dl-address-change-other-state": {
    whenApplicable: [
      "Person with a DL issued by any other Indian state (MH, TN, KL, AP, DL, etc.) has relocated to Karnataka",
      "New Bengaluru address falls under a Bengaluru RTO zone",
      "DL must be valid; cannot be expired",
      "This is an inter-state transfer",
    ],
    documentsRequired: [
      "Original out-of-state DL",
      "Self-attested copy of DL",
      "Aadhaar / Voter ID / Passport with Karnataka address",
      "If listed IDs aren't yet updated with the Bengaluru address: valid rental agreement + electricity bill + Aadhaar (any address)",
    ],
    process: [
      "Apply on Sarathi portal → Services on DL → Change of Address",
      "Enter DL number + DOB to fetch details; you share the OTP to begin the application",
      "Select the new RTO zone based on the new pincode",
      "Upload new address proof + DL copy",
      "Pay fee online",
      "Hand over the Original DL to the Lane team",
      "Lane submits the Original DL and application at the RTO to obtain approvals",
      "New DL card with updated address dispatched by post",
    ],
    timeline: "18–30 business days",
    note: "",
    eligibility: {
      question: "What's your situation?",
      defaultTone: "info",
      defaultResult: {
        title: "For out-of-state licences",
        body: "This moves an out-of-state DL address to Bengaluru. Pick your case to confirm.",
      },
      options: [
        {
          label: "Moved to Bengaluru with an out-of-state DL",
          tone: "ok",
          result: {
            title: "Exactly this service",
            body: "Lane files the inter-state address change on Sarathi — 18–30 days.",
          },
        },
        {
          label: "My DL is expired",
          tone: "warn",
          result: {
            title: "Renew first",
            body: "Your DL must be valid (not expired) for an inter-state address change. Let's sort renewal first.",
          },
        },
        {
          label: "I only moved within Karnataka",
          tone: "info",
          result: {
            title: "Use the simpler version",
            body: "You need ‘DL Address Change (KA → KA)’ instead — it's quicker.",
          },
        },
      ],
    },
    documents: [
      { name: "Original DL (out-of-state)", status: "REQUIRED" },
      { name: "Self-attested DL Copy", status: "REQUIRED" },
      { name: "Karnataka Address Proof", status: "REQUIRED" },
      { name: "Rental Agreement + Utility Bill", status: "IF APPLICABLE" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Eligibility & document check", day: "Day 1" },
      { actor: "LANE", desc: "Inter-state address change filed", day: "Day 1-3" },
      { actor: "LANE", desc: "Original DL submitted at RTO", day: "Day 3-5" },
      { actor: "RTO", desc: "RTO processes the transfer", day: "Day 5-25" },
      { actor: "DONE", desc: "Updated DL dispatched to your address", day: "Day 18-30" },
    ],
  },

  "duplicate-dl": {
    whenApplicable: [
      "Original DL is lost, stolen, or damaged / mutilated",
      "DL is illegible or worn out",
      "Can apply even for an expired DL if name correction or other services are also needed",
      "FIR is mandatory if the DL was stolen",
    ],
    documentsRequired: [
      "DL number",
      "Address proof (Aadhaar, Voter ID, etc.)",
      "Old DL copy if available (for damaged / mutilated cases)",
      "FIR copy from police if stolen (Lane will assist with filing)",
      "Notarised affidavit on stamp paper stating the DL is lost / not misused (Lane will prepare this)",
    ],
    process: [
      "Lane files an FIR at the local police station / online as the DL is reported lost",
      "Lane gets the affidavit notarised",
      "Apply on Sarathi portal → Duplicate DL → with OTP",
      "Upload FIR / affidavit",
      "Pay fee",
      "Lane visits the RTO with supporting documents for approvals",
      "Duplicate DL dispatched by Speed Post",
    ],
    timeline: "18–30 business days",
    note: "If DL details aren't available online, a backlog application must be completed first before the Duplicate DL can be issued — additional charges may apply.",
    eligibility: {
      question: "What happened to your DL?",
      defaultTone: "info",
      defaultResult: {
        title: "Lane handles the whole process",
        body: "Pick what happened so we can tell you exactly what's needed.",
      },
      options: [
        {
          label: "Lost or stolen",
          tone: "ok",
          result: {
            title: "FIR + affidavit needed",
            body: "Lane files the FIR online for you and gets the affidavit notarised. Duplicate issued in 18–30 days.",
          },
        },
        {
          label: "Damaged / illegible",
          tone: "ok",
          result: {
            title: "No FIR needed",
            body: "Just your old DL copy. Lane applies for a duplicate on Sarathi — 18–30 days.",
          },
        },
        {
          label: "It's not showing online",
          tone: "warn",
          result: {
            title: "Digitisation may come first",
            body: "If your DL isn't in the system, a backlog application is needed before a duplicate — extra time may apply.",
          },
        },
      ],
    },
    documents: [
      { name: "DL Number", status: "REQUIRED" },
      { name: "Address Proof", status: "REQUIRED" },
      { name: "Old DL Copy", status: "IF APPLICABLE" },
      { name: "FIR Copy", status: "LANE FILLS THIS" },
      { name: "Notarised Affidavit", status: "LANE FILLS THIS" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "FIR filed online + affidavit notarised", day: "Day 1-2" },
      { actor: "LANE", desc: "Duplicate DL filed on Sarathi", day: "Day 2-3" },
      { actor: "RTO", desc: "RTO approves the duplicate", day: "Day 3-25" },
      { actor: "DONE", desc: "Duplicate DL dispatched by Speed Post", day: "Day 18-30" },
    ],
  },

  "dl-backlog-digitisation": {
    whenApplicable: [
      "DL issued before Sarathi digitisation (pre-2005/2010 era) not appearing on the Parivahan portal",
      "Portal shows 'Record not found' on Sarathi",
      "Required before any DL service (renewal, address change) can be done online",
      "Common for DLs issued in the older booklet format",
      "Note: no Smart Card is issued through this process — only details appear online",
    ],
    documentsRequired: ["Original DL (old booklet format)", "Aadhaar"],
    process: [
      "Attempt the online service on Sarathi — if a 'de-duplication error' appears, proceed with backlog",
      "Visit the original issuing RTO in person (this cannot be done online for KA)",
      "Submit an application letter + original DL + photocopies at the RTO data entry counter",
      "RTO officer manually enters / digitises records into Sarathi",
      "Once digitised, online services become available",
      "Proceed with the required service (renewal, address change, etc.)",
      "If a Smart Card is needed: additional charges apply and you'll need to visit the RTO for a live photograph",
    ],
    timeline: "18–30 business days",
    note: "Customer must have the Original KA Driving Licence available.",
    eligibility: {
      question: "When was your DL issued?",
      defaultTone: "info",
      defaultResult: {
        title: "For pre-digitisation licences",
        body: "This gets an old DL entered into Sarathi. Pick your case to confirm.",
      },
      options: [
        {
          label: "Before ~2010 (old booklet)",
          tone: "ok",
          result: {
            title: "Likely needs digitisation",
            body: "Lane gets your details entered into Sarathi at the issuing RTO — 18–30 days. Note: no Smart Card is issued by this step alone.",
          },
        },
        {
          label: "It shows ‘Record not found’ online",
          tone: "ok",
          result: {
            title: "That's the digitisation case",
            body: "Lane handles the RTO data entry so online services unlock afterwards.",
          },
        },
        {
          label: "It already appears online",
          tone: "info",
          result: {
            title: "No digitisation needed",
            body: "Go straight to the service you want — renewal, address change, and so on.",
          },
        },
      ],
    },
    documents: [
      { name: "Original DL (old booklet)", status: "REQUIRED" },
      { name: "Aadhaar Card", status: "REQUIRED" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "DL status & eligibility checked", day: "Day 1" },
      { actor: "YOU", desc: "Visit issuing RTO with original DL", day: "Day 2-5" },
      { actor: "RTO", desc: "RTO digitises your record into Sarathi", day: "Day 5-25" },
      { actor: "DONE", desc: "Online services unlocked", day: "Day 18-30" },
    ],
  },

  "dl-2w-4w-new-addon": {
    whenApplicable: [
      "Applicant holds only a 2-wheeler (LMV-NT / Motorcycle) DL and wants to add the 4-wheeler (LMV / Car) class",
      "Applicant holds only a 4-wheeler DL and wants to add the 2-wheeler class",
      "Applicant needs a fresh 4-wheeler and 2-wheeler DL together",
      "Minimum age: 18 for 4-wheeler; 16 for non-gear 2-wheeler; 18 for gear 2-wheeler",
    ],
    documentsRequired: [
      "Existing valid DL (original), if the applicant already holds a 2W/4W licence",
      "Address and age proof (Voter ID / Passport / DOB certificate)",
      "Recent passport-size photograph",
      "Signature on white paper",
    ],
    process: [
      "Apply for a Learner's Licence on Sarathi for the new vehicle class → pass the online LL test",
      "After a mandatory 30-day gap, apply for a driving test slot",
      "Apply on Sarathi → New DL / Endorsement → add vehicle class",
      "Upload docs + existing DL",
      "Pay fee",
      "Book a driving test appointment at the RTO",
      "Pass the driving test (car test = figure-8 + road; bike = figure-8 track)",
      "New DL with both classes dispatched by Speed Post (OTPs required at multiple stages)",
    ],
    timeline: "45–60 days",
    note: "",
    eligibility: {
      question: "What do you need?",
      defaultTone: "info",
      defaultResult: {
        title: "New licence or add-on class",
        body: "Includes the Learner's Licence, online test, and driving test. Pick your case.",
      },
      options: [
        {
          label: "Add a 4-wheeler to my 2-wheeler DL",
          tone: "ok",
          result: {
            title: "Covered",
            body: "Requires an LL and a driving test for the new class — full process in 45–60 days.",
          },
        },
        {
          label: "Add a 2-wheeler to my 4-wheeler DL",
          tone: "ok",
          result: {
            title: "Covered",
            body: "Requires an LL and a driving test for the new class — 45–60 days.",
          },
        },
        {
          label: "A fresh licence (no DL yet)",
          tone: "ok",
          result: {
            title: "Covered end-to-end",
            body: "LL → online LL test → driving test → new DL by post. 45–60 days.",
          },
        },
        {
          label: "I'm under 18",
          tone: "warn",
          result: {
            title: "Age requirement",
            body: "Minimum age is 18 for 4-wheeler / geared 2-wheeler, and 16 for a non-geared 2-wheeler.",
          },
        },
      ],
    },
    documents: [
      { name: "Existing DL", status: "IF APPLICABLE" },
      { name: "Address & Age Proof", status: "REQUIRED" },
      { name: "Passport Photo", status: "REQUIRED" },
      { name: "Signature on White Paper", status: "REQUIRED" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Learner's Licence applied on Sarathi", day: "Day 1-3" },
      { actor: "YOU", desc: "Pass the online LL test", day: "Day 3-5" },
      { actor: "LANE", desc: "Driving test slot booked (30-day gap)", day: "Day 5-35" },
      { actor: "YOU", desc: "Pass the driving test at RTO", day: "Day 35-45" },
      { actor: "DONE", desc: "New DL dispatched by Speed Post", day: "Day 45-60" },
    ],
  },

  "international-driving-permit": {
    whenApplicable: [
      "Indian citizen planning to drive abroad in IDP-recognising countries (Europe, USA, UAE, Australia, etc.)",
      "Must hold a valid permanent Driving Licence — a Learner's Licence is not eligible",
      "Must have a valid passport and confirmed travel (visa / ticket may be required)",
      "IDP is valid for 1 year from date of issue OR until DL expiry, whichever is earlier",
      "IDP is not valid for driving in India — only for use abroad",
      "If the permanent DL isn't from Karnataka, an address change must be done first — additional charges may apply",
    ],
    documentsRequired: [
      "Valid Karnataka Driving Licence (permanent DL) — photocopy",
      "Valid passport — copy",
      "Visa copy (if available)",
      "Air ticket / travel itinerary",
      "3 recent passport-size photographs",
      "Address proof (Aadhaar)",
    ],
    process: [
      "Download Form A (CMVR) from transport.karnataka.gov.in or collect it at the RTO",
      "Fill the form and compile all documents",
      "Visit the RTO that issued your DL in Bengaluru (or the nearest Bengaluru RTO)",
      "Submit the file at the IDP counter",
      "Pay the fee at the cash counter",
      "Lane gets the necessary approvals",
      "IDP (booklet format) issued within 2–5 working days",
    ],
    timeline: "5–7 business days",
    note: "If your permanent DL isn't from Karnataka, an address change must be completed first. Additional charges may apply.",
    eligibility: {
      question: "Do you hold a valid permanent DL?",
      defaultTone: "info",
      defaultResult: {
        title: "Valid permanent DL required",
        body: "An IDP needs a valid permanent licence and a passport. Pick your case.",
      },
      options: [
        {
          label: "Yes — from Karnataka",
          tone: "ok",
          result: {
            title: "You're eligible",
            body: "Lane files for the IDP — 5–7 days. Valid 1 year, or until your DL expires.",
          },
        },
        {
          label: "Yes — from another state",
          tone: "warn",
          result: {
            title: "KA address change first",
            body: "Your permanent DL must show a Karnataka address — we'll do that first. Additional charges may apply.",
          },
        },
        {
          label: "Only a Learner's Licence",
          tone: "warn",
          result: {
            title: "Not eligible on an LL",
            body: "An IDP requires a permanent DL — a Learner's Licence doesn't qualify.",
          },
        },
        {
          label: "No valid DL",
          tone: "warn",
          result: {
            title: "Get a DL first",
            body: "A valid permanent DL is required before applying for an IDP.",
          },
        },
      ],
    },
    documents: [
      { name: "Karnataka DL Copy", status: "REQUIRED" },
      { name: "Passport Copy", status: "REQUIRED" },
      { name: "Visa Copy", status: "IF APPLICABLE" },
      { name: "Air Ticket / Itinerary", status: "REQUIRED" },
      { name: "Passport Photos x3", status: "REQUIRED" },
      { name: "Form A (CMVR)", status: "LANE FILLS THIS" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Documents verified (DL, passport, visa)", day: "Day 1" },
      { actor: "LANE", desc: "Form A filed + priority submission", day: "Day 1-2" },
      { actor: "RTO", desc: "RTO approves the IDP", day: "Day 2-5" },
      { actor: "DONE", desc: "IDP booklet issued", day: "Day 5-7" },
    ],
  },

  "rc-name-transfer-car": {
    whenApplicable: [
      "Car purchased from an individual seller (used / second-hand car)",
      "Transfer must be completed within 30 days of purchase (₹500/month penalty for delay)",
      "Owner's death — transfer to legal heir",
      "Vehicle gifted or auctioned",
      "Same RTO zone: direct transfer. Different KA RTO zone: Clearance Certificate (CC) needed first. Other state: NOC from original state RTO",
    ],
    documentsRequired: [
      "Original RC",
      "Form 29 — Notice of Transfer (signed by both buyer and seller)",
      "Form 30 — Application for Transfer of Ownership (signed by both)",
      "Address proof of buyer (2 documents: Aadhaar + any utility bill)",
      "PAN card / Form 60 (mandatory for LMVs)",
      "3 recent passport-size photographs (buyer)",
      "Valid Insurance Certificate (in buyer's name after transfer)",
      "Valid PUC Certificate",
      "Form 28 (NOC) — if the car is from a different RTO zone within KA or another state",
      "Bank NOC if there's hypothecation / a loan on the vehicle (must be terminated at the original RTO first)",
    ],
    process: [
      "Check for pending e-challans on Parivahan / BTP portal and clear them all",
      "Get a chassis pencil imprint on Form 29 / 30",
      "Apply on Parivahan → Vehicle Services → Transfer of Ownership",
      "Enter the vehicle registration number → select Transfer of Ownership",
      "Enter the chassis's last 5 digits + mobile OTP verification",
      "Fill buyer / seller details and upload documents",
      "Pay fee online",
      "Book an MVI (Motor Vehicle Inspector) inspection appointment",
      "Visit the buyer's RTO with the complete file",
      "After approval, new Smart Card RC dispatched by Speed Post",
    ],
    timeline: "18–30 business days",
    note: "Vehicle must have no active loan. If a loan existed previously, hypothecation must be removed before proceeding.",
    eligibility: {
      question: "Where is the car registered?",
      defaultTone: "info",
      defaultResult: {
        title: "Transfer within 30 days of purchase",
        body: "A ₹500/month penalty applies for delays. Pick your case to see the route.",
      },
      options: [
        {
          label: "Same KA RTO zone",
          tone: "ok",
          result: {
            title: "Direct transfer",
            body: "Lane files Forms 29 & 30, coordinates MVI inspection, and dispatches the new Smart Card RC — 18–30 days.",
          },
        },
        {
          label: "A different KA RTO zone",
          tone: "warn",
          result: {
            title: "Clearance Certificate first",
            body: "A CC from the original RTO is needed before transfer. Lane arranges it.",
          },
        },
        {
          label: "Another state",
          tone: "warn",
          result: {
            title: "NOC route",
            body: "You'll need an NOC from the origin state (or the Other-State → KA transfer). We'll guide the sequence.",
          },
        },
        {
          label: "It has an active loan",
          tone: "warn",
          result: {
            title: "Clear the loan first",
            body: "Hypothecation must be terminated with a bank NOC before ownership can transfer.",
          },
        },
      ],
    },
    documents: [
      { name: "Original RC", status: "REQUIRED" },
      { name: "Form 29", status: "LANE FILLS THIS" },
      { name: "Form 30", status: "LANE FILLS THIS" },
      { name: "Buyer Address Proof", status: "REQUIRED" },
      { name: "PAN / Form 60", status: "REQUIRED" },
      { name: "Passport Photos x3", status: "REQUIRED" },
      { name: "Insurance (buyer's name)", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Form 28 (NOC)", status: "IF APPLICABLE" },
      { name: "Bank NOC", status: "IF APPLICABLE" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Challans cleared & documents verified", day: "Day 1-2" },
      { actor: "LANE", desc: "Transfer filed on Parivahan (Forms 29 & 30)", day: "Day 2-4" },
      { actor: "YOU", desc: "MVI inspection of the vehicle", day: "Day 4-8" },
      { actor: "RTO", desc: "RTO processes ownership transfer", day: "Day 8-25" },
      { actor: "DONE", desc: "New Smart Card RC dispatched", day: "Day 18-30" },
    ],
  },

  "rc-fitness-car": {
    whenApplicable: [
      "Private cars after 15 years from date of first registration — RC expires and an FC / fitness check is mandatory",
      "After the first FC renewal, re-apply every 5 years",
      "FC required for RC renewal of private vehicles",
      "For private vehicles between 15–20 years: FC + RC renewal are done together",
    ],
    documentsRequired: [
      "Original RC (Smart Card)",
      "Valid Insurance Certificate",
      "Valid PUC (Emission) Certificate",
      "Address proof of owner",
    ],
    process: [
      "Book an FC inspection slot on Parivahan → Vehicle Services → Fitness Certificate",
      "Pay fee online",
      "Ensure PUC, insurance, and road tax are all valid and updated on the Vahan server",
      "Take the vehicle to the RTO / Automated Testing Station (ATS) on the booked date",
      "Inspector checks brakes, lights, horn, emission, tyres, and body condition",
      "If cleared, FC is updated in the Vahan system",
      "Apply simultaneously for RC renewal (Form 25) at the same RTO visit",
      "New Smart Card RC with 5-year validity dispatched by Speed Post",
    ],
    timeline: "18–30 business days",
    pricingNote: "Costing depends on the RC expiry date / age of the vehicle.",
    note: "If the vehicle has illegal modifications, after-market accessories, non-standard wheels or tints, or isn't in good running condition, the RTO may charge additional fees.",
    eligibility: {
      question: "How old is your car (from first registration)?",
      defaultTone: "info",
      defaultResult: {
        title: "FC applies at 15 years",
        body: "Check your RC for the first-registration date. Pick your case.",
      },
      options: [
        {
          label: "Under 15 years",
          tone: "info",
          result: {
            title: "Not needed yet",
            body: "A fitness certificate is required only once the car turns 15.",
          },
        },
        {
          label: "15 years or older",
          tone: "ok",
          result: {
            title: "FC required",
            body: "Lane books the inspection and files RC renewal together — 18–30 days. Cost depends on age/expiry.",
          },
        },
        {
          label: "Already renewed FC once",
          tone: "ok",
          result: {
            title: "Renew every 5 years",
            body: "After the first FC, renew every 5 years. Lane handles inspection + paperwork — 18–30 days.",
          },
        },
      ],
    },
    documents: [
      { name: "Original RC (Smart Card)", status: "REQUIRED" },
      { name: "Valid Insurance", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Owner Address Proof", status: "REQUIRED" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Documents verified (insurance, PUC, tax)", day: "Day 1-2" },
      { actor: "LANE", desc: "FC inspection slot booked", day: "Day 2-4" },
      { actor: "YOU", desc: "Bring vehicle for RTO inspection", day: "Day 4-8" },
      { actor: "RTO", desc: "RC renewal filed with FC endorsement", day: "Day 8-25" },
      { actor: "DONE", desc: "New Smart Card RC dispatched", day: "Day 18-30" },
    ],
  },

  "rc-transfer-other-state-car": {
    whenApplicable: [
      "Vehicle registered in another Indian state and the owner has relocated to Karnataka",
      "Must be re-registered in KA within 11 months (legal requirement)",
      "Road tax must be paid to KA; a refund can be claimed from the original state",
      "Vehicle must pass fitness / inspection in Karnataka",
    ],
    documentsRequired: [
      "NOC (Form 28) from original state RTO",
      "Road Tax Clearance Certificate from original state",
      "Original RC (original state)",
      "Valid Insurance",
      "Valid PUC Certificate",
      "Chassis + engine pencil prints",
      "Address proof in Karnataka (Aadhaar / rental agreement)",
      "PAN card / Form 60",
      "Demand Draft for road tax (payable to RTO Karnataka)",
      "For a refund from the original state: original road tax receipt + NOC to original RTO",
    ],
    process: [
      "Apply for NOC (Form 28) at the original state RTO (can often be done online via Parivahan)",
      "Once the NOC is received, come to the Bengaluru RTO",
      "Apply on Parivahan → Vehicle Services → Re-registration in new state",
      "Submit the complete document file at the KA RTO",
      "Pay road tax (Demand Draft)",
      "Vehicle inspection by the MVI",
      "Obtain a new KA registration number (KA-XX series)",
      "Get HSRP plates fitted",
      "New RC dispatched with the KA registration",
    ],
    timeline: "30–45 days (depends on timely submission and inspection)",
    pricingNote:
      "Costing depends on the NOC from origin state, age of the vehicle, and invoice value. Road tax and re-registration fees are calculated on these factors.",
    note: "",
    eligibility: {
      question: "How long since you moved to Karnataka?",
      defaultTone: "info",
      defaultResult: {
        title: "Re-register within 11 months",
        body: "This is a legal requirement for out-of-state vehicles. Pick your case.",
      },
      options: [
        {
          label: "Within 11 months",
          tone: "ok",
          result: {
            title: "You're within the window",
            body: "Lane handles NOC, KA road tax, MVI inspection, and re-registration — 30–45 days.",
          },
        },
        {
          label: "Over 11 months",
          tone: "warn",
          result: {
            title: "Overdue — but fixable",
            body: "Re-registration is past the 11-month limit. Contact us and we'll still help sort it.",
          },
        },
        {
          label: "Just planning the move",
          tone: "info",
          result: {
            title: "Start with the NOC",
            body: "You'll first need an NOC (Form 28) from your origin state. We can guide the full sequence.",
          },
        },
      ],
    },
    documents: [
      { name: "NOC (Form 28)", status: "REQUIRED" },
      { name: "Road Tax Clearance", status: "REQUIRED" },
      { name: "Original RC", status: "REQUIRED" },
      { name: "Valid Insurance", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Chassis & Engine Prints", status: "REQUIRED" },
      { name: "Karnataka Address Proof", status: "REQUIRED" },
      { name: "PAN / Form 60", status: "REQUIRED" },
      { name: "Road Tax Demand Draft", status: "REQUIRED" },
      { name: "Original Tax Receipt", status: "IF APPLICABLE" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "NOC obtained from origin state", day: "Day 1-10" },
      { actor: "LANE", desc: "Re-registration filed at KA RTO", day: "Day 10-15" },
      { actor: "YOU", desc: "Vehicle inspection + road tax paid", day: "Day 15-25" },
      { actor: "RTO", desc: "New KA registration + HSRP issued", day: "Day 25-40" },
      { actor: "DONE", desc: "New RC dispatched", day: "Day 30-45" },
    ],
  },

  "non-migration-certificate-car": {
    whenApplicable: [
      "Vehicle has an expired NOC from another state and the owner is now staying in Karnataka",
      "Required to regularise vehicle registration when the NOC from the original state has lapsed",
    ],
    documentsRequired: [
      "Expired NOC from original state",
      "Original RC",
      "Active Insurance Certificate",
      "Valid PUC Certificate",
      "Aadhaar card",
    ],
    process: [
      "Lane reviews the expired NOC and original RC to assess the case",
      "Compile all required documents",
      "Apply at the relevant Bengaluru RTO for a Non-Migration Certificate",
      "Submit documents at the RTO counter",
      "Lane follows up and collects the Non-Migration Certificate",
      "Certificate enables subsequent services (re-registration, transfer, etc.) to proceed",
    ],
    timeline: "Depends on RTO and vehicle specifics",
    note: "",
    eligibility: {
      question: "What's the status of your origin-state NOC?",
      defaultTone: "info",
      defaultResult: {
        title: "For lapsed NOCs",
        body: "A Non-Migration Certificate regularises a vehicle whose origin-state NOC has expired. Pick your case.",
      },
      options: [
        {
          label: "My NOC has expired",
          tone: "ok",
          result: {
            title: "Exactly this service",
            body: "Lane files for the Non-Migration Certificate at the Bengaluru RTO and follows up to collect it.",
          },
        },
        {
          label: "My NOC is still valid",
          tone: "info",
          result: {
            title: "You may not need this",
            body: "A valid NOC usually lets you re-register directly. We'll confirm your case.",
          },
        },
        {
          label: "I never received an NOC",
          tone: "warn",
          result: {
            title: "Sort the NOC first",
            body: "You'll likely need the NOC/transfer route first. Contact us and we'll map it out.",
          },
        },
      ],
    },
    documents: [
      { name: "Expired NOC", status: "REQUIRED" },
      { name: "Original RC", status: "REQUIRED" },
      { name: "Valid Insurance", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Aadhaar Card", status: "REQUIRED" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Expired NOC & RC reviewed", day: "Day 1-2" },
      { actor: "LANE", desc: "Application filed at Bengaluru RTO", day: "Day 2-5" },
      { actor: "RTO", desc: "RTO processes the certificate", day: "Day 5-20" },
      { actor: "DONE", desc: "Non-Migration Certificate handed over", day: "Day 15-25" },
    ],
  },

  "noc-4w-other-state": {
    whenApplicable: [
      "Owner wishes to re-register their car from Karnataka to another Indian state",
      "NOC from the Karnataka RTO is a mandatory prerequisite before re-registration in the new state",
      "Applies when the owner is permanently relocating to another state",
    ],
    documentsRequired: [
      "Original RC",
      "Aadhaar card",
      "Valid Insurance Certificate",
      "Valid PUC Certificate",
      "Invoice / purchase receipt of the vehicle",
      "Pencil print of chassis number",
      "Pencil print of engine number",
    ],
    process: [
      "Verify no pending challans or dues on Parivahan",
      "Apply for NOC (Form 28) on Parivahan → Vehicle Services → NOC",
      "Upload all required documents",
      "Pay fee online",
      "Lane visits the KA RTO for physical submission and approvals where needed",
      "NOC (Form 28) issued and handed over to the customer",
      "Customer can proceed with re-registration in the new state",
    ],
    timeline: "18–30 business days",
    note: "",
    eligibility: {
      question: "Why do you need the NOC?",
      defaultTone: "info",
      defaultResult: {
        title: "NOC before re-registration",
        body: "A Karnataka NOC is mandatory before re-registering your car in another state. Pick your case.",
      },
      options: [
        {
          label: "Relocating my car to another state",
          tone: "ok",
          result: {
            title: "Right service",
            body: "Lane checks for pending challans and files Form 28 — 18–30 days.",
          },
        },
        {
          label: "There are pending challans",
          tone: "warn",
          result: {
            title: "Clear dues first",
            body: "Pending dues must be cleared before the NOC is issued. Lane verifies these on Parivahan.",
          },
        },
        {
          label: "Just selling within Karnataka",
          tone: "info",
          result: {
            title: "No NOC needed",
            body: "A same-state sale doesn't need an NOC — see ‘RC Name Transfer’ instead.",
          },
        },
      ],
    },
    documents: [
      { name: "Original RC", status: "REQUIRED" },
      { name: "Aadhaar Card", status: "REQUIRED" },
      { name: "Valid Insurance", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Purchase Invoice", status: "REQUIRED" },
      { name: "Chassis & Engine Prints", status: "REQUIRED" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Challans checked & documents verified", day: "Day 1-2" },
      { actor: "LANE", desc: "Form 28 (NOC) filed on Parivahan", day: "Day 2-4" },
      { actor: "RTO", desc: "RTO approves the NOC", day: "Day 4-25" },
      { actor: "DONE", desc: "NOC handed over to you", day: "Day 18-30" },
    ],
  },

  "rc-address-change-car": {
    whenApplicable: [
      "Vehicle owner has moved to a new address within Bengaluru city limits",
      "Address on the RC needs to be updated to reflect the current address",
    ],
    documentsRequired: [
      "Current address proof (govt.-issued ID with new address: Aadhaar / Voter ID / Passport / utility bill)",
    ],
    process: [
      "Verify current details on Vahan / Parivahan portal",
      "Apply on Parivahan → Vehicle Services → Change of Address",
      "Upload new address proof",
      "Pay fee online",
      "Lane submits the application and visits the RTO for approvals as needed",
      "Updated RC dispatched by Speed Post to the new address",
    ],
    timeline: "18–30 business days",
    note: "",
    eligibility: {
      question: "Where's your new address?",
      defaultTone: "info",
      defaultResult: {
        title: "For moves inside Bengaluru",
        body: "This updates your car's RC address within the city. Pick your case.",
      },
      options: [
        {
          label: "Within Bengaluru city",
          tone: "ok",
          result: {
            title: "Covered",
            body: "Lane updates the RC address on Parivahan and dispatches the updated RC — 18–30 days.",
          },
        },
        {
          label: "A different city in Karnataka",
          tone: "warn",
          result: {
            title: "May involve a zone transfer",
            body: "Contact us — we'll confirm whether a transfer between RTO zones is needed.",
          },
        },
        {
          label: "Another state",
          tone: "warn",
          result: {
            title: "NOC + re-registration",
            body: "An out-of-state move needs an NOC and re-registration, not just an address change.",
          },
        },
      ],
    },
    documents: [{ name: "New Address Proof", status: "REQUIRED" }],
    howItWorks: [
      { actor: "LANE", desc: "New address proof verified", day: "Day 1" },
      { actor: "LANE", desc: "Address change filed on Parivahan", day: "Day 1-3" },
      { actor: "RTO", desc: "RTO processes the update", day: "Day 3-25" },
      { actor: "DONE", desc: "Updated RC dispatched by post", day: "Day 18-30" },
    ],
  },

  "rc-name-transfer-bike": {
    whenApplicable: [
      "Bike (2-wheeler) purchased from an individual seller",
      "Transfer must be completed within 30 days of purchase",
      "Bike from the same KA RTO zone: direct transfer, no CC needed",
      "Bike from a different KA district: CC is not required for 2-wheelers (unlike cars)",
      "Bike with a loan / hypothecation: HP termination must be done at the original RTO first",
      "Other-state bike: NOC from the original state + road tax payment in KA",
    ],
    documentsRequired: [
      "Original RC",
      "Form 29 (signed by buyer + seller)",
      "Form 30 (signed by buyer + seller)",
      "Address proof of buyer",
      "PAN card of buyer (if applicable)",
      "2 passport-size photographs (buyer)",
      "Valid Insurance",
      "Valid PUC",
      "Bank NOC if there's hypothecation (must be terminated at original RTO first)",
    ],
    process: [
      "Verify no pending challans on Parivahan",
      "Get a chassis pencil print on Form 29",
      "Apply on Parivahan → Vehicle Services → Transfer of Ownership",
      "Enter the registration number, chassis digits, and mobile OTP",
      "Fill buyer / seller details and upload documents",
      "Pay fee",
      "Visit any Bengaluru RTO (no zone restriction for bikes in KA)",
      "Submit the file to the RTO counter — Lane obtains the necessary approvals",
      "New RC dispatched by Speed Post within 30 days",
    ],
    timeline: "18–30 business days",
    note: "Vehicle must have no active loan. If a loan existed previously, hypothecation must be removed before proceeding.",
    eligibility: {
      question: "Where is the bike registered?",
      defaultTone: "info",
      defaultResult: {
        title: "Transfer within 30 days of purchase",
        body: "Pick your case to see the route for your bike.",
      },
      options: [
        {
          label: "Anywhere in Karnataka",
          tone: "ok",
          result: {
            title: "Direct transfer",
            body: "For 2-wheelers, no Clearance Certificate is needed across KA districts. New RC in 18–30 days.",
          },
        },
        {
          label: "Another state",
          tone: "warn",
          result: {
            title: "NOC route",
            body: "You'll need an NOC from the origin state (or the Other-State → KA transfer). We'll guide you.",
          },
        },
        {
          label: "It has an active loan",
          tone: "warn",
          result: {
            title: "Clear the loan first",
            body: "Hypothecation must be terminated with a bank NOC before transfer.",
          },
        },
      ],
    },
    documents: [
      { name: "Original RC", status: "REQUIRED" },
      { name: "Form 29", status: "LANE FILLS THIS" },
      { name: "Form 30", status: "LANE FILLS THIS" },
      { name: "Buyer Address Proof", status: "REQUIRED" },
      { name: "PAN Card", status: "IF APPLICABLE" },
      { name: "Passport Photos x2", status: "REQUIRED" },
      { name: "Valid Insurance", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Bank NOC", status: "IF APPLICABLE" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Challans cleared & documents verified", day: "Day 1-2" },
      { actor: "LANE", desc: "Transfer filed on Parivahan (Forms 29 & 30)", day: "Day 2-4" },
      { actor: "RTO", desc: "RTO processes ownership transfer", day: "Day 4-25" },
      { actor: "DONE", desc: "New RC dispatched within 30 days", day: "Day 18-30" },
    ],
  },

  "rc-fitness-bike": {
    whenApplicable: [
      "Bike crosses 15 years from the date of first registration",
      "RC expires at 15 years — FC check is mandatory for renewal",
      "After the first renewal, every 5 years",
      "Many older bikes in KA have expired FC — Lane also handles backlog FC cases",
    ],
    documentsRequired: [
      "Original RC (book or Smart Card)",
      "Form 25 (RC Renewal + FC application)",
      "Valid Insurance Certificate",
      "Valid PUC Certificate",
      "Address proof",
      "Passport-size photo",
    ],
    process: [
      "Pay FC + RC renewal fees on mParivahan / Parivahan portal",
      "If records are missing from Vahan: 'moto history' correction at the RTO counter first",
      "Get tax clearance at the RTO if pending",
      "Book an inspection date",
      "Take the bike to the RTO / test track for physical inspection (indicators, headlight, horn, brakes)",
      "Inspector signs Form 25 after the physical inspection",
      "Submit file + fee receipt at the RC renewal counter",
      "New Smart Card RC with FC endorsement dispatched",
    ],
    timeline: "18–30 business days",
    pricingNote: "Costing depends on the RC expiry date / age of the vehicle.",
    note: "If the vehicle has illegal modifications, after-market accessories, non-standard wheels or tints, or isn't in good running condition, the RTO may charge additional fees.",
    eligibility: {
      question: "How old is your bike (from first registration)?",
      defaultTone: "info",
      defaultResult: {
        title: "FC applies at 15 years",
        body: "Check your RC for the first-registration date. Pick your case.",
      },
      options: [
        {
          label: "Under 15 years",
          tone: "info",
          result: {
            title: "Not needed yet",
            body: "A fitness certificate is required only once the bike turns 15.",
          },
        },
        {
          label: "15 years or older",
          tone: "ok",
          result: {
            title: "FC required",
            body: "Lane handles the physical inspection and RC renewal — 18–30 days.",
          },
        },
        {
          label: "Records are missing / FC lapsed",
          tone: "ok",
          result: {
            title: "Backlog handled too",
            body: "Lane fixes the history/backlog first, then completes the FC — 18–30 days.",
          },
        },
      ],
    },
    documents: [
      { name: "Original RC", status: "REQUIRED" },
      { name: "Form 25", status: "LANE FILLS THIS" },
      { name: "Valid Insurance", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Address Proof", status: "REQUIRED" },
      { name: "Passport Photo", status: "REQUIRED" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Backlog/history checked & docs verified", day: "Day 1-3" },
      { actor: "LANE", desc: "FC + RC renewal fees paid", day: "Day 3-5" },
      { actor: "YOU", desc: "Bring bike for RTO inspection", day: "Day 5-10" },
      { actor: "RTO", desc: "FC endorsed & RC renewed", day: "Day 10-25" },
      { actor: "DONE", desc: "New Smart Card RC dispatched", day: "Day 18-30" },
    ],
  },

  "rc-transfer-other-state-bike": {
    whenApplicable: [
      "Vehicle registered in another Indian state and the owner has relocated to Karnataka",
      "Must be re-registered in KA within 11 months (legal requirement)",
      "Road tax must be paid to KA; a refund can be claimed from the original state",
      "Vehicle must pass fitness / inspection in Karnataka",
    ],
    documentsRequired: [
      "NOC (Form 28) from original state RTO",
      "Road Tax Clearance Certificate from original state",
      "Original RC (original state)",
      "Valid Insurance",
      "Valid PUC Certificate",
      "Chassis + engine pencil prints",
      "Address proof in Karnataka (Aadhaar / rental agreement)",
      "PAN card / Form 60",
      "Demand Draft for road tax (payable to RTO Karnataka)",
      "For a refund from the original state: original road tax receipt + NOC to original RTO",
    ],
    process: [
      "Apply for NOC (Form 28) at the original state RTO (can often be done online via Parivahan)",
      "Once the NOC is received, come to the Bengaluru RTO",
      "Apply on Parivahan → Vehicle Services → Re-registration in new state",
      "Submit the complete document file at the KA RTO",
      "Pay road tax (Demand Draft)",
      "Vehicle inspection by the MVI",
      "Obtain a new KA registration number (KA-XX series)",
      "Get HSRP plates fitted",
      "New RC dispatched with the KA registration",
    ],
    timeline: "30–45 days (depends on timely submission and inspection)",
    pricingNote:
      "Costing depends on the NOC from origin state, age of the vehicle, and invoice value. Road tax and re-registration fees are calculated on these factors.",
    note: "",
    eligibility: {
      question: "How long since you moved to Karnataka?",
      defaultTone: "info",
      defaultResult: {
        title: "Re-register within 11 months",
        body: "This is a legal requirement for out-of-state vehicles. Pick your case.",
      },
      options: [
        {
          label: "Within 11 months",
          tone: "ok",
          result: {
            title: "You're within the window",
            body: "Lane handles NOC, KA road tax, inspection, and re-registration — 30–45 days.",
          },
        },
        {
          label: "Over 11 months",
          tone: "warn",
          result: {
            title: "Overdue — but fixable",
            body: "Past the 11-month limit. Contact us and we'll still help sort it.",
          },
        },
        {
          label: "Just planning the move",
          tone: "info",
          result: {
            title: "Start with the NOC",
            body: "You'll first need an NOC (Form 28) from your origin state. We can guide the sequence.",
          },
        },
      ],
    },
    documents: [
      { name: "NOC (Form 28)", status: "REQUIRED" },
      { name: "Road Tax Clearance", status: "REQUIRED" },
      { name: "Original RC", status: "REQUIRED" },
      { name: "Valid Insurance", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Chassis & Engine Prints", status: "REQUIRED" },
      { name: "Karnataka Address Proof", status: "REQUIRED" },
      { name: "PAN / Form 60", status: "REQUIRED" },
      { name: "Road Tax Demand Draft", status: "REQUIRED" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "NOC obtained from origin state", day: "Day 1-10" },
      { actor: "LANE", desc: "Re-registration filed at KA RTO", day: "Day 10-15" },
      { actor: "YOU", desc: "Vehicle inspection + road tax paid", day: "Day 15-25" },
      { actor: "RTO", desc: "New KA registration + HSRP issued", day: "Day 25-40" },
      { actor: "DONE", desc: "New RC dispatched", day: "Day 30-45" },
    ],
  },

  "non-migration-certificate-bike": {
    whenApplicable: [
      "Vehicle has an expired NOC from another state and the owner is now staying in Karnataka",
      "Required to regularise vehicle registration when the NOC from the original state has lapsed",
    ],
    documentsRequired: [
      "Expired NOC from original state",
      "Original RC",
      "Active Insurance Certificate",
      "Valid PUC Certificate",
      "Aadhaar card",
    ],
    process: [
      "Lane reviews the expired NOC and original RC to assess the case",
      "Compile all required documents",
      "Apply at the relevant Bengaluru RTO for a Non-Migration Certificate",
      "Submit documents at the RTO counter",
      "Lane follows up and collects the Non-Migration Certificate",
      "Certificate enables subsequent services (re-registration, transfer, etc.) to proceed",
    ],
    timeline: "Depends on RTO and vehicle specifics",
    note: "",
    eligibility: {
      question: "What's the status of your origin-state NOC?",
      defaultTone: "info",
      defaultResult: {
        title: "For lapsed NOCs",
        body: "A Non-Migration Certificate regularises a bike whose origin-state NOC has expired. Pick your case.",
      },
      options: [
        {
          label: "My NOC has expired",
          tone: "ok",
          result: {
            title: "Exactly this service",
            body: "Lane files for the Non-Migration Certificate at the Bengaluru RTO and collects it for you.",
          },
        },
        {
          label: "My NOC is still valid",
          tone: "info",
          result: {
            title: "You may not need this",
            body: "A valid NOC usually lets you re-register directly. We'll confirm your case.",
          },
        },
        {
          label: "I never received an NOC",
          tone: "warn",
          result: {
            title: "Sort the NOC first",
            body: "You'll likely need the NOC/transfer route first. Contact us and we'll map it out.",
          },
        },
      ],
    },
    documents: [
      { name: "Expired NOC", status: "REQUIRED" },
      { name: "Original RC", status: "REQUIRED" },
      { name: "Valid Insurance", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Aadhaar Card", status: "REQUIRED" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Expired NOC & RC reviewed", day: "Day 1-2" },
      { actor: "LANE", desc: "Application filed at Bengaluru RTO", day: "Day 2-5" },
      { actor: "RTO", desc: "RTO processes the certificate", day: "Day 5-20" },
      { actor: "DONE", desc: "Non-Migration Certificate handed over", day: "Day 15-25" },
    ],
  },

  "noc-2w-other-state": {
    whenApplicable: [
      "Owner wishes to re-register their 2-wheeler from Karnataka to another Indian state",
      "NOC from the Karnataka RTO is a mandatory prerequisite before re-registration in the new state",
      "Applies when the owner is permanently relocating to another state",
    ],
    documentsRequired: [
      "Original RC",
      "Aadhaar card",
      "Valid Insurance Certificate",
      "Valid PUC Certificate",
      "Invoice / purchase receipt of the vehicle",
      "Pencil print of chassis number",
      "Pencil print of engine number",
    ],
    process: [
      "Verify no pending challans or dues on Parivahan",
      "Apply for NOC (Form 28) on Parivahan → Vehicle Services → NOC",
      "Upload all required documents",
      "Pay fee online",
      "Lane visits the KA RTO for physical submission and approvals where needed",
      "NOC (Form 28) issued and handed over to the customer",
      "Customer can proceed with re-registration in the new state",
    ],
    timeline: "18–30 business days",
    note: "",
    eligibility: {
      question: "Why do you need the NOC?",
      defaultTone: "info",
      defaultResult: {
        title: "NOC before re-registration",
        body: "A Karnataka NOC is mandatory before re-registering your bike in another state. Pick your case.",
      },
      options: [
        {
          label: "Relocating my bike to another state",
          tone: "ok",
          result: {
            title: "Right service",
            body: "Lane checks for pending challans and files Form 28 — 18–30 days.",
          },
        },
        {
          label: "There are pending challans",
          tone: "warn",
          result: {
            title: "Clear dues first",
            body: "Pending dues must be cleared before the NOC is issued. Lane verifies these on Parivahan.",
          },
        },
        {
          label: "Just selling within Karnataka",
          tone: "info",
          result: {
            title: "No NOC needed",
            body: "A same-state sale doesn't need an NOC — see ‘RC Name Transfer’ instead.",
          },
        },
      ],
    },
    documents: [
      { name: "Original RC", status: "REQUIRED" },
      { name: "Aadhaar Card", status: "REQUIRED" },
      { name: "Valid Insurance", status: "REQUIRED" },
      { name: "Valid PUC", status: "REQUIRED" },
      { name: "Purchase Invoice", status: "REQUIRED" },
      { name: "Chassis & Engine Prints", status: "REQUIRED" },
    ],
    howItWorks: [
      { actor: "LANE", desc: "Challans checked & documents verified", day: "Day 1-2" },
      { actor: "LANE", desc: "Form 28 (NOC) filed on Parivahan", day: "Day 2-4" },
      { actor: "RTO", desc: "RTO approves the NOC", day: "Day 4-25" },
      { actor: "DONE", desc: "NOC handed over to you", day: "Day 18-30" },
    ],
  },

  "rc-address-change-bike": {
    whenApplicable: [
      "Vehicle owner has moved to a new address within Bengaluru city limits",
      "Address on the RC needs to be updated to reflect the current address",
    ],
    documentsRequired: [
      "Current address proof (govt.-issued ID with new address: Aadhaar / Voter ID / Passport / utility bill)",
    ],
    process: [
      "Verify current details on Vahan / Parivahan portal",
      "Apply on Parivahan → Vehicle Services → Change of Address",
      "Upload new address proof",
      "Pay fee online",
      "Lane submits the application and visits the RTO for approvals as needed",
      "Updated RC dispatched by Speed Post to the new address",
    ],
    timeline: "18–30 business days",
    note: "",
    eligibility: {
      question: "Where's your new address?",
      defaultTone: "info",
      defaultResult: {
        title: "For moves inside Bengaluru",
        body: "This updates your bike's RC address within the city. Pick your case.",
      },
      options: [
        {
          label: "Within Bengaluru city",
          tone: "ok",
          result: {
            title: "Covered",
            body: "Lane updates the RC address on Parivahan and dispatches the updated RC — 18–30 days.",
          },
        },
        {
          label: "A different city in Karnataka",
          tone: "warn",
          result: {
            title: "May involve a zone transfer",
            body: "Contact us — we'll confirm whether a transfer between RTO zones is needed.",
          },
        },
        {
          label: "Another state",
          tone: "warn",
          result: {
            title: "NOC + re-registration",
            body: "An out-of-state move needs an NOC and re-registration, not just an address change.",
          },
        },
      ],
    },
    documents: [{ name: "New Address Proof", status: "REQUIRED" }],
    howItWorks: [
      { actor: "LANE", desc: "New address proof verified", day: "Day 1" },
      { actor: "LANE", desc: "Address change filed on Parivahan", day: "Day 1-3" },
      { actor: "RTO", desc: "RTO processes the update", day: "Day 3-25" },
      { actor: "DONE", desc: "Updated RC dispatched by post", day: "Day 18-30" },
    ],
  },
};

// Safe lookup so a bad/unknown slug never crashes the detail page.
export const getServiceContent = (slug) => rtoServiceContent[slug] || null;

export default rtoServiceContent;
