const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.warn('[warn] Missing Supabase environment variables — DB operations will fail until configured.');
}

// Anon client — for client-side-safe operations
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service role client — bypasses RLS; server-side only
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = { supabase, supabaseAdmin };
