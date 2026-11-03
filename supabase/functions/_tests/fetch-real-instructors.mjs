import { createClient } from "../../../node_modules/@supabase/supabase-js/dist/index.mjs";

const SUPABASE_URL = "https://csnzgfzxnscumvjefpon.supabase.co";
const ANON_KEY = "sb_publishable_Pb581zR71aWpJ2GACdY_-g_GB_FsfDC";

const client = createClient(SUPABASE_URL, ANON_KEY);

async function fetchRealInstructors() {
  const { data: instructors, error } = await client
    .from("Instructor")
    .select("id_instructor,name,gender,areas,latitude,longitude,radius,status,unavailability")
    .eq("status", "active");

  if (error) {
    console.error("Error fetching instructors:", error);
    return;
  }

  console.log(`Total active instructors: ${instructors.length}`);
  console.log("");

  // Group by area for coverage analysis
  const areaMap = new Map();
  for (const instr of instructors) {
    for (const area of instr.areas || []) {
      if (!areaMap.has(area)) areaMap.set(area, []);
      areaMap.get(area).push({ id: instr.id_instructor, name: instr.name });
    }
  }

  console.log("=== INSTRUCTORS BY AREA ===");
  for (const [area, instrs] of [...areaMap.entries()].sort()) {
    console.log(`${area}: ${instrs.length} instructors`);
    for (const i of instrs) console.log(`  - ${i.name} (${i.id})`);
  }

  console.log("");
  console.log("=== SAMPLE INSTRUCTOR DATA ===");
  for (const instr of instructors.slice(0, 10)) {
    console.log(JSON.stringify(instr, null, 2));
  }
}

fetchRealInstructors().catch(console.error);