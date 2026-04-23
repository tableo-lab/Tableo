require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  // Check if column already exists
  const { data, error } = await s.from('restaurants').select('gst_type').limit(1);
  
  if (error && error.message.includes('does not exist')) {
    console.log('❌ Column gst_type does not exist yet.');
    console.log('');
    console.log('Please run this SQL in your Supabase SQL Editor:');
    console.log('');
    console.log("  ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gst_type TEXT NOT NULL DEFAULT 'composition';");
    console.log('');
    process.exit(1);
  } else if (error) {
    console.log('Error:', error.message);
    process.exit(1);
  } else {
    console.log('✅ Column gst_type already exists. Current values:', data);
  }
})();
