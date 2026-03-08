// ===================================================================
// api-mobile.js
// Provides the same window.api interface as Electron's preload.js
// but using Capacitor plugins instead of IPC.
// Must be loaded BEFORE renderer.js.
// ===================================================================

const { Preferences, Filesystem, Camera, Share, Network } = Capacitor.Plugins;

// Capacitor enum values (not available as JS objects in native web view)
const Directory = { Data: 'DATA' };
const Encoding = { UTF8: 'utf8' };
const CameraResultType = { DataUrl: 'dataUrl' };
const CameraSource = { Camera: 'CAMERA' };

const DRAFTS_DIR = 'saved-reports';
let _lastPdfUri = null;

// ===== window.api =====
window.api = {

  // --- Settings ---
  loadSettings: async () => {
    try {
      const { value } = await Preferences.get({ key: 'settings' });
      const s = value ? JSON.parse(value) : {};
      // Provide dummy SMTP values so renderer.js email validation passes
      s.smtpHost = s.smtpHost || 'mobile-share';
      s.smtpPort = s.smtpPort || '587';
      s.smtpUser = s.smtpUser || 'mobile-share';
      s.smtpPass = s.smtpPass || 'mobile-share';
      return s;
    } catch {
      return { smtpHost: 'mobile-share', smtpUser: 'mobile-share', smtpPort: '587', smtpPass: 'mobile-share' };
    }
  },

  saveSettings: async (settings) => {
    await Preferences.set({ key: 'settings', value: JSON.stringify(settings) });
    return true;
  },

  // --- Drafts ---
  saveDraft: async (filename, data) => {
    await Filesystem.writeFile({
      path: `${DRAFTS_DIR}/${filename}`,
      data: JSON.stringify(data, null, 2),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return `${DRAFTS_DIR}/${filename}`;
  },

  loadDraft: async (filename) => {
    try {
      const result = await Filesystem.readFile({
        path: `${DRAFTS_DIR}/${filename}`,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      return JSON.parse(result.data);
    } catch {
      return null;
    }
  },

  listDrafts: async () => {
    try {
      const result = await Filesystem.readdir({
        path: DRAFTS_DIR,
        directory: Directory.Data,
      });
      return result.files
        .filter(f => f.name.endsWith('.json'))
        .map(f => ({
          filename: f.name,
          modified: f.mtime ? new Date(f.mtime).toISOString() : new Date().toISOString(),
        }));
    } catch {
      return [];
    }
  },

  deleteDraft: async (filename) => {
    try {
      await Filesystem.deleteFile({
        path: `${DRAFTS_DIR}/${filename}`,
        directory: Directory.Data,
      });
    } catch { /* ignore */ }
    return true;
  },

  // --- AI Writing ---
  aiImproveWriting: async (text, apiKey) => {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: `You are a professional septic and sewer inspection report writer.
Improve the following inspection notes into clear, professional language suitable for a formal inspection report.
Keep it factual and concise. Fix grammar, improve flow, and use standard inspection terminology.
Do not add information that wasn't in the original notes. Return only the improved text, no explanations.`,
          messages: [{ role: 'user', content: text }],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return { success: false, error: `API error ${response.status}: ${errBody}` };
      }

      const body = await response.json();
      return { success: true, text: body.content[0].text };
    } catch (err) {
      return { success: false, error: err.message || 'Network error - check your internet connection' };
    }
  },

  aiGenerateSummary: async (formData, apiKey) => {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: `You are a professional septic and sewer inspection report writer.
Given the structured inspection data below, write a cohesive, professional inspection summary report.
Use formal inspection language. Be factual and concise. Organize by sections (Tank, Leachfield, Camera, Design).
Mention any concerns or recommendations clearly.`,
          messages: [{ role: 'user', content: `Inspection data:\n${JSON.stringify(formData, null, 2)}` }],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return { success: false, error: `API error ${response.status}: ${errBody}` };
      }

      const body = await response.json();
      return { success: true, text: body.content[0].text };
    } catch (err) {
      return { success: false, error: err.message || 'Network error' };
    }
  },

  // --- PDF Generation (client-side via html2pdf.js) ---
  generatePdf: async (html, outputName) => {
    try {
      // The report HTML is a full document (<!DOCTYPE html><html><head><style>...)
      // Setting innerHTML on a div strips <html>, <head>, <style> tags.
      // Extract CSS and body content separately so styles are preserved.
      const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

      // Inject report styles into the main document temporarily
      const styleEl = document.createElement('style');
      styleEl.id = 'pdf-render-styles';
      if (styleMatch) styleEl.textContent = styleMatch[1];
      document.head.appendChild(styleEl);

      // Create render container with just the body content
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '0';
      container.style.top = '0';
      container.style.width = '720px';
      container.style.background = 'white';
      container.innerHTML = bodyMatch ? bodyMatch[1] : html;
      document.body.appendChild(container);

      // Give WebView time to apply styles and load images
      await new Promise(r => setTimeout(r, 500));

      // Generate PDF blob using html2pdf.js
      const pdfBlob = await html2pdf()
        .set({
          margin: [0.5, 0.5, 0.5, 0.5],
          filename: outputName,
          image: { type: 'jpeg', quality: 0.90 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            logging: false,
            windowWidth: 720,
            scrollY: 0,
            scrollX: 0,
          },
          jsPDF: {
            unit: 'in',
            format: 'letter',
            orientation: 'portrait',
          },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(container)
        .outputPdf('blob');

      document.body.removeChild(container);
      if (document.getElementById('pdf-render-styles')) {
        document.head.removeChild(document.getElementById('pdf-render-styles'));
      }

      // Convert blob to base64 for Filesystem write
      const base64 = await blobToBase64(pdfBlob);

      // Save to device filesystem
      const result = await Filesystem.writeFile({
        path: `${DRAFTS_DIR}/${outputName}`,
        data: base64,
        directory: Directory.Data,
        recursive: true,
      });

      _lastPdfUri = result.uri;
      return { success: true, path: result.uri };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // --- Email / Share ---
  sendEmail: async (params) => {
    try {
      if (!_lastPdfUri) {
        return { success: false, error: 'No PDF to share. Generate a PDF first.' };
      }

      await Share.share({
        title: params.subject,
        text: params.body,
        url: _lastPdfUri,
        dialogTitle: 'Share Inspection Report',
      });

      return { success: true };
    } catch (err) {
      // User cancelled share - not an error
      if (err.message && (err.message.includes('cancel') || err.message.includes('dismiss'))) {
        return { success: true };
      }
      return { success: false, error: err.message };
    }
  },

  // --- File Operations ---
  openFile: async (filePath) => {
    try {
      await Share.share({
        url: filePath || _lastPdfUri,
        dialogTitle: 'Open Report',
      });
    } catch {
      // User cancelled, ignore
    }
  },

  showSaveDialog: async () => ({ canceled: true }),
  copyFile: async () => true,

  // --- Google Drive (auto-share on mobile) ---
  copyToGoogleDrive: async (sourcePath, fileName) => {
    try {
      if (!_lastPdfUri) return { success: false };
      await Share.share({
        title: fileName,
        url: _lastPdfUri,
        dialogTitle: 'Save Report to Google Drive',
      });
      return { success: true };
    } catch (err) {
      if (err.message && (err.message.includes('cancel') || err.message.includes('dismiss'))) {
        return { success: true };
      }
      return { success: false, error: err.message };
    }
  },
};

// ===== Helper: Blob to base64 =====
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ===== Camera (global function for onclick) =====
window.takePhoto = async (tab) => {
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      width: 1600,
      height: 1200,
      correctOrientation: true,
    });

    const imageObj = {
      id: Date.now() + Math.random(),
      dataUrl: photo.dataUrl,
      caption: '',
    };

    if (tab === 'sewer') {
      sewerImages.push(imageObj);
      renderSewerImages();
    } else {
      images.push(imageObj);
      renderImages();
    }
  } catch (err) {
    if (err.message && !err.message.includes('cancel') && !err.message.includes('User')) {
      showToast('Camera error: ' + err.message, 'error');
    }
  }
};

// ===== Offline Detection =====
let _isOnline = true;

function updateOnlineUI() {
  document.querySelectorAll('.btn-ai').forEach(btn => {
    btn.disabled = !_isOnline;
    btn.title = _isOnline ? 'Improve with AI' : 'Requires internet';
    btn.style.opacity = _isOnline ? '' : '0.4';
  });
}

// Check initial network state
Network.getStatus().then(status => {
  _isOnline = status.connected;
  updateOnlineUI();
}).catch(() => {});

// Listen for changes
Network.addListener('networkStatusChange', (status) => {
  _isOnline = status.connected;
  updateOnlineUI();
});

// ===== Mobile UI Tweaks (run after DOM loads) =====
document.addEventListener('DOMContentLoaded', () => {
  // Hide SMTP and Google Drive settings (mobile uses native share for both)
  document.querySelectorAll('#settingsModal h3').forEach(h3 => {
    h3.style.display = 'none';
    // Hide all form-groups after each h3 until the next h3 or modal-actions
    let el = h3.nextElementSibling;
    while (el && !el.matches('h3') && !el.matches('.modal-actions')) {
      el.style.display = 'none';
      el = el.nextElementSibling;
    }
  });
});
