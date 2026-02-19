'use strict';

// ============================================================================
// SIMPLEPRACTICE AUTOFILL ENGINE
// ============================================================================

const EXTENSION_VERSION = '1.0.0';

// ============================================================================
// PLATFORM GUARD - SimplePractice Domain Check
// ============================================================================

if (!location.hostname.includes('simplepractice.com')) {
  // Exit early - script only runs on SimplePractice
  throw new Error('SimplePractice Autofill: Not on simplepractice.com domain');
}

// ============================================================================
// CONFIGURATION - SimplePractice Vocabulary
// ============================================================================

// Development mode - enables logging of unmatched fields
const DEV_MODE = false;

// Client type radio button keywords
const CLIENT_TYPE_KEYWORDS = {
  adult: ['adult'],
  minor: ['minor'],
  couple: ['couple']
};

// Billing type radio button keywords
const BILLING_TYPE_KEYWORDS = {
  'self-pay': ['self', 'self-pay'],
  insurance: ['insurance']
};

// Contact tab identification
const CONTACT_TAB_KEYWORDS = ['contact'];

// Add email button keywords
const ADD_EMAIL_BUTTON_KEYWORDS = ['add email', '+ email'];

// Add phone button keywords
const ADD_PHONE_BUTTON_KEYWORDS = ['add phone', '+ phone', 'add mobile'];

// Date of birth field keywords
const DOB_FIELD_KEYWORDS = {
  month: /\bmonth\b/,
  day: /\bday\b/,
  year: /\byear\b/
};

// Field matchers configuration - defines how to match form fields to data types
const FIELD_MATCHERS = [
  {
    type: 'firstName',
    keywords: [['first', 'name'], ['given', 'name']],
    getValue: data => data.firstName
  },
  {
    type: 'lastName',
    keywords: [['last', 'name'], ['surname'], ['family', 'name']],
    getValue: data => data.lastName
  },
  {
    type: 'preferredName',
    keywords: [['prefer'], ['nickname'], [/\bgo\s+by\b/]],
    getValue: data => data.preferredName
  },
  {
    type: 'email',
    keywords: [['email'], ['e-mail']],
    getValue: data => data.email
  },
  {
    type: 'phone',
    keywords: [['phone'], ['mobile'], ['cell'], ['telephone']],
    getValue: data => data.phone
  }
];

// ============================================================================
// MESSAGE LISTENER - Entry Point
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'autofill') {
    autofillWithRetry(request.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        fieldsFilledCount: 0,
        message: 'Error: ' + error.message
      }));
    return true; // Keep channel open for async response
  }
});

// ============================================================================
// CORE AUTOFILL ORCHESTRATOR
// ============================================================================

/**
 * Retry mechanism for SPA dynamic forms
 * Waits up to 3 seconds for form fields to appear
 */
async function autofillWithRetry(data, maxRetries = 10, retryDelay = 300) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const allFields = getAllVisibleFields();
    
    if (allFields.inputs.length > 0) {
      return await autofill(data, allFields);
    }
    
    if (attempt < maxRetries) {
      await wait(retryDelay);
    }
  }
  
  return {
    success: false,
    fieldsFilledCount: 0,
    message: 'No form fields detected after retries'
  };
}

/**
 * Main autofill orchestrator
 */
async function autofill(data, allFields = null) {
  // Query DOM once if not provided
  if (!allFields) {
    allFields = getAllVisibleFields();
  }
  
  let totalFilled = 0;
  
  // 1. Ensure dynamic contact fields are visible
  await ensureDynamicContactFields(data);
  
  // Re-query after dynamic fields may have been added
  allFields = getAllVisibleFields();
  
  // 2. Fill radio groups
  totalFilled += fillRadioGroups(allFields.radios, data);
  
  // 3. Fill text fields
  totalFilled += await fillTextFields(allFields.inputs, data);
  
  // 4. Fill select dropdowns (DOB)
  totalFilled += fillSelectDropdowns(allFields.selects, data);
  
  return {
    success: totalFilled > 0,
    fieldsFilledCount: totalFilled,
    message: totalFilled > 0 ? `Filled ${totalFilled} field(s)` : 'No matching fields found'
  };
}

/**
 * Query DOM once and return all visible fields
 */
function getAllVisibleFields() {
  const inputs = Array.from(document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea'
  )).filter(el => isVisible(el) && !el.disabled);
  
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
    .filter(isVisible);
  
  const selects = Array.from(document.querySelectorAll('select'))
    .filter(el => isVisible(el) && !el.disabled);
  
  return { inputs, radios, selects };
}

// ============================================================================
// DYNAMIC FIELD ACTIVATION
// ============================================================================

/**
 * Clicks "Contact" tab and "Add email/phone" buttons if needed
 */
async function ensureDynamicContactFields(data) {
  if (!data.email && !data.phone) return;
  
  // Try to click Contact tab
  const contactTab = findTabByKeywords(CONTACT_TAB_KEYWORDS);
  if (contactTab) {
    contactTab.click();
    await wait(600);
  }
  
  // Click "Add email" if email provided but field not visible
  if (data.email && !findEmailField()) {
    const addEmailBtn = findButtonByKeywords(ADD_EMAIL_BUTTON_KEYWORDS);
    if (addEmailBtn) {
      addEmailBtn.click();
      await wait(600);
    }
  }
  
  // Click "Add phone" if phone provided but field not visible
  if (data.phone && !findPhoneField()) {
    const addPhoneBtn = findButtonByKeywords(ADD_PHONE_BUTTON_KEYWORDS);
    if (addPhoneBtn) {
      addPhoneBtn.click();
      await wait(600);
    }
  }
}

/**
 * Find tab by keywords, excluding external links
 */
function findTabByKeywords(keywords) {
  // Try proper ARIA tabs first
  const tabs = document.querySelectorAll('[role="tab"]');
  for (const tab of tabs) {
    if (matchesAnyKeyword(tab.textContent.toLowerCase(), keywords)) {
      return tab;
    }
  }
  
  // Try button-like elements with tab indicators
  const buttons = document.querySelectorAll('button, [role="button"], .tab, [class*="tab"]');
  for (const btn of buttons) {
    if (matchesAnyKeyword(btn.textContent.toLowerCase(), keywords)) {
      // Exclude external links
      const links = btn.querySelectorAll('a[href]');
      const hasExternalLink = Array.from(links).some(link => 
        link.href.startsWith('http') && !link.href.includes('simplepractice.com')
      );
      if (!hasExternalLink) {
        return btn;
      }
    }
  }
  
  return null;
}

/**
 * Find button by keyword list
 */
function findButtonByKeywords(keywords) {
  const elements = document.querySelectorAll('button, [role="button"], a, span[class*="button"]');
  
  for (const el of elements) {
    const text = el.textContent.trim().toLowerCase();
    if (matchesAnyKeyword(text, keywords)) {
      return el;
    }
  }
  
  return null;
}

/**
 * Find email input field
 */
function findEmailField() {
  const inputs = getAllVisibleFields().inputs;
  for (const input of inputs) {
    const metadata = extractFieldMetadata(input);
    if (metadata.includes('email')) {
      return input;
    }
  }
  return null;
}

/**
 * Find phone input field
 */
function findPhoneField() {
  const inputs = getAllVisibleFields().inputs;
  for (const input of inputs) {
    const metadata = extractFieldMetadata(input);
    if (metadata.includes('phone') || metadata.includes('mobile')) {
      return input;
    }
  }
  return null;
}

// ============================================================================
// RADIO GROUP FILLING
// ============================================================================

/**
 * Fill radio groups (client type, billing type)
 */
function fillRadioGroups(radios, data) {
  let count = 0;
  
  for (const radio of radios) {
    const labelText = getRadioLabelText(radio).toLowerCase();
    
    // Client type matching
    if (data.clientType) {
      const clientType = data.clientType.toLowerCase();
      const keywords = CLIENT_TYPE_KEYWORDS[clientType];
      if (keywords && matchesAnyKeyword(labelText, keywords)) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        count++;
        continue;
      }
    }
    
    // Billing type matching
    if (data.billingType) {
      const billingType = data.billingType.toLowerCase();
      const keywords = BILLING_TYPE_KEYWORDS[billingType];
      if (keywords && matchesAnyKeyword(labelText, keywords)) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        count++;
      }
    }
  }
  
  return count;
}

/**
 * Get label text associated with radio button
 */
function getRadioLabelText(radio) {
  // Try direct label association
  const label = radio.labels?.[0];
  if (label) return label.textContent.trim();
  
  // Try aria-label
  const ariaLabel = radio.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  
  // Try parent label
  const parentLabel = radio.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();
  
  // Try sibling label
  const siblingLabel = radio.parentElement?.querySelector('label');
  if (siblingLabel) return siblingLabel.textContent.trim();
  
  return '';
}

// ============================================================================
// TEXT FIELD FILLING
// ============================================================================

/**
 * Fill text input and textarea fields
 */
async function fillTextFields(inputs, data) {
  let count = 0;
  
  for (const field of inputs) {
    const metadata = extractFieldMetadata(field);
    const matchResult = matchFieldToDataType(metadata, data);
    
    if (matchResult.matched && matchResult.value) {
      try {
        await applyValueToField(field, String(matchResult.value), matchResult.type);
        count++;
      } catch (error) {
        // Silent fail for individual fields
        if (DEV_MODE) {
          console.warn('SimplePractice Autofill: Failed to fill field', metadata, error);
        }
      }
    } else if (DEV_MODE && !matchResult.matched) {
      // Log unmatched fields in development mode
      console.warn('SimplePractice Autofill: Unmatched field:', metadata);
    }
  }
  
  return count;
}

/**
 * Match field metadata to data type using configuration
 */
function matchFieldToDataType(metadata, data) {
  const meta = metadata.toLowerCase();
  
  for (const matcher of FIELD_MATCHERS) {
    for (const keywordSet of matcher.keywords) {
      // Handle regex patterns
      if (keywordSet.length === 1 && keywordSet[0] instanceof RegExp) {
        if (keywordSet[0].test(meta)) {
          return {
            matched: true,
            type: matcher.type,
            value: matcher.getValue(data)
          };
        }
      }
      // Handle keyword arrays
      else if (matchesKeywords(meta, keywordSet)) {
        return {
          matched: true,
          type: matcher.type,
          value: matcher.getValue(data)
        };
      }
    }
  }
  
  return { matched: false, type: null, value: null };
}

/**
 * Check if metadata contains all keywords
 */
function matchesKeywords(metadata, keywords) {
  return keywords.every(keyword => metadata.includes(keyword));
}

// ============================================================================
// SELECT DROPDOWN FILLING (Date of Birth)
// ============================================================================

/**
 * Fill select dropdowns for DOB
 */
function fillSelectDropdowns(selects, data) {
  let count = 0;
  
  for (const select of selects) {
    const metadata = extractFieldMetadata(select);
    const meta = metadata.toLowerCase();
    
    let valueToSelect = null;
    
    // Month dropdown
    if (DOB_FIELD_KEYWORDS.month.test(meta)) {
      valueToSelect = data.dobMonth;
      // Convert number to month name if needed
      if (valueToSelect && /^\d{1,2}$/.test(valueToSelect)) {
        valueToSelect = convertMonthToName(valueToSelect);
      }
    }
    // Day dropdown
    else if (DOB_FIELD_KEYWORDS.day.test(meta)) {
      valueToSelect = data.dobDay;
    }
    // Year dropdown
    else if (DOB_FIELD_KEYWORDS.year.test(meta)) {
      valueToSelect = data.dobYear;
    }
    
    if (valueToSelect && selectDropdownOption(select, valueToSelect)) {
      count++;
    } else if (DEV_MODE && !valueToSelect) {
      // Log unmatched dropdown
      console.warn('SimplePractice Autofill: Unmatched dropdown:', metadata);
    }
  }
  
  return count;
}

/**
 * Convert numeric month to name
 */
function convertMonthToName(monthNum) {
  const months = {
    '01': 'January', '1': 'January',
    '02': 'February', '2': 'February',
    '03': 'March', '3': 'March',
    '04': 'April', '4': 'April',
    '05': 'May', '5': 'May',
    '06': 'June', '6': 'June',
    '07': 'July', '7': 'July',
    '08': 'August', '8': 'August',
    '09': 'September', '9': 'September',
    '10': 'October',
    '11': 'November',
    '12': 'December'
  };
  return months[monthNum] || monthNum;
}

/**
 * Select option in dropdown by value or text
 */
function selectDropdownOption(select, targetValue) {
  const options = select.options;
  
  // Try exact value match
  for (let i = 0; i < options.length; i++) {
    if (options[i].value === targetValue) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }
  }
  
  // Try case-insensitive text match
  const targetLower = targetValue.toLowerCase();
  for (let i = 0; i < options.length; i++) {
    if (options[i].text.toLowerCase() === targetLower) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }
  }
  
  // Try partial match
  for (let i = 0; i < options.length; i++) {
    if (options[i].text.toLowerCase().includes(targetLower) || 
        options[i].value.toLowerCase().includes(targetLower)) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }
  }
  
  return false;
}

// ============================================================================
// FIELD FILLING IMPLEMENTATIONS
// ============================================================================

/**
 * Apply value to field - handles both regular and masked inputs
 * @param {HTMLElement} field - The input field
 * @param {string} value - The value to apply
 * @param {string} type - The field type (e.g., 'phone', 'email', 'firstName')
 */
async function applyValueToField(field, value, type) {
  if (type === 'phone') {
    await fillPhoneField(field, value);
  } else {
    await fillRegularField(field, value);
  }
}

/**
 * Fill regular text field (non-masked)
 */
async function fillRegularField(field, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  
  nativeInputValueSetter.call(field, value);
  
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.dispatchEvent(new Event('blur', { bubbles: true }));
  field.dispatchEvent(new Event('focus', { bubbles: true }));
}

/**
 * Fill phone field with Ember mask support
 * This is the critical function for masked phone inputs
 */
async function fillPhoneField(field, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  
  // Focus field
  field.focus();
  field.dispatchEvent(new Event('focus', { bubbles: true }));
  
  // Try setting formatted value directly first
  nativeInputValueSetter.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  
  await wait(50);
  
  // If mask rejected it, fall back to digit-by-digit typing
  const digitsOnly = value.replace(/\D/g, '');
  const fieldDigitsOnly = field.value.replace(/\D/g, '');
  
  if (fieldDigitsOnly.length < digitsOnly.length - 1) {
    // Clear and type digit-by-digit
    nativeInputValueSetter.call(field, '');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    
    const digits = digitsOnly.split('');
    for (let i = 0; i < digits.length; i++) {
      if (i > 0) {
        await wait(150); // Critical delay for Ember mask
      }
      
      const currentValue = field.value;
      nativeInputValueSetter.call(field, currentValue + digits[i]);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  
  // Wait for mask to settle - check if value stabilizes
  await waitForStableValue(field, 500, 100);
  
  // Dispatch change but NOT blur (blur causes validation failure)
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Wait for field value to stabilize (no longer changing)
 * @param {HTMLElement} field - Field to monitor
 * @param {number} maxWait - Maximum time to wait (ms)
 * @param {number} checkInterval - How often to check (ms)
 */
async function waitForStableValue(field, maxWait = 500, checkInterval = 100) {
  const startTime = Date.now();
  let lastValue = field.value;
  
  while (Date.now() - startTime < maxWait) {
    await wait(checkInterval);
    
    if (field.value === lastValue) {
      // Value stabilized
      return;
    }
    
    lastValue = field.value;
  }
  
  // Max wait reached
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract comprehensive field metadata for matching
 * Uses only semantic attributes - no class/ID exact matching
 */
function extractFieldMetadata(field) {
  const parts = [
    field.name || '',
    field.id || '',
    field.placeholder || '',
    field.getAttribute('aria-label') || '',
    field.getAttribute('data-testid') || '',
    field.className || '',
    getAssociatedLabelText(field)
  ];
  
  return parts.join(' ').toLowerCase();
}

/**
 * Get label text associated with field
 */
function getAssociatedLabelText(field) {
  // Try direct label association
  if (field.labels && field.labels.length > 0) {
    return field.labels[0].textContent.trim();
  }
  
  // Try aria-labelledby
  const ariaLabelledBy = field.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelEl = document.getElementById(ariaLabelledBy);
    if (labelEl) return labelEl.textContent.trim();
  }
  
  // Try parent label
  const parentLabel = field.closest('label');
  if (parentLabel) {
    return parentLabel.textContent.trim();
  }
  
  // Try for attribute match
  if (field.id) {
    const label = document.querySelector(`label[for="${field.id}"]`);
    if (label) return label.textContent.trim();
  }
  
  return '';
}

/**
 * Check if text matches any keyword in the list
 * @param {string} text - Text to search in (should be lowercase)
 * @param {Array<string>} keywords - Keywords to match
 * @returns {boolean}
 */
function matchesAnyKeyword(text, keywords) {
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

/**
 * Check if element is visible to user
 */
function isVisible(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  
  return true;
}

/**
 * Async wait helper
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
