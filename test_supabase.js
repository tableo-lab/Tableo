require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function testIt() {
  console.log("Testing fetch tables:");
  const res1 = await supabase.from('tables').select('*');
  console.log("Select response:", res1);

  if (res1.error) {
    console.error("SELECT ERROR:", res1.error);
  }

  console.log("Testing insert table:");
  const res2 = await supabase.from('tables').insert([{ name: 'Test Table', seats: 2, status: 'available' }]).select().single();
  console.log("Insert response:", res2);
}

testIt();
