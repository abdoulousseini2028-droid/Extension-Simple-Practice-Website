/**
 * SimplePractice Autofill Extension - Content Script
 * 
 * This script fills client information forms on SimplePractice.
 * Triggered manually from extension popup.
 * 
 * Key Features:
 * - SPA retry mechanism for dynamically loaded forms
 * - Semantic field matching (name, id, aria-label, placeholder, labels)
 * - Ember.js masked input compatibility  
 * - Radio group selection (client type, billing type)
 * - Dynamic contact field activation (email/phone buttons)
 * - Date of birth with month name conversion
 */

'use strict';

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
    const visibleInputs = document.querySelectorAll(
      'input[type="text"]:not([disabled]), input[type="email"]:not([disabled]), input[type="tel"]:not([disabled]), textarea:not([disabled])'
    );
    
    const visibleFields = Array.from(visibleInputs).filter(isVisible);
    
    if (visibleFields.length > 0) {
      return await autofill(data);
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
async function autofill(data) {
  let totalFilled = 0;
  
  // 1. Ensure dynamic contact fields are visible
  await ensureDynamicContactFields(data);
  
  // 2. Fill radio groups
  totalFilled += fillRadioGroups(data);
  
  // 3. Fill text fields
  totalFilled += await fillTextFields(data);
  
  // 4. Fill select dropdowns (DOB)
  totalFilled += fillSelectDropdowns(data);
  
  return {
    success: totalFilled > 0,
    fieldsFilledCount: totalFilled,
    message: totalFilled > 0 ? `Filled ${totalFilled} field(s)` : 'No matching fields found'
  };
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
  const contactTab = findTabByText('Contact');
  if (contactTab) {
    contactTab.click();
    await wait(600);
  }
  
  // Click "Add email" if email provided but field not visible
  if (data.email && !findEmailField()) {
    const addEmailBtn = findButtonByText(['Add email', 'add email', '+ Email']);
    if (addEmailBtn) {
      addEmailBtn.click();
      await wait(600);
    }
  }
  
  // Click "Add phone" if phone provided but field not visible
  if (data.phone && !findPhoneField()) {
    const addPhoneBtn = findButtonByText(['Add phone', 'add phone', '+ Phone', 'Add mobile']);
    if (addPhoneBtn) {
      addPhoneBtn.click();
      await wait(600);
    }
  }
}

/**
 * Find tab by text, excluding external links
 */
function findTabByText(text) {
  const searchText = text.toLowerCase();
  
  // Try proper ARIA tabs first
  const tabs = document.querySelectorAll('[role="tab"]');
  for (const tab of tabs) {
    if (tab.textContent.toLowerCase().includes(searchText)) {
      return tab;
    }
  }
  
  // Try button-like elements with tab indicators
  const buttons = document.querySelectorAll('button, [role="button"], .tab, [class*="tab"]');
  for (const btn of buttons) {
    if (btn.textContent.toLowerCase().includes(searchText)) {
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
 * Find button by text variations
 */
function findButtonByText(textVariations) {
  const elements = document.querySelectorAll('button, [role="button"], a, span[class*="button"]');
  
  for (const el of elements) {
    const text = el.textContent.trim();
    if (textVariations.some(variation => text.includes(variation))) {
      return el;
    }
  }
  
  return null;
}

/**
 * Find email input field
 */
function findEmailField() {
  const inputs = document.querySelectorAll('input[type="email"], input[type="text"]');
  for (const input of inputs) {
    const meta = getFieldMetadata(input);
    if (meta.includes('email') && isVisible(input)) {
      return input;
    }
  }
  return null;
}

/**
 * Find phone input field
 */
function findPhoneField() {
  const inputs = document.querySelectorAll('input[type="tel"], input[type="text"]');
  for (const input of inputs) {
    const meta = getFieldMetadata(input);
    if ((meta.includes('phone') || meta.includes('mobile')) && isVisible(input)) {
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
function fillRadioGroups(data) {
  let count = 0;
  const radioGroups = document.querySelectorAll('input[type="radio"]');
  
  for (const radio of radioGroups) {
    if (!isVisible(radio)) continue;
    
    const labelText = getRadioLabelText(radio).toLowerCase();
    
    // Client type matching
    if (data.clientType) {
      const clientType = data.clientType.toLowerCase();
      if (
        (clientType === 'adult' && labelText.includes('adult')) ||
        (clientType === 'minor' && labelText.includes('minor')) ||
        (clientType === 'couple' && labelText.includes('couple'))
      ) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        count++;
        continue;
      }
    }
    
    // Billing type matching
    if (data.billingType) {
      const billingType = data.billingType.toLowerCase();
      if (
        (billingType === 'self-pay' && (labelText.includes('self') || labelText.includes('self-pay'))) ||
        (billingType === 'insurance' && labelText.includes('insurance'))
      ) {
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
async function fillTextFields(data) {
  let count = 0;
  const textFields = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea'
  );
  
  for (const field of textFields) {
    if (!isVisible(field) || field.disabled) continue;
    
    const metadata = getFieldMetadata(field);
    const matchResult = matchFieldToDataType(metadata, data);
    
    if (matchResult.matched && matchResult.value) {
      try {
        if (matchResult.type === 'phone') {
          await fillPhoneField(field, String(matchResult.value));
        } else {
          await fillRegularField(field, String(matchResult.value));
        }
        count++;
      } catch (error) {
        // Silent fail for individual fields
      }
    }
  }
  
  return count;
}

/**
 * Match field metadata to data type
 */
function matchFieldToDataType(metadata, data) {
  const meta = metadata.toLowerCase();
  
  // First name
  if (matchesKeywords(meta, ['first', 'name']) || matchesKeywords(meta, ['given', 'name'])) {
    return { matched: true, type: 'firstName', value: data.firstName };
  }
  
  // Last name
  if (matchesKeywords(meta, ['last', 'name']) || matchesKeywords(meta, ['surname']) || matchesKeywords(meta, ['family', 'name'])) {
    return { matched: true, type: 'lastName', value: data.lastName };
  }
  
  // Preferred name / nickname
  if (meta.includes('prefer') || meta.includes('nickname') || meta.match(/\bgo\s+by\b/)) {
    return { matched: true, type: 'preferredName', value: data.preferredName };
  }
  
  // Email
  if (meta.includes('email') || meta.includes('e-mail')) {
    return { matched: true, type: 'email', value: data.email };
  }
  
  // Phone
  if (meta.includes('phone') || meta.includes('mobile') || meta.includes('cell') || meta.includes('telephone')) {
    return { matched: true, type: 'phone', value: data.phone };
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
function fillSelectDropdowns(data) {
  let count = 0;
  const selects = document.querySelectorAll('select');
  
  for (const select of selects) {
    if (!isVisible(select) || select.disbaled) continue;
    
    const metadata = getFieldMetadata(select);
    const meta = metadata.toLowerCase();
    
    let valueToSelect = null;
    
    // Month dropdown
    if (meta.match(/\bmonth\b/)) {
      valueToSelect = data.dobMonth;
      // Convert number to month name if needed
      if (valueToSelect && /^\d{1,2}$/.test(valueToSelect)) {
        valueToSelect = convertMonthToName(valueToSelect);
      }
    }
    // Day dropdown
    else if (meta.match(/\bday\b/)) {
      valueToSelect = data.dobDay;
    }
    // Year dropdown
    else if (meta.match(/\byear\b/)) {
      valueToSelect = data.dobYear;
    }
    
    if (valueToSelect && selectDropdownOption(select, valueToSelect)) {
      count++;
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
  
  // Wait for mask to settle
  await wait(1000);
  
  // Dispatch change but NOT blur (blur causes validation failure)
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get comprehensive field metadata for matching
 */
function getFieldMetadata(field) {
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
