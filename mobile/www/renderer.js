// ===== STATE =====
let images = []; // { id, dataUrl, caption }
let sewerImages = []; // { id, dataUrl, caption }
let settings = {};
let lastPdfPath = null;
let activeTab = 'septic';
let editMode = false;
let fieldConfig = null;
let editingDropdownId = null; // which select is being edited
let editingOptions = []; // temp options list while editing

// ===== DEFAULT FIELD CONFIG =====
const DEFAULT_FIELD_CONFIG = {
  dropdowns: {
    tankType: ['Concrete', 'Plastic', 'Fiberglass', 'Steel', 'Unknown'],
    tankCapacity: ['500 gallon', '750 gallon', '1000 gallon', '1500 gallon', '2000 gallon'],
    pumpStation: ['In-Tank', 'Separate', 'No'],
    pumpCondition: ['Operational', 'Not operational', 'Unable to verify'],
    highWaterAlarm: ['Present and functional', 'Present but not functional', 'Not present', 'Unable to locate alarm panel'],
    inletBaffle: ['Good condition', 'Deteriorated', 'Missing', 'Unable to inspect'],
    outletBaffle: ['Good condition', 'Deteriorated', 'Missing', 'Unable to inspect'],
    inletPipe: ['Good condition', 'Sag observed', 'Roots present', 'Crack or break observed', 'Unable to inspect'],
    outletPipe: ['Good condition', 'Sag observed', 'Roots present', 'Crack or break observed', 'Unable to inspect'],
    effluentLevel: ['Normal', 'High', 'Low', 'Tank was full'],
    tankPumped: ['Yes', 'No - seasonal conditions', 'No - recently pumped', 'No - other reason'],
    leachfieldType: ['Pipe and Stone', 'Infiltrators', 'Enviroseptic Tubes', 'Eljin Indrain'],
    testPitFindings: ['No biomat in soil or pooling of effluent', 'Biomat in soil', 'Pooling of effluent', 'Biomat and effluent present in soil'],
    vegetation: ['Clear and maintained', 'Overgrowth present - maintenance recommended', 'Trees or large shrubs present - removal recommended'],
  },
  labels: {},
  sectionHeaders: {},
};

// Dropdowns that should NOT get an "Other" option (pumpStation uses conditional logic, not Other)
const NO_OTHER_DROPDOWNS = ['pumpStation'];

// ===== FIELD CONFIG FUNCTIONS =====
function populateDropdowns() {
  if (!fieldConfig) return;
  const dd = fieldConfig.dropdowns;
  Object.keys(dd).forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = sel.value;
    // Keep "-- Select --" as first option, clear the rest
    while (sel.options.length > 1) sel.remove(1);
    // Add config options
    dd[id].forEach(opt => {
      const o = document.createElement('option');
      o.textContent = opt;
      o.value = opt;
      sel.appendChild(o);
    });
    // Add "Other" unless excluded
    if (!NO_OTHER_DROPDOWNS.includes(id)) {
      const o = document.createElement('option');
      o.textContent = 'Other';
      o.value = 'Other';
      sel.appendChild(o);
    }
    // Restore previous value if it exists
    if (currentVal) sel.value = currentVal;
  });
}

function applyLabels() {
  if (!fieldConfig) return;
  const labels = fieldConfig.labels || {};
  Object.keys(labels).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // Find the label for this element
    const formGroup = el.closest('.form-group');
    if (formGroup) {
      const lbl = formGroup.querySelector('label');
      if (lbl) lbl.textContent = labels[id];
    }
  });
  const headers = fieldConfig.sectionHeaders || {};
  Object.keys(headers).forEach(key => {
    const headerEl = document.querySelector(`[data-section="${key}"]`);
    if (headerEl) {
      const chevron = headerEl.querySelector('.chevron');
      headerEl.textContent = headers[key] + ' ';
      if (chevron) headerEl.appendChild(chevron);
    }
  });
}

function wrapSelectsWithEditButtons() {
  // Wrap each configurable select in a flex wrapper with an edit pencil button
  const dd = fieldConfig ? fieldConfig.dropdowns : DEFAULT_FIELD_CONFIG.dropdowns;
  Object.keys(dd).forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.parentElement.classList.contains('select-edit-wrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'select-edit-wrapper';
    sel.parentElement.insertBefore(wrapper, sel);
    wrapper.appendChild(sel);
    const btn = document.createElement('button');
    btn.className = 'edit-field-btn';
    btn.innerHTML = '&#9998;';
    btn.title = 'Edit options';
    btn.onclick = (e) => { e.stopPropagation(); openDropdownEditor(id); };
    wrapper.appendChild(btn);
  });
}

function addEditableAttributes() {
  // Mark labels as editable
  const dd = fieldConfig ? fieldConfig.dropdowns : DEFAULT_FIELD_CONFIG.dropdowns;
  // All form groups with inputs/selects/textareas
  document.querySelectorAll('.form-group label').forEach(lbl => {
    const formGroup = lbl.closest('.form-group');
    if (!formGroup) return;
    const input = formGroup.querySelector('input, select, textarea');
    if (input && input.id) {
      lbl.setAttribute('data-editable', input.id);
    }
  });
  // Mark section headers
  document.querySelectorAll('.section-header').forEach((header, idx) => {
    const sectionKeys = ['headerInfo', 'septicTank', 'leachfield', 'hhe200', 'inspectionPhotos', 'recommendations',
                         'sewerHeaderInfo', 'sewerVideoLink', 'sewerFindings', 'sewerPhotos'];
    if (idx < sectionKeys.length) {
      header.setAttribute('data-editable', 'true');
      header.setAttribute('data-section', sectionKeys[idx]);
    }
  });
}

// ===== EDIT MODE =====
function toggleEditMode() {
  editMode = !editMode;
  document.body.classList.toggle('edit-mode', editMode);
  document.getElementById('editModeBtn').classList.toggle('active', editMode);
  document.getElementById('editModeBtn').textContent = editMode ? 'Exit Edit Mode' : 'Edit Fields';

  if (editMode) {
    // Add click handlers for editable labels
    document.querySelectorAll('label[data-editable]').forEach(lbl => {
      lbl._editHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startLabelEdit(lbl);
      };
      lbl.addEventListener('click', lbl._editHandler);
    });
    document.querySelectorAll('.section-header[data-editable]').forEach(header => {
      header._editHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startHeaderEdit(header);
      };
      header.addEventListener('click', header._editHandler);
    });
  } else {
    // Remove edit handlers
    document.querySelectorAll('label[data-editable]').forEach(lbl => {
      if (lbl._editHandler) {
        lbl.removeEventListener('click', lbl._editHandler);
        delete lbl._editHandler;
      }
    });
    document.querySelectorAll('.section-header[data-editable]').forEach(header => {
      if (header._editHandler) {
        header.removeEventListener('click', header._editHandler);
        delete header._editHandler;
      }
    });
  }
}

function startLabelEdit(lbl) {
  if (!editMode) return;
  const original = lbl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = original;
  input.style.cssText = 'font-size:13px;font-weight:600;padding:2px 4px;border:1px solid #f39c12;border-radius:3px;width:100%;';
  lbl.textContent = '';
  lbl.appendChild(input);
  input.focus();
  input.select();

  const finish = () => {
    const newVal = input.value.trim() || original;
    lbl.textContent = newVal;
    const fieldId = lbl.getAttribute('data-editable');
    if (fieldId && newVal !== original) {
      if (!fieldConfig.labels) fieldConfig.labels = {};
      fieldConfig.labels[fieldId] = newVal;
      saveFieldConfig();
    }
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

function startHeaderEdit(header) {
  if (!editMode) return;
  const chevron = header.querySelector('.chevron');
  const original = header.textContent.replace('▼', '').trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.value = original;
  input.style.cssText = 'font-size:15px;font-weight:600;padding:2px 6px;border:1px solid #f39c12;border-radius:3px;background:rgba(255,255,255,0.9);color:#2c3e50;width:70%;';
  header.textContent = '';
  header.appendChild(input);
  if (chevron) header.appendChild(chevron);
  input.focus();
  input.select();

  const finish = () => {
    const newVal = input.value.trim() || original;
    header.textContent = newVal + ' ';
    if (chevron) header.appendChild(chevron);
    const sectionKey = header.getAttribute('data-section');
    if (sectionKey && newVal !== original) {
      if (!fieldConfig.sectionHeaders) fieldConfig.sectionHeaders = {};
      fieldConfig.sectionHeaders[sectionKey] = newVal;
      saveFieldConfig();
    }
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

// ===== DROPDOWN EDITOR =====
function openDropdownEditor(selectId) {
  editingDropdownId = selectId;
  const dd = fieldConfig.dropdowns[selectId] || DEFAULT_FIELD_CONFIG.dropdowns[selectId] || [];
  editingOptions = [...dd];

  // Find label for title
  const sel = document.getElementById(selectId);
  const formGroup = sel ? sel.closest('.form-group') : null;
  const lbl = formGroup ? formGroup.querySelector('label') : null;
  document.getElementById('dropdownEditorTitle').textContent = 'Edit: ' + (lbl ? lbl.textContent : selectId);

  renderOptionList();
  showModal('dropdownEditorModal');
  document.getElementById('newOptionInput').value = '';
  document.getElementById('newOptionInput').focus();
}

function renderOptionList() {
  const list = document.getElementById('optionList');
  list.innerHTML = editingOptions.map((opt, i) => `
    <li>
      <button class="btn-move" onclick="moveOption(${i}, -1)" ${i === 0 ? 'disabled style="opacity:0.3"' : ''} title="Move up">&#9650;</button>
      <button class="btn-move" onclick="moveOption(${i}, 1)" ${i === editingOptions.length - 1 ? 'disabled style="opacity:0.3"' : ''} title="Move down">&#9660;</button>
      <span class="option-text">${opt}</span>
      <button class="btn-remove-opt" onclick="removeOption(${i})" title="Remove">&times;</button>
    </li>
  `).join('');
}

function addOption() {
  const input = document.getElementById('newOptionInput');
  const val = input.value.trim();
  if (!val) return;
  if (editingOptions.includes(val)) {
    showToast('Option already exists', 'error');
    return;
  }
  editingOptions.push(val);
  renderOptionList();
  input.value = '';
  input.focus();
}

function removeOption(index) {
  editingOptions.splice(index, 1);
  renderOptionList();
}

function moveOption(index, direction) {
  const newIdx = index + direction;
  if (newIdx < 0 || newIdx >= editingOptions.length) return;
  const temp = editingOptions[index];
  editingOptions[index] = editingOptions[newIdx];
  editingOptions[newIdx] = temp;
  renderOptionList();
}

function saveDropdownEdits() {
  if (!editingDropdownId) return;
  fieldConfig.dropdowns[editingDropdownId] = [...editingOptions];
  populateDropdowns();
  saveFieldConfig();
  closeModal('dropdownEditorModal');
  showToast('Options saved!', 'success');
}

function resetDropdownToDefault() {
  if (!editingDropdownId) return;
  const defaults = DEFAULT_FIELD_CONFIG.dropdowns[editingDropdownId];
  if (defaults) {
    editingOptions = [...defaults];
    renderOptionList();
  }
}

async function saveFieldConfig() {
  try {
    await window.api.saveFieldConfig(fieldConfig);
  } catch (e) { /* silently fail on web preview */ }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  try { settings = await window.api.loadSettings(); } catch (e) { settings = {}; }

  // Load field config (or use defaults)
  try {
    const saved = await window.api.loadFieldConfig();
    if (saved) {
      fieldConfig = saved;
      // Merge any new defaults (in case new dropdowns were added)
      Object.keys(DEFAULT_FIELD_CONFIG.dropdowns).forEach(k => {
        if (!fieldConfig.dropdowns[k]) fieldConfig.dropdowns[k] = DEFAULT_FIELD_CONFIG.dropdowns[k];
      });
    } else {
      fieldConfig = JSON.parse(JSON.stringify(DEFAULT_FIELD_CONFIG));
      saveFieldConfig();
    }
  } catch (e) {
    fieldConfig = JSON.parse(JSON.stringify(DEFAULT_FIELD_CONFIG));
  }

  populateDropdowns();
  applyLabels();
  wrapSelectsWithEditButtons();
  addEditableAttributes();

  document.getElementById('inspectorName').value = 'Tyler Fish';
  document.getElementById('inspectionDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('sewerInspectorName').value = 'Tyler Fish';
  document.getElementById('sewerDate').value = new Date().toISOString().split('T')[0];
  setupImageHandling();
  setupSewerImageHandling();
});

// ===== TAB SWITCHING =====
function switchTab(tab) {
  activeTab = tab;
  document.getElementById('septicTab').style.display = tab === 'septic' ? '' : 'none';
  document.getElementById('sewerTab').style.display = tab === 'sewer' ? '' : 'none';
  document.getElementById('tabBtnSeptic').classList.toggle('active', tab === 'septic');
  document.getElementById('tabBtnSewer').classList.toggle('active', tab === 'sewer');
}

// ===== SECTION TOGGLE =====
function toggleSection(headerEl) {
  const chevron = headerEl.querySelector('.chevron');
  const body = headerEl.nextElementSibling;
  chevron.classList.toggle('collapsed');
  body.classList.toggle('collapsed');
}

// ===== "OTHER" FIELD TOGGLE =====
function toggleOtherField(selectEl, otherInputId) {
  const otherInput = document.getElementById(otherInputId);
  if (selectEl.value === 'Other') {
    otherInput.classList.remove('hidden');
    otherInput.focus();
  } else {
    otherInput.classList.add('hidden');
    otherInput.value = '';
  }
}

// Helper: get the effective value of a select with an "Other" text field
function getFieldValue(selectId, otherId) {
  const sel = document.getElementById(selectId);
  if (!sel) return '';
  if (sel.value === 'Other') {
    const other = document.getElementById(otherId);
    return other ? other.value : '';
  }
  return sel.value;
}

// ===== CONDITIONAL FIELDS =====
function togglePumpFields() {
  const val = document.getElementById('pumpStation').value;
  const hasPump = val === 'In-Tank' || val === 'Separate';
  document.getElementById('pumpConditionGroup').classList.toggle('hidden', !hasPump);
  document.getElementById('highWaterAlarmGroup').classList.toggle('hidden', !hasPump);
}

function toggleHHEFields() {
  const provided = document.getElementById('hheProvided');
  const notProvided = document.getElementById('hheNotProvided');

  // Make checkboxes mutually exclusive
  if (this === provided || event.target === provided) {
    if (provided.checked) notProvided.checked = false;
  }
  if (this === notProvided || event.target === notProvided) {
    if (notProvided.checked) provided.checked = false;
  }

  document.getElementById('hheAutoNote').classList.toggle('hidden', !notProvided.checked);
}

// ===== SEPTIC IMAGE HANDLING =====
function setupImageHandling() {
  const dropZone = document.getElementById('imageDropZone');
  const fileInput = document.getElementById('imageFileInput');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = '';
  });

  // Clipboard paste - routes to active tab
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (activeTab === 'sewer') {
          handleSewerFiles([file]);
        } else {
          handleFiles([file]);
        }
      }
    }
  });
}

function handleFiles(files) {
  for (let file of files) {
    if (!file.type.startsWith('image/')) continue;
    const reader = new FileReader();
    reader.onload = (e) => {
      images.push({
        id: Date.now() + Math.random(),
        dataUrl: e.target.result,
        caption: '',
      });
      renderImages();
    };
    reader.readAsDataURL(file);
  }
}

function renderImages() {
  const gallery = document.getElementById('imageGallery');
  gallery.innerHTML = images.map((img, i) => `
    <div class="image-card">
      <img src="${img.dataUrl}" alt="Photo ${i + 1}">
      <button class="btn-remove" onclick="removeImage(${i})">&times;</button>
      <div class="image-caption">
        <label>Caption:</label>
        <input type="text" placeholder="Describe this photo..." value="${img.caption}"
               oninput="images[${i}].caption = this.value">
      </div>
    </div>
  `).join('');
}

function removeImage(index) {
  images.splice(index, 1);
  renderImages();
}

// ===== SEWER IMAGE HANDLING =====
function setupSewerImageHandling() {
  const dropZone = document.getElementById('sewerImageDropZone');
  const fileInput = document.getElementById('sewerImageFileInput');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleSewerFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => {
    handleSewerFiles(e.target.files);
    fileInput.value = '';
  });
}

function handleSewerFiles(files) {
  for (let file of files) {
    if (!file.type.startsWith('image/')) continue;
    const reader = new FileReader();
    reader.onload = (e) => {
      sewerImages.push({
        id: Date.now() + Math.random(),
        dataUrl: e.target.result,
        caption: '',
      });
      renderSewerImages();
    };
    reader.readAsDataURL(file);
  }
}

function renderSewerImages() {
  const gallery = document.getElementById('sewerImageGallery');
  gallery.innerHTML = sewerImages.map((img, i) => `
    <div class="image-card">
      <img src="${img.dataUrl}" alt="Photo ${i + 1}">
      <button class="btn-remove" onclick="removeSewerImage(${i})">&times;</button>
      <div class="image-caption">
        <label>Caption:</label>
        <input type="text" placeholder="Describe this photo..." value="${img.caption}"
               oninput="sewerImages[${i}].caption = this.value">
      </div>
    </div>
  `).join('');
}

function removeSewerImage(index) {
  sewerImages.splice(index, 1);
  renderSewerImages();
}

// ===== COLLECT FORM DATA =====
function collectFormData() {
  // Sync captions from DOM before collecting
  const captionInputs = document.querySelectorAll('#imageGallery .image-caption input');
  captionInputs.forEach((input, i) => {
    if (images[i]) images[i].caption = input.value;
  });

  return {
    reportType: 'septic',
    customerName: document.getElementById('customerName').value,
    jobAddress: document.getElementById('jobAddress').value,
    inspectorName: document.getElementById('inspectorName').value,
    inspectionDate: document.getElementById('inspectionDate').value,
    tankType: getFieldValue('tankType', 'tankTypeOther'),
    tankCapacity: getFieldValue('tankCapacity', 'tankCapacityOther'),
    pumpStation: document.getElementById('pumpStation').value,
    pumpCondition: getFieldValue('pumpCondition', 'pumpConditionOther'),
    highWaterAlarm: getFieldValue('highWaterAlarm', 'highWaterAlarmOther'),
    inletBaffle: getFieldValue('inletBaffle', 'inletBaffleOther'),
    outletBaffle: getFieldValue('outletBaffle', 'outletBaffleOther'),
    inletPipe: getFieldValue('inletPipe', 'inletPipeOther'),
    outletPipe: getFieldValue('outletPipe', 'outletPipeOther'),
    effluentLevel: getFieldValue('effluentLevel', 'effluentLevelOther'),
    tankPumped: getFieldValue('tankPumped', 'tankPumpedOther'),
    lastPumped: document.getElementById('lastPumped').value,
    tankNotes: document.getElementById('tankNotes').value,
    leachfieldType: getFieldValue('leachfieldType', 'leachfieldTypeOther'),
    testPitFindings: getFieldValue('testPitFindings', 'testPitFindingsOther'),
    vegetation: getFieldValue('vegetation', 'vegetationOther'),
    leachfieldNotes: document.getElementById('leachfieldNotes').value,
    hheProvided: document.getElementById('hheProvided').checked,
    hheNotProvided: document.getElementById('hheNotProvided').checked,
    recommendations: document.getElementById('recommendations').value,
    images: images,
  };
}

function collectSewerFormData() {
  // Sync captions from DOM before collecting
  const captionInputs = document.querySelectorAll('#sewerImageGallery .image-caption input');
  captionInputs.forEach((input, i) => {
    if (sewerImages[i]) sewerImages[i].caption = input.value;
  });

  return {
    reportType: 'sewer',
    customerName: document.getElementById('sewerCustomerName').value,
    jobAddress: document.getElementById('sewerJobAddress').value,
    inspectorName: document.getElementById('sewerInspectorName').value,
    inspectionDate: document.getElementById('sewerDate').value,
    videoLink: document.getElementById('sewerVideoLink').value,
    findings: document.getElementById('sewerFindings').value,
    images: sewerImages,
  };
}

// Get the correct form data based on active tab
function getActiveFormData() {
  return activeTab === 'sewer' ? collectSewerFormData() : collectFormData();
}

// Restore form data from a loaded draft
function restoreFormData(data) {
  // Simple text/date fields
  const textFields = [
    'customerName', 'jobAddress', 'inspectorName', 'inspectionDate',
    'lastPumped', 'tankNotes', 'leachfieldNotes', 'recommendations',
  ];
  textFields.forEach(f => {
    const el = document.getElementById(f);
    if (el && data[f] !== undefined) el.value = data[f];
  });

  // Select fields with "Other" support
  const selectFields = [
    { sel: 'tankType', other: 'tankTypeOther' },
    { sel: 'tankCapacity', other: 'tankCapacityOther' },
    { sel: 'pumpCondition', other: 'pumpConditionOther' },
    { sel: 'highWaterAlarm', other: 'highWaterAlarmOther' },
    { sel: 'inletBaffle', other: 'inletBaffleOther' },
    { sel: 'outletBaffle', other: 'outletBaffleOther' },
    { sel: 'inletPipe', other: 'inletPipeOther' },
    { sel: 'outletPipe', other: 'outletPipeOther' },
    { sel: 'effluentLevel', other: 'effluentLevelOther' },
    { sel: 'tankPumped', other: 'tankPumpedOther' },
    { sel: 'leachfieldType', other: 'leachfieldTypeOther' },
    { sel: 'testPitFindings', other: 'testPitFindingsOther' },
    { sel: 'vegetation', other: 'vegetationOther' },
  ];
  selectFields.forEach(({ sel, other }) => {
    const selectEl = document.getElementById(sel);
    const otherEl = document.getElementById(other);
    if (!selectEl || !data[sel]) return;

    // Check if the saved value matches any option
    const options = Array.from(selectEl.options).map(o => o.value || o.text);
    if (options.includes(data[sel])) {
      selectEl.value = data[sel];
    } else {
      // It was a custom "Other" value
      selectEl.value = 'Other';
      if (otherEl) {
        otherEl.value = data[sel];
        otherEl.classList.remove('hidden');
      }
    }
  });

  // Simple selects (no Other)
  if (data.pumpStation) document.getElementById('pumpStation').value = data.pumpStation;

  // Checkboxes
  if (data.hheProvided) document.getElementById('hheProvided').checked = true;
  if (data.hheNotProvided) document.getElementById('hheNotProvided').checked = true;

  // Images
  if (data.images) {
    images = data.images;
    renderImages();
  }

  // Re-trigger conditional fields
  togglePumpFields();
  toggleHHEFields();
}

function restoreSewerFormData(data) {
  document.getElementById('sewerCustomerName').value = data.customerName || '';
  document.getElementById('sewerJobAddress').value = data.jobAddress || '';
  document.getElementById('sewerInspectorName').value = data.inspectorName || 'Tyler Fish';
  document.getElementById('sewerDate').value = data.inspectionDate || '';
  document.getElementById('sewerVideoLink').value = data.videoLink || '';
  document.getElementById('sewerFindings').value = data.findings || '';

  if (data.images) {
    sewerImages = data.images;
    renderSewerImages();
  }
}

// ===== AI WRITING =====
async function improveWriting(textareaId) {
  const textarea = document.getElementById(textareaId);
  const text = textarea.value.trim();
  if (!text) return showToast('Enter some text first, then click AI Improve.', 'error');

  const apiKey = settings.apiKey;
  if (!apiKey) return showToast('Set your Claude API key in Settings first.', 'error');

  const btn = textarea.parentElement.querySelector('.btn-ai');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Working...';

  const result = await window.api.aiImproveWriting(text, apiKey);
  if (result.success) {
    textarea.value = result.text;
    showToast('Text improved!', 'success');
  } else {
    showToast('AI error: ' + result.error, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'AI Improve';
}

// ===== SEPTIC REPORT HTML GENERATION =====
function buildReportHtml(data) {
  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const field = (label, value) => {
    if (!value) return '';
    return `<tr><td style="font-weight:600;padding:4px 12px 4px 0;color:#555;white-space:nowrap;">${label}</td><td style="padding:4px 0;">${value}</td></tr>`;
  };

  let imagesHtml = '';
  if (data.images && data.images.length > 0) {
    imagesHtml = `
      <div class="photo-grid">
      <h2 style="color:#1a5276;border-bottom:2px solid #1a5276;padding-bottom:4px;margin-top:24px;">Inspection Photos</h2>
      ${data.images.map((img, idx) => `
        <div style="text-align:center;page-break-inside:avoid;margin:16px 0;">
          <img src="${img.dataUrl}" style="max-width:100%;max-height:500px;border:1px solid #ddd;border-radius:4px;">
          <p style="font-size:13px;color:#2c3e50;margin-top:8px;font-style:italic;font-weight:500;">${img.caption || 'Photo ' + (idx + 1)}</p>
        </div>
      `).join('')}
      </div>
    `;
  }

  const pumpHtml = (data.pumpStation === 'In-Tank' || data.pumpStation === 'Separate')
    ? `${field('Pump Condition', data.pumpCondition)}${field('High Water Alarm', data.highWaterAlarm)}`
    : '';

  let hheHtml = '';
  if (data.hheProvided) {
    hheHtml = `<p>Septic Design was provided and reviewed as part of this inspection.</p>`;
  } else if (data.hheNotProvided) {
    hheHtml = `<p>Septic Design was not provided.</p>
      <p style="background:#fef9e7;border:1px solid #f9e79f;padding:8px;border-radius:4px;font-size:13px;color:#7d6608;">
      Without the Septic Design, the inspector cannot verify the system's approved design capacity, component layout, or whether current use falls within the original design parameters.</p>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #2c3e50; padding: 0; line-height: 1.6; font-size: 14px; }
  h1 { color: #1a5276; font-size: 20px; margin-bottom: 2px; }
  h2 { color: #1a5276; font-size: 15px; margin-top: 14px; border-bottom: 2px solid #1a5276; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .notes { background: #f8f9fa; border-left: 3px solid #1a5276; padding: 8px 12px; margin-top: 8px; }
  .section-small { page-break-inside: avoid; break-inside: avoid; }
  h2 { page-break-after: avoid; break-after: avoid; }
  .notes { page-break-inside: avoid; break-inside: avoid; }
  .photo-grid { page-break-before: always; }
  tr { page-break-inside: avoid; }
  .company-header {
    text-align: center;
    padding: 14px 24px 10px;
    border-bottom: 2px solid #333;
    margin-bottom: 12px;
  }
  .company-name {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 30px;
    font-weight: 700;
    font-style: italic;
    color: #4a7c3f;
    margin: 0 0 6px 0;
  }
  .company-address {
    font-size: 13px;
    color: #333;
    margin: 2px 0;
  }
  .company-phone {
    font-size: 13px;
    color: #333;
    font-weight: 600;
    margin: 2px 0;
  }
  .company-tagline {
    font-size: 12px;
    color: #555;
    font-style: italic;
    margin: 10px 0 0 0;
  }
  .company-est {
    font-size: 12px;
    color: #555;
    font-style: italic;
    margin: 2px 0 0 0;
  }
  .report-body { padding: 0 20px 20px 20px; }
</style></head><body>
  <div class="company-header">
    <div class="company-name">Interstate Septic Systems</div>
    <div class="company-address">10 Gordon Drive Rockland ME 04841</div>
    <div class="company-phone">207 596 5646</div>
    <div class="company-tagline">Call us for your pumping, drain cleaning, and inspection needs</div>
    <div class="company-est">Est. 1966</div>
  </div>
  <div class="report-body">
  <h1>Septic System Inspection Report</h1>
  <hr style="border:1px solid #1a5276;margin-bottom:10px;">
  <table>
    ${field('Customer', data.customerName)}
    ${field('Job Site Address', data.jobAddress)}
    ${field('Inspector', data.inspectorName)}
    ${field('Date', formatDate(data.inspectionDate))}
  </table>

  <h2>Septic Tank</h2>
  <table>
    ${field('Tank Type', data.tankType)}
    ${field('Tank Capacity', data.tankCapacity)}
    ${field('Pump Station', data.pumpStation)}
    ${pumpHtml}
    ${field('Inlet Baffle', data.inletBaffle)}
    ${field('Outlet Baffle', data.outletBaffle)}
    ${field('Inlet Pipe', data.inletPipe)}
    ${field('Outlet Pipe', data.outletPipe)}
    ${field('Effluent Level', data.effluentLevel)}
    ${field('Tank Pumped', data.tankPumped)}
    ${field('Last Pumped', data.lastPumped)}
  </table>
  ${data.tankNotes ? `<div class="notes"><strong>Notes:</strong><br>${data.tankNotes.replace(/\n/g, '<br>')}</div>` : ''}

  <div class="section-small">
  <h2>Leachfield</h2>
  <table>
    ${field('Leachfield Type', data.leachfieldType)}
    ${field('Test Pit Findings', data.testPitFindings)}
    ${field('Vegetation', data.vegetation)}
  </table>
  ${data.leachfieldNotes ? `<div class="notes"><strong>Notes:</strong><br>${data.leachfieldNotes.replace(/\n/g, '<br>')}</div>` : ''}
  </div>

  <div class="section-small">
  <h2>Septic Design</h2>
  ${hheHtml}
  </div>

  ${data.recommendations ? `
    <h2>Recommendations</h2>
    <div class="notes">${data.recommendations.replace(/\n/g, '<br>')}</div>
  ` : ''}

  ${imagesHtml}

  <div class="disclaimer" style="margin-top:30px;padding:16px 20px;border:1px solid #ccc;border-radius:4px;background:#fafafa;font-size:11px;color:#555;line-height:1.6;page-break-inside:avoid;">
    <h3 style="font-size:13px;color:#333;margin:0 0 8px 0;text-align:center;text-transform:uppercase;letter-spacing:1px;">Septic System Inspection Disclaimer</h3>
    <p style="margin:0 0 8px 0;">The inspection conducted by Interstate Septic Systems is based on the observable conditions of the septic system at the time of the inspection. This inspection does not include any warranties, guarantees, or assurances that the system will function as intended in the future. The inspection is limited to the components that are accessible and visible at the time of the inspection. It is not a comprehensive assessment of every possible issue that may arise with the septic system.</p>
    <p style="margin:0 0 8px 0;">Due to the inherent limitations in accessing and evaluating underground and covered components, this inspection may not identify all potential problems, defects, or failures within the system. Additionally, the performance of the septic system is influenced by a variety of factors, including but not limited to soil conditions, system age, usage patterns, and maintenance practices, which are beyond the scope of this inspection.</p>
    <p style="margin:0 0 4px 0;font-weight:600;color:#333;">Limitations and Liability:</p>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li style="margin-bottom:4px;">Interstate Septic Systems assumes no liability for any undetected or future defects, malfunctions, or failures of the septic system.</li>
      <li style="margin-bottom:4px;">The findings and recommendations provided in this report are based on the conditions observed on the inspection date and are intended to offer guidance for current and future maintenance.</li>
      <li style="margin-bottom:4px;">This inspection report should not be considered a guarantee or prediction of the system's longevity, performance, or compliance with any regulatory standards.</li>
    </ul>
    <p style="margin:0 0 4px 0;font-weight:600;color:#333;">Recommendations:</p>
    <p style="margin:0 0 8px 0;">We recommend ongoing routine maintenance by a qualified septic professional and that any concerns or unusual system behavior be addressed promptly by a licensed specialist.</p>
    <p style="margin:0;font-style:italic;">By accepting this report, the client acknowledges and accepts the limitations and scope of this inspection and agrees that Interstate Septic Systems and its inspectors are not responsible for any misinterpretations, inaccuracies, or unforeseen issues that may arise after the inspection.</p>
  </div>

  <div style="margin-top:12px;padding-top:10px;border-top:1px solid #ccc;font-size:10px;color:#999;text-align:center;">
    Report generated on ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
  </div>
  </div>
</body></html>`;
}

// ===== SEWER REPORT HTML GENERATION =====
function buildSewerReportHtml(data) {
  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const field = (label, value) => {
    if (!value) return '';
    return `<tr><td style="font-weight:600;padding:4px 12px 4px 0;color:#555;white-space:nowrap;">${label}</td><td style="padding:4px 0;">${value}</td></tr>`;
  };

  let imagesHtml = '';
  if (data.images && data.images.length > 0) {
    imagesHtml = `
      <div class="photo-grid">
      <h2 style="color:#1a5276;border-bottom:2px solid #1a5276;padding-bottom:4px;margin-top:24px;">Inspection Photos</h2>
      ${data.images.map((img, idx) => `
        <div style="text-align:center;page-break-inside:avoid;margin:16px 0;">
          <img src="${img.dataUrl}" style="max-width:100%;max-height:500px;border:1px solid #ddd;border-radius:4px;">
          <p style="font-size:13px;color:#2c3e50;margin-top:8px;font-style:italic;font-weight:500;">${img.caption || 'Photo ' + (idx + 1)}</p>
        </div>
      `).join('')}
      </div>
    `;
  }

  let videoLinkHtml = '';
  if (data.videoLink) {
    videoLinkHtml = `
      <div style="margin:12px 0;page-break-inside:avoid;">
        <h2 style="color:#1a5276;border-bottom:2px solid #1a5276;padding-bottom:3px;">Video Link</h2>
        <p style="margin-top:8px;"><a href="${data.videoLink}" style="color:#2980b9;word-break:break-all;">${data.videoLink}</a></p>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #2c3e50; padding: 0; line-height: 1.6; font-size: 14px; }
  h1 { color: #1a5276; font-size: 20px; margin-bottom: 2px; }
  h2 { color: #1a5276; font-size: 15px; margin-top: 14px; border-bottom: 2px solid #1a5276; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .notes { background: #f8f9fa; border-left: 3px solid #1a5276; padding: 8px 12px; margin-top: 8px; }
  h2 { page-break-after: avoid; break-after: avoid; }
  .notes { page-break-inside: avoid; break-inside: avoid; }
  .photo-grid { page-break-before: always; }
  tr { page-break-inside: avoid; }
  .company-header {
    text-align: center;
    padding: 14px 24px 10px;
    border-bottom: 2px solid #333;
    margin-bottom: 12px;
  }
  .company-name {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 30px;
    font-weight: 700;
    font-style: italic;
    color: #4a7c3f;
    margin: 0 0 6px 0;
  }
  .company-address {
    font-size: 13px;
    color: #333;
    margin: 2px 0;
  }
  .company-phone {
    font-size: 13px;
    color: #333;
    font-weight: 600;
    margin: 2px 0;
  }
  .company-tagline {
    font-size: 12px;
    color: #555;
    font-style: italic;
    margin: 10px 0 0 0;
  }
  .company-est {
    font-size: 12px;
    color: #555;
    font-style: italic;
    margin: 2px 0 0 0;
  }
  .report-body { padding: 0 20px 20px 20px; }
</style></head><body>
  <div class="company-header">
    <div class="company-name">Interstate Septic Systems</div>
    <div class="company-address">10 Gordon Drive Rockland ME 04841</div>
    <div class="company-phone">207 596 5646</div>
    <div class="company-tagline">Call us for your pumping, drain cleaning, and inspection needs</div>
    <div class="company-est">Est. 1966</div>
  </div>
  <div class="report-body">
  <h1>Sewer Camera Inspection Report</h1>
  <hr style="border:1px solid #1a5276;margin-bottom:10px;">
  <table>
    ${field('Customer', data.customerName)}
    ${field('Job Site Address', data.jobAddress)}
    ${field('Inspector', data.inspectorName)}
    ${field('Date Completed', formatDate(data.inspectionDate))}
  </table>

  ${videoLinkHtml}

  <div style="margin:12px 0;padding:10px 14px;background:#fef9e7;border:1px solid #f9e79f;border-radius:4px;font-size:12px;color:#7d6608;page-break-inside:avoid;">
    <strong>Note:</strong> All distances listed in this report are approximate and based on the camera footage counter at the time of the inspection. Actual distances may vary.
  </div>

  ${data.findings ? `
    <h2>Summary of Findings</h2>
    <div class="notes">${data.findings.replace(/\n/g, '<br>')}</div>
  ` : ''}

  ${imagesHtml}

  <div class="disclaimer" style="margin-top:30px;padding:16px 20px;border:1px solid #ccc;border-radius:4px;background:#fafafa;font-size:11px;color:#555;line-height:1.6;page-break-inside:avoid;">
    <h3 style="font-size:13px;color:#333;margin:0 0 8px 0;text-align:center;text-transform:uppercase;letter-spacing:1px;">Sewer Camera Inspection Waiver & Disclaimer</h3>
    <p style="margin:0 0 8px 0;">Interstate Septic Systems performs sewer camera inspections as a diagnostic service to visually assess the interior condition of sewer and drain lines. The inspection is limited to what can be observed via camera at the time of service. Results may be affected by water levels, debris, pipe conditions, or access limitations.</p>
    <p style="margin:0 0 4px 0;font-weight:600;color:#333;">Limitations and Liability:</p>
    <ul style="margin:0 0 8px 16px;padding:0;">
      <li style="margin-bottom:4px;">Interstate Septic Systems is not responsible for any pre-existing damage, blockages, or conditions within the sewer line that may not be visible during the camera inspection.</li>
      <li style="margin-bottom:4px;">The camera inspection does not guarantee the identification of all defects, obstructions, or issues within the sewer line. Some conditions may only become apparent over time or through more invasive investigation.</li>
      <li style="margin-bottom:4px;">All distances and measurements provided in this report are approximations based on the camera footage counter and may not reflect exact distances.</li>
      <li style="margin-bottom:4px;">This inspection report should not be considered a guarantee or prediction of the sewer line's longevity, performance, or compliance with any regulatory standards.</li>
    </ul>
    <p style="margin:0 0 4px 0;font-weight:600;color:#333;">Recommendations:</p>
    <p style="margin:0 0 8px 0;">We recommend addressing any concerns identified in this report promptly and consulting with a licensed professional for any necessary repairs or further evaluation.</p>
    <p style="margin:0;font-style:italic;">By accepting this report, the client acknowledges and accepts the limitations and scope of this inspection and agrees that Interstate Septic Systems and its inspectors are not responsible for any misinterpretations, inaccuracies, or unforeseen issues that may arise after the inspection.</p>
  </div>

  <div style="margin-top:12px;padding-top:10px;border-top:1px solid #ccc;font-size:10px;color:#999;text-align:center;">
    Report generated on ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
  </div>
  </div>
</body></html>`;
}

// ===== PREVIEW =====
function previewReport() {
  const data = getActiveFormData();
  const html = activeTab === 'sewer' ? buildSewerReportHtml(data) : buildReportHtml(data);
  document.getElementById('previewContent').innerHTML = html;
  showModal('previewModal');
}

// ===== PDF GENERATION =====
async function generatePdf() {
  const data = getActiveFormData();
  const html = activeTab === 'sewer' ? buildSewerReportHtml(data) : buildReportHtml(data);
  const customerName = data.customerName || 'Inspection';
  const date = data.inspectionDate || new Date().toISOString().split('T')[0];
  const prefix = activeTab === 'sewer' ? 'SewerCam_' : '';
  const filename = `${prefix}${customerName.replace(/[^a-zA-Z0-9]/g, '_')}_${date}.pdf`;

  showToast('Generating PDF...', '');
  const result = await window.api.generatePdf(html, filename);
  if (result.success) {
    lastPdfPath = result.path;
    showToast('PDF saved: ' + filename, 'success');

    // Auto-save to Google Drive
    try {
      const driveResult = await window.api.copyToGoogleDrive(result.path, filename);
      if (driveResult.success && driveResult.message) {
        showToast(driveResult.message, 'success');
      }
    } catch (e) { /* silently skip if not configured */ }

    if (confirm('PDF generated! Open it now?')) {
      window.api.openFile(result.path);
    }
  } else {
    showToast('PDF error: ' + result.error, 'error');
  }
}

// ===== EMAIL =====
function showEmailModal() {
  const data = getActiveFormData();
  const name = data.customerName || 'Customer';
  const addr = data.jobAddress || '';

  if (activeTab === 'sewer') {
    document.getElementById('emailSubject').value = `Sewer Camera Inspection Report - ${name}${addr ? ' - ' + addr : ''}`;
    document.getElementById('emailBody').value = `Hello,\n\nPlease find attached the sewer camera inspection report for ${name}${addr ? ' at ' + addr : ''}.\n\nPlease let me know if you have any questions.\n\nThank you,\nTyler Fish`;
  } else {
    document.getElementById('emailSubject').value = `Septic Inspection Report - ${name}${addr ? ' - ' + addr : ''}`;
    document.getElementById('emailBody').value = `Hello,\n\nPlease find attached the septic system inspection report for ${name}${addr ? ' at ' + addr : ''}.\n\nPlease let me know if you have any questions.\n\nThank you,\nTyler Fish`;
  }
  showModal('emailModal');
}

async function sendEmail() {
  if (!lastPdfPath) {
    showToast('Generate a PDF first before emailing.', 'error');
    return;
  }

  if (!settings.smtpHost || !settings.smtpUser) {
    showToast('Configure email settings first.', 'error');
    return;
  }

  const to = document.getElementById('emailTo').value.trim();
  if (!to) return showToast('Enter a recipient email address.', 'error');

  showToast('Sending email...', '');
  const result = await window.api.sendEmail({
    emailConfig: {
      host: settings.smtpHost,
      port: settings.smtpPort,
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
    to,
    cc: document.getElementById('emailCc').value.trim(),
    subject: document.getElementById('emailSubject').value,
    body: document.getElementById('emailBody').value,
    attachmentPath: lastPdfPath,
  });

  if (result.success) {
    showToast('Email sent successfully!', 'success');
    closeModal('emailModal');
  } else {
    showToast('Email error: ' + result.error, 'error');
  }
}

// ===== SAVE / LOAD DRAFTS =====
async function saveDraft() {
  const data = getActiveFormData();
  const name = data.customerName || 'Untitled';
  const date = data.inspectionDate || new Date().toISOString().split('T')[0];
  const prefix = activeTab === 'sewer' ? 'Sewer_' : '';
  const filename = `${prefix}${name.replace(/[^a-zA-Z0-9]/g, '_')}_${date}.json`;
  await window.api.saveDraft(filename, data);
  showToast('Draft saved: ' + filename, 'success');
}

async function showDraftsModal() {
  showModal('draftsModal');
  const drafts = await window.api.listDrafts();
  const list = document.getElementById('draftsList');
  if (drafts.length === 0) {
    list.innerHTML = '<li style="color: var(--text-light); justify-content: center;">No saved drafts.</li>';
    return;
  }
  list.innerHTML = drafts.map(d => `
    <li onclick="loadDraft('${d.filename}')">
      <div>
        <div class="draft-name">${d.filename.replace('.json', '').replace(/_/g, ' ')}</div>
        <div class="draft-date">${new Date(d.modified).toLocaleString()}</div>
      </div>
      <button class="btn btn-danger" style="padding:4px 10px;font-size:12px;" onclick="event.stopPropagation(); deleteDraft('${d.filename}')">Delete</button>
    </li>
  `).join('');
}

async function loadDraft(filename) {
  const data = await window.api.loadDraft(filename);
  if (data) {
    if (data.reportType === 'sewer') {
      switchTab('sewer');
      restoreSewerFormData(data);
    } else {
      switchTab('septic');
      restoreFormData(data);
    }
    closeModal('draftsModal');
    showToast('Draft loaded!', 'success');
  }
}

async function deleteDraft(filename) {
  if (confirm('Delete this draft?')) {
    await window.api.deleteDraft(filename);
    showDraftsModal();
    showToast('Draft deleted.', 'success');
  }
}

// ===== SETTINGS =====
async function showSettingsModal() {
  settings = await window.api.loadSettings();
  document.getElementById('settingsApiKey').value = settings.apiKey || '';
  document.getElementById('settingsSmtpHost').value = settings.smtpHost || '';
  document.getElementById('settingsSmtpPort').value = settings.smtpPort || '587';
  document.getElementById('settingsSmtpUser').value = settings.smtpUser || '';
  document.getElementById('settingsSmtpPass').value = settings.smtpPass || '';
  document.getElementById('settingsGoogleDriveFolder').value = settings.googleDriveFolder || '';
  showModal('settingsModal');
}

async function saveSettings() {
  settings = {
    apiKey: document.getElementById('settingsApiKey').value.trim(),
    smtpHost: document.getElementById('settingsSmtpHost').value.trim(),
    smtpPort: document.getElementById('settingsSmtpPort').value.trim(),
    smtpUser: document.getElementById('settingsSmtpUser').value.trim(),
    smtpPass: document.getElementById('settingsSmtpPass').value.trim(),
    googleDriveFolder: document.getElementById('settingsGoogleDriveFolder').value.trim(),
  };
  await window.api.saveSettings(settings);
  closeModal('settingsModal');
  showToast('Settings saved!', 'success');
}

// ===== CLEAR FORM =====
function clearForm() {
  if (!confirm('Clear all fields? This cannot be undone.')) return;
  document.querySelectorAll('#septicTab input[type="text"], #septicTab input[type="date"], #septicTab textarea, #septicTab select').forEach(el => {
    if (el.id === 'inspectorName') return; // Keep Tyler Fish
    el.value = '';
  });
  document.querySelectorAll('#septicTab input[type="checkbox"]').forEach(el => el.checked = false);
  document.querySelectorAll('#septicTab .other-input').forEach(el => {
    el.value = '';
    el.classList.add('hidden');
  });
  images = [];
  renderImages();
  // Reset conditional fields
  togglePumpFields();
  toggleHHEFields();
  // Re-set date
  document.getElementById('inspectionDate').value = new Date().toISOString().split('T')[0];
  showToast('Form cleared.', 'success');
}

function clearSewerForm() {
  if (!confirm('Clear all fields? This cannot be undone.')) return;
  document.querySelectorAll('#sewerTab input[type="text"], #sewerTab input[type="date"], #sewerTab textarea').forEach(el => {
    if (el.id === 'sewerInspectorName') return; // Keep Tyler Fish
    el.value = '';
  });
  sewerImages = [];
  renderSewerImages();
  // Re-set date
  document.getElementById('sewerDate').value = new Date().toISOString().split('T')[0];
  showToast('Form cleared.', 'success');
}

// ===== MODAL HELPERS =====
function showModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Close modals on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
    e.target.classList.remove('active');
  }
});

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
