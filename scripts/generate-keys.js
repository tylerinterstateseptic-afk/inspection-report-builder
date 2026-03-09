#!/usr/bin/env node

// License Key Generator
// Usage: node scripts/generate-keys.js <count> [email]
// Example: node scripts/generate-keys.js 10 customer@email.com
//
// Requires environment variables:
//   SUPABASE_URL - Your Supabase project URL
//   SUPABASE_SERVICE_KEY - Your Supabase service role key

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.');
  console.error('');
  console.error('Example:');
  console.error('  set SUPABASE_URL=https://xxxx.supabase.co');
  console.error('  set SUPABASE_SERVICE_KEY=eyJ...');
  console.error('  node scripts/generate-keys.js 5');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// No ambiguous characters (removed 0/O/1/I)
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateKey() {
  const segments = [];
  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let c = 0; c < 4; c++) {
      segment += CHARS[crypto.randomInt(CHARS.length)];
    }
    segments.push(segment);
  }
  return segments.join('-');
}

async function main() {
  const count = parseInt(process.argv[2]) || 1;
  const email = process.argv[3] || null;

  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push({
      license_key: generateKey(),
      email: email,
      max_activations: 2,
      activated_machines: [],
    });
  }

  const { data, error } = await supabase.from('licenses').insert(keys).select();

  if (error) {
    console.error('Error inserting keys:', error.message);
    process.exit(1);
  }

  console.log(`\nGenerated ${data.length} license key(s):\n`);
  data.forEach(row => {
    console.log(`  ${row.license_key}  ${row.email ? '(' + row.email + ')' : ''}`);
  });
  console.log('');
}

main();
