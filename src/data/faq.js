const faqData = [
 
  {
    question: "What services does Lane Driving School offer in Bangalore?",
    answer: "Lane Driving School offers beginner 4-Wheeler driving lessons, refresher courses, RTO assistance, and both 4- Wheeler and 2-Wheeler license test preparation in Bangalore. Training is provided in manual cars, or in your own car if preferred.",
    category: "General Driving School Information"
  },
  {
    question: "Where are Lane’s driving training centers located in Bangalore?",
    answer: "Lane operates from MG Road, near Trinity Circle Metro Station at Capsule Workspace, and offers doorstep driving lessons across Bangalore. Our certified instructors train learners at their location, with online RTO assistance and minimal in-office visits.",
    category: "General Driving School Information"
  },
  {
    question: "Does Lane Driving School provide online driving theory classes or only in-person sessions?",
    answer: "Lane Driving School provides only practical driving classes. For theory, learners get access to interactive digital modules, short videos, and gamified content designed to build strong driving knowledge at their own pace.",
    category: "General Driving School Information"
  },
  {
    question: "Are Lane's driving instructors certified and background-verified?",
    answer: "Yes, Lane’s instructors undergo thorough assessments evaluating their training skills, patience, communication, and multilingual abilities. They also pass strict background checks to ensure learner safety. Afterward, instructors are trained to follow our standardized curriculum.",
    category: "General Driving School Information"
  },
  {
    question:"Why should I choose Lane over other driving schools in Bangalore?",
    answer:"Lane Driving School offers a structured, curriculum-based learning experience tailored to each learner’s skill level. Our certified instructors are trained for clarity, patience, and safety, with verified backgrounds. Each class follows a clear agenda, and learners receive pre-reads, short videos, and interactive gaming modules in advance—so the learner can come prepared and make the most out of the practical sessions.",
    category: "General Driving School Information"
  },
  {
    question: "What are the benefits of choosing Lane Driving School?",
    answer: "Lane Driving School offers a structured, curriculum-based learning experience tailored to each learner’s skill level. Our certified instructors are trained for clarity, patience, and safety, with verified backgrounds. Each class follows a clear agenda, and learners receive pre-reads, short videos, and interactive gaming modules in advance—so the learner can come prepared and make the most out of the practical sessions.",
    category: "General Driving School Information"
  },
  {
    question:"What types of car driving courses does Lane Driving School offer?",
    answer:"Lane Driving School in Bangalore offers beginner and refresher-level car driving courses using manual transmission hatchback cars. Learners can also opt to train in their own vehicles. All sessions are customized and conducted at the learner’s location, ensuring a convenient and personalized experience.",
    category: "Course & Training Details",
  },
  {
    question: "How long does it take to complete a standard driving course at Lane?",
    answer: "Lane’s standard beginner driving course takes 10 days, covering both basic and advanced driving skills. We also offer refresher courses tailored to needs like city traffic driving, flyover driving, slope handling, and parking in narrow spaces, with flexible durations based on the learner’s goals.For more details, visit our <a href='https://inlane.in/courses' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>https://inlane.in/courses</a>",
    category: "Course & Training Details",
  },
  {
    question: "Can I customize my driving lessons based on my skill level and schedule?",
    answer: "Yes, Inlane offers fully customizable driving lessons tailored to your skill level, learning pace, and schedule. Whether you’re a beginner or need advanced training, our flexible sessions ensure convenient, personalized coaching that fits your needs.For any suggestions or support, you can contact us at <a href='mailto:team@inlane.in' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>team@inlane.in</a> or call <a href='tel:+919611687011' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>+91 96116 87011</a>.",
    category: "Course & Training Details",
  },
  {
    question: "How can I track my driving progress during my course with Lane?",
    answer: "Lane Driving School provides regular feedback from certified instructors after each session to help you track your progress. Additionally, our online dashboard allows you to monitor completed lessons, upcoming schedules, and personalized recommendations to improve your driving skills.",
    category: "Course & Training Details",
  },
  {
    question: "What is the pricing structure for car driving lessons at Lane Bangalore?",
    answer: "The beginner car driving course at Lane, including driving license assistance, is priced at ₹10,000. Refresher course fees vary based on the learner’s specific requirements and the number of hours needed. For personalized pricing details, you can contact us at <a href='mailto:team@inlane.in' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>team@inlane.in</a> or call <a href='tel:+919611687011' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>+91 96116 87011</a>.",
    category: "Pricing, Payments & Refunds",
  },
  {
    question: "Are there any ongoing referral rewards at Lane Driving School?",
    answer: "When a learner refers to a friend who also enrolls for a course in Lane Driving School, the referring learner receives a referral discount of ₹500.To get started, sign up here:<a href='https://inlane.in/signup' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>https://inlane.in/signup</a>",
    category: "Pricing, Payments & Refunds",
  },
  {
    question: "What payment methods are accepted for Lane driving courses?",
    answer: "Lane Driving School accepts multiple payment methods for driving courses, including UPI, credit cards, debit cards, and net banking. This flexibility ensures a convenient and secure payment experience for all learners.",
    category: "Pricing, Payments & Refunds",
  },
  {
    question: "Does Lane Driving School offer EMI options for driving lessons?",
    answer: "Yes, Lane Driving School provides a 2-installment payment option for courses with driving license assistance. The first half of the fee is paid during onboarding, and the second half after the learner receives their learner’s license and completes two driving classes.",
    category: "Pricing, Payments & Refunds",
  },
  {
    question: "How do I book a driving lesson online with Lane Driving School Bangalore?",
    answer: "To book a driving lesson with Lane School, simply sign up using our online form or contact us via call or WhatsApp at +91 9611687011. If you have a valid learner’s or driving license, you can directly schedule a demo session. After payment, we confirm your availability and provide your driving instructor details along with a personalized lesson plan aligned with our structured curriculum.",
    category: "Booking & Scheduling",
  },
  {
    question: "Can I reschedule a booked driving lesson at Lane Driving School?",
    answer: "Yes, you can reschedule your driving lesson at Lane School for free if done at least 24 hours in advance. For last-minute changes (within 24 hours), a rescheduling fee of ₹300 will apply.This policy helps ensure our instructors can manage their schedules efficiently and provide the best learning experience for all students. To make any changes, please contact our Operations team directly—instructors are not authorized to handle scheduling requests.",
    category: "Booking & Scheduling",
  },
  {
    question: "What happens if I miss a scheduled driving class with Lane Driving School?",
    answer: "If you miss a scheduled driving class at Lane School without prior notice, it will be marked as a no-show. To reschedule the same lesson, a penalty of ₹300 will be applicable.This policy ensures that our instructors' time is respected and schedules run smoothly for all learners. For rescheduling a missed class, please contact our Operations team directly—instructors cannot process such requests.",
    category: "Booking & Scheduling",
  },
  {
    question: "Can I choose my preferred time slot and days when booking a driving lesson at Lane Driving School Bangalore?",
    answer: "Yes, Lane Driving School offers flexible scheduling for learners. You can choose your preferred time slots and days for your driving lessons while filling out the Onboarding Form. You can also mention any dates or days you’d like to avoid. Our Operations team will review your preferences and get in touch to finalize a personalized schedule and lesson plan that works best for you.",
    category: "Booking & Scheduling",
  },
  {
    question: "Does Lane School help with the learner's driving license application process?",
    answer: "Yes, Inlane offers complete end-to-end support for your driving license application—from Learner's License (LL) to Driving License (DL). Our license process is 100% online. We collect your documents digitally and connect with you over a Google Meet, during which our team enters the required details directly on the government portal. You'll simply need to verify the information before submission.",
    category: "License & Government Procedures",
  },
  {
    question: "What documents are required to apply for a driving license in Bangalore?",
    answer: "The documents required for a driving license in Bangalore depend on your current license status: If you already hold a valid 2-wheeler driving license (DL) from Bangalore, we can use that to directly apply for your 4-wheeler DL. If you don't have any existing license, you'll need to submit a government-issued ID proof (like Aadhaar, PAN, etc.) and address proof (such as rental agreement, utility bill, etc.). If you don't have address proof from Bangalore, we'll help you apply through a self-affidavit, enabling you to still get your driving license issued from Bangalore. Lane handles the entire online documentation and application process to make it seamless for you.",
    category: "License & Government Procedures",
  },
  {
    question: "Does Lane Driving School assist with RTO test preparation and appointments?",
    answer: "Yes, Lane provides complete support for both Learner's License (LL) and Driving License (DL) test preparation and appointments. For the LL test, we offer optimized gaming modules and pre-reads to help you prepare effectively. For the DL test, we schedule a dedicated driving session focused on RTO track training and test simulation. We also assist in booking your DL appointment slot with the RTO. Our goal is to ensure you're fully confident and prepared for your RTO test experience.",
    category: "License & Government Procedures",
  },
  {
    question: "How long does it take to get a permanent driving license in Bangalore?",
    answer: "The entire process takes about 1.5 to 2 months, depending on RTO schedules. Learner's License (LL): After passing the LL test, the license is typically issued within 7 working days. Mandatory Waiting Period: Applicants must hold the LL for at least 30 days before applying for the Driving License (DL) test. Driving License (DL): After clearing the DL test, the permanent license is usually delivered within 7 to 15 working days. At Lane Driving School, we handle the full process—LL to DL—with smooth coordination and end-to-end support.",
    category: "License & Government Procedures",
  },
  {
    question: "What's the difference between a learner's license and a permanent license in India?",
    answer: "A Learner's License (LL) is a temporary permit valid for 6 months, allowing you to practice driving under the supervision of someone with a valid Driving License. A Permanent License (DL) is issued after you pass the RTO driving test and allows you to drive independently on public roads. At Lane Driving School, we guide you through both LL and DL steps with complete support.",
    category: "License & Government Procedures",
  },
  {
    question: "Who is eligible to enroll in driving lessons at Inlane Driving School?",
    answer: "Anyone 18 years or older can join our 4-wheeler driving classes. If you don't have a license, we help you get a Learner's License (LL) first. If you already have an LL or DL, you can directly enroll and begin classes. At Lane Driving School, we make it easy for both beginners and licensed drivers to start learning confidently.",
    category: "Eligibility & Requirements",
  },
  {
    question: "What is the minimum legal age to start learning to drive a 4 Wheeler in India?",
    answer: "To learn 4-wheeler driving in India, you must be at least 18 years old. At Lane Driving School, we assist eligible learners with: The Learner's License (LL) process: from document collection to online submission. The Driving License (DL) process: including RTO test prep, track practice, and appointment booking. We ensure a smooth journey from LL to DL for first-time drivers.",
    category: "Eligibility & Requirements",
  },
  {
    question: "Do I need any prior experience to join Inlane's beginner driving course?",
    answer: "No, you don't need any prior driving experience. Inlane's courses are designed for both first-time learners and those looking to restart their driving journey. Based on your current skill level, you can enroll in either the Beginner or Refresher course. We also assist new learners with the Learner's License (LL) and Driving License (DL) process from start to finish. Stuck choosing? Contact <a href='mailto:team@inlane.in' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>team@inlane.in</a> or call <a href='tel:+919611687011' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>+91 96116 87011</a>.",
    category: "Eligibility & Requirements",
  },
  {
    question: "What should I bring to my first driving lesson at Lane Driving School?",
    answer: "You'll need to carry your Learner's License (LL) or Driving License (DL)—either a printed copy or a digital version from DigiLocker or mParivahan. Wear comfortable footwear (avoid slippers) and comfortable clothing to ensure ease of movement during your lesson. If your LL is still in process, our operations team will coordinate and schedule your lessons accordingly.",
    category: "Eligibility & Requirements",
  },
  {
    question: "What types of vehicles does Lane Driving School use for driving instruction?",
    answer: "Lane Driving School trains learners exclusively in manual hatchbacks, as per RTO rules that require the DL test to be taken in a manual vehicle—automatic cars aren't allowed. Learning manual driving builds essential skills like gear and clutch control. It also makes switching to automatic easy, while the reverse isn't true. Hatchbacks are compact and ideal for beginners and learners.",
    category: "Safety & Vehicle Details",
  },
  {
    question: "Are Lane's training vehicles fully insured and road-safe?",
    answer: "Yes, all of Lane Driving School's training vehicles are fully insured, regularly maintained, and thoroughly road-tested to ensure complete safety during every lesson. We prioritize learner safety by adhering to all RTO regulations and using only well-equipped, road-ready manual hatchbacks for training.",
    category: "Safety & Vehicle Details",
  },
  {
    question: "What safety protocols does Lane Driving School follow during in-car training sessions?",
    answer: "Lane Driving School ensures safety with fully insured, well-maintained vehicles equipped with dual controls. Our instructors are trained in defensive driving and follow all RTO safety norms, creating a secure and confident learning environment.",
    category: "Safety & Vehicle Details",
  },
  {
    question: "Who are the certified driving instructors at Lane Driving School Bangalore?",
    answer: "Our certified instructors at Lane Driving School Bangalore are professionally trained experts, vetted through strict background checks. They are skilled in effective communication, patient teaching, and defensive driving techniques to ensure a safe and supportive learning environment for all learners.",
    category: "Instructor-Related Questions",
  },
  {
    question: "What qualifications and experience do Inlane instructors have?",
    answer: "All Lane Driving School instructors have at least 5 years of driving experience and are certified professionals trained in defensive driving. They undergo thorough background checks and are regularly trained to follow our structured curriculum, with frequent audit classes to ensure consistent, high-quality teaching tailored to each learner.",
    category: "Instructor-Related Questions",
  },
  {
    question: "Do Lane Driving School instructors speak multiple languages?",
    answer: "Yes, Lane Driving School instructors are selected for their ability to speak multiple languages such as Kannada, Hindi, Tamil, Telugu, Malayalam. Along with these, they also understand and communicate in basic English to ensure clear and effective lessons for learners from diverse backgrounds.",
    category: "Instructor-Related Questions",
  },

  // Corporate & Bulk Training
  {
    question: "Does Lane Driving School offer corporate driving training for delivery or fleet drivers?",
    answer: "Yes, Lane Driving School provides specialized corporate driving training programs for delivery personnel and fleet drivers. Our courses focus on safety, defensive driving, and efficient driving practices tailored to business requirements. For corporate training inquiries, please write to us at <a href='mailto:team@inlane.in' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>team@inlane.in</a>",
    category: "Corporate & Bulk Training",
  },
  {
    question: "How can companies partner with Lane for employee driving lessons?",
    answer: "Companies can partner with Lane by writing to us at <a href='mailto:team@inlane.in' style='color: #2563eb; text-decoration: underline; font-weight: 500;'>team@inlane.in</a>. We offer tailored driving training programs that can be included as part of employee benefit initiatives—promoting road safety, confidence, and skill-building for your workforce.",
    category: "Corporate & Bulk Training",
  },

  // Legal, Policies & Support
  {
    question: "What is Lane's privacy policy for user data and personal information?",
    answer: `Lane Driving School respects your privacy and protects your personal data. We collect and use your information only to provide and improve our services, following strict security and legal standards. Read the full policy here: <a href="https://inlane.in/privacy-policy" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: 500;">https://inlane.in/privacy-policy</a>.`,
    category: "Legal, Policies & Support",
  },
  {
    question: "Where can I find Lane's terms and conditions for service use?",
    answer: `You can review Lane's full terms and conditions <a href="https://inlane.in/terms-and-conditions" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline font-medium">https://inlane.in/terms-and-conditions</a>.`,
    category: "Legal, Policies & Support",
  },
  {
    question: "How do I contact Lane's customer support team for help or queries?",
answer: `You can reach Lane's customer support by phone or WhatsApp at <a href="tel:+919611687011" style="color: #2563eb; text-decoration: underline; font-weight: 500;">+91 96116 87011</a> or email us at <a href="mailto:team@inlane.in" style="color: #2563eb; text-decoration: underline; font-weight: 500;">team@inlane.in</a>. We're here to assist you with any questions or support you need.`,
    category: "Legal, Policies & Support",
  },
  
  
];

export default faqData;
