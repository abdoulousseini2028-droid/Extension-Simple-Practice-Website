# SimplePractice Autofill - Architecture & Code Reference

Quick reference guide for the codebase structure and key functions.

## File Overview

### manifest.json
Chrome Extension configuration file.

**Key Settings:**
- `manifest_version: 3` - Uses Manifest V3
- `permissions: ["activeTab", "storage", "scripting"]`
- `host_permissions: ["*://*.simplepractice.com/*"]`
- `content_scripts[0].run_at: "document_idle"` - Wait for DOM

### popup.html (150 lines)
User interface for data entry.

**Key Sections:**
- Header with icon and title
- Form fields (client type, billing type, name, email, phone, DOB)
- Fill Form button
- Status message area

**Notable Features:**
- Phone input with auto-formatting
- Date of birth split into 3 inputs (MM/DD/YYYY)
- Proper label associations for accessibility

### popup.js (300 lines)
Handles user input and communication with content script.

**Key Functions:**

```javascript
// Auto-formats phone input as (XXX) XXX-XXXX
phoneInput.addEventListener('input', function(e) { ... })

// Sends message to content script with fallback injection
function sendMessageWithFallback(data) { ... }

// Main handler for "Fill Form" button
document.getElementById('fillBtn').addEventListener('click', async () => { ... })
```

**Data Flow:**
1. Collect form data from popup
2. Send to active tab via `chrome.tabs.sendMessage`
3. If connection fails, inject content script and retry
4. Display success/error message

### content.js (1,760 lines)
Main autofill engine. Most complex file.

## Content.js Function Reference

### Entry Point & Message Handling

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'autofill') {
    autofillFormWithRetry(request.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse(error));
  }
  return true; // Keep channel open for async response
});
```

### Core Autofill Functions

#### `autofillFormWithRetry(data, maxRetries=10, retryDelay=300)`
Retry mechanism for SPA dynamic forms.
- **Purpose:** Wait for form fields to appear
- **Returns:** Promise<Object> with success status
- **Retries:** Up to 10 times, 300ms apart

#### `autofillForm(data)`
Main orchestrator that calls specialized functions.
- **Steps:**
  1. Run diagnostic
  2. Ensure dynamic contact fields
  3. Fill radio groups
  4. Fill text fields (async)
  5. Fill select dropdowns
- **Returns:** Object with fieldsFilledCount

### Diagnostic & Field Detection

#### `runPageDiagnostic()`
Dumps comprehensive form structure to console.
- **Outputs:**
  - All `<select>` elements
  - All `type="tel"` inputs
  - Phone-related inputs (by keyword)
  - DOB-related inputs (by keyword)
  - Contact-related elements
  - Custom dropdowns

#### `getFieldMetadata(field)`
Collects metadata from 10+ sources.
- **Sources:** name, id, placeholder, aria-label, data-testid, class
- **Returns:** Combined string for semantic matching

#### `getAssociatedLabelText(field)`
Finds label text associated with input.
- **Methods:** 
  - `<label for="id">`
  - Wrapped in `<label>`
  - `aria-labelledby`
- **Returns:** Label text or empty string

#### `isVisible(element)`
Checks if element is visible to user.
- **Checks:** display, visibility, opacity, dimensions
- **Returns:** Boolean

### Dynamic Field Management

#### `ensureDynamicContactFields(data)`
Clicks "Contact" tab and "Add email/phone" buttons.
- **Async:** Yes
- **Waits:** 600ms between clicks
- **Smart:** Only clicks if email/phone data provided

#### `findTabByText(text)`
Safely finds tab without clicking external links.
- **Priority:**
  1. `role="tab"` elements
  2. Tab-like buttons
  3. Clickable elements (excluding external links)
- **Returns:** Element or null

### Radio Group Handling

#### `fillRadioGroups(data)`
Fills client type and billing type radio buttons.
- **Matches:**
  - Client type: Adult, Minor, Couple
  - Billing type: Self-pay, Insurance
- **Returns:** Count of fields filled

### Text Field Filling

#### `fillTextFields(data)`
Main async function for text input filling.
- **Async:** Yes
- **Uses:** for loop (not forEach) to support await
- **Special:** Calls `fillPhoneFieldWithMask` for phone fields
- **Returns:** Count of fields filled

#### `matchFieldToDataType(metadata, data)`
Semantic matching of fields to data types.
- **Keywords:**
  - firstName: ['first', 'name', 'given']
  - lastName: ['last', 'surname', 'family']
  - phone: ['phone', 'mobile', 'cell']
  - month: `\bmonth\b` (standalone)
- **Returns:** Object with { matched, type, value, keywords }

### Phone Number Filling (Most Complex)

#### `fillPhoneFieldWithMask(field, value)`
Custom phone filling logic for Ember masked inputs.

**Strategy:**
```javascript
1. Focus field
2. Try setting formatted value directly
3. If rejected, clear and type digit-by-digit
4. Wait 150ms between each digit
5. Wait 1000ms for mask to settle
6. Dispatch change event
7. DO NOT dispatch blur event (causes validation failure)
```

**Why Complex:**
- Ember masks have multi-stage validation
- Too fast = digits rejected
- Blur event = validation clears values
- Requires 1 second total to complete

**Returns:** Promise (async)

### Masked Field Detection & Filling

#### `detectMaskedField(field)`
Auto-detects if field uses input mask.
- **Checks:**
  - type="tel" or type="number"
  - Date-related keywords
  - Phone-related keywords
  - Placeholder patterns (XXX, ___)
  - maxLength hints
- **Returns:** Boolean

#### `fillMaskedField(field, value, type)`
Character-by-character typing with delays.
- **Types:** 'phone', 'date', 'text'
- **Delays:**
  - Phone: 100ms between chars
  - Date: 50ms between chars
  - Text: 10ms between chars
- **Events:** keydown → setValue → input → keyup per character

#### `fillField(field, value)`
Smart field filler that auto-detects masks.
- **Auto-routes:** Masked fields → fillMaskedField
- **Auto-routes:** Regular fields → direct setValue
- **Async:** Yes

### Select Dropdown Handling

#### `fillSelectDropdowns(data)`
Fills month/day/year dropdowns for DOB.
- **Auto-converts:** Month numbers to names (11 → November)
- **Matches:** Standalone keywords (month, day, year)
- **Returns:** Count of fields filled

#### `selectDropdownOption(select, targetValue)`
Multiple matching strategies for select options.

**Strategies:**
1. Exact value match
2. Case-insensitive text match
3. Partial text match (startsWith)
4. Partial text match (includes)

**Special:** Auto-detects month dropdowns and converts numbers

#### `convertMonthToName(monthNum)`
Converts numeric month to name.
- **Input:** "01", "1", "11", etc.
- **Output:** "January", "November", etc.
- **Fallback:** Returns original if not a month number

### Date Field Utilities

#### `isDateField(field)`
Detects date-related fields.
- **Keywords:** birth, dob, date, month, day, year
- **Returns:** Boolean

## Key Technical Patterns

### 1. Native Value Setters
```javascript
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  'value'
).set;

nativeInputValueSetter.call(field, newValue);
```
**Why:** Bypasses React/Ember synthetic event systems

### 2. Full Keyboard Event Simulation
```javascript
field.dispatchEvent(new KeyboardEvent('keydown', {
  key: char,
  code: `Digit${char}`,
  keyCode: char.charCodeAt(0),
  which: char.charCodeAt(0),
  bubbles: true,
  cancelable: true,
  composed: true
}));
```
**Why:** Ember components listen for keyboard events

### 3. Async Sequential Processing
```javascript
// Use for loop, not forEach, to support await
for (let i = 0; i < fields.length; i++) {
  await fillField(fields[i], value);
}
```
**Why:** Ensures proper timing and prevents race conditions

### 4. Comprehensive Logging
```javascript
console.log('🔧 Step 1: Focusing field...');
console.log('📱 Phone field detected');
console.log('⌨️ [3/10] Typed "7" → Field value: "567"');
console.log('✅ FILLED SUCCESSFULLY');
console.log('❌ FILL FAILED:', error);
```
**Why:** Critical for debugging async timing issues

## Data Flow Diagram

```
User enters data in popup.html
         ↓
popup.js collects data
         ↓
chrome.tabs.sendMessage → content.js
         ↓
autofillFormWithRetry (retry mechanism)
         ↓
autofillForm (orchestrator)
         ├→ ensureDynamicContactFields
         ├→ fillRadioGroups
         ├→ fillTextFields
         │    ├→ fillPhoneFieldWithMask (special)
         │    └→ fillField → fillMaskedField
         └→ fillSelectDropdowns
              └→ selectDropdownOption
                   └→ convertMonthToName
         ↓
Returns result object
         ↓
popup.js displays success/error
```

## Performance Metrics

| Operation | Time | Notes |
|-----------|------|-------|
| Text field fill | ~50ms | Direct value set |
| Phone field fill | ~2500ms | 150ms × 10 + 1000ms wait |
| Date dropdown | ~20ms | Each dropdown |
| Total autofill | ~3s | Including all waits |

## Event Timing Summary

**Phone Fields:**
1. Focus + focus event
2. 150ms delay between each digit
3. For each digit: keydown → setValue → input → keyup
4. 1000ms wait after last digit
5. change event (NO blur)

**Regular Text Fields:**
1. Direct setValue
2. input + change + blur + focus events

**Dropdowns:**
1. Find option
2. option.selected = true
3. change + blur events

## Critical Code Sections

### Phone Number - The Most Important Function
Located in `fillPhoneFieldWithMask()` around line 1600-1650.

**Why Critical:** This was the hardest problem to solve. If you modify this, test extensively.

**Key Points:**
- Try formatted value first (optimization)
- Fall back to digit-by-digit if rejected
- 150ms delays are intentional
- 1000ms final wait is required
- NO blur event (it causes validation failure)

### Safe Tab Detection
Located in `findTabByText()` around line 460-530.

**Why Critical:** Prevents clicking wrong elements and navigating away from page.

**Key Points:**
- Always check for external links
- Verify role="tab" when possible
- Look at containing elements for context

### Month Name Conversion
Located in `convertMonthToName()` and `selectDropdownOption()`.

**Why Critical:** SimplePractice uses month names, users enter numbers.

**Key Points:**
- Handle both "01" and "1" formats
- Auto-detect month dropdowns
- Fall back to original value if not a month

## Testing Checklist

When modifying code, test:

- [ ] Basic text fields (first name, last name)
- [ ] Email field
- [ ] **Phone number** (most fragile - wait full 3 seconds)
- [ ] Date of birth dropdowns (month conversion)
- [ ] Client type radio buttons
- [ ] Billing type radio buttons
- [ ] Extension works after page reload
- [ ] Extension works on new tab to SimplePractice
- [ ] Popup auto-formats phone as (XXX) XXX-XXXX
- [ ] Console shows no errors

## Common Modification Points

### To add a new field type:
1. Add keywords to `matchFieldToDataType()`
2. Add data property to popup.html form
3. Add data collection in popup.js
4. (Optional) Add special handling in `fillTextFields()` if needed

### To change timing:
1. Phone delays: Modify `fillPhoneFieldWithMask()` delays
2. SPA retry: Modify `autofillFormWithRetry()` parameters
3. Tab/button clicks: Modify waits in `ensureDynamicContactFields()`

### To improve field detection:
1. Add more keywords to `matchFieldToDataType()`
2. Add more metadata sources to `getFieldMetadata()`
3. Enhance `isVisible()` checks if needed

## Debugging Guide

### Enable verbose logging:
All logging is already enabled. Check browser console (F12).

### Key log markers:
- `🔧` = General operation
- `📱` = Phone-specific
- `⌨️` = Character-by-character typing
- `✓` = Success
- `❌` = Failure

### Common issues:
1. **No fields filled** → Check `runPageDiagnostic()` output
2. **Phone partial digits** → Check timing in `fillPhoneFieldWithMask()`
3. **Wrong field matched** → Check keywords in `matchFieldToDataType()`
4. **Dropdowns not filling** → Check `fillSelectDropdowns()` matching logic

## Code Quality Notes

- **Comments:** ~30% of codebase
- **Logging:** Extensive console.log throughout
- **Error handling:** try/catch in critical sections
- **Async/await:** Used consistently for timing control
- **No external dependencies:** Vanilla JavaScript only

## Security Considerations

- **DOM sanitization:** Not needed (we're setting values, not HTML)
- **XSS prevention:** No eval() or innerHTML usage
- **Permissions:** Minimal required permissions only
- **Data storage:** Uses Chrome's secure sync storage
- **Network:** No external API calls

---

Last Updated: February 2026
Version: 1.0.0
