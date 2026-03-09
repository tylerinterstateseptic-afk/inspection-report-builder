const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, net } = require('electron');

// --- Constants ---
const LICENSE_API_URL = 'https://septic-sewer-report-builder.netlify.app/.netlify/functions/license';
const ENCRYPTION_KEY_SEED = 'InspReportBuilder2026!$xK9#mQ@vZ';
const TRIAL_DAYS = 7;
const REVALIDATION_DAYS = 30;

// Derive a consistent 32-byte key from the seed
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY_SEED).digest();

// --- File Paths ---
function getLicensePath() {
  return path.join(app.getPath('userData'), '.license-state');
}

// --- Machine ID ---
function getMachineId() {
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || '',
    os.homedir(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

// --- Encryption helpers ---
function encrypt(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  try {
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

// --- State persistence ---
function loadState() {
  const filePath = getLicensePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return decrypt(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  const filePath = getLicensePath();
  fs.writeFileSync(filePath, encrypt(state), 'utf-8');
}

// --- Initialize trial on first run ---
function initializeTrialIfNeeded() {
  let state = loadState();
  if (!state) {
    state = {
      type: 'trial',
      trialStartDate: new Date().toISOString(),
      licenseKey: null,
      lastValidated: null,
    };
    saveState(state);
  }
  return state;
}

// --- Get license/trial status ---
function getLicenseStatus() {
  const state = initializeTrialIfNeeded();
  const machineId = getMachineId();

  if (state.type === 'licensed') {
    const lastValidated = state.lastValidated ? new Date(state.lastValidated) : null;
    const daysSinceValidation = lastValidated
      ? (Date.now() - lastValidated.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    return {
      status: 'licensed',
      licenseKey: state.licenseKey,
      needsRevalidation: daysSinceValidation > REVALIDATION_DAYS,
      machineId,
    };
  }

  // Trial
  const trialStart = new Date(state.trialStartDate);
  const now = new Date();
  const daysElapsed = (now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24);
  const daysRemaining = Math.max(0, Math.ceil(TRIAL_DAYS - daysElapsed));

  return {
    status: daysRemaining > 0 ? 'trial' : 'expired',
    daysRemaining,
    trialStartDate: state.trialStartDate,
    machineId,
  };
}

// --- Electron net module fetch wrapper ---
function netFetch(url, options) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: options.method || 'GET',
      url,
    });

    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        request.setHeader(key, value);
      });
    }

    let responseBody = '';
    let statusCode = 0;

    request.on('response', (response) => {
      statusCode = response.statusCode;
      response.on('data', (chunk) => { responseBody += chunk.toString(); });
      response.on('end', () => { resolve({ statusCode, body: responseBody }); });
    });

    request.on('error', (error) => { reject(error); });

    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

// --- Server communication ---
async function activateLicense(licenseKey) {
  const machineId = getMachineId();
  const hostname = os.hostname();

  try {
    const response = await netFetch(LICENSE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'activate',
        licenseKey: licenseKey.toUpperCase().trim(),
        machineId,
        hostname,
      }),
    });

    const data = JSON.parse(response.body);

    if (response.statusCode === 200 && data.success) {
      const currentState = loadState();
      const state = {
        type: 'licensed',
        licenseKey: licenseKey.toUpperCase().trim(),
        lastValidated: new Date().toISOString(),
        trialStartDate: currentState?.trialStartDate || new Date().toISOString(),
      };
      saveState(state);
      return { success: true, message: data.message };
    } else {
      return { success: false, error: data.error || 'Activation failed' };
    }
  } catch (err) {
    return { success: false, error: 'Could not connect to license server. Check your internet connection.' };
  }
}

async function validateLicense() {
  const state = loadState();
  if (!state || state.type !== 'licensed') {
    return { success: false, error: 'No active license' };
  }

  const machineId = getMachineId();

  try {
    const response = await netFetch(LICENSE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'validate',
        licenseKey: state.licenseKey,
        machineId,
      }),
    });

    const data = JSON.parse(response.body);

    if (response.statusCode === 200 && data.success) {
      state.lastValidated = new Date().toISOString();
      saveState(state);
      return { success: true };
    } else {
      // License revoked or invalidated — revert to expired trial
      state.type = 'trial';
      state.licenseKey = null;
      state.lastValidated = null;
      saveState(state);
      return { success: false, error: data.error || 'License no longer valid' };
    }
  } catch {
    // Offline — allow continued use
    return { success: true, offline: true };
  }
}

module.exports = {
  getLicenseStatus,
  activateLicense,
  validateLicense,
  getMachineId,
};
