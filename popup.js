/**
 * Popup script.
 * Collects user input (first name, last name, email, phone)
 * and sends it to the content script in the active tab.
 */

console.log('✓ SimplePractice autofill popup loaded');
console.log('✓ Timestamp:', new Date().toISOString());

// Get references to DOM elements
const clientTypeSelect = document.getElementById('clientType');
const billingTypeSelect = document.getElementById('billingType');
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const dobMonthInput = document.getElementById('dobMonth');
const dobDayInput = document.getElementById('dobDay');
const dobYearInput = document.getElementById('dobYear');
const fillBtn = document.getElementById('fillBtn');
const statusDiv = document.getElementById('status');

console.log('✓ DOM elements loaded:', {
  clientTypeSelect: !!clientTypeSelect,
  billingTypeSelect: !!billingTypeSelect,
  firstNameInput: !!firstNameInput,
  lastNameInput: !!lastNameInput,
  emailInput: !!emailInput,
  phoneInput: !!phoneInput,
  dobMonthInput: !!dobMonthInput,
  dobDayInput: !!dobDayInput,
  dobYearInput: !!dobYearInput,
  fillBtn: !!fillBtn,
  statusDiv: !!statusDiv
});

// Load saved data when popup opens
console.log('🔄 Loading saved data from chrome.storage.sync...');
chrome.storage.sync.get(['clientType', 'billingType', 'firstName', 'lastName', 'email', 'phone', 'dobMonth', 'dobDay', 'dobYear'], (result) => {
  console.log('📦 Loaded data:', result);
  
  if (result.clientType) clientTypeSelect.value = result.clientType;
  if (result.billingType) billingTypeSelect.value = result.billingType;
  if (result.firstName) firstNameInput.value = result.firstName;
  if (result.lastName) lastNameInput.value = result.lastName;
  if (result.email) emailInput.value = result.email;
  if (result.phone) phoneInput.value = result.phone;
  if (result.dobMonth) dobMonthInput.value = result.dobMonth;
  if (result.dobDay) dobDayInput.value = result.dobDay;
  if (result.dobYear) dobYearInput.value = result.dobYear;
  
  console.log('✓ Form fields populated with saved data');
});

// Save data as user types
const saveData = () => {
  const data = {
    clientType: clientTypeSelect.value,
    billingType: billingTypeSelect.value,
    firstName: firstNameInput.value,
    lastName: lastNameInput.value,
    email: emailInput.value,
    phone: phoneInput.value,
    dobMonth: dobMonthInput.value,
    dobDay: dobDayInput.value,
    dobYear: dobYearInput.value
  };
  
  chrome.storage.sync.set(data, () => {
    console.log('💾 Data saved to storage:', data);
  });
};

// Format phone number as user types
phoneInput.addEventListener('input', (e) => {
  // Get cursor position before formatting
  const cursorPos = e.target.selectionStart;
  const oldValue = e.target.value;
  const oldLength = oldValue.length;
  
  // Extract only digits (up to 10)
  let digits = e.target.value.replace(/\D/g, '').substring(0, 10);
  let formatted = '';
  
  if (digits.length === 0) {
    formatted = '';
  } else if (digits.length <= 3) {
    formatted = '(' + digits;
  } else if (digits.length <= 6) {
    formatted = '(' + digits.substring(0, 3) + ') ' + digits.substring(3);
  } else {
    formatted = '(' + digits.substring(0, 3) + ') ' + digits.substring(3, 6) + '-' + digits.substring(6);
  }
  
  e.target.value = formatted;
  
  // Restore cursor position at end of input
  e.target.setSelectionRange(formatted.length, formatted.length);
  
  saveData();
});

clientTypeSelect.addEventListener('change', saveData);
billingTypeSelect.addEventListener('change', saveData);
firstNameInput.addEventListener('input', saveData);
lastNameInput.addEventListener('input', saveData);
emailInput.addEventListener('input', saveData);
dobMonthInput.addEventListener('input', saveData);
dobDayInput.addEventListener('input', saveData);
dobYearInput.addEventListener('input', saveData);

// Handle fill button click
fillBtn.addEventListener('click', async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🖱️ Fill button clicked');
  
  try {
    // Collect form data
    const formData = {
      clientType: clientTypeSelect.value,
      billingType: billingTypeSelect.value,
      firstName: firstNameInput.value.trim(),
      lastName: lastNameInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      dobMonth: dobMonthInput.value.trim(),
      dobDay: dobDayInput.value.trim(),
      dobYear: dobYearInput.value.trim()
    };

    console.log('📋 Form data collected:', formData);
    console.log('📋 Phone value from input:', phoneInput.value);
    console.log('📋 Phone digits only:', phoneInput.value.replace(/\D/g, ''));

    // Validate that at least one field has data
    if (!formData.clientType && !formData.billingType && !formData.firstName && 
        !formData.lastName && !formData.email && !formData.phone && 
        !formData.dobMonth && !formData.dobDay && !formData.dobYear) {
      console.warn('⚠️ Validation failed: No fields filled');
      showStatus('Please enter at least one field', 'error');
      return;
    }

    console.log('✓ Validation passed');
    
    // Get the active tab
    console.log('🔍 Querying for active tab...');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('📑 Query result:', tabs);
    
    if (!tabs || tabs.length === 0) {
      console.error('❌ No active tab found');
      showStatus('Error: No active tab found', 'error');
      return;
    }
    
    const tab = tabs[0];
    console.log('✓ Active tab found:', {
      id: tab.id,
      url: tab.url,
      title: tab.title
    });
    
    // Check if we're on SimplePractice domain
    if (!tab.url || !tab.url.includes('simplepractice.com')) {
      console.warn('⚠️ Not on SimplePractice domain:', tab.url);
      showStatus('Please navigate to SimplePractice first', 'error');
      return;
    }

    console.log('✓ SimplePractice domain confirmed');

    // Disable button while processing
    fillBtn.disabled = true;
    showStatus('Filling form...', '');

    // Prepare message
    const message = { 
      action: 'autofill', 
      data: formData 
    };
    
    console.log('📤 Sending message to tab:', tab.id);
    console.log('📤 Message payload:', message);

    // Send message to content script with fallback injection
    sendMessageWithFallback(tab.id, message, (response) => {
      console.log('📥 Response received from content script:', response);
      
      fillBtn.disabled = false;
      
      if (response && response.success) {
        console.log('✅ Autofill successful!');
        console.log('✅ Fields filled:', response.fieldsFilledCount);
        showStatus(`✓ Filled ${response.fieldsFilledCount} field(s)`, 'success');
      } else if (response && !response.success) {
        console.warn('⚠️ Autofill completed but no fields filled');
        console.warn('⚠️ Response message:', response?.message);
        showStatus(response?.message || 'No fields found to fill', 'error');
      } else {
        console.error('❌ No response received');
        showStatus('Error: No response from content script', 'error');
      }
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (error) {
    console.error('❌ Exception in fill button handler:', error);
    console.error('❌ Stack trace:', error.stack);
    fillBtn.disabled = false;
    showStatus('Error: ' + error.message, 'error');
  }
});

/**
 * Send message with automatic content script injection fallback
 * If content script is not loaded, attempts to inject it programmatically
 * 
 * @param {number} tabId - Tab ID to send message to
 * @param {Object} message - Message to send
 * @param {Function} callback - Callback function
 */
function sendMessageWithFallback(tabId, message, callback) {
  // First attempt: try sending message normally
  chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ Runtime error:', chrome.runtime.lastError.message);
      console.error('❌ Full error details:', JSON.stringify(chrome.runtime.lastError));
      
      // Check if it's a connection error (content script not loaded)
      if (chrome.runtime.lastError.message.includes('Could not establish connection') ||
          chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
        
        console.log('🔄 Content script not loaded, attempting programmatic injection...');
        showStatus('Loading extension into page...', '');
        
        // Inject content script programmatically
        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            files: ['content.js']
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error('❌ Failed to inject content script:', chrome.runtime.lastError);
              showStatus('Error: Could not load extension. Please refresh the page.', 'error');
              callback({ success: false, message: 'Failed to inject content script' });
              return;
            }
            
            console.log('✓ Content script injected successfully');
            console.log('🔄 Waiting 500ms for script initialization...');
            
            // Wait a moment for content script to initialize
            setTimeout(() => {
              console.log('🔄 Retrying message send...');
              
              // Retry sending the message
              chrome.tabs.sendMessage(tabId, message, (retryResponse) => {
                if (chrome.runtime.lastError) {
                  console.error('❌ Retry failed:', chrome.runtime.lastError.message);
                  showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                  callback({ success: false, message: chrome.runtime.lastError.message });
                } else {
                  console.log('✓ Retry successful!');
                  callback(retryResponse);
                }
              });
            }, 500);
          }
        );
      } else {
        // Different error, not connection-related
        showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
        callback({ success: false, message: chrome.runtime.lastError.message });
      }
    } else {
      // Success on first attempt
      callback(response);
    }
  });
}

// Show status message
function showStatus(message, type) {
  console.log(`📢 Status update [${type || 'info'}]:`, message);
  
  statusDiv.textContent = message;
  statusDiv.className = 'show ' + type;
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusDiv.className = '';
  }, 3000);
}
