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
  customFields: [],   // { id, label, sectionId, options[] }
  customSections: [],  // { id, title, fields: [{ id, label, options[] }] }
};

// Dropdowns that should NOT get an "Other" option (pumpStation uses conditional logic, not Other)
const NO_OTHER_DROPDOWNS = ['pumpStation'];

// Default disclaimer text (uses {companyName} placeholder)
const DEFAULT_SEPTIC_DISCLAIMER = `The inspection conducted by {companyName} is based on the observable conditions of the septic system at the time of the inspection. This inspection does not include any warranties, guarantees, or assurances that the system will function as intended in the future. The inspection is limited to the components that are accessible and visible at the time of the inspection. It is not a comprehensive assessment of every possible issue that may arise with the septic system.

Due to the inherent limitations in accessing and evaluating underground and covered components, this inspection may not identify all potential problems, defects, or failures within the system. Additionally, the performance of the septic system is influenced by a variety of factors, including but not limited to soil conditions, system age, usage patterns, and maintenance practices, which are beyond the scope of this inspection.

Limitations and Liability:
- {companyName} assumes no liability for any undetected or future defects, malfunctions, or failures of the septic system.
- The findings and recommendations provided in this report are based on the conditions observed on the inspection date and are intended to offer guidance for current and future maintenance.
- This inspection report should not be considered a guarantee or prediction of the system's longevity, performance, or compliance with any regulatory standards.

Recommendations:
We recommend ongoing routine maintenance by a qualified septic professional and that any concerns or unusual system behavior be addressed promptly by a licensed specialist.

By accepting this report, the client acknowledges and accepts the limitations and scope of this inspection and agrees that {companyName} and its inspectors are not responsible for any misinterpretations, inaccuracies, or unforeseen issues that may arise after the inspection.`;

const DEFAULT_SEWER_DISCLAIMER = `{companyName} performs sewer camera inspections as a diagnostic service to visually assess the interior condition of sewer and drain lines. The inspection is limited to what can be observed via camera at the time of service. Results may be affected by water levels, debris, pipe conditions, or access limitations.

Limitations and Liability:
- {companyName} is not responsible for any pre-existing damage, blockages, or conditions within the sewer line that may not be visible during the camera inspection.
- The camera inspection does not guarantee the identification of all defects, obstructions, or issues within the sewer line. Some conditions may only become apparent over time or through more invasive investigation.
- All distances and measurements provided in this report are approximations based on the camera footage counter and may not reflect exact distances.
- This inspection report should not be considered a guarantee or prediction of the sewer line's longevity, performance, or compliance with any regulatory standards.

Recommendations:
We recommend addressing any concerns identified in this report promptly and consulting with a licensed professional for any necessary repairs or further evaluation.

By accepting this report, the client acknowledges and accepts the limitations and scope of this inspection and agrees that {companyName} and its inspectors are not responsible for any misinterpretations, inaccuracies, or unforeseen issues that may arise after the inspection.`;

// Map section-body elements to a sectionId for custom field insertion
const SECTION_IDS = ['headerInfo', 'septicTank', 'leachfield', 'hhe200', 'inspectionPhotos', 'recommendations'];

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

  addEditModeButtons();
  updateEditModeVisibility();

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
      <button class="btn-move" style="display:flex${i === 0 ? ';opacity:0.3' : ''}" onclick="moveOption(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Move up">&#9650;</button>
      <button class="btn-move" style="display:flex${i === editingOptions.length - 1 ? ';opacity:0.3' : ''}" onclick="moveOption(${i}, 1)" ${i === editingOptions.length - 1 ? 'disabled' : ''} title="Move down">&#9660;</button>
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

  // Also update the options stored in customFields/customSections
  const cf = (fieldConfig.customFields || []).find(f => f.id === editingDropdownId);
  if (cf) cf.options = [...editingOptions];
  (fieldConfig.customSections || []).forEach(cs => {
    const sf = (cs.fields || []).find(f => f.id === editingDropdownId);
    if (sf) sf.options = [...editingOptions];
  });

  populateDropdowns();
  // Re-populate custom field selects too
  const sel = document.getElementById(editingDropdownId);
  if (sel && sel.closest('.custom-field-row')) {
    while (sel.options.length > 1) sel.remove(1);
    editingOptions.forEach(opt => {
      const o = document.createElement('option');
      o.textContent = opt; o.value = opt;
      sel.appendChild(o);
    });
    const o = document.createElement('option');
    o.textContent = 'Other'; o.value = 'Other';
    sel.appendChild(o);
  }

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

// ===== CUSTOM FIELDS & SECTIONS =====
function renderCustomFields() {
  if (!fieldConfig) return;
  // Remove any previously rendered custom fields
  document.querySelectorAll('.custom-field-row').forEach(el => el.remove());

  (fieldConfig.customFields || []).forEach(cf => {
    const sectionIdx = SECTION_IDS.indexOf(cf.sectionId);
    if (sectionIdx < 0) return;
    const sectionBodies = document.querySelectorAll('#septicTab .section .section-body');
    const sectionBody = sectionBodies[sectionIdx];
    if (!sectionBody) return;
    // Insert before the "Add Field" button row if it exists, else append
    const addBtnRow = sectionBody.querySelector('.add-field-row');
    const row = document.createElement('div');
    row.className = 'form-row single custom-field-row';
    row.setAttribute('data-custom-field', cf.id);
    row.innerHTML = `
      <div class="form-group">
        <div class="reorder-controls">
          <button class="btn-move" style="display:inline-block" onclick="moveCustomField('${cf.id}',-1)" title="Move up">&#9650;</button>
          <button class="btn-move" style="display:inline-block" onclick="moveCustomField('${cf.id}',1)" title="Move down">&#9660;</button>
        </div>
        <label data-editable="${cf.id}">${cf.label}</label>
        <div class="select-edit-wrapper">
          <select id="${cf.id}" onchange="toggleOtherField(this, '${cf.id}Other')">
            <option value="">-- Select --</option>
            ${(cf.options || []).map(o => `<option value="${o}">${o}</option>`).join('')}
            <option value="Other">Other</option>
          </select>
          <button class="edit-field-btn" onclick="event.stopPropagation(); openDropdownEditor('${cf.id}')" title="Edit options">&#9998;</button>
        </div>
        <input type="text" id="${cf.id}Other" class="other-input hidden" placeholder="Specify...">
        <button class="btn-remove-custom" onclick="removeCustomField('${cf.id}')" title="Remove this field">&times; Remove Field</button>
      </div>
    `;
    if (addBtnRow) sectionBody.insertBefore(row, addBtnRow);
    else sectionBody.appendChild(row);
  });
}

function renderCustomSections() {
  if (!fieldConfig) return;
  // Remove any previously rendered custom sections
  document.querySelectorAll('.custom-section').forEach(el => el.remove());

  (fieldConfig.customSections || []).forEach(cs => {
    const section = document.createElement('div');
    section.className = 'section custom-section';
    section.setAttribute('data-custom-section', cs.id);
    let fieldsHtml = (cs.fields || []).map(f => `
      <div class="form-row single custom-field-row" data-custom-field="${f.id}">
        <div class="form-group">
          <div class="reorder-controls">
            <button class="btn-move" style="display:inline-block" onclick="moveCustomSectionField('${cs.id}','${f.id}',-1)" title="Move up">&#9650;</button>
            <button class="btn-move" style="display:inline-block" onclick="moveCustomSectionField('${cs.id}','${f.id}',1)" title="Move down">&#9660;</button>
          </div>
          <label data-editable="${f.id}">${f.label}</label>
          <div class="select-edit-wrapper">
            <select id="${f.id}" onchange="toggleOtherField(this, '${f.id}Other')">
              <option value="">-- Select --</option>
              ${(f.options || []).map(o => `<option value="${o}">${o}</option>`).join('')}
              <option value="Other">Other</option>
            </select>
            <button class="edit-field-btn" onclick="event.stopPropagation(); openDropdownEditor('${f.id}')" title="Edit options">&#9998;</button>
          </div>
          <input type="text" id="${f.id}Other" class="other-input hidden" placeholder="Specify...">
          <button class="btn-remove-custom" onclick="removeCustomSectionField('${cs.id}','${f.id}')" title="Remove this field">&times; Remove Field</button>
        </div>
      </div>
    `).join('');

    section.innerHTML = `
      <div class="section-header" onclick="toggleSection(this)" data-editable="true" data-section="custom_${cs.id}">
        ${cs.title} <span class="chevron">&#9660;</span>
      </div>
      <div class="section-body">
        <div class="section-reorder">
          <button class="btn-move" style="display:inline-block" onclick="moveSectionById('${cs.id}',-1)" title="Move section up">&#9650; Move Up</button>
          <button class="btn-move" style="display:inline-block" onclick="moveSectionById('${cs.id}',1)" title="Move section down">&#9660; Move Down</button>
          <button class="btn-move" style="display:inline-block;background:#e74c3c;margin-left:8px;" onclick="hideSection('${cs.id}')" title="Delete section">&#10005; Delete</button>
        </div>
        ${fieldsHtml}
        <div class="form-row single custom-field-row" data-custom-field="notes_${cs.id}">
          <div class="form-group">
            <label>Notes</label>
            <textarea id="notes_${cs.id}" placeholder="Additional notes..."></textarea>
          </div>
        </div>
        <div class="add-field-row" style="display:none;">
          <button class="btn btn-add-field" onclick="showAddFieldModal('custom_${cs.id}')">+ Add Field</button>
        </div>
        <button class="btn-remove-custom btn-remove-section" onclick="removeCustomSection('${cs.id}')" style="display:none;">&times; Remove Section</button>
      </div>
    `;
    // Insert before the actions bar
    const actionsBar = document.querySelector('#septicTab .actions-bar');
    if (actionsBar) actionsBar.parentElement.insertBefore(section, actionsBar);
  });
}

function addEditModeButtons() {
  // Remove existing add-field rows in built-in sections only (not custom sections)
  document.querySelectorAll('.section:not(.custom-section) .add-field-row').forEach(el => el.remove());
  document.querySelectorAll('#addSectionBtn').forEach(el => el.remove());

  // Add "Add Field" button to each built-in section body (skip photos and HHE)
  const sectionBodies = document.querySelectorAll('#septicTab .section .section-body');
  const allowAddField = [1, 2]; // septicTank=1, leachfield=2
  allowAddField.forEach(idx => {
    const body = sectionBodies[idx];
    if (!body || body.querySelector('.add-field-row')) return;
    const row = document.createElement('div');
    row.className = 'add-field-row';
    row.style.display = editMode ? '' : 'none';
    row.innerHTML = `<button class="btn btn-add-field" onclick="showAddFieldModal('${SECTION_IDS[idx]}')">+ Add Field</button>`;
    body.appendChild(row);
  });

  // Add field buttons in custom sections
  document.querySelectorAll('.custom-section .add-field-row').forEach(row => {
    row.style.display = editMode ? '' : 'none';
  });

  // Add "Add Section" button before the actions bar
  const actionsBar = document.querySelector('#septicTab .actions-bar');
  if (actionsBar && !document.getElementById('addSectionBtn')) {
    const btn = document.createElement('div');
    btn.id = 'addSectionBtn';
    btn.style.display = editMode ? '' : 'none';
    btn.innerHTML = `<button class="btn btn-add-section" onclick="showAddSectionModal()">+ Add New Section</button>`;
    actionsBar.parentElement.insertBefore(btn, actionsBar);
  }
}

function showAddFieldModal(sectionId) {
  document.getElementById('addFieldSectionId').value = sectionId;
  document.getElementById('addFieldName').value = '';
  document.getElementById('addFieldOptions').value = '';
  showModal('addFieldModal');
  document.getElementById('addFieldName').focus();
}

function confirmAddField() {
  const sectionId = document.getElementById('addFieldSectionId').value;
  const name = document.getElementById('addFieldName').value.trim();
  if (!name) { showToast('Enter a field name.', 'error'); return; }
  const optStr = document.getElementById('addFieldOptions').value;
  const optList = optStr ? optStr.split(',').map(o => o.trim()).filter(o => o) : ['Good', 'Fair', 'Poor'];
  const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  if (sectionId.startsWith('custom_')) {
    const csId = sectionId.replace('custom_', '');
    const cs = (fieldConfig.customSections || []).find(s => s.id === csId);
    if (cs) cs.fields.push({ id, label: name, options: optList });
  } else {
    if (!fieldConfig.customFields) fieldConfig.customFields = [];
    fieldConfig.customFields.push({ id, label: name, sectionId, options: optList });
  }
  fieldConfig.dropdowns[id] = optList;
  saveFieldConfig();
  renderCustomFields();
  renderCustomSections();
  addEditModeButtons();
  updateEditModeVisibility();
  closeModal('addFieldModal');
  showToast('Field added!', 'success');
}

function showAddSectionModal() {
  document.getElementById('addSectionName').value = '';
  showModal('addSectionModal');
  document.getElementById('addSectionName').focus();
}

function confirmAddSection() {
  const title = document.getElementById('addSectionName').value.trim();
  if (!title) { showToast('Enter a section name.', 'error'); return; }
  const id = 'section_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  if (!fieldConfig.customSections) fieldConfig.customSections = [];
  fieldConfig.customSections.push({ id, title, fields: [] });
  saveFieldConfig();
  renderCustomSections();
  addEditModeButtons();
  updateEditModeVisibility();
  closeModal('addSectionModal');
  showToast('Section added! Use "+ Add Field" to add dropdowns.', 'success');
}

// ===== CONFIRM MODAL HELPER =====
function showConfirmModal(title, message, onConfirm) {
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalMessage').textContent = message;
  const okBtn = document.getElementById('confirmModalOk');
  const newBtn = okBtn.cloneNode(true); // remove old listeners
  okBtn.parentNode.replaceChild(newBtn, okBtn);
  newBtn.addEventListener('click', () => { closeModal('confirmModal'); onConfirm(); });
  showModal('confirmModal');
}

function removeCustomField(fieldId) {
  showConfirmModal('Remove Field', 'Remove this custom field?', () => {
    fieldConfig.customFields = (fieldConfig.customFields || []).filter(f => f.id !== fieldId);
    delete fieldConfig.dropdowns[fieldId];
    saveFieldConfig();
    renderCustomFields();
    addEditModeButtons();
    updateEditModeVisibility();
    showToast('Field removed.', 'success');
  });
}

function removeCustomSectionField(sectionId, fieldId) {
  showConfirmModal('Remove Field', 'Remove this field?', () => {
    const cs = (fieldConfig.customSections || []).find(s => s.id === sectionId);
    if (cs) cs.fields = cs.fields.filter(f => f.id !== fieldId);
    delete fieldConfig.dropdowns[fieldId];
    saveFieldConfig();
    renderCustomSections();
    addEditModeButtons();
    updateEditModeVisibility();
    showToast('Field removed.', 'success');
  });
}

function removeCustomSection(sectionId) {
  showConfirmModal('Remove Section', 'Remove this entire section and all its fields?', () => {
    const cs = (fieldConfig.customSections || []).find(s => s.id === sectionId);
    if (cs) {
      (cs.fields || []).forEach(f => delete fieldConfig.dropdowns[f.id]);
    }
    fieldConfig.customSections = (fieldConfig.customSections || []).filter(s => s.id !== sectionId);
    saveFieldConfig();
    renderCustomSections();
    addEditModeButtons();
    updateEditModeVisibility();
    showToast('Section removed.', 'success');
  });
}

// ===== REORDER FUNCTIONS =====
function moveCustomField(fieldId, direction) {
  const arr = fieldConfig.customFields || [];
  const idx = arr.findIndex(f => f.id === fieldId);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= arr.length) return;
  // Swap in data
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  saveFieldConfig();
  // Swap in DOM
  const row = document.querySelector(`[data-custom-field="${fieldId}"]`);
  const sibling = direction === -1 ? row.previousElementSibling : row.nextElementSibling;
  if (row && sibling && sibling.classList.contains('custom-field-row')) {
    if (direction === -1) sibling.before(row);
    else sibling.after(row);
    flashElement(row);
  }
}

function moveCustomSectionField(sectionId, fieldId, direction) {
  const cs = (fieldConfig.customSections || []).find(s => s.id === sectionId);
  if (!cs) return;
  const arr = cs.fields || [];
  const idx = arr.findIndex(f => f.id === fieldId);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= arr.length) return;
  // Swap in data
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  saveFieldConfig();
  // Swap in DOM
  const row = document.querySelector(`[data-custom-field="${fieldId}"]`);
  const sibling = direction === -1 ? row.previousElementSibling : row.nextElementSibling;
  if (row && sibling && sibling.classList.contains('custom-field-row') && !sibling.getAttribute('data-custom-field')?.startsWith('notes_')) {
    if (direction === -1) sibling.before(row);
    else sibling.after(row);
    flashElement(row);
  }
}

function moveCustomSection(sectionId, direction) {
  // Delegate to unified section mover
  moveSectionById(sectionId, direction);
}

// Visual feedback flash when element moves
function flashElement(el) {
  el.style.transition = 'background-color 0.3s';
  el.style.backgroundColor = '#f39c1233';
  setTimeout(() => {
    el.style.backgroundColor = '';
    setTimeout(() => { el.style.transition = ''; }, 300);
  }, 400);
}

function updateEditModeVisibility() {
  // Show/hide edit-only elements based on edit mode state
  document.querySelectorAll('.add-field-row').forEach(r => r.style.display = editMode ? 'block' : 'none');
  const addSectionBtn = document.getElementById('addSectionBtn');
  if (addSectionBtn) addSectionBtn.style.display = editMode ? 'block' : 'none';
  document.querySelectorAll('.btn-remove-custom').forEach(b => b.style.display = editMode ? 'block' : 'none');

  // Add/remove "Restore Deleted Items" button
  let restoreBtn = document.getElementById('restoreDeletedBtn');
  if (editMode) {
    if (!restoreBtn) {
      restoreBtn = document.createElement('div');
      restoreBtn.id = 'restoreDeletedBtn';
      restoreBtn.style.textAlign = 'center';
      restoreBtn.style.margin = '8px 0';
      restoreBtn.innerHTML = '<button class="btn" style="background:#8e44ad;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;" onclick="showRestoreModal()">Restore Deleted Items</button>';
      const actionsBar = document.querySelector('#septicTab .actions-bar');
      if (actionsBar) actionsBar.parentElement.insertBefore(restoreBtn, actionsBar);
    }
    restoreBtn.style.display = 'block';
  } else {
    if (restoreBtn) restoreBtn.style.display = 'none';
  }

  // Add/remove section reorder controls
  addSectionReorderControls();
  // Add/remove field reorder controls within sections
  addFieldReorderControls();
}

// ===== FIELD REORDERING (WITHIN SECTIONS) =====
function addFieldReorderControls() {
  // Remove any previously injected field reorder buttons
  document.querySelectorAll('.field-reorder-btn-group').forEach(el => el.remove());

  if (!editMode) return;

  document.querySelectorAll('#septicTab .section .section-body').forEach(sectionBody => {
    const rows = Array.from(sectionBody.querySelectorAll(':scope > .form-row'))
      .filter(r => !r.classList.contains('add-field-row'));

    if (rows.length < 2) return; // no point if only 0-1 rows

    rows.forEach((row, idx) => {
      const btnGroup = document.createElement('div');
      btnGroup.className = 'field-reorder-btn-group';
      btnGroup.style.cssText = 'grid-column: 1 / -1; display:flex; gap:4px; align-items:center; margin-bottom:2px;';

      const upBtn = document.createElement('button');
      upBtn.className = 'btn-move';
      upBtn.style.cssText = 'display:inline-block;padding:2px 8px;font-size:12px;';
      upBtn.innerHTML = '&#9650;';
      upBtn.title = 'Move field up';
      if (idx === 0) { upBtn.disabled = true; upBtn.style.opacity = '0.3'; }

      const downBtn = document.createElement('button');
      downBtn.className = 'btn-move';
      downBtn.style.cssText = 'display:inline-block;padding:2px 8px;font-size:12px;';
      downBtn.innerHTML = '&#9660;';
      downBtn.title = 'Move field down';
      if (idx === rows.length - 1) { downBtn.disabled = true; downBtn.style.opacity = '0.3'; }

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-move';
      delBtn.style.cssText = 'display:inline-block;padding:2px 8px;font-size:12px;background:#e74c3c;color:#fff;';
      delBtn.innerHTML = '&#10005;';
      delBtn.title = 'Delete field';

      const currentRow = row;
      upBtn.onclick = (e) => { e.stopPropagation(); moveFieldRow(currentRow, -1); };
      downBtn.onclick = (e) => { e.stopPropagation(); moveFieldRow(currentRow, 1); };
      delBtn.onclick = (e) => { e.stopPropagation(); hideFieldRow(currentRow); };

      btnGroup.appendChild(upBtn);
      btnGroup.appendChild(downBtn);
      btnGroup.appendChild(delBtn);
      row.insertBefore(btnGroup, row.firstChild);
    });
  });
}

function moveFieldRow(row, direction) {
  const sectionBody = row.parentElement;
  const rows = Array.from(sectionBody.querySelectorAll(':scope > .form-row'))
    .filter(r => !r.classList.contains('add-field-row'));

  const idx = rows.indexOf(row);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= rows.length) return;

  const sibling = rows[newIdx];
  if (direction === -1) {
    sibling.before(row);
  } else {
    sibling.after(row);
  }

  flashElement(row);
  saveFieldOrder();
  addFieldReorderControls();
}

function saveFieldOrder() {
  if (!fieldConfig) return;
  if (!fieldConfig.fieldOrder) fieldConfig.fieldOrder = {};

  document.querySelectorAll('#septicTab .section[data-section-id]').forEach(section => {
    const sectionId = section.getAttribute('data-section-id');
    const sectionBody = section.querySelector('.section-body');
    if (!sectionBody) return;
    const rows = Array.from(sectionBody.querySelectorAll(':scope > .form-row'))
      .filter(r => !r.classList.contains('add-field-row'));

    const order = rows.map(row => {
      const firstEl = row.querySelector('input, select, textarea');
      return firstEl ? firstEl.id : '';
    }).filter(Boolean);

    if (order.length > 0) fieldConfig.fieldOrder[sectionId] = order;
  });

  saveFieldConfig();
}

function applyFieldOrder() {
  if (!fieldConfig || !fieldConfig.fieldOrder) return;

  Object.keys(fieldConfig.fieldOrder).forEach(sectionId => {
    const section = document.querySelector(`[data-section-id="${sectionId}"]`);
    if (!section) return;
    const sectionBody = section.querySelector('.section-body');
    if (!sectionBody) return;

    const order = fieldConfig.fieldOrder[sectionId];
    const rows = Array.from(sectionBody.querySelectorAll(':scope > .form-row'))
      .filter(r => !r.classList.contains('add-field-row'));

    // Map rows by their first input ID
    const rowMap = {};
    rows.forEach(row => {
      const firstEl = row.querySelector('input, select, textarea');
      if (firstEl) rowMap[firstEl.id] = row;
    });

    // Find insertion reference point
    const addFieldRow = sectionBody.querySelector('.add-field-row');

    order.forEach(id => {
      const row = rowMap[id];
      if (row) {
        sectionBody.insertBefore(row, addFieldRow || null);
      }
    });
  });
}

// ===== SECTION REORDERING (ALL SECTIONS) =====
function addSectionReorderControls() {
  // Remove any previously injected reorder controls
  document.querySelectorAll('.section-reorder-builtin').forEach(el => el.remove());

  if (!editMode) return;

  const container = document.getElementById('septicTab');
  const allSections = Array.from(container.querySelectorAll(':scope > .section'));

  allSections.forEach((section, idx) => {
    // Skip custom sections that already have their own reorder controls
    if (section.classList.contains('custom-section')) return;

    const sectionBody = section.querySelector('.section-body');
    if (!sectionBody) return;

    const sectionId = section.getAttribute('data-section-id') || '';
    const isFirst = idx === 0;
    const isLast = idx === allSections.length - 1;

    const controls = document.createElement('div');
    controls.className = 'section-reorder section-reorder-builtin';
    controls.style.display = 'flex';
    controls.style.justifyContent = 'center';
    controls.style.gap = '8px';
    controls.style.marginBottom = '8px';
    controls.innerHTML = `
      <button class="btn-move" style="display:inline-block${isFirst ? ';opacity:0.3' : ''}" onclick="moveSectionById('${sectionId}', -1)" ${isFirst ? 'disabled' : ''} title="Move section up">&#9650; Move Up</button>
      <button class="btn-move" style="display:inline-block${isLast ? ';opacity:0.3' : ''}" onclick="moveSectionById('${sectionId}', 1)" ${isLast ? 'disabled' : ''} title="Move section down">&#9660; Move Down</button>
      <button class="btn-move" style="display:inline-block;background:#e74c3c;margin-left:8px;" onclick="hideSection('${sectionId}')" title="Delete section">&#10005; Delete</button>
    `;
    sectionBody.insertBefore(controls, sectionBody.firstChild);
  });
}

function moveSectionById(sectionId, direction) {
  const container = document.getElementById('septicTab');
  const allSections = Array.from(container.querySelectorAll(':scope > .section'));

  // Find the section by data-section-id or data-custom-section
  const section = allSections.find(s =>
    s.getAttribute('data-section-id') === sectionId ||
    s.getAttribute('data-custom-section') === sectionId
  );
  if (!section) return;

  const idx = allSections.indexOf(section);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= allSections.length) return;

  const sibling = allSections[newIdx];
  if (direction === -1) {
    sibling.before(section);
  } else {
    sibling.after(section);
  }

  flashElement(section);
  section.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Save order and refresh controls
  saveSectionOrder();
  addSectionReorderControls();
}

function saveSectionOrder() {
  const container = document.getElementById('septicTab');
  const allSections = Array.from(container.querySelectorAll(':scope > .section'));
  const order = allSections.map(s => {
    return s.getAttribute('data-section-id') || s.getAttribute('data-custom-section') || '';
  }).filter(Boolean);
  fieldConfig.sectionOrder = order;
  saveFieldConfig();
}

function applySectionOrder() {
  if (!fieldConfig || !fieldConfig.sectionOrder || fieldConfig.sectionOrder.length === 0) return;

  const container = document.getElementById('septicTab');
  const actionsBar = container.querySelector('.actions-bar');
  if (!actionsBar) return;

  fieldConfig.sectionOrder.forEach(id => {
    const section = container.querySelector(`[data-section-id="${id}"]`) ||
                    container.querySelector(`[data-custom-section="${id}"]`);
    if (section) {
      container.insertBefore(section, actionsBar);
    }
  });
}

// ===== HIDE / DELETE ITEMS =====
function hideSection(sectionId) {
  if (!fieldConfig) return;
  if (!fieldConfig.hiddenSections) fieldConfig.hiddenSections = [];

  // Find section label for restore UI
  const section = document.querySelector(`[data-section-id="${sectionId}"]`) ||
                  document.querySelector(`[data-custom-section="${sectionId}"]`);
  if (!section) return;

  const header = section.querySelector('.section-header');
  const label = header ? header.textContent.replace(/[\u25B2\u25BC\u25B6\u25C0\u2716]/g, '').trim() : sectionId;

  if (!fieldConfig.hiddenSections.find(h => h.id === sectionId)) {
    fieldConfig.hiddenSections.push({ id: sectionId, label: label });
  }

  section.style.display = 'none';
  saveFieldConfig();
  showToast(`"${label}" section hidden. Use Restore Deleted Items in edit mode to bring it back.`, 'success');
}

function hideFieldRow(row) {
  if (!fieldConfig) return;
  if (!fieldConfig.hiddenFields) fieldConfig.hiddenFields = [];

  // Identify the field by first input/select/textarea ID
  const firstEl = row.querySelector('input:not(.other-input), select, textarea');
  if (!firstEl || !firstEl.id) return;
  const fieldId = firstEl.id;

  // Find section this field belongs to
  const section = row.closest('.section');
  const sectionId = section ? (section.getAttribute('data-section-id') || section.getAttribute('data-custom-section') || '') : '';

  // Get label text
  const labelEl = row.querySelector('label');
  const label = labelEl ? labelEl.textContent.trim() : fieldId;

  if (!fieldConfig.hiddenFields.find(h => h.id === fieldId)) {
    fieldConfig.hiddenFields.push({ id: fieldId, sectionId: sectionId, label: label });
  }

  row.style.display = 'none';
  saveFieldConfig();
  showToast(`"${label}" field hidden. Use Restore Deleted Items to bring it back.`, 'success');
}

function applyHiddenItems() {
  if (!fieldConfig) return;

  // Hide sections
  (fieldConfig.hiddenSections || []).forEach(h => {
    const section = document.querySelector(`[data-section-id="${h.id}"]`) ||
                    document.querySelector(`[data-custom-section="${h.id}"]`);
    if (section) section.style.display = 'none';
  });

  // Hide field rows
  (fieldConfig.hiddenFields || []).forEach(h => {
    const el = document.getElementById(h.id);
    if (el) {
      const row = el.closest('.form-row');
      if (row) row.style.display = 'none';
    }
  });
}

function showRestoreModal() {
  const hiddenSections = fieldConfig.hiddenSections || [];
  const hiddenFields = fieldConfig.hiddenFields || [];

  if (hiddenSections.length === 0 && hiddenFields.length === 0) {
    // Close the modal if it's open
    const modal = document.getElementById('restoreModal');
    if (modal) modal.classList.remove('active');
    showToast('No deleted items to restore.', 'error');
    return;
  }

  let html = '<h3 style="margin-top:0;">Restore Deleted Items</h3>';

  if (hiddenSections.length > 0) {
    html += '<h4 style="margin-bottom:4px;">Sections</h4>';
    hiddenSections.forEach(h => {
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="flex:1;">${h.label}</span>
        <button class="btn" style="padding:4px 12px;font-size:12px;background:#27ae60;color:#fff;border:none;border-radius:4px;cursor:pointer;" onclick="restoreSection('${h.id}')">Restore</button>
      </div>`;
    });
  }

  if (hiddenFields.length > 0) {
    html += '<h4 style="margin-bottom:4px;">Fields</h4>';
    hiddenFields.forEach(h => {
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="flex:1;">${h.label}</span>
        <button class="btn" style="padding:4px 12px;font-size:12px;background:#27ae60;color:#fff;border:none;border-radius:4px;cursor:pointer;" onclick="restoreField('${h.id}')">Restore</button>
      </div>`;
    });
  }

  html += '<div style="text-align:right;margin-top:12px;"><button class="btn" onclick="closeModal(\'restoreModal\')">Close</button></div>';

  // Create or reuse restore modal
  let modal = document.getElementById('restoreModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'restoreModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div class="modal" style="max-width:450px;">${html}</div>`;
  modal.classList.add('active');
}

function restoreSection(sectionId) {
  if (!fieldConfig || !fieldConfig.hiddenSections) return;
  fieldConfig.hiddenSections = fieldConfig.hiddenSections.filter(h => h.id !== sectionId);

  const section = document.querySelector(`[data-section-id="${sectionId}"]`) ||
                  document.querySelector(`[data-custom-section="${sectionId}"]`);
  if (section) section.style.display = '';

  saveFieldConfig();
  showToast('Section restored!', 'success');
  showRestoreModal(); // refresh the modal
}

function restoreField(fieldId) {
  if (!fieldConfig || !fieldConfig.hiddenFields) return;
  fieldConfig.hiddenFields = fieldConfig.hiddenFields.filter(h => h.id !== fieldId);

  const el = document.getElementById(fieldId);
  if (el) {
    const row = el.closest('.form-row');
    if (row) row.style.display = '';
  }

  saveFieldConfig();
  showToast('Field restored!', 'success');
  showRestoreModal(); // refresh the modal
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // --- License Check (runs first, before anything else) ---
  try {
    const licenseStatus = await window.api.getLicenseStatus();

    if (licenseStatus.status === 'expired') {
      document.getElementById('licenseGate').style.display = 'flex';
      return; // STOP — app is locked, don't initialize anything
    }

    if (licenseStatus.status === 'trial') {
      const banner = document.getElementById('trialBanner');
      const bannerText = document.getElementById('trialBannerText');
      banner.style.display = 'flex';
      const days = licenseStatus.daysRemaining;
      bannerText.textContent = `${days} day${days !== 1 ? 's' : ''} left in your free trial`;

      if (days <= 1) {
        banner.classList.add('critical');
      } else if (days <= 3) {
        banner.classList.add('warning');
      }
    }
    // If 'licensed' — no banner, no gate, proceed normally
  } catch (err) {
    console.error('License check failed:', err);
    // Fail-open: if license check crashes, allow access
  }

  // --- Normal app initialization continues ---
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
  renderCustomFields();
  renderCustomSections();
  applySectionOrder();
  applyFieldOrder();
  applyHiddenItems();
  updateEditModeVisibility();

  // Apply branding from settings
  applyBrandingSettings();

  document.getElementById('inspectionDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('sewerDate').value = new Date().toISOString().split('T')[0];
  setupImageHandling();
  setupSewerImageHandling();

  // Show setup wizard on first launch
  if (!settings.setupWizardCompleted) {
    showSetupWizard();
  }
});

function applyBrandingSettings() {
  // Top bar company name
  document.getElementById('topBarCompanyName').textContent = settings.companyName || 'Inspection Report Builder';

  // Inspector name fields (pre-fill but editable)
  const inspName = settings.inspectorName || '';
  document.getElementById('inspectorName').value = inspName;
  document.getElementById('sewerInspectorName').value = inspName;

  // Apply fonts
  if (settings.reportFont) {
    document.body.style.fontFamily = `'${settings.reportFont}', Tahoma, Geneva, Verdana, sans-serif`;
  }
  if (settings.companyNameFont) {
    document.getElementById('topBarCompanyName').style.fontFamily = `'${settings.companyNameFont}', serif`;
  }
}

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
function isFieldHidden(fieldId) {
  return (fieldConfig.hiddenFields || []).some(h => h.id === fieldId);
}

function isSectionHidden(sectionId) {
  return (fieldConfig.hiddenSections || []).some(h => h.id === sectionId);
}

function collectFormData() {
  // Sync captions from DOM before collecting
  const captionInputs = document.querySelectorAll('#imageGallery .image-caption input');
  captionInputs.forEach((input, i) => {
    if (images[i]) images[i].caption = input.value;
  });

  const hiddenSectionIds = (fieldConfig.hiddenSections || []).map(h => h.id);

  return {
    reportType: 'septic',
    customerName: document.getElementById('customerName').value,
    jobAddress: document.getElementById('jobAddress').value,
    inspectorName: document.getElementById('inspectorName').value,
    inspectionDate: document.getElementById('inspectionDate').value,
    tankType: isFieldHidden('tankType') ? '' : getFieldValue('tankType', 'tankTypeOther'),
    tankCapacity: isFieldHidden('tankCapacity') ? '' : getFieldValue('tankCapacity', 'tankCapacityOther'),
    pumpStation: isFieldHidden('pumpStation') ? '' : document.getElementById('pumpStation').value,
    pumpCondition: isFieldHidden('pumpCondition') ? '' : getFieldValue('pumpCondition', 'pumpConditionOther'),
    highWaterAlarm: isFieldHidden('highWaterAlarm') ? '' : getFieldValue('highWaterAlarm', 'highWaterAlarmOther'),
    inletBaffle: isFieldHidden('inletBaffle') ? '' : getFieldValue('inletBaffle', 'inletBaffleOther'),
    outletBaffle: isFieldHidden('outletBaffle') ? '' : getFieldValue('outletBaffle', 'outletBaffleOther'),
    inletPipe: isFieldHidden('inletPipe') ? '' : getFieldValue('inletPipe', 'inletPipeOther'),
    outletPipe: isFieldHidden('outletPipe') ? '' : getFieldValue('outletPipe', 'outletPipeOther'),
    effluentLevel: isFieldHidden('effluentLevel') ? '' : getFieldValue('effluentLevel', 'effluentLevelOther'),
    tankPumped: isFieldHidden('tankPumped') ? '' : getFieldValue('tankPumped', 'tankPumpedOther'),
    lastPumped: isFieldHidden('lastPumped') ? '' : document.getElementById('lastPumped').value,
    tankNotes: isFieldHidden('tankNotes') ? '' : document.getElementById('tankNotes').value,
    leachfieldType: isFieldHidden('leachfieldType') ? '' : getFieldValue('leachfieldType', 'leachfieldTypeOther'),
    testPitFindings: isFieldHidden('testPitFindings') ? '' : getFieldValue('testPitFindings', 'testPitFindingsOther'),
    vegetation: isFieldHidden('vegetation') ? '' : getFieldValue('vegetation', 'vegetationOther'),
    leachfieldNotes: isFieldHidden('leachfieldNotes') ? '' : document.getElementById('leachfieldNotes').value,
    hheProvided: isSectionHidden('hheDesign') ? false : document.getElementById('hheProvided').checked,
    hheNotProvided: isSectionHidden('hheDesign') ? false : document.getElementById('hheNotProvided').checked,
    recommendations: isSectionHidden('recommendations') ? '' : document.getElementById('recommendations').value,
    images: isSectionHidden('photos') ? [] : images,
    hiddenSections: hiddenSectionIds,
    // Custom fields in built-in sections
    customFieldValues: (fieldConfig.customFields || []).reduce((acc, cf) => {
      acc[cf.id] = isFieldHidden(cf.id) ? '' : getFieldValue(cf.id, cf.id + 'Other');
      return acc;
    }, {}),
    // Custom sections with their field values
    customSectionValues: (fieldConfig.customSections || [])
      .filter(cs => !hiddenSectionIds.includes(cs.id))
      .map(cs => ({
        id: cs.id,
        title: cs.title,
        fields: (cs.fields || []).reduce((acc, f) => {
          acc[f.id] = isFieldHidden(f.id) ? '' : getFieldValue(f.id, f.id + 'Other');
          return acc;
        }, {}),
        notes: (document.getElementById('notes_' + cs.id) || {}).value || '',
      })),
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

  // Restore custom field values
  if (data.customFieldValues) {
    Object.keys(data.customFieldValues).forEach(id => {
      const sel = document.getElementById(id);
      const otherEl = document.getElementById(id + 'Other');
      if (!sel || !data.customFieldValues[id]) return;
      const options = Array.from(sel.options).map(o => o.value);
      if (options.includes(data.customFieldValues[id])) {
        sel.value = data.customFieldValues[id];
      } else {
        sel.value = 'Other';
        if (otherEl) { otherEl.value = data.customFieldValues[id]; otherEl.classList.remove('hidden'); }
      }
    });
  }
  // Restore custom section values
  if (data.customSectionValues) {
    data.customSectionValues.forEach(cs => {
      Object.keys(cs.fields || {}).forEach(id => {
        const sel = document.getElementById(id);
        const otherEl = document.getElementById(id + 'Other');
        if (!sel || !cs.fields[id]) return;
        const options = Array.from(sel.options).map(o => o.value);
        if (options.includes(cs.fields[id])) {
          sel.value = cs.fields[id];
        } else {
          sel.value = 'Other';
          if (otherEl) { otherEl.value = cs.fields[id]; otherEl.classList.remove('hidden'); }
        }
      });
      const notes = document.getElementById('notes_' + cs.id);
      if (notes) notes.value = cs.notes || '';
    });
  }

  // Re-trigger conditional fields
  togglePumpFields();
  toggleHHEFields();
}

function restoreSewerFormData(data) {
  document.getElementById('sewerCustomerName').value = data.customerName || '';
  document.getElementById('sewerJobAddress').value = data.jobAddress || '';
  document.getElementById('sewerInspectorName').value = data.inspectorName || settings.inspectorName || '';
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
    hheHtml = `<p>HHE-200 design was provided and reviewed as part of this inspection.</p>`;
  } else if (data.hheNotProvided) {
    hheHtml = `<p>HHE-200 design was not provided.</p>
      <p style="background:#fef9e7;border:1px solid #f9e79f;padding:8px;border-radius:4px;font-size:13px;color:#7d6608;">
      Without the HHE-200, the inspector cannot verify the system's approved design capacity, component layout, or whether current use falls within the original design parameters.</p>`;
  }

  const companyName = settings.companyName || 'Your Company';
  const companyNameFont = settings.companyNameFont || 'Georgia';
  const reportFont = settings.reportFont || 'Segoe UI';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: '${reportFont}', Tahoma, sans-serif; color: #2c3e50; padding: 0; line-height: 1.6; font-size: 14px; }
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
    font-family: '${companyNameFont}', 'Times New Roman', serif;
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
    <div class="company-name">${companyName}</div>
    ${settings.companyAddress ? `<div class="company-address">${settings.companyAddress}</div>` : ''}
    ${settings.companyPhone ? `<div class="company-phone">${settings.companyPhone}</div>` : ''}
    ${settings.companyTagline ? `<div class="company-tagline">${settings.companyTagline}</div>` : ''}
    ${settings.companyEst ? `<div class="company-est">${settings.companyEst}</div>` : ''}
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

  ${!(data.hiddenSections || []).includes('septicTank') ? `
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
    ${(() => {
      let html = '';
      if (data.customFieldValues) {
        (fieldConfig.customFields || []).filter(f => f.sectionId === 'septicTank').forEach(f => {
          html += field(f.label, data.customFieldValues[f.id]);
        });
      }
      return html;
    })()}
  </table>
  ${data.tankNotes ? `<div class="notes"><strong>Notes:</strong><br>${data.tankNotes.replace(/\n/g, '<br>')}</div>` : ''}
  ` : ''}

  ${!(data.hiddenSections || []).includes('leachfield') ? `
  <div class="section-small">
  <h2>Leachfield</h2>
  <table>
    ${field('Leachfield Type', data.leachfieldType)}
    ${field('Test Pit Findings', data.testPitFindings)}
    ${field('Vegetation', data.vegetation)}
    ${(() => {
      let html = '';
      if (data.customFieldValues) {
        (fieldConfig.customFields || []).filter(f => f.sectionId === 'leachfield').forEach(f => {
          html += field(f.label, data.customFieldValues[f.id]);
        });
      }
      return html;
    })()}
  </table>
  ${data.leachfieldNotes ? `<div class="notes"><strong>Notes:</strong><br>${data.leachfieldNotes.replace(/\n/g, '<br>')}</div>` : ''}
  </div>
  ` : ''}

  ${!(data.hiddenSections || []).includes('hheDesign') ? `
  <div class="section-small">
  <h2>HHE-200 Design</h2>
  ${hheHtml}
  </div>
  ` : ''}

  ${!(data.hiddenSections || []).includes('recommendations') && data.recommendations ? `
    <h2>Recommendations</h2>
    <div class="notes">${data.recommendations.replace(/\n/g, '<br>')}</div>
  ` : ''}

  ${(() => {
    // Render custom sections in the PDF
    if (!data.customSectionValues || data.customSectionValues.length === 0) return '';
    return data.customSectionValues.map(cs => {
      const csConfig = (fieldConfig.customSections || []).find(s => s.id === cs.id);
      if (!csConfig) return '';
      let rows = (csConfig.fields || []).map(f => field(f.label, cs.fields[f.id])).join('');
      let notesHtml = cs.notes ? `<div class="notes"><strong>Notes:</strong><br>${cs.notes.replace(/\n/g, '<br>')}</div>` : '';
      return `<div class="section-small"><h2>${cs.title}</h2><table>${rows}</table>${notesHtml}</div>`;
    }).join('');
  })()}

  ${imagesHtml}

  <div class="disclaimer" style="margin-top:30px;padding:16px 20px;border:1px solid #ccc;border-radius:4px;background:#fafafa;font-size:11px;color:#555;line-height:1.6;page-break-inside:avoid;">
    <h3 style="font-size:13px;color:#333;margin:0 0 8px 0;text-align:center;text-transform:uppercase;letter-spacing:1px;">Septic System Inspection Disclaimer</h3>
    ${(settings.septicDisclaimer || DEFAULT_SEPTIC_DISCLAIMER).replace(/\{companyName\}/g, companyName).split('\n').filter(l => l.trim()).map(p => `<p style="margin:0 0 8px 0;">${p}</p>`).join('')}
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

  const companyName = settings.companyName || 'Your Company';
  const companyNameFont = settings.companyNameFont || 'Georgia';
  const reportFont = settings.reportFont || 'Segoe UI';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: '${reportFont}', Tahoma, sans-serif; color: #2c3e50; padding: 0; line-height: 1.6; font-size: 14px; }
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
    font-family: '${companyNameFont}', 'Times New Roman', serif;
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
    <div class="company-name">${companyName}</div>
    ${settings.companyAddress ? `<div class="company-address">${settings.companyAddress}</div>` : ''}
    ${settings.companyPhone ? `<div class="company-phone">${settings.companyPhone}</div>` : ''}
    ${settings.companyTagline ? `<div class="company-tagline">${settings.companyTagline}</div>` : ''}
    ${settings.companyEst ? `<div class="company-est">${settings.companyEst}</div>` : ''}
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
    ${(settings.sewerDisclaimer || DEFAULT_SEWER_DISCLAIMER).replace(/\{companyName\}/g, companyName).split('\n').filter(l => l.trim()).map(p => `<p style="margin:0 0 8px 0;">${p}</p>`).join('')}
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
    document.getElementById('emailBody').value = `Hello,\n\nPlease find attached the sewer camera inspection report for ${name}${addr ? ' at ' + addr : ''}.\n\nPlease let me know if you have any questions.\n\nThank you,\n${settings.inspectorName || 'Inspector'}`;
  } else {
    document.getElementById('emailSubject').value = `Septic Inspection Report - ${name}${addr ? ' - ' + addr : ''}`;
    document.getElementById('emailBody').value = `Hello,\n\nPlease find attached the septic system inspection report for ${name}${addr ? ' at ' + addr : ''}.\n\nPlease let me know if you have any questions.\n\nThank you,\n${settings.inspectorName || 'Inspector'}`;
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
  // Company branding
  document.getElementById('settingsCompanyName').value = settings.companyName || '';
  document.getElementById('settingsInspectorName').value = settings.inspectorName || '';
  document.getElementById('settingsCompanyAddress').value = settings.companyAddress || '';
  document.getElementById('settingsCompanyPhone').value = settings.companyPhone || '';
  document.getElementById('settingsCompanyEst').value = settings.companyEst || '';
  document.getElementById('settingsCompanyTagline').value = settings.companyTagline || '';
  // Fonts
  document.getElementById('settingsReportFont').value = settings.reportFont || 'Segoe UI';
  document.getElementById('settingsCompanyNameFont').value = settings.companyNameFont || 'Georgia';
  // AI
  document.getElementById('settingsApiKey').value = settings.apiKey || '';
  // Email
  document.getElementById('settingsSmtpHost').value = settings.smtpHost || '';
  document.getElementById('settingsSmtpPort').value = settings.smtpPort || '587';
  document.getElementById('settingsSmtpUser').value = settings.smtpUser || '';
  document.getElementById('settingsSmtpPass').value = settings.smtpPass || '';
  // Google Drive
  document.getElementById('settingsGoogleDriveFolder').value = settings.googleDriveFolder || '';
  // Disclaimers
  document.getElementById('settingsSepticDisclaimer').value = settings.septicDisclaimer || DEFAULT_SEPTIC_DISCLAIMER;
  document.getElementById('settingsSewerDisclaimer').value = settings.sewerDisclaimer || DEFAULT_SEWER_DISCLAIMER;
  showModal('settingsModal');
}

async function saveSettings() {
  settings = {
    companyName: document.getElementById('settingsCompanyName').value.trim(),
    inspectorName: document.getElementById('settingsInspectorName').value.trim(),
    companyAddress: document.getElementById('settingsCompanyAddress').value.trim(),
    companyPhone: document.getElementById('settingsCompanyPhone').value.trim(),
    companyEst: document.getElementById('settingsCompanyEst').value.trim(),
    companyTagline: document.getElementById('settingsCompanyTagline').value.trim(),
    reportFont: document.getElementById('settingsReportFont').value,
    companyNameFont: document.getElementById('settingsCompanyNameFont').value,
    apiKey: document.getElementById('settingsApiKey').value.trim(),
    smtpHost: document.getElementById('settingsSmtpHost').value.trim(),
    smtpPort: document.getElementById('settingsSmtpPort').value.trim(),
    smtpUser: document.getElementById('settingsSmtpUser').value.trim(),
    smtpPass: document.getElementById('settingsSmtpPass').value.trim(),
    googleDriveFolder: document.getElementById('settingsGoogleDriveFolder').value.trim(),
    septicDisclaimer: document.getElementById('settingsSepticDisclaimer').value,
    sewerDisclaimer: document.getElementById('settingsSewerDisclaimer').value,
  };
  await window.api.saveSettings(settings);
  applyBrandingSettings();
  closeModal('settingsModal');
  showToast('Settings saved!', 'success');
}

// ===== CLEAR FORM =====
function clearForm() {
  if (!confirm('Clear all fields? This cannot be undone.')) return;
  document.querySelectorAll('#septicTab input[type="text"], #septicTab input[type="date"], #septicTab textarea, #septicTab select').forEach(el => {
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
  // Re-set defaults
  document.getElementById('inspectorName').value = settings.inspectorName || '';
  document.getElementById('inspectionDate').value = new Date().toISOString().split('T')[0];
  showToast('Form cleared.', 'success');
}

function clearSewerForm() {
  if (!confirm('Clear all fields? This cannot be undone.')) return;
  document.querySelectorAll('#sewerTab input[type="text"], #sewerTab input[type="date"], #sewerTab textarea').forEach(el => {
    el.value = '';
  });
  sewerImages = [];
  renderSewerImages();
  // Re-set defaults
  document.getElementById('sewerInspectorName').value = settings.inspectorName || '';
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

// ===== LICENSE FUNCTIONS =====
async function activateLicenseFromGate() {
  const input = document.getElementById('licenseKeyInput');
  const errorEl = document.getElementById('licenseGateError');
  const key = input.value.trim();

  if (!key) {
    errorEl.textContent = 'Please enter a license key.';
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';
  input.disabled = true;

  const result = await window.api.activateLicense(key);

  if (result.success) {
    document.getElementById('licenseGate').style.display = 'none';
    showToast('License activated! Welcome to Inspection Report Builder.', 'success');
    location.reload();
  } else {
    errorEl.textContent = result.error;
    errorEl.style.display = 'block';
    input.disabled = false;
  }
}

async function activateLicenseFromModal() {
  const input = document.getElementById('licenseModalKeyInput');
  const errorEl = document.getElementById('licenseModalError');
  const successEl = document.getElementById('licenseModalSuccess');
  const btn = document.getElementById('licenseModalActivateBtn');
  const key = input.value.trim();

  if (!key) {
    errorEl.textContent = 'Please enter a license key.';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }

  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Activating...';

  const result = await window.api.activateLicense(key);

  if (result.success) {
    successEl.textContent = 'License activated successfully!';
    successEl.style.display = 'block';
    document.getElementById('trialBanner').style.display = 'none';
    showToast('License activated!', 'success');
    setTimeout(() => closeModal('licenseModal'), 1500);
  } else {
    errorEl.textContent = result.error;
    errorEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = 'Activate';
}

function showLicenseModal() {
  document.getElementById('licenseModalKeyInput').value = '';
  document.getElementById('licenseModalError').style.display = 'none';
  document.getElementById('licenseModalSuccess').style.display = 'none';
  showModal('licenseModal');
}

// ============================
// SETUP WIZARD
// ============================
let setupWizardCurrentStep = 0;
const SETUP_WIZARD_TOTAL_STEPS = 5; // 0=welcome, 1=email, 2=drive, 3=ai, 4=done

function showSetupWizard() {
  setupWizardCurrentStep = 0;

  // Pre-fill fields from existing settings
  document.getElementById('swSmtpHost').value = settings.smtpHost || '';
  document.getElementById('swSmtpPort').value = settings.smtpPort || '';
  document.getElementById('swSmtpUser').value = settings.smtpUser || '';
  document.getElementById('swSmtpPass').value = settings.smtpPass || '';
  document.getElementById('swGoogleDrive').value = settings.googleDriveFolder || '';
  document.getElementById('swApiKey').value = settings.apiKey || '';

  setupWizardGoToStep(0);
  document.getElementById('setupWizard').style.display = 'flex';
}

function closeSetupWizard() {
  document.getElementById('setupWizard').style.display = 'none';
}

function setupWizardGoToStep(stepIndex) {
  setupWizardCurrentStep = stepIndex;

  // Show/hide steps
  document.querySelectorAll('.setup-wizard-step').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.step) === stepIndex);
  });

  // Update progress dots
  document.querySelectorAll('.sw-dot').forEach(dot => {
    const dotStep = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'completed');
    if (dotStep === stepIndex) {
      dot.classList.add('active');
    } else if (dotStep < stepIndex) {
      dot.classList.add('completed');
    }
  });

  // Update navigation buttons
  const btnBack = document.getElementById('swBtnBack');
  const btnSkip = document.getElementById('swBtnSkip');
  const btnNext = document.getElementById('swBtnNext');

  // Back button — hidden on welcome and done steps
  btnBack.style.display = (stepIndex > 0 && stepIndex < 4) ? 'inline-block' : 'none';

  // Skip button — only on steps 1-3
  btnSkip.style.display = (stepIndex >= 1 && stepIndex <= 3) ? 'inline-block' : 'none';

  // Next button text
  if (stepIndex === 0) {
    btnNext.textContent = 'Get Started';
  } else if (stepIndex === 3) {
    btnNext.textContent = 'Finish Setup';
  } else if (stepIndex === 4) {
    btnNext.textContent = 'Start Building Reports';
  } else {
    btnNext.textContent = 'Next';
  }
}

function setupWizardNext() {
  // Save current step data before advancing
  setupWizardSaveCurrentStep();

  if (setupWizardCurrentStep >= 4) {
    // Final step — complete the wizard
    setupWizardComplete();
    return;
  }

  // If on step 3 (AI), go to summary and build it
  if (setupWizardCurrentStep === 3) {
    setupWizardBuildSummary();
  }

  setupWizardGoToStep(setupWizardCurrentStep + 1);
}

function setupWizardBack() {
  if (setupWizardCurrentStep > 0) {
    setupWizardGoToStep(setupWizardCurrentStep - 1);
  }
}

function setupWizardSkip() {
  // Don't save current step — just advance
  if (setupWizardCurrentStep === 3) {
    setupWizardBuildSummary();
  }
  if (setupWizardCurrentStep < 4) {
    setupWizardGoToStep(setupWizardCurrentStep + 1);
  }
}

function setupWizardSaveCurrentStep() {
  // Gather values from current step into settings
  if (setupWizardCurrentStep === 1) {
    const host = document.getElementById('swSmtpHost').value.trim();
    const port = document.getElementById('swSmtpPort').value.trim();
    const user = document.getElementById('swSmtpUser').value.trim();
    const pass = document.getElementById('swSmtpPass').value;
    if (host) settings.smtpHost = host;
    if (port) settings.smtpPort = port;
    if (user) settings.smtpUser = user;
    if (pass) settings.smtpPass = pass;
  } else if (setupWizardCurrentStep === 2) {
    const folder = document.getElementById('swGoogleDrive').value.trim();
    if (folder) settings.googleDriveFolder = folder;
  } else if (setupWizardCurrentStep === 3) {
    const key = document.getElementById('swApiKey').value.trim();
    if (key) settings.apiKey = key;
  }
}

function setupWizardBuildSummary() {
  // Save step 3 data first (in case coming from step 3)
  setupWizardSaveCurrentStep();

  // Email status
  const emailConfigured = settings.smtpHost && settings.smtpUser && settings.smtpPass;
  const emailStatus = document.getElementById('swSummaryEmailStatus');
  emailStatus.textContent = emailConfigured ? 'Configured' : 'Not configured';
  emailStatus.className = 'sw-summary-status ' + (emailConfigured ? 'configured' : 'skipped');

  // Google Drive status
  const driveConfigured = !!settings.googleDriveFolder;
  const driveStatus = document.getElementById('swSummaryDriveStatus');
  driveStatus.textContent = driveConfigured ? 'Configured' : 'Not configured';
  driveStatus.className = 'sw-summary-status ' + (driveConfigured ? 'configured' : 'skipped');

  // AI status
  const aiConfigured = !!settings.apiKey;
  const aiStatus = document.getElementById('swSummaryAIStatus');
  aiStatus.textContent = aiConfigured ? 'Configured' : 'Not configured';
  aiStatus.className = 'sw-summary-status ' + (aiConfigured ? 'configured' : 'skipped');
}

async function setupWizardComplete() {
  settings.setupWizardCompleted = true;
  try {
    await window.api.saveSettings(settings);
    applyBrandingSettings();
    showToast('Setup complete!', 'success');
  } catch (e) {
    console.error('Failed to save settings from wizard:', e);
  }
  closeSetupWizard();
}

// Email preset helpers
function applyGmailPreset() {
  document.getElementById('swSmtpHost').value = 'smtp.gmail.com';
  document.getElementById('swSmtpPort').value = '587';
}

function applyOutlookPreset() {
  document.getElementById('swSmtpHost').value = 'smtp.office365.com';
  document.getElementById('swSmtpPort').value = '587';
}

function applyYahooPreset() {
  document.getElementById('swSmtpHost').value = 'smtp.mail.yahoo.com';
  document.getElementById('swSmtpPort').value = '465';
}
