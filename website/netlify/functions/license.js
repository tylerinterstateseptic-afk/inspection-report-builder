const { createClient } = require('@supabase/supabase-js');

let supabase;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return supabase;
}

// Simple in-memory rate limiting (per function instance)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, {});
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  if (!checkRateLimit(ip)) {
    return jsonResponse(429, { error: 'Too many requests. Please try again in a minute.' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { error: 'Invalid request' });
  }

  const { action, licenseKey, machineId, hostname } = body;

  if (action === 'activate') {
    return handleActivate(licenseKey, machineId, hostname);
  } else if (action === 'validate') {
    return handleValidate(licenseKey, machineId);
  } else {
    return jsonResponse(400, { error: 'Invalid action' });
  }
};

async function handleActivate(licenseKey, machineId, hostname) {
  if (!licenseKey || !machineId) {
    return jsonResponse(400, { error: 'Missing license key or machine identifier' });
  }

  const db = getSupabase();

  // Look up the key
  const { data: license, error } = await db
    .from('licenses')
    .select('*')
    .eq('license_key', licenseKey.toUpperCase().trim())
    .single();

  if (error || !license) {
    return jsonResponse(404, { error: 'Invalid license key. Please check and try again.' });
  }

  if (license.is_revoked) {
    return jsonResponse(403, { error: 'This license has been revoked. Contact support for help.' });
  }

  const machines = license.activated_machines || [];

  // Check if this machine is already activated
  const alreadyActivated = machines.find(m => m.machine_id === machineId);
  if (alreadyActivated) {
    return jsonResponse(200, { success: true, message: 'License already activated on this computer.' });
  }

  // Check activation limit
  if (machines.length >= license.max_activations) {
    return jsonResponse(403, {
      error: `This license is already activated on ${license.max_activations} computers. Contact support to transfer your license.`,
    });
  }

  // Add this machine
  machines.push({
    machine_id: machineId,
    hostname: hostname || 'Unknown',
    activated_at: new Date().toISOString(),
  });

  const { error: updateError } = await db
    .from('licenses')
    .update({
      activated_machines: machines,
      updated_at: new Date().toISOString(),
    })
    .eq('id', license.id);

  if (updateError) {
    return jsonResponse(500, { error: 'Activation failed. Please try again.' });
  }

  return jsonResponse(200, { success: true, message: 'License activated successfully!' });
}

async function handleValidate(licenseKey, machineId) {
  if (!licenseKey || !machineId) {
    return jsonResponse(400, { error: 'Missing license key or machine identifier' });
  }

  const db = getSupabase();

  const { data: license, error } = await db
    .from('licenses')
    .select('*')
    .eq('license_key', licenseKey.toUpperCase().trim())
    .single();

  if (error || !license) {
    return jsonResponse(404, { error: 'Invalid license key' });
  }

  if (license.is_revoked) {
    return jsonResponse(403, { error: 'License has been revoked' });
  }

  const machines = license.activated_machines || [];
  const isActivated = machines.some(m => m.machine_id === machineId);

  if (!isActivated) {
    return jsonResponse(403, { error: 'License not activated on this computer' });
  }

  return jsonResponse(200, { success: true, valid: true });
}
