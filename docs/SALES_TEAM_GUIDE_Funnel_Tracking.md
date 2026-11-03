# Funnel Tracking: Sales Team Guide

*For: Sales and Operations team. No technical knowledge needed.*

---

## 1. What is this, in one minute?

When someone visits the InLane website, they go through steps before they pay for a driving course. Example: they land on the homepage, enter their area, pick a course, leave their phone number, choose a slot, and pay.

**Funnel tracking** is a quiet counter that notes how far each visitor gets. It answers questions like:

- How many people visited the homepage this week?
- How many left their phone number?
- At which step do most people drop off?
- Which ad or campaign brings people who actually book?

**Nothing changes for the customer.** They see the same website and forms. Nothing slows down or asks for more details.

---

## 2. The customer journey (and what we count)

| # | Step the customer takes | What we record |
|---|---|---|
| 1 | Opens the homepage | Homepage viewed |
| 2 | Clicks **"Talk to an expert"** | Expert contact requested |
| 3 | Enters their area or locality | Location entered (and whether we serve it) |
| 4 | Says whether they already have a licence | Licence status selected |
| 5 | Sees the list of courses | Course list viewed |
| 6 | Tries to see prices (this asks for their details) | Price unlock attempted |
| 7 | Closes the details form without submitting | Form dismissed |
| 8 | **Submits the form with name and phone** | **Lead captured** |
| 9 | Sees available time slots | Slots viewed |
| 10 | Picks a slot | Slot selected |
| 11 | Chooses a course | Course selected |
| 12 | Opens the plan and payment page | Plan page viewed |
| 13 | Chooses full payment or first half | Payment option selected |
| 14 | Starts paying, then pays or fails | Payment started, succeeded or failed |
| 15 | Booking confirmed | Booking confirmed |

Steps 8 and 14-15 are recorded by our server, not the visitor's browser. That means they are reliable and can't be faked or missed because a browser closed early.

---

## 3. What happens when a customer submits a lead form

There are two lead forms on the site:

1. **The popup** on the homepage.
2. **The Signup page** (`/signup`), reached from "Talk to an expert".

When the customer presses Submit:

1. **The lead is saved to our funnel database.** We record who they are, their area, whether they have a licence, and which campaign or ad brought them.
2. **The lead is sent to Cratio (CRM) and Google Sheets**, as before. You see it in the same places you always have.
3. **A "Lead captured" mark is added** to the customer's journey, so we can connect "came from ad X" to "paid for course Y".
4. **The customer goes to the Thank You page.**

### Safety net
If our server can't reach Cratio or Google Sheets for any reason, the customer's browser **sends the lead the old way**. A lead should not be lost because of a technical hiccup.

### Duplicates
If the same person presses Submit twice, or their internet retries, they are recorded **once**. Counts stay clean.

---

## 4. Where do the leads come from? (Campaign tracking)

If a customer arrives from a link with campaign details, for example a Google or Meta ad, the site remembers:

- **Source** (e.g. google, facebook)
- **Medium** (e.g. cpc, social)
- **Campaign name**
- **Ad content / keyword**

It keeps both the **first** campaign that brought them and the **latest** one. Even if someone first clicks an ad, leaves, and returns two days later directly, we still know the ad that started it.

**Tip for marketing:** always use links with campaign tags (UTM tags). A link with no tags shows up as "direct / unknown".

---

## 5. Privacy: what we do not store

- Phone number and email are kept **only in the lead record**, not in the event log.
- We do **not** store exact map coordinates or the raw text a customer typed in the address box. We store only the area name.
- Customers are tracked by a random session code, not by their name.
- Technical logs contain no phone numbers or emails.

---

## 6. How to read the numbers

Reports are produced by the technical team from the file `docs/funnel_metrics.sql`. Ask them for any of these:

| Report | What it tells you |
|---|---|
| **Funnel step counts** | How many unique visitors reached each step in the last 30 days. Also the % of homepage visitors, and the % who continued from the previous step. |
| **Leads by source and day** | Which campaigns produce leads each day. |
| **Lead-to-booking** | Of the people who left their number, how many booked. |
| **Delivery health** | Whether leads reached Cratio, or any are stuck. |

### How to interpret a drop-off
- **Big drop between homepage and area entered:** the homepage message or button isn't pulling people in.
- **Big drop at "price unlock" and form:** people don't want to share their number. Consider a clearer reason to do so.
- **Lead captured but no slots viewed:** the follow-up call or message may be slow, or there are no slots in their area.
- **Slots viewed but no slot selected:** not enough availability or inconvenient timings.
- **Payment started but not successful:** payment problems. Check the gateway.

---

## 7. What is not tracked yet

- The Thank You page has no funnel event of its own. It uses the existing separate Thank You tracking pipeline.
- Reports are not on a dashboard yet. They are run on request.
- Calls made by the sales team are not part of this funnel. Only website behaviour is.

---

## 8. FAQ

**Will this slow the website or break forms?**
No. Tracking runs in the background. If it fails, the customer never notices and the form still works.

**A customer says they submitted but I can't find them.**
Search Cratio and the Google Sheet first (same as always). If missing, tell the tech team the phone number and approximate time. They can check the funnel database.

**Can tracking be turned off?**
Yes. The tech team can switch it off with one setting (`VITE_FUNNEL_TRACKING=off`) and redeploy. The forms keep working.

**Why do my numbers differ from Google Analytics?**
Google Analytics counts page views and users in its own way and can be blocked by browsers. Funnel tracking counts unique journeys, and key steps are recorded by our server. Expect differences. Trust the funnel numbers for step-by-step conversion.

**Why is the test data missing or low right now?**
The system is new. Tables started empty and fill as real visitors come. Early numbers are small until traffic is flowing through the updated website.

**Whom do I contact?**
The tech team (Divyansh Pal), for reports, missing leads, or switching tracking off.

---

## 9. One-page cheat sheet

- Customers do nothing differently.
- Every lead is saved once, sent to Cratio and Sheets, and tagged with its campaign.
- If delivery fails, the browser sends it the old way.
- Key steps (lead captured, payment, booking) are recorded by the server.
- Ask tech for the funnel report (`funnel_metrics.sql`).
- Always use tagged campaign links.
