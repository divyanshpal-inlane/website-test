// Focused test: LL Pipeline integration for RTO services
// Tests: create-booking with RTO addon -> payment approval -> LL application created

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://csnzgfzxnscumvjefpon.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbnpnZnp4bnNjdW12amVmcG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjMyODEyMDksImV4cCI6MjAzODg1NzIwOX0.Go70qkJn_MsIjU9QgRy1HbIUGmY-M7wmNg6MU77VaDk";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbnpnZnp4bnNjdW12amVmcG9uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMzI4MTIwOSwiZXhwIjoyMDM4ODU3MjA5fQ.3u9NwGziDxSpyjgZ88tPf-xLcN3XIBKNQkiT5i3VRqc";

const anon = createClient(SUPABASE_URL, ANON_KEY);
const svc = createClient(SUPABASE_URL, SERVICE_KEY);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const testPhone = `900${Date.now().toString().slice(-7)}`;
const testName = `E2E Test ${Date.now()}`;
const IDEMPOTENCY_KEY = `e2e-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const AREA_LAT = 12.9773495;
const AREA_LNG = 77.6364356;

async function invoke(fn, body) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    console.log(`   ${fn} ERROR:`, JSON.stringify(data, null, 2));
    throw new Error(`${fn} error: ${JSON.stringify(data)}`);
  }
  return data;
}

async function run() {
  console.log("=== LL PIPELINE INTEGRATION TEST ===\n");
  
  // 1. CONFIG
  console.log("1. get-booking-config");
  const config = await invoke("get-booking-config", {});
  console.log("   enabled:", config.enabled, "| areas:", config.areas?.length, "| courses:", config.courses?.length);
  if (!config.enabled) throw new Error("Booking disabled");
  const course = config.courses.find(c => c.name === "Comprehensive/Beginner's course");
  if (!course) throw new Error("Course not found");
  console.log("   course:", course.name, "| total_lessons:", course.total_lessons, "| price:", course.price);
  
  // 2. GRID (location mode)
  console.log("\n2. get-booking-slots (location mode)");
  const grid = await invoke("get-booking-slots", {
    latitude: AREA_LAT,
    longitude: AREA_LNG,
    courseId: course.id,
    has_a_DL: true,
    femaleInstructorPreference: false,
  });
  const dates = grid.dates || [];
  console.log("   days:", dates.length, "| total slots:", dates.reduce((sum, d) => sum + (d.slots?.length || 0), 0));
  const firstDate = dates.find(d => d.slots && d.slots.length > 0);
  if (!firstDate) throw new Error("No slots available");
  const firstSlot = firstDate.slots[0];
  console.log("   first slot:", firstDate.date, firstSlot.start, "instructor:", firstSlot.instructorName);
  
  // 3. PLAN
  console.log("\n3. get-booking-slots with firstSlot (plan mode)");
  const plan = await invoke("get-booking-slots", {
    latitude: AREA_LAT,
    longitude: AREA_LNG,
    courseId: course.id,
    has_a_DL: true,
    femaleInstructorPreference: false,
    firstSlot: { date: firstDate.date, start: firstSlot.start },
  });
  console.log("   plan ok:", plan.plan?.ok, "| lessons:", plan.plan?.lessons?.length);
  if (!plan.plan?.ok || !plan.plan?.lessons?.length) throw new Error("Plan generation failed");
  console.log("   instructor:", plan.plan.instructorName, "| lessons:", plan.plan.lessons.map(l => `${l.date} ${l.start_time}-${l.end_time}`).join(", "));
  
  // 4. CREATE BOOKING (holds)
  console.log("\n4. create-booking (reserves all lessons as pending_payment)");
  const createRes = await invoke("create-booking", {
    idempotencyKey: IDEMPOTENCY_KEY,
    courseId: course.id,
    firstSlot: { date: firstDate.date, start: firstSlot.start },
    latitude: AREA_LAT,
    longitude: AREA_LNG,
    locationName: "Indiranagar, Bangalore",
    has_a_DL: true,
    customer: {
      name: testName,
      phone: testPhone,
      email: "e2e-test@example.com",
    },
    addonIds: ["8d500f64-45d4-4b72-8e33-1a4e08df0050"], // rto_4w_ll_dl
  });
  console.log("   bookingId:", createRes.bookingId);
  console.log("   learnerId:", createRes.learnerId);
  console.log("   enrollmentId:", createRes.enrollmentId);
  console.log("   heldSlots:", createRes.heldSlots?.length);
  console.log("   totalAmount:", createRes.totalAmount);
  if (!createRes.bookingId || !createRes.heldSlots?.length) throw new Error("Create booking failed");
  
  // Verify held slots in DB
  const { data: holds } = await svc.from("Schedule")
    .select("id, status, enabled, date, start_time, end_time, instructor_id")
    .eq("booking_id", createRes.bookingId)
    .order("id");
  console.log("   DB holds:", holds?.length, "| statuses:", [...new Set(holds?.map(h => h.status))]);
  if (holds?.some(h => h.status !== "pending_payment")) throw new Error("Holds not pending_payment");
  
  // 4. PAYMENT (test mode)
  console.log("\n5. create-razorpay-order (test mode)");
  const totalAmount = createRes.amounts?.total || createRes.totalAmount;
  const order = await invoke("create-razorpay-order", {
    learnerId: createRes.learnerId,
    courseId: course.id,
    amount: totalAmount,
    paymentType: "custom",
    name: testName,
    phone: testPhone,
    email: "e2e-test@example.com",
    installmentType: "full",
    totalAmount,
    installment1Amount: totalAmount,
    installment2Amount: 0,
  });
  console.log("   orderId:", order.orderId, "| testMode:", order.testMode);
  if (!order.orderId || !order.testMode) throw new Error("Order creation failed");
  
  // 5. COMPLETE PAYMENT
  console.log("\n6. Complete payment (via service role)");
  await new Promise(r => setTimeout(r, 500));
  console.log("   Updating payment status...");
  const paymentUpdate = await svc
    .from("payment")
    .update({ status: "completed", gateway_reference: `pay_test_${Date.now()}` })
    .eq("id", order.paymentId);
  console.log("   Payment update result:", paymentUpdate);
  if (paymentUpdate.error) throw paymentUpdate.error;
  
  console.log("   Updating enrollment...");
  const enrollmentUpdate = await svc
    .from("enrollment")
    .update({ payment_id: order.paymentId, payment_status: "full_paid", status: "active", unlocked_lessons: `{1,2,3,4,5,6,7,8,9,10}` })
    .eq("id", createRes.enrollmentId);
  console.log("   Enrollment update result:", enrollmentUpdate);
  if (enrollmentUpdate.error) throw enrollmentUpdate.error;
  
  console.log("   payment completed (via service role)");
  
  // Check if LL application was created for RTO services
  console.log("\n7. Checking if LL application was created for RTO services...");
  await new Promise(r => setTimeout(r, 1000));
  const { data: llApps, error: llErr } = await svc
    .from("ll_applications")
    .select("*")
    .eq("learner_id", createRes.learnerId)
    .not("status", "in", "('dl_delivered','closed')");
  if (llErr) {
    console.log("   Error checking LL applications:", llErr);
  } else {
    console.log("   LL applications found:", llApps?.length || 0);
    if (llApps && llApps.length > 0) {
      llApps.forEach(app => {
        console.log("   - App ID:", app.id, "| Services:", app.services, "| Status:", app.status);
      });
      console.log("\n=== TEST PASSED ===");
      console.log("LL Pipeline integration WORKING!");
    } else {
      console.log("\n=== TEST FAILED ===");
      console.log("No LL application created for RTO services");
      process.exit(1);
    }
  
  // CLEANUP
  console.log("\n=== CLEANUP ===");
  const cleanupResults = await Promise.allSettled([
    svc.from("Schedule").delete().eq("booking_id", createRes.bookingId),
    svc.from("enrollment").delete().eq("id", createRes.enrollmentId),
    svc.from("payment").delete().eq("gateway_reference", order.orderId),
    svc.from("booking").delete().eq("id", createRes.bookingId),
    svc.from("Learner").delete().eq("id", createRes.learnerId),
  ]);
  console.log("Cleanup results:", cleanupResults.map(r => r.status).join(", "));
  console.log("Cleanup done.");
}

run().catch(e => {
  console.error("\n=== TEST FAILED ===");
  console.error(e.message);
  console.error(e.stack);
  process.exit(1);
});