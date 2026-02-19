/**
 * PROJECT: SimplePractice Chrome Autofill Extension
 *
 * OVERVIEW
 * --------
 * This is a Chrome Extension (Manifest v3) that autofills forms
 * inside the authenticated SimplePractice web application.
 *
 * It must only run on: *.simplepractice.com
 *
 * The extension does NOT:
 * - Automate navigation
 * - Click "Continue"
 * - Submit forms
 * - Monitor background activity
 *
 * It ONLY autofills visible form fields when manually triggered
 * from the extension popup.
 *
 *
 * ARCHITECTURE
 * ------------
 * - popup.html → collects user data (first name, last name, email, phone, etc.)
 * - popup.js → sends structured data to content script
 * - content.js → receives data and autofills form fields
 * - manifest.json → Manifest v3, activeTab permission
 *
 *
 * TARGET FORM
 * -----------
 * The primary target form is "Create Client" inside SimplePractice.
 *
 * It includes:
 *
 * 1) Radio Groups:
 *    - Client type: Adult | Minor | Couple
 *    - Billing type: Self-pay | Insurance
 *
 * 2) Text inputs:
 *    - Legal first name
 *    - Legal last name
 *    - What name do they go by?
 *
 * 3) Date of birth:
 *    - Month (dropdown)
 *    - Day
 *    - Year
 *
 * 4) Dynamic fields:
 *    - Email (may require clicking "Add email")
 *    - Phone (may require clicking "Add phone")
 *
 * 5) Conditional rendering:
 *    - If clientType === "Couple", two client sections appear (Client 1 / Client 2)
 *
 *
 * DESIGN PRINCIPLES
 * -----------------
 * 1. Do NOT rely on hardcoded CSS class names.
 * 2. Do NOT rely on element positions.
 * 3. Do NOT assume stable IDs (SPA app with dynamic classes).
 * 4. Only operate on visible and enabled fields.
 * 5. Gracefully skip fields that do not exist.
 * 6. Modular structure (separate functions per field type).
 *
 *
 * RETRY MECHANISM (FOR SPA/DYNAMIC FORMS)
 * ---------------------------------------
 * Since SimplePractice is an Ember SPA, forms may not be present when
 * the autofill is triggered.
 *
 * Solution:
 * - When autofill is triggered, check if visible input fields exist
 * - If not found, wait 300ms and retry
 * - Maximum 10 attempts (total ~3 seconds)
 * - Only proceed with autofill once fields are detected
 *
 * This handles:
 * - Client-side navigation
 * - Delayed rendering
 * - Dynamic component mounting
 *
 *
 * FIELD MATCHING STRATEGY
 * -----------------------
 * To infer what each field represents:
 *
 * - Read element attributes:
 *     name
 *     id
 *     placeholder
 *     aria-label
 * - Also inspect nearby <label> text
 *
 * Combine all metadata into a lowercase string.
 *
 * Example:
 *   const metadata = `${name} ${id} ${placeholder} ${labelText}`.toLowerCase();
 *
 * Then match keywords:
 *
 * - "first" + "name" → firstName
 * - "last" + "name" → lastName
 * - "email" → email
 * - "phone" → phone
 * - "birth" or "dob" → date of birth
 *
 *
 * RADIO GROUP STRATEGY
 * --------------------
 * - Find all radio inputs or clickable role="radio" elements.
 * - Inspect associated label text.
 * - Match label text against:
 *      adult
 *      minor
 *      couple
 *      self-pay
 *      insurance
 * - Click matching option.
 *
 *
 * SELECT / DROPDOWN STRATEGY
 * --------------------------
 * - If element is <select>, set .value and dispatch change event.
 * - If custom dropdown (div-based), skip for now unless simple.
 *
 *
 * REACT / EMBER EVENT HANDLING
 * -----------------------------
 * After setting a value:
 * - Dispatch new Event("input", { bubbles: true })
 * - Dispatch new Event("change", { bubbles: true })
 *
 * This ensures framework state updates correctly.
 *
 *
 * DATA CONTRACT FROM POPUP
 * ------------------------
 * The content script will receive an object like:
 *
 * {
 *   clientType: "adult" | "minor" | "couple",
 *   firstName: string,
 *   lastName: string,
 *   preferredName: string,
 *   email: string,
 *   phone: string,
 *   billingType: "self-pay" | "insurance",
 *   dob: {
 *     month: "January",
 *     day: "01",
 *     year: "1990"
 *   }
 * }
 *
 *
 * CORE FUNCTIONS TO IMPLEMENT
 * ----------------------------
 * - fillTextFields(data)
 * - fillRadioGroups(data)
 * - fillSelectFields(data)
 * - fillDynamicContactFields(data)
 * - isElementVisible(el)
 * - dispatchReactEvents(el)
 *
 *
 * SAFETY RULES
 * ------------
 * - Never throw errors if field not found.
 * - Wrap risky logic in safe guards.
 * - Only fill currently visible fields.
 *
 *
 * GOAL
 * ----
 * Build a robust, generic autofill engine that works across
 * multiple SimplePractice internal forms without page-specific hacks.
 *
 */



console.log('✓ SimplePractice autofill extension loaded successfully');
console.log('✓ Content script running on:', window.location.href);
console.log('✓ Timestamp:', new Date().toISOString());
console.log('✓ Document ready state:', document.readyState);
console.log('✓ Setting up message listener...');

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📨 Message received via chrome.runtime.onMessage');
  console.log('📨 Sender info:', {
    id: sender.id,
    url: sender.url,
    tab: sender.tab ? `Tab ${sender.tab.id}` : 'No tab info'
  });
  console.log('📨 Request object:', request);
  console.log('📨 Request action:', request?.action);
  console.log('📨 Request data keys:', request?.data ? Object.keys(request.data) : 'No data');
  
  if (request.action === 'autofill') {
    console.log('✓ Action confirmed: autofill');
    console.log('📋 Data received:', request.data);
    console.log('📋 Data detail:', {
      firstName: request.data.firstName || '(empty)',
      lastName: request.data.lastName || '(empty)',
      email: request.data.email || '(empty)',
      phone: request.data.phone || '(empty)',
      preferredName: request.data.preferredName || '(empty)'
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Use async autofill with retry mechanism
    autofillFormWithRetry(request.data)
      .then(result => {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Autofill complete. Result:', result);
        console.log('✅ Sending response back to popup...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        sendResponse(result);
      })
      .catch(error => {
        console.error('❌ Autofill failed with error:', error);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Stack trace:', error.stack);
        
        const errorResult = {
          success: false,
          fieldsFilledCount: 0,
          message: 'Error: ' + error.message
        };
        
        console.log('❌ Sending error response back to popup:', errorResult);
        sendResponse(errorResult);
      });
  } else if (request.action) {
    console.log('⚠️ Unknown action received:', request.action);
    sendResponse({
      success: false,
      fieldsFilledCount: 0,
      message: 'Unknown action: ' + request.action
    });
  } else {
    console.log('⚠️ Message received without action property');
    sendResponse({
      success: false,
      fieldsFilledCount: 0,
      message: 'No action specified in message'
    });
  }
  
  return true; // Keep the message channel open for async response
});

console.log('✓ Message listener registered successfully');
console.log('✓ Ready to receive autofill messages from popup');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

/**
 * Autofill with retry mechanism
 * Waits for form fields to appear before attempting to fill
 * 
 * @param {Object} data - Form data from popup
 * @param {number} maxRetries - Maximum number of retry attempts (default: 10)
 * @param {number} retryDelay - Delay between retries in ms (default: 300)
 * @returns {Promise<Object>} - Result object with success status
 */
async function autofillFormWithRetry(data, maxRetries = 10, retryDelay = 300) {
  console.log('🔄 Starting autofill with retry mechanism');
  console.log(`🔄 Max retries: ${maxRetries}, Delay: ${retryDelay}ms`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n🔄 Attempt ${attempt}/${maxRetries}`);
    
    // Check if any visible input fields exist
    const visibleInputs = document.querySelectorAll(
      'input[type="text"]:not([disabled]), input[type="email"]:not([disabled]), input[type="tel"]:not([disabled]), input:not([type]):not([disabled]), textarea:not([disabled])'
    );
    
    let visibleCount = 0;
    visibleInputs.forEach(input => {
      if (isVisible(input)) {
        visibleCount++;
      }
    });
    
    console.log(`🔄 Found ${visibleCount} visible input fields`);
    
    if (visibleCount > 0) {
      console.log('✓ Form fields detected! Proceeding with autofill...');
      return await autofillForm(data);
    } else {
      console.log(`⏳ No visible fields yet. Waiting ${retryDelay}ms before retry...`);
      
      if (attempt < maxRetries) {
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.log('⚠️ Max retries reached. Form may not be loaded yet.');
        return {
          success: false,
          fieldsFilledCount: 0,
          message: 'No form fields found after waiting. Please ensure the form is loaded.'
        };
      }
    }
  }
}

/**
 * Comprehensive page diagnostic for debugging
 * Logs all potentially relevant form elements
 */
function runPageDiagnostic() {
  console.log('📊 DIAGNOSTIC: Searching for form elements...');
  
  // 1. All SELECT elements
  const selects = document.querySelectorAll('select');
  console.log(`\n📊 Found ${selects.length} <select> elements:`);
  selects.forEach((sel, i) => {
    if (i < 20) { // Limit to first 20
      const label = getAssociatedLabelText(sel);
      console.log(`  [${i}] ${isVisible(sel) ? '👁️' : '🚫'} name="${sel.name}" id="${sel.id}" label="${label}" options=${sel.options.length}`);
    }
  });
  
  // 2. All INPUT type="tel" elements
  const telInputs = document.querySelectorAll('input[type="tel"]');
  console.log(`\n📊 Found ${telInputs.length} input[type="tel"] elements:`);
  telInputs.forEach((inp, i) => {
    const label = getAssociatedLabelText(inp);
    console.log(`  [${i}] ${isVisible(inp) ? '👁️' : '🚫'} name="${inp.name}" id="${inp.id}" label="${label}" placeholder="${inp.placeholder}"`);
  });
  
  // 3. All inputs with "phone" in name/id/placeholder/label
  const allInputs = document.querySelectorAll('input');
  const phoneInputs = [];
  allInputs.forEach(inp => {
    const meta = getFieldMetadata(inp).toLowerCase();
    const label = getAssociatedLabelText(inp).toLowerCase();
    if (meta.includes('phone') || label.includes('phone') || meta.includes('mobile') || label.includes('mobile')) {
      phoneInputs.push(inp);
    }
  });
  console.log(`\n📊 Found ${phoneInputs.length} inputs with "phone" keywords:`);
  phoneInputs.forEach((inp, i) => {
    const label = getAssociatedLabelText(inp);
    console.log(`  [${i}] ${isVisible(inp) ? '👁️' : '🚫'} type="${inp.type}" name="${inp.name}" id="${inp.id}" label="${label}" value="${inp.value}"`);
  });
  
  // 4. All inputs with "birth" or "dob" keywords
  const dobInputs = [];
  allInputs.forEach(inp => {
    const meta = getFieldMetadata(inp).toLowerCase();
    const label = getAssociatedLabelText(inp).toLowerCase();
    if (meta.includes('birth') || label.includes('birth') || 
        meta.includes('dob') || label.includes('dob') ||
        meta.includes('month') || meta.includes('year') || 
        (meta.includes('day') && !meta.includes('birthday'))) {
      dobInputs.push(inp);
    }
  });
  console.log(`\n📊 Found ${dobInputs.length} inputs with "birth/dob/date" keywords:`);
  dobInputs.forEach((inp, i) => {
    if (i < 10) {
      const label = getAssociatedLabelText(inp);
      console.log(`  [${i}] ${isVisible(inp) ? '👁️' : '🚫'} type="${inp.type}" name="${inp.name}" id="${inp.id}" label="${label}"`);
    }
  });
  
  // 5. Elements with text "Contact" (potential tabs)
  const allElements = document.querySelectorAll('*');
  const contactElements = [];
  allElements.forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.toLowerCase() === 'contact' && el.children.length === 0) {
      contactElements.push(el);
    }
  });
  console.log(`\n📊 Found ${contactElements.length} elements with text="Contact":`);
  contactElements.forEach((el, i) => {
    if (i < 10) {
      console.log(`  [${i}] ${isVisible(el) ? '👁️' : '🚫'} <${el.tagName.toLowerCase()}> class="${el.className}" role="${el.getAttribute('role') || 'none'}"`);
    }
  });
  
  // 6. Check for custom dropdowns (non-select)
  const customDropdowns = document.querySelectorAll('[role="combobox"], [role="listbox"], .dropdown, .select, [class*="dropdown"], [class*="select"]');
  console.log(`\n📊 Found ${customDropdowns.length} potential custom dropdown elements:`);
  const uniqueCustomDropdowns = new Set();
  customDropdowns.forEach(dd => {
    const label = getAssociatedLabelText(dd);
    const meta = getFieldMetadata(dd).toLowerCase();
    if (isVisible(dd) && (meta.includes('month') || meta.includes('day') || meta.includes('year') || 
        meta.includes('birth') || label.toLowerCase().includes('birth'))) {
      uniqueCustomDropdowns.add(dd);
    }
  });
  console.log(`  ${uniqueCustomDropdowns.size} visible custom dropdowns related to date/birth:`);
  let idx = 0;
  uniqueCustomDropdowns.forEach(dd => {
    if (idx < 10) {
      const label = getAssociatedLabelText(dd);
      console.log(`  [${idx}] <${dd.tagName.toLowerCase()}> class="${dd.className.substring(0, 50)}" label="${label}" role="${dd.getAttribute('role')}"`);
    }
    idx++;
  });
  
  console.log('\n📊 DIAGNOSTIC COMPLETE\n');
}

/**
 * Main autofill orchestrator
 * Calls specialized functions for each field type
 */
async function autofillForm(data) {
  console.log('🔧 Starting autofillForm...');
  console.log('🔧 DOM ready state:', document.readyState);
  console.log('🔧 Total elements in DOM:', document.querySelectorAll('*').length);
  
  // DIAGNOSTIC: Dump page structure for debugging
  console.log('\n🔍 ===== PAGE DIAGNOSTIC =====');
  runPageDiagnostic();
  console.log('🔍 ===== END DIAGNOSTIC =====\n');
  
  let totalFieldsFilled = 0;
  
  // Step 1: Ensure dynamic contact fields are visible (click "Add email"/"Add phone" if needed)
  console.log('\n📝 Step 1: Ensuring dynamic contact fields are visible...');
  await ensureDynamicContactFields(data);
  
  // Step 2: Fill radio groups (client type, billing type)
  console.log('\n📝 Step 2: Filling radio groups...');
  totalFieldsFilled += fillRadioGroups(data);
  
  // Step 3: Fill text fields (first name, last name, preferred name, email, phone)
  console.log('\n📝 Step 3: Filling text fields...');
  totalFieldsFilled += await fillTextFields(data);
  
  // Step 4: Fill select dropdowns (date of birth)
  console.log('\n📝 Step 4: Filling select dropdowns...');
  console.log('📝 DOB data provided:', {
    dobMonth: data.dobMonth || '(empty)',
    dobDay: data.dobDay || '(empty)',
    dobYear: data.dobYear || '(empty)'
  });
  totalFieldsFilled += fillSelectDropdowns(data);
  
  console.log('\n📊 Total fields filled:', totalFieldsFilled);
  
  return {
    success: totalFieldsFilled > 0,
    fieldsFilledCount: totalFieldsFilled,
    message: totalFieldsFilled > 0 ? `Filled ${totalFieldsFilled} field(s)` : 'No matching fields found'
  };
}

/**
 * Fill radio group selections
 * Matches radio options by their label text and selects based on data
 * 
 * Supports:
 * - Client type: adult, minor, couple
 * - Billing type: self-pay, insurance
 * 
 * @param {Object} data - Form data from popup
 * @returns {number} - Count of radio options selected
 */
function fillRadioGroups(data) {
  console.log('🔘 Starting radio group autofill...');
  
  let count = 0;
  
  // Find all radio inputs (both native and custom role="radio")
  const radioElements = document.querySelectorAll('input[type="radio"], [role="radio"]');
  console.log(`🔍 Found ${radioElements.length} radio elements on page`);
  
  // Track which groups we've already filled
  const filledGroups = new Set();
  
  radioElements.forEach((radio, index) => {
    // Skip if not visible
    if (!isVisible(radio)) {
      return;
    }
    
    // Get label text for this radio option
    const labelText = getRadioLabelText(radio);
    const metadata = getFieldMetadata(radio);
    const combinedText = `${labelText} ${metadata}`.toLowerCase().trim();
    
    console.log(`\n  🔘 Radio ${index + 1}:`);
    console.log(`     Label text: "${labelText}"`);
    console.log(`     Value: "${radio.value || '(no value)'}"`);
    console.log(`     Name: "${radio.name || '(no name)'}"`);
    console.log(`     Checked: ${radio.checked || radio.getAttribute('aria-checked') === 'true'}`);
    console.log(`     Combined text: "${combinedText}"`);
    
    // Determine radio group identifier
    const groupId = radio.name || `role-radio-${radio.getAttribute('aria-labelledby') || index}`;
    
    // Match against data
    let shouldSelect = false;
    let matchType = null;
    
    // Client Type matching
    if (data.clientType) {
      const clientTypeLower = data.clientType.toLowerCase();
      
      if (clientTypeLower === 'adult' && matchesKeywords(combinedText, ['adult'])) {
        shouldSelect = true;
        matchType = 'clientType: adult';
      } else if (clientTypeLower === 'minor' && matchesKeywords(combinedText, ['minor', 'child'])) {
        shouldSelect = true;
        matchType = 'clientType: minor';
      } else if (clientTypeLower === 'couple' && matchesKeywords(combinedText, ['couple', 'couples'])) {
        shouldSelect = true;
        matchType = 'clientType: couple';
      }
    }
    
    // Billing Type matching
    if (data.billingType && !shouldSelect) {
      const billingTypeLower = data.billingType.toLowerCase();
      
      if (billingTypeLower === 'self-pay' && matchesKeywords(combinedText, ['self', 'pay', 'self-pay', 'selfpay'])) {
        shouldSelect = true;
        matchType = 'billingType: self-pay';
      } else if (billingTypeLower === 'insurance' && matchesKeywords(combinedText, ['insurance'])) {
        shouldSelect = true;
        matchType = 'billingType: insurance';
      }
    }
    
    // Select the radio if matched and group not already filled
    if (shouldSelect && !filledGroups.has(groupId)) {
      console.log(`     ✓ MATCHED: ${matchType}`);
      console.log(`     → Selecting radio option...`);
      
      try {
        // Click the radio element (works for both native and custom radios)
        radio.click();
        
        // Also set checked attribute for native radios
        if (radio.type === 'radio') {
          radio.checked = true;
          // Dispatch events for framework state updates
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          radio.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        count++;
        filledGroups.add(groupId);
        console.log(`     ✅ Radio option selected successfully`);
      } catch (error) {
        console.error(`     ❌ Failed to select radio:`, error);
      }
    } else if (shouldSelect && filledGroups.has(groupId)) {
      console.log(`     ⊘ Group already filled, skipping`);
    } else {
      console.log(`     ✗ No match for this radio`);
    }
  });
  
  console.log(`\n📊 Radio group summary:`);
  console.log(`   Total radio elements: ${radioElements.length}`);
  console.log(`   Radio options selected: ${count}`);
  console.log(`   Groups filled: ${filledGroups.size}`);
  
  return count;
}

/**
 * Get label text associated with a radio button
 * Checks multiple methods to find the label
 * 
 * @param {HTMLElement} radio - Radio input or element
 * @returns {string} - Label text
 */
function getRadioLabelText(radio) {
  // Method 1: Associated <label> element
  const associatedLabel = getAssociatedLabelText(radio);
  if (associatedLabel) {
    return associatedLabel;
  }
  
  // Method 2: Parent label (radio nested inside label)
  const parentLabel = radio.closest('label');
  if (parentLabel) {
    return parentLabel.textContent || '';
  }
  
  // Method 3: aria-label attribute
  const ariaLabel = radio.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }
  
  // Method 4: Next sibling text (common pattern: <input><span>Label</span>)
  if (radio.nextElementSibling) {
    const siblingText = radio.nextElementSibling.textContent;
    if (siblingText && siblingText.trim()) {
      return siblingText;
    }
  }
  
  // Method 5: Parent element text (for custom radio buttons)
  const parent = radio.parentElement;
  if (parent) {
    // Get text content but exclude nested radio elements
    const clone = parent.cloneNode(true);
    const nestedRadios = clone.querySelectorAll('input[type="radio"], [role="radio"]');
    nestedRadios.forEach(r => r.remove());
    const text = clone.textContent || '';
    if (text.trim()) {
      return text;
    }
  }
  
  // Method 6: Value attribute as fallback
  if (radio.value) {
    return radio.value;
  }
  
  return '';
}

/**
 * Ensure dynamic contact fields are visible
 * Clicks "Add email" and "Add phone" buttons if fields don't exist but data is provided
 * 
 * @param {Object} data - Form data from popup
 * @returns {Promise<void>}
 */
async function ensureDynamicContactFields(data) {
  console.log('🔘 Checking for dynamic contact fields...');
  
  // First, try to click the "Contact" tab if it exists
  // (SimplePractice has Client/Contact tabs in the create client form)
  console.log('🔍 Looking for Contact tab...');
  const contactTab = findTabByText('Contact');
  if (contactTab) {
    console.log('✓ Found Contact tab:', contactTab);
    console.log('✓ Tab element:', contactTab.tagName, contactTab.getAttribute('role'));
    
    // Safety check: don't click if it's an external link
    if (contactTab.tagName === 'A' && contactTab.href && 
        (contactTab.href.startsWith('http://') || contactTab.href.startsWith('https://'))) {
      console.log('⚠️ Contact element is an external link, skipping click to avoid navigation');
      console.log('⚠️ Link URL:', contactTab.href);
    } else {
      console.log('✓ Clicking Contact tab...');
      contactTab.click();
      
      // Wait for tab content to load
      console.log('⏳ Waiting 500ms for Contact tab content to load...');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } else {
    console.log('⊘ Contact tab not found (fields may be on same page)');
  }
  
  // Check if we need email field
  if (data.email && data.email.trim()) {
    console.log('📧 Email data provided, checking if email field exists...');
    
    const emailField = findEmailField();
    
    if (!emailField) {
      console.log('📧 Email field not found, searching for "Add email" button...');
      const addEmailBtn = findButtonByText(['add email', 'add e-mail', '+ email']);
      
      if (addEmailBtn) {
        console.log('📧 Found "Add email" button:', addEmailBtn);
        console.log('📧 Clicking button...');
        addEmailBtn.click();
        
        // Wait for field to appear
        console.log('📧 Waiting 600ms for email field to appear...');
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Verify field appeared
        const newEmailField = findEmailField();
        if (newEmailField) {
          console.log('✓ Email field successfully created');
        } else {
          console.log('⚠️ Email field still not found after clicking button');
        }
      } else {
        console.log('⚠️ "Add email" button not found, field may already exist or use different pattern');
      }
    } else {
      console.log('✓ Email field already exists');
    }
  } else {
    console.log('⊘ No email data provided, skipping email field check');
  }
  
  // Check if we need phone field
  if (data.phone && data.phone.trim()) {
    console.log('📱 Phone data provided, checking if phone field exists...');
    
    const phoneField = findPhoneField();
    
    if (!phoneField) {
      console.log('📱 Phone field not found, searching for "Add phone" button...');
      const addPhoneBtn = findButtonByText(['add phone', 'add telephone', '+ phone', 'add mobile']);
      
      if (addPhoneBtn) {
        console.log('📱 Found "Add phone" button:', addPhoneBtn);
        console.log('📱 Clicking button...');
        addPhoneBtn.click();
        
        // Wait for field to appear
        console.log('📱 Waiting 600ms for phone field to appear...');
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Verify field appeared
        const newPhoneField = findPhoneField();
        if (newPhoneField) {
          console.log('✓ Phone field successfully created');
        } else {
          console.log('⚠️ Phone field still not found after clicking button');
        }
      } else {
        console.log('⚠️ "Add phone" button not found, field may already exist or use different pattern');
      }
    } else {
      console.log('✓ Phone field already exists');
    }
  } else {
    console.log('⊘ No phone data provided, skipping phone field check');
  }
  
  console.log('✓ Dynamic contact fields check complete');
}

/**
 * Find email input field on the page
 * @returns {HTMLElement|null}
 */
function findEmailField() {
  const inputs = document.querySelectorAll('input[type="email"], input[type="text"], input:not([type])');
  
  for (const input of inputs) {
    if (!isVisible(input) || input.disabled) continue;
    
    const metadata = getFieldMetadata(input);
    const labelText = getAssociatedLabelText(input);
    const combinedMeta = `${metadata} ${labelText}`.toLowerCase();
    
    if (matchesKeywords(combinedMeta, ['email', 'e-mail'])) {
      return input;
    }
  }
  
  return null;
}

/**
 * Fill select dropdown fields
 * Matches dropdowns semantically and selects appropriate options
 * 
 * @param {Object} data - Form data from popup
 * @returns {number} - Count of fields filled
 */
function fillSelectDropdowns(data) {
  let count = 0;
  
  // Find all visible select elements
  const selectFields = document.querySelectorAll('select');
  
  console.log(`🔍 Found ${selectFields.length} total select dropdowns on page`);
  
  // Log ALL selects for debugging (first 10)
  if (selectFields.length > 0) {
    console.log('🔍 Dumping first 10 select elements for debugging:');
    const selectsToLog = Math.min(10, selectFields.length);
    for (let i = 0; i < selectsToLog; i++) {
      const sel = selectFields[i];
      console.log(`  Select ${i + 1}:`, {
        visible: isVisible(sel),
        disabled: sel.disabled,
        name: sel.name,
        id: sel.id,
        className: sel.className,
        'aria-label': sel.getAttribute('aria-label'),
        optionsCount: sel.options.length,
        firstOptionText: sel.options[0]?.text || '(no options)'
      });
    }
  }
  
  let visibleCount = 0;
  let invisibleCount = 0;
  
  selectFields.forEach((select, index) => {
    // Only process visible and enabled fields
    const visible = isVisible(select);
    const disabled = select.disabled;
    
    if (!visible) {
      invisibleCount++;
    } else {
      visibleCount++;
    }
    
    if (!visible || disabled) {
      console.log(`  ⊘ Select ${index + 1}: SKIPPED (visible=${visible}, disabled=${disabled})`);
      return;
    }
    
    // Get comprehensive semantic metadata about this select
    const metadata = getFieldMetadata(select);
    const labelText = getAssociatedLabelText(select);
    const combinedMeta = `${metadata} ${labelText}`.toLowerCase();
    
    console.log(`\n  🔽 Select ${index + 1}:`);
    console.log(`     Name: "${select.name}"`);
    console.log(`     ID: "${select.id}"`);
    console.log(`     Aria-label: "${select.getAttribute('aria-label') || ''}"`);
    console.log(`     Label text: "${labelText}"`);
    console.log(`     📝 Combined metadata: "${combinedMeta.substring(0, 120)}${combinedMeta.length > 120 ? '...' : ''}"`);
    console.log(`     Options count: ${select.options.length}`);
    
    // Try to match this select to a data type
    const matchResult = matchFieldToDataType(combinedMeta, data);
    
    let valueToSelect = matchResult.value;
    let fieldType = matchResult.type;
    
    if (matchResult.matched) {
      console.log(`     ✓ MATCHED: ${fieldType}`);
      console.log(`     🎯 Match reason: Found keywords [${matchResult.keywords.join(', ')}]`);
    } else {
      console.log(`     ✗ NO MATCH - No recognized keywords found`);
    }
    
    // Select the value if we have one
    if (valueToSelect && String(valueToSelect).trim()) {
      try {
        console.log(`     → Attempting to select: "${valueToSelect}"`);
        
        // Try to find and select the matching option
        const selected = selectDropdownOption(select, String(valueToSelect));
        
        if (selected) {
          count++;
          console.log(`     ✅ SELECTED SUCCESSFULLY`);
        } else {
          console.log(`     ❌ No matching option found for value: "${valueToSelect}"`);
        }
      } catch (error) {
        console.error(`     ❌ SELECT FAILED:`, error);
      }
    } else if (valueToSelect === null || valueToSelect === undefined) {
      console.log(`     ⊘ No value provided for ${fieldType}`);
    } else {
      console.log(`     ⊘ Value is empty/blank`);
    }
  });
  
  console.log(`\n📊 Select dropdown summary:`);
  console.log(`   Total found: ${selectFields.length}`);
  console.log(`   Visible: ${visibleCount}`);
  console.log(`   Invisible: ${invisibleCount}`);
  console.log(`   Successfully filled: ${count}`);
  
  return count;
}

/**
 * Convert numeric month (01-12) to month name
 * @param {string} monthNum - Month number ("01" - "12")
 * @returns {string} - Month name or original value
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
 * Select an option in a dropdown by value
 * Tries multiple matching strategies: by value, by text content, by partial match
 * 
 * @param {HTMLSelectElement} select - The select element
 * @param {string} targetValue - The value to select
 * @returns {boolean} - True if successfully selected
 */
function selectDropdownOption(select, targetValue) {
  const targetStr = String(targetValue).trim().toLowerCase();
  
  console.log(`     🔍 Searching for option matching: "${targetStr}"`);
  
  // Special handling: If this is a month dropdown and value is numeric, convert to month name
  let searchValue = targetStr;
  const selectName = select.name?.toLowerCase() || '';
  const selectAria = select.getAttribute('aria-label')?.toLowerCase() || '';
  
  if ((selectName.includes('month') || selectAria.includes('month')) && /^\d{1,2}$/.test(targetStr)) {
    const monthName = convertMonthToName(targetStr);
    console.log(`     🔍 Detected month dropdown, converting "${targetStr}" → "${monthName}"`);
    searchValue = monthName.toLowerCase();
  }
  
  console.log(`     🔍 Available options:`);
  
  // Log all options for debugging
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    console.log(`        [${i}] value="${opt.value}" text="${opt.text}"`);
  }
  
  // Strategy 1: Match by option value
  for (let i = 0; i < select.options.length; i++) {
    const option = select.options[i];
    if (option.value.toLowerCase() === searchValue) {
      console.log(`     ✓ Match found (by value): "${option.value}"`);
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  }
  
  // Strategy 2: Match by option text
  for (let i = 0; i < select.options.length; i++) {
    const option = select.options[i];
    if (option.text.toLowerCase().trim() === searchValue) {
      console.log(`     ✓ Match found (by text): "${option.text}"`);
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  }
  
  // Strategy 3: Partial match (option text contains target or vice versa)
  for (let i = 0; i < select.options.length; i++) {
    const option = select.options[i];
    const optText = option.text.toLowerCase().trim();
    const optValue = option.value.toLowerCase().trim();
    
    if (optText.includes(searchValue) || searchValue.includes(optText) ||
        optValue.includes(searchValue) || searchValue.includes(optValue)) {
      console.log(`     ✓ Match found (partial): "${option.text}"`);
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  }
  
  // Strategy 4: For numbers (like day 01-31 or year), try direct numeric match
  if (/^\d+$/.test(targetStr)) {
    const targetNum = parseInt(targetStr, 10);
    for (let i = 0; i < select.options.length; i++) {
      const option = select.options[i];
      const optNum = parseInt(option.value, 10);
      
      if (optNum === targetNum) {
        console.log(`     ✓ Match found (numeric): ${option.value}`);
        select.selectedIndex = i;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    }
  }
  
  console.log(`     ✗ No matching option found`);
  return false;
}

/**
 * Find phone input field on the page
 * @returns {HTMLElement|null}
 */
function findPhoneField() {
  const inputs = document.querySelectorAll('input[type="tel"], input[type="text"], input:not([type])');
  
  for (const input of inputs) {
    if (!isVisible(input) || input.disabled) continue;
    
    const metadata = getFieldMetadata(input);
    const labelText = getAssociatedLabelText(input);
    const combinedMeta = `${metadata} ${labelText}`.toLowerCase();
    
    if (matchesKeywords(combinedMeta, ['phone', 'telephone', 'mobile', 'cell'])) {
      return input;
    }
  }
  
  return null;
}

/**
 * Find a tab element by text content
 * More specific than findButtonByText - looks for actual tab navigation elements
 * @param {string} text - Text to search for
 * @returns {HTMLElement|null}
 */
function findTabByText(text) {
  const searchText = text.toLowerCase();
  
  // Strategy 1: Look for elements with role="tab"
  const tabElements = document.querySelectorAll('[role="tab"]');
  for (const tab of tabElements) {
    if (!isVisible(tab)) continue;
    
    const tabText = tab.textContent.toLowerCase().trim();
    const ariaLabel = (tab.getAttribute('aria-label') || '').toLowerCase();
    
    if (tabText.includes(searchText) || ariaLabel.includes(searchText)) {
      console.log('🔍 Found tab with role="tab":', tab);
      return tab;
    }
  }
  
  // Strategy 2: Look for button/div in a tab-like structure
  // Exclude <a> elements to avoid accidentally clicking links
  const buttons = document.querySelectorAll('button, div[onclick], [role="button"]');
  for (const btn of buttons) {
    if (!isVisible(btn)) continue;
    
    const btnText = btn.textContent.toLowerCase().trim();
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    
    // Check if this looks like a tab (has tab-related classes or is in a tabs container)
    const hasTabClass = btn.className.toLowerCase().includes('tab');
    const inTabContainer = btn.closest('[role="tablist"]') || 
                          btn.closest('.tabs') || 
                          btn.closest('[class*="tab"]');
    
    if ((btnText.includes(searchText) || ariaLabel.includes(searchText)) &&
        (hasTabClass || inTabContainer)) {
      console.log('🔍 Found tab-like button:', btn);
      return btn;
    }
  }
  
  // Strategy 3: Look for Ember view links/buttons (SimplePractice specific)
  // Look for clickable elements that contain the text, are NOT external links
  const allClickables = document.querySelectorAll('a:not([href^="http"]), button, div[onclick], span[onclick]');
  for (const elem of allClickables) {
    if (!isVisible(elem)) continue;
    
    const elemText = elem.textContent.toLowerCase().trim();
    
    // Must be exact match or very close match to avoid false positives
    if (elemText === searchText || elemText === searchText + ':') {
      console.log('🔍 Found clickable element with matching text:', elem);
      return elem;
    }
  }
  
  console.log('🔍 No tab element found for:', text);
  console.log('🔍 All visible elements searched:', {
    'role=tab': tabElements.length,
    'buttons': buttons.length,
    'allClickables': allClickables.length
  });
  return null;
}

/**
 * Find a clickable button/element by text content
 * @param {string[]} textVariations - Array of text variations to search for
 * @returns {HTMLElement|null}
 */
function findButtonByText(textVariations) {
  // Search for actual <button> elements
  const buttons = document.querySelectorAll('button, [role="button"], a, span[onclick], div[onclick]');
  
  for (const btn of buttons) {
    if (!isVisible(btn)) continue;
    
    const btnText = btn.textContent.toLowerCase().trim();
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    const title = (btn.title || '').toLowerCase();
    
    const combinedText = `${btnText} ${ariaLabel} ${title}`;
    
    // Check if any variation matches
    for (const variation of textVariations) {
      if (combinedText.includes(variation.toLowerCase())) {
        return btn;
      }
    }
  }
  
  return null;
}

/**
 * Fill text input and textarea fields
 * Matches fields semantically using metadata inspection
 * 
 * @param {Object} data - Form data from popup
 * @returns {number} - Count of fields filled
 */
async function fillTextFields(data) {
  let count = 0;
  
  // Find all visible text-based input fields and textareas
  const textFields = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea'
  );
  
  console.log(`🔍 Found ${textFields.length} potential text input fields on page`);
  
  // Also log all inputs for debugging
  const allInputs = document.querySelectorAll('input');
  console.log(`🔍 Total input elements on page: ${allInputs.length}`);
  console.log('🔍 Input types found:', [...new Set([...allInputs].map(i => i.type || 'no-type'))]);
  
  // Log phone data specifically
  console.log('🔍 Phone data provided:', data.phone || '(empty)');
  
  let visibleCount = 0;
  let invisibleCount = 0;
  
  for (let index = 0; index < textFields.length; index++) {
    const field = textFields[index];
    
    // Only process visible and enabled fields
    const visible = isVisible(field);
    const disabled = field.disabled;
    
    if (!visible) {
      invisibleCount++;
    } else {
      visibleCount++;
    }
    
    if (!visible || disabled) {
      console.log(`  ⊘ Field ${index + 1}: SKIPPED (visible=${visible}, disabled=${disabled})`);
      continue;
    }
    
    // Get comprehensive semantic metadata about this field
    const metadata = getFieldMetadata(field);
    const labelText = getAssociatedLabelText(field);
    const combinedMeta = `${metadata} ${labelText}`.toLowerCase();
    
    console.log(`\n  🔎 Field ${index + 1}:`);
    console.log(`     Tag: <${field.tagName.toLowerCase()}> Type: ${field.type || 'default'}`);
    console.log(`     Name: "${field.name}"`);
    console.log(`     ID: "${field.id}"`);
    console.log(`     Placeholder: "${field.placeholder}"`);
    console.log(`     Aria-label: "${field.getAttribute('aria-label') || ''}"`);
    console.log(`     Label text: "${labelText}"`);
    console.log(`     Data-testid: "${field.getAttribute('data-testid') || ''}"`);
    console.log(`     Classes: "${field.className.substring(0, 50)}${field.className.length > 50 ? '...' : ''}"`);
    console.log(`     📝 Combined metadata: "${combinedMeta.substring(0, 120)}${combinedMeta.length > 120 ? '...' : ''}"`);
    
    // Try to match this field to a data type
    const matchResult = matchFieldToDataType(combinedMeta, data);
    
    let valueToFill = matchResult.value;
    let fieldType = matchResult.type;
    
    if (matchResult.matched) {
      console.log(`     ✓ MATCHED: ${fieldType}`);
      console.log(`     🎯 Match reason: Found keywords [${matchResult.keywords.join(', ')}]`);
    } else {
      console.log(`     ✗ NO MATCH - No recognized keywords found`);
    }
    
    // Fill the field if we have a value
    if (valueToFill && String(valueToFill).trim()) {
      try {
        console.log(`     → Attempting to fill with: "${valueToFill}"`);
        
        // Use special phone filling for phone fields (handles input masks)
        if (fieldType === 'phone') {
          await fillPhoneFieldWithMask(field, String(valueToFill));
        } else {
          await fillField(field, String(valueToFill));
        }
        
        count++;
        console.log(`     ✅ FILLED SUCCESSFULLY`);
      } catch (error) {
        console.error(`     ❌ FILL FAILED:`, error);
      }
    } else if (valueToFill === null || valueToFill === undefined) {
      console.log(`     ⊘ No value provided for ${fieldType}`);
    } else {
      console.log(`     ⊘ Value is empty/blank`);
    }
  }
  
  console.log(`\n📊 Text field summary:`);
  console.log(`   Total found: ${textFields.length}`);
  console.log(`   Visible: ${visibleCount}`);
  console.log(`   Invisible: ${invisibleCount}`);
  console.log(`   Successfully filled: ${count}`);
  
  return count;
}

/**
 * Combine field metadata into one comprehensive string for semantic matching.
 * Extracts text from: name, id, placeholder, aria-label, data-testid, class names
 * 
 * @param {HTMLElement} field - The input/textarea element
 * @returns {string} - Space-separated metadata string
 */
function getFieldMetadata(field) {
  const parts = [
    field.name || '',
    field.id || '',
    field.placeholder || '',
    field.getAttribute('aria-label') || '',
    field.getAttribute('aria-labelledby') || '',
    field.getAttribute('data-testid') || '',
    field.getAttribute('data-test') || '',
    field.getAttribute('data-name') || '',
    field.title || '',
    field.className || ''
  ];
  
  // Clean up class names to be more readable (remove random hash suffixes)
  const cleanedParts = parts.map(part => {
    if (typeof part === 'string') {
      // Replace hyphens and underscores with spaces for better keyword matching
      return part.replace(/[-_]/g, ' ');
    }
    return part;
  });
  
  return cleanedParts.join(' ').trim();
}

/**
 * Get label text associated with a field
 * Checks for <label> elements by 'for' attribute or parent relationship
 */
function getAssociatedLabelText(field) {
  // Method 1: Label with 'for' attribute matching field's id
  if (field.id) {
    const label = document.querySelector(`label[for="${field.id}"]`);
    if (label) {
      return label.textContent || '';
    }
  }
  
  // Method 2: Field is nested inside a <label>
  const parentLabel = field.closest('label');
  if (parentLabel) {
    return parentLabel.textContent || '';
  }
  
  // Method 3: Look for aria-labelledby
  const ariaLabelledBy = field.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelElement = document.getElementById(ariaLabelledBy);
    if (labelElement) {
      return labelElement.textContent || '';
    }
  }
  
  return '';
}

/**
 * Match a field to a data type based on keyword analysis
 * Returns the data value and type if matched
 * 
 * @param {string} metadata - Lowercase metadata string from field
 * @param {Object} data - Form data from popup
 * @returns {Object} - { matched: boolean, type: string, value: any, keywords: string[] }
 */
function matchFieldToDataType(metadata, data) {
  // Define matching patterns with priority order
  const patterns = [
    {
      type: 'firstName',
      value: data.firstName,
      // Try legal first name, then first name, then given name
      tests: [
        { keywords: ['legal', 'first', 'name'], description: 'legal first name' },
        { keywords: ['first', 'name'], description: 'first name' },
        { keywords: ['given', 'name'], description: 'given name' },
        { keywords: ['fname'], description: 'fname abbreviation' }
      ]
    },
    {
      type: 'lastName',
      value: data.lastName,
      tests: [
        { keywords: ['legal', 'last', 'name'], description: 'legal last name' },
        { keywords: ['last', 'name'], description: 'last name' },
        { keywords: ['surname'], description: 'surname' },
        { keywords: ['family', 'name'], description: 'family name' },
        { keywords: ['lname'], description: 'lname abbreviation' }
      ]
    },
    {
      type: 'preferredName',
      value: data.preferredName || data.firstName,
      tests: [
        { keywords: ['preferred', 'name'], description: 'preferred name' },
        { keywords: ['goes', 'by'], description: 'goes by' },
        { keywords: ['nickname'], description: 'nickname' },
        { keywords: ['call', 'name'], description: 'what to call' }
      ]
    },
    {
      type: 'email',
      value: data.email,
      tests: [
        { keywords: ['email'], description: 'email' },
        { keywords: ['e', 'mail'], description: 'e-mail' },
        { keywords: ['electronic', 'mail'], description: 'electronic mail' }
      ]
    },
    {
      type: 'phone',
      value: data.phone,
      tests: [
        { keywords: ['phone'], description: 'phone' },
        { keywords: ['telephone'], description: 'telephone' },
        { keywords: ['mobile'], description: 'mobile' },
        { keywords: ['cell'], description: 'cell' },
        { keywords: ['contact', 'number'], description: 'contact number' }
      ]
    },
    {
      type: 'dobMonth',
      value: data.dobMonth,
      tests: [
        { keywords: ['birth', 'month'], description: 'birth month' },
        { keywords: ['dob', 'month'], description: 'DOB month' },
        { keywords: ['date', 'of', 'birth', 'month'], description: 'date of birth month' },
        { keywords: ['month', 'born'], description: 'month born' },
        { keywords: ['month'], description: 'month (standalone)' }
      ]
    },
    {
      type: 'dobDay',
      value: data.dobDay,
      tests: [
        { keywords: ['birth', 'day'], description: 'birth day' },
        { keywords: ['dob', 'day'], description: 'DOB day' },
        { keywords: ['date', 'of', 'birth', 'day'], description: 'date of birth day' },
        { keywords: ['day', 'born'], description: 'day born' },
        { keywords: ['day'], description: 'day (standalone)' }
      ]
    },
    {
      type: 'dobYear',
      value: data.dobYear,
      tests: [
        { keywords: ['birth', 'year'], description: 'birth year' },
        { keywords: ['dob', 'year'], description: 'DOB year' },
        { keywords: ['date', 'of', 'birth', 'year'], description: 'date of birth year' },
        { keywords: ['year', 'born'], description: 'year born' },
        { keywords: ['year'], description: 'year (standalone)' }
      ]
    },
    {
      type: 'dobFull',
      value: data.dobMonth && data.dobDay && data.dobYear ? `${data.dobMonth}/${data.dobDay}/${data.dobYear}` : null,
      tests: [
        { keywords: ['date', 'of', 'birth'], description: 'date of birth' },
        { keywords: ['birth', 'date'], description: 'birth date' },
        { keywords: ['dob'], description: 'DOB' },
        { keywords: ['birthday'], description: 'birthday' },
        { keywords: ['date', 'born'], description: 'date born' }
      ]
    }
  ];
  
  // Try each pattern
  for (const pattern of patterns) {
    for (const test of pattern.tests) {
      // Check if ALL keywords in the test are present in metadata
      const allKeywordsFound = test.keywords.every(keyword => metadata.includes(keyword));
      
      if (allKeywordsFound) {
        return {
          matched: true,
          type: pattern.type,
          value: pattern.value,
          keywords: test.keywords
        };
      }
    }
  }
  
  // No match found
  return {
    matched: false,
    type: 'unknown',
    value: null,
    keywords: []
  };
}

/**
 * Check if field metadata matches any of the given keywords
 * @deprecated - Use matchFieldToDataType instead for better matching
 */
function matchesKeywords(metadata, keywords) {
  return keywords.some(keyword => metadata.includes(keyword));
}

/**
 * Check if an element is visible
 */
function isVisible(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Fill masked input field by simulating real user typing
 * Works with Ember/React controlled components that use input masks
 * 
 * Process for each character:
 * 1. Dispatch keydown event
 * 2. Update value using native setter
 * 3. Dispatch input event (triggers mask formatting)
 * 4. Dispatch keyup event
 * 
 * @param {HTMLElement} field - Input field with mask
 * @param {string} value - Value to fill (will extract only valid characters)
 * @param {string} type - Field type ('phone', 'date', 'text')
 */
async function fillMaskedField(field, value, type = 'text') {
  console.log(`     ⌨️  fillMaskedField called`);
  console.log(`     ⌨️  Type: ${type}`);
  console.log(`     ⌨️  Original value: "${value}"`);
  console.log(`     ⌨️  Current field value: "${field.value}"`);
  
  // Extract only valid characters based on field type
  let characters;
  if (type === 'phone') {
    // Extract only digits for phone
    characters = value.replace(/\D/g, '').split('');
    console.log(`     ⌨️  Extracted ${characters.length} digits: "${characters.join('')}"`);
  } else if (type === 'date') {
    // Extract only digits for date
    characters = value.replace(/\D/g, '').split('');
    console.log(`     ⌨️  Extracted ${characters.length} digits: "${characters.join('')}"`);
  } else {
    // For text, use all characters
    characters = value.split('');
    console.log(`     ⌨️  Using ${characters.length} characters`);
  }
  
  if (characters.length === 0) {
    console.log(`     ⚠️  No valid characters found`);
    return;
  }
  
  // Get native value setter
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  
  // Step 1: Focus the field
  console.log(`     ⌨️  Step 1: Focusing field...`);
  field.focus();
  field.dispatchEvent(new Event('focus', { bubbles: true }));
  
  // Step 2: Clear existing content
  console.log(`     ⌨️  Step 2: Clearing field...`);
  nativeInputValueSetter.call(field, '');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  console.log(`     ⌨️  Field cleared, value now: "${field.value}"`);
  
  // Step 3: Insert characters one by one with realistic delays
  console.log(`     ⌨️  Step 3: Typing ${characters.length} characters with delays...`);
  
  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    
    // Add delay between characters to simulate realistic typing
    // Phone fields need longer delays (100ms) for input masks to process
    if (i > 0) {
      const delay = type === 'phone' ? 100 : (type === 'date' ? 50 : 10);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Step 3a: Dispatch keydown event
    const keydownEvent = new KeyboardEvent('keydown', {
      key: char,
      code: type === 'phone' || type === 'date' ? `Digit${char}` : `Key${char.toUpperCase()}`,
      keyCode: char.charCodeAt(0),
      which: char.charCodeAt(0),
      bubbles: true,
      cancelable: true,
      composed: true
    });
    field.dispatchEvent(keydownEvent);
    
    // Step 3b: Update value using native setter
    const currentValue = field.value;
    const newValue = currentValue + char;
    nativeInputValueSetter.call(field, newValue);
    
    // Step 3c: Dispatch input event (this triggers mask formatting)
    const inputEvent = new Event('input', {
      bubbles: true,
      cancelable: true,
      composed: true
    });
    field.dispatchEvent(inputEvent);
    
    // Step 3d: Dispatch keyup event
    const keyupEvent = new KeyboardEvent('keyup', {
      key: char,
      code: type === 'phone' || type === 'date' ? `Digit${char}` : `Key${char.toUpperCase()}`,
      keyCode: char.charCodeAt(0),
      which: char.charCodeAt(0),
      bubbles: true,
      cancelable: true,
      composed: true
    });
    field.dispatchEvent(keyupEvent);
    
    // Log progress
    const progress = `[${i + 1}/${characters.length}]`;
    console.log(`     ⌨️  ${progress} Typed "${char}" → Field value: "${field.value}"`);
  }
  
  // Step 4: Wait for mask to settle (especially important for phone fields)
  if (type === 'phone') {
    console.log(`     ⌨️  Step 4: Waiting 500ms for mask to process...`);
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`     ⌨️  Field value after wait: "${field.value}"`);
  }
  
  // Step 5: Dispatch final events to lock in the value
  console.log(`     ⌨️  Step 5: Dispatching final events...`);
  
  // Dispatch change event
  field.dispatchEvent(new Event('change', { bubbles: true }));
  console.log(`     ⌨️    → change event`);
  
  // Wait before blur to ensure change is processed
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Dispatch blur event to finalize the input
  field.dispatchEvent(new Event('blur', { bubbles: true }));
  console.log(`     ⌨️    → blur event`);
  
  // Final wait to let Ember fully process the blur
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log(`     ⌨️  ✅ Complete! Final value: "${field.value}"`);
}

/**
 * Fill phone field with input mask support
 * Simulates typing each digit to trigger mask formatting (e.g., (XXX) XXX-XXXX)
 * 
 * @param {HTMLElement} field - Phone input field
 * @param {string} value - Phone number value (already formatted as (XXX) XXX-XXXX)
 */
async function fillPhoneFieldWithMask(field, value) {
  console.log(`     📱 fillPhoneFieldWithMask called`);
  console.log(`     📱 Value to fill: "${value}"`);
  console.log(`     📱 Current field value: "${field.value}"`);
  
  // Get native value setter
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  
  // Try setting the formatted value directly first
  console.log(`     📱 Attempting direct formatted value set...`);
  field.focus();
  field.dispatchEvent(new Event('focus', { bubbles: true }));
  
  // Set the formatted value directly
  nativeInputValueSetter.call(field, value);
  
  // Dispatch input event
  field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  console.log(`     📱 Value after direct set: "${field.value}"`);
  
  // If the mask rejected it (value is empty or wrong), fall back to digit-by-digit
  const digitsOnly = value.replace(/\D/g, '');
  const fieldDigitsOnly = field.value.replace(/\D/g, '');
  
  if (fieldDigitsOnly.length < digitsOnly.length - 1) {
    console.log(`     📱 Direct set failed, falling back to character-by-character typing...`);
    
    // Clear and try digit by digit
    nativeInputValueSetter.call(field, '');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Type each digit with delays
    const digits = digitsOnly.split('');
    for (let i = 0; i < digits.length; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      const currentValue = field.value;
      nativeInputValueSetter.call(field, currentValue + digits[i]);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      
      console.log(`     📱 [${i + 1}/${digits.length}] Typed "${digits[i]}" → "${field.value}"`);
    }
  }
  
  // Wait for mask to settle
  console.log(`     📱 Waiting 1 second for mask to settle...`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log(`     📱 Value after wait: "${field.value}"`);
  
  // Dispatch change event but DON'T blur yet
  field.dispatchEvent(new Event('change', { bubbles: true }));
  console.log(`     📱 Dispatched change event`);
  console.log(`     📱 Final value: "${field.value}"`);
}

/**
 * Trigger synthetic events so React/Ember state updates correctly.
 * Automatically detects masked fields and uses character-by-character typing.
 * 
 * @param {HTMLElement} field - Input or textarea element
 * @param {string} value - Value to fill
 */
async function fillField(field, value) {
  console.log(`     🔧 fillField called for:`, field.tagName, field.type);
  console.log(`     🔧 Current value: "${field.value}"`);
  console.log(`     🔧 New value: "${value}"`);
  
  // Check if this field might be masked (uses input mask or is date/number field)
  const isMaskedField = detectMaskedField(field);
  
  if (isMaskedField) {
    console.log(`     🔧 Detected masked field, using character-by-character typing`);
    const fieldType = field.type === 'tel' ? 'phone' : 
                     (field.type === 'number' || isDateField(field)) ? 'date' : 'text';
    await fillMaskedField(field, value, fieldType);
    return;
  }
  
  // For textareas and simple text fields, use direct value setting
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  ).set;
  
  // Use the appropriate setter based on element type
  if (field.tagName === 'TEXTAREA') {
    nativeTextAreaValueSetter.call(field, value);
    console.log(`     🔧 Used textarea setter`);
  } else {
    nativeInputValueSetter.call(field, value);
    console.log(`     🔧 Used input setter`);
  }
  
  console.log(`     🔧 Value after setter: "${field.value}"`);
  
  // Dispatch events to trigger React/Ember onChange handlers
  console.log(`     🔧 Dispatching events...`);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  console.log(`     🔧   → input event dispatched`);
  field.dispatchEvent(new Event('change', { bubbles: true }));
  console.log(`     🔧   → change event dispatched`);
  field.dispatchEvent(new Event('blur', { bubbles: true }));
  console.log(`     🔧   → blur event dispatched`);
  
  // Also try focus event for good measure
  field.dispatchEvent(new Event('focus', { bubbles: true }));
  console.log(`     🔧   → focus event dispatched`);
}

/**
 * Detect if a field uses an input mask
 * Checks for common indicators of masked fields
 * 
 * @param {HTMLElement} field - Input field
 * @returns {boolean} - True if field appears to use a mask
 */
function detectMaskedField(field) {
  // Check input type
  if (field.type === 'tel') {
    console.log(`     🔍 Mask detection: type="tel" → YES`);
    return true;
  }
  
  if (field.type === 'number') {
    console.log(`     🔍 Mask detection: type="number" → YES`);
    return true;
  }
  
  // Check for date-related fields
  if (isDateField(field)) {
    console.log(`     🔍 Mask detection: date field → YES`);
    return true;
  }
  
  // Check for common mask attributes or patterns
  const metadata = getFieldMetadata(field).toLowerCase();
  const labelText = getAssociatedLabelText(field).toLowerCase();
  const combined = `${metadata} ${labelText}`;
  
  // Check for phone indicators
  if (matchesKeywords(combined, ['phone', 'telephone', 'mobile', 'cell'])) {
    console.log(`     🔍 Mask detection: phone-related keywords → YES`);
    return true;
  }
  
  // Check for date indicators
  if (matchesKeywords(combined, ['date', 'birth', 'dob', 'birthday', 'month', 'day', 'year'])) {
    console.log(`     🔍 Mask detection: date-related keywords → YES`);
    return true;
  }
  
  // Check placeholder for mask patterns
  if (field.placeholder) {
    const placeholder = field.placeholder.toLowerCase();
    // Phone mask patterns: (xxx) xxx-xxxx, xxx-xxx-xxxx
    if (placeholder.includes('(') && placeholder.includes(')') && placeholder.includes('-')) {
      console.log(`     🔍 Mask detection: phone pattern in placeholder → YES`);
      return true;
    }
    // Date patterns: mm/dd/yyyy, dd/mm/yyyy
    if (/\d{2}\/\d{2}\/\d{4}|mm\/dd\/yyyy|dd\/mm\/yyyy/i.test(placeholder)) {
      console.log(`     🔍 Mask detection: date pattern in placeholder → YES`);
      return true;
    }
  }
  
  // Check for maxlength that suggests formatted input
  if (field.maxLength > 0 && field.maxLength <= 20) {
    // Phone numbers are typically 14-16 chars with formatting
    if (field.maxLength >= 10 && field.maxLength <= 16) {
      const hasPhoneKeywords = matchesKeywords(combined, ['phone', 'tel', 'mobile']);
      if (hasPhoneKeywords) {
        console.log(`     🔍 Mask detection: maxLength + phone keywords → YES`);
        return true;
      }
    }
  }
  
  console.log(`     🔍 Mask detection: no mask indicators → NO`);
  return false;
}

/**
 * Check if field is a date-related input
 * 
 * @param {HTMLElement} field - Input field
 * @returns {boolean} - True if field is for date input
 */
function isDateField(field) {
  if (field.type === 'date') {
    return true;
  }
  
  const metadata = getFieldMetadata(field).toLowerCase();
  const labelText = getAssociatedLabelText(field).toLowerCase();
  const combined = `${metadata} ${labelText}`;
  
  // Check for specific date field indicators
  if (matchesKeywords(combined, ['birth', 'dob']) || 
      matchesKeywords(combined, ['date', 'of', 'birth'])) {
    return true;
  }
  
  // Check for month/day/year fields
  if (matchesKeywords(combined, ['month']) || 
      matchesKeywords(combined, ['year']) ||
      (matchesKeywords(combined, ['day']) && !matchesKeywords(combined, ['birthday']))) {
    return true;
  }
  
  return false;
}
