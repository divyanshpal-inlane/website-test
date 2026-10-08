// LL Pipeline Integration Test
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://csnzgfzxnscumvjefpon.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbnpnZnp4bnNjdW12amVmcG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjMyODEyMDksImV4cCI6MjAzODg1NzIwOX0.Go70qkJn_MsIjU9QgRy1HbIUGmY-M7wmNg6MU77VaDk';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbnpnZnp4bnNjdW12amVmcG9uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMzI4MTIwOSwiZXhwIjoyMDM4ODU3MjA5fQ.3u9NwGziDxSpyjgZ88tPf-xLcN3XIBKNQkiT5i3VRqc';

const anon = createClient(SUPABASE_URL, ANON_KEY);
const svc = createClient(SUPABASE_URL, SERVICE_KEY);

const testPhone = '900' + Date.now().toString().slice(-7);
const testName = 'E2E Test ' + Date.now();
const IDEMPOTENCY_KEY = 'e2e-' + Date.now() + '-' + Math.random().toString(36).slice(2,10);
const AREA_LAT = 12.9773495;
const AREA_LNG = 77.6364356;

async function invoke(fn, body) {
  const response = await fetch('https://csnzgfzxnscumvjefpon.supabase.co/functions/v1/' + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(fn + ' error: ' + JSON.stringify(data));
  return data;
}

async function run() {
  console.log('=== LL PIPELINE INTEGRATION TEST ===\n');
  
  const config = await invoke('get-booking-config', {});
  console.log('1. Config OK, areas:', config.areas?.length);
  const course = config.courses.find(c => c.name === "Mini Course - Flyover");
  if (!course) throw new Error('Course not found');
  
  const grid = await invoke('get-booking-slots', {
    latitude: 12.9773495, longitude: 77.6364356, courseId: course.id, has_a_DL: true, femaleInstructorPreference: false
  });
  console.log('Grid response:', JSON.stringify(grid, null, 2));
  const firstDate = grid.dates.find(d => d.slots && d.slots.length > 0);
  if (!firstDate) throw new Error("No slots available");
  const firstSlot = firstDate.slots[0];
  console.log('First slot:', firstDate.date, firstSlot.start);
  
  const plan = await invoke('get-booking-slots', {
    latitude: 12.9773495, longitude: 77.6364356, courseId: course.id, has_a_DL: true,
    firstSlot: { date: firstDate.date, start: firstSlot.start }
  });
  console.log('Plan OK:', plan.plan?.ok, 'lessons:', plan.plan?.lessons?.length);
  
  const createRes = await invoke('create-booking', {
    idempotencyKey: 'e2e-' + Date.now(), courseId: course.id,
    firstSlot: { date: firstDate.date, start: firstSlot.start },
    latitude: 12.9773495, longitude: 77.6364356, locationName: 'Indiranagar, Bangalore',
    has_a_DL: true,
    customer: { name: 'Test', phone: '9001234567', email: 'test@test.com' },
    addonIds: ['8d500f64-45d4-4b72-8e33-1a4e08df0050']
  });
  console.log('Booking:', createRes.bookingId);
  
  const order = await fetch('https://csnzgfzxnscumvjefpon.supabase.co/functions/v1/create-razorpay-order', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY },
    body: JSON.stringify({ learnerId: createRes.learnerId, courseId: course.id, amount: createRes.amounts.total, paymentType: 'custom', name: 'Test', phone: '9001234567', email: 'test@test.com', installmentType: 'full', totalAmount: createRes.amounts.total, installment1Amount: createRes.amounts.total, installment2Amount: 0 })
  }).then(r => r.json());
  console.log('Order:', order.orderId);
  
  // Complete payment via approve-booking-payment function
  console.log("\n6. Approve booking payment (test mode)");
  const approveRes = await fetch('https://csnzgfzxnscumvjefpon.supabase.co/functions/v1/approve-booking-payment', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY },
    body: JSON.stringify({ bookingId: createRes.bookingId })
  }).then(r => r.json());
  console.log('Approve result:', approveRes);
  
  console.log("Payment completed via approve-booking-payment");
  
  // Check LL application
  await new Promise(r => setTimeout(r, 1000));
  const { data: llApps } = await svc.from('ll_applications').select('*').eq('learner_id', createRes.learnerId).not('status', 'in', '(\'dl_delivered\',\'closed\')');
  console.log('LL Apps:', llApps?.length);
  if (llApps && llApps.length > 0) {
    console.log('SUCCESS: LL application created for RTO services');
    llApps.forEach(app => console.log('  App:', app.id, app.services, app.status));
  } else {
    console.log('FAILED: No LL application created');
    process.exit(1);
  }
  
  // Cleanup
  await Promise.allSettled([
    svc.from('Schedule').delete().eq('booking_id', createRes.bookingId),
    svc.from('enrollment').delete().eq('id', createRes.enrollmentId),
    svc.from('payment').delete().eq('gateway_reference', order.orderId),
    svc.from('booking').delete().eq('id', createRes.bookingId),
    svc.from('Learner').delete().eq('id', createRes.learnerId),
  ]);
  console.log('Cleanup done');
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1); });