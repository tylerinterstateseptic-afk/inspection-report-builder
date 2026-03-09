const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Use userData for all writable files (settings, drafts, field-config)
// On Windows this is %APPDATA%/inspection-program/
function getUserDataPath(...segments) {
  return path.join(app.getPath('userData'), ...segments);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    title: 'Inspection Report Builder',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  // Background license revalidation (checks every 30 days when online)
  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const status = license.getLicenseStatus();
      if (status.status === 'licensed' && status.needsRevalidation) {
        await license.validateLicense();
      }
    } catch (err) {
      // Silent fail — don't block the user
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

// Save report draft to disk
ipcMain.handle('save-draft', async (event, { filename, data }) => {
  const dir = getUserDataPath('saved-reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
});

// Load a draft from disk
ipcMain.handle('load-draft', async (event, filename) => {
  const filePath = getUserDataPath('saved-reports', filename);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
});

// List saved drafts
ipcMain.handle('list-drafts', async () => {
  const dir = getUserDataPath('saved-reports');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    const stat = fs.statSync(path.join(dir, f));
    return { filename: f, modified: stat.mtime.toISOString() };
  });
});

// Delete a draft
ipcMain.handle('delete-draft', async (event, filename) => {
  const filePath = getUserDataPath('saved-reports', filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return true;
});

// Save settings (API key, email config)
ipcMain.handle('save-settings', async (event, settings) => {
  const filePath = getUserDataPath('settings.json');
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  return true;
});

// Load settings
ipcMain.handle('load-settings', async () => {
  const filePath = getUserDataPath('settings.json');
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
});

// Claude AI: improve writing
ipcMain.handle('ai-improve-writing', async (event, { text, apiKey }) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are a professional septic and sewer inspection report writer.
Improve the following inspection notes into clear, professional language suitable for a formal inspection report.
Keep it factual and concise. Fix grammar, improve flow, and use standard inspection terminology.
Do not add information that wasn't in the original notes. Return only the improved text, no explanations.`,
      messages: [{ role: 'user', content: text }],
    });
    return { success: true, text: message.content[0].text };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Claude AI: generate full report summary
ipcMain.handle('ai-generate-summary', async (event, { formData, apiKey }) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `You are a professional septic and sewer inspection report writer.
Given the structured inspection data below, write a cohesive, professional inspection summary report.
Use formal inspection language. Be factual and concise. Organize by sections (Tank, Leachfield, Camera, Design).
Mention any concerns or recommendations clearly.`,
      messages: [{ role: 'user', content: `Inspection data:\n${JSON.stringify(formData, null, 2)}` }],
    });
    return { success: true, text: message.content[0].text };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Generate PDF from HTML using Electron's built-in printToPDF
ipcMain.handle('generate-pdf', async (event, { html, outputName }) => {
  try {
    const dir = getUserDataPath('saved-reports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const outputPath = path.join(dir, outputName);

    const pdfWindow = new BrowserWindow({ show: false, width: 816, height: 1056 });
    await pdfWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // Small delay to ensure images and styles are fully rendered
    await new Promise(resolve => setTimeout(resolve, 500));

    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      pageSize: 'Letter',
      printBackground: true,
      margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    });

    fs.writeFileSync(outputPath, pdfBuffer);
    pdfWindow.close();
    return { success: true, path: outputPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Send email with attachment
ipcMain.handle('send-email', async (event, { emailConfig, to, cc, subject, body, attachmentPath }) => {
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: parseInt(emailConfig.port),
      secure: parseInt(emailConfig.port) === 465,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass,
      },
    });
    const mailOptions = {
      from: emailConfig.user,
      to,
      cc: cc || undefined,
      subject,
      text: body,
      attachments: attachmentPath ? [{ path: attachmentPath }] : [],
    };
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open file in OS default app
ipcMain.handle('open-file', async (event, filePath) => {
  shell.openPath(filePath);
});

// Show save dialog
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

// Copy file to a chosen location
ipcMain.handle('copy-file', async (event, { source, destination }) => {
  fs.copyFileSync(source, destination);
  return true;
});

// Save field config
ipcMain.handle('save-field-config', async (event, config) => {
  const filePath = getUserDataPath('field-config.json');
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  return true;
});

// Load field config
ipcMain.handle('load-field-config', async () => {
  const filePath = getUserDataPath('field-config.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
});

// --- License System ---
const license = require('./license');

ipcMain.handle('get-license-status', async () => {
  return license.getLicenseStatus();
});

ipcMain.handle('activate-license', async (event, licenseKey) => {
  return license.activateLicense(licenseKey);
});

ipcMain.handle('validate-license', async () => {
  return license.validateLicense();
});

// Copy PDF to Google Drive sync folder
ipcMain.handle('copy-to-google-drive', async (event, { sourcePath, fileName }) => {
  try {
    const settingsPath = getUserDataPath('settings.json');
    const s = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
    const driveFolder = s.googleDriveFolder;
    if (!driveFolder) return { success: false };
    if (!fs.existsSync(driveFolder)) fs.mkdirSync(driveFolder, { recursive: true });
    const destPath = path.join(driveFolder, fileName);
    fs.copyFileSync(sourcePath, destPath);
    return { success: true, message: 'Copied to Google Drive!' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
