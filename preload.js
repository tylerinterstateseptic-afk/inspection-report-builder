const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveDraft: (filename, data) => ipcRenderer.invoke('save-draft', { filename, data }),
  loadDraft: (filename) => ipcRenderer.invoke('load-draft', filename),
  listDrafts: () => ipcRenderer.invoke('list-drafts'),
  deleteDraft: (filename) => ipcRenderer.invoke('delete-draft', filename),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  aiImproveWriting: (text, apiKey) => ipcRenderer.invoke('ai-improve-writing', { text, apiKey }),
  aiGenerateSummary: (formData, apiKey) => ipcRenderer.invoke('ai-generate-summary', { formData, apiKey }),
  generatePdf: (html, outputName) => ipcRenderer.invoke('generate-pdf', { html, outputName }),
  sendEmail: (params) => ipcRenderer.invoke('send-email', params),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  copyFile: (source, destination) => ipcRenderer.invoke('copy-file', { source, destination }),
  copyToGoogleDrive: (sourcePath, fileName) => ipcRenderer.invoke('copy-to-google-drive', { sourcePath, fileName }),
  saveFieldConfig: (config) => ipcRenderer.invoke('save-field-config', config),
  loadFieldConfig: () => ipcRenderer.invoke('load-field-config'),
});
