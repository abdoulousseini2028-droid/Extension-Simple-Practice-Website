# Architecture 
Quick reference guide for the codebase structure and key functions.

## File Overview

### manifest.json
Chrome Extension configuration file.

**Key Settings:**
- `manifest_version: 3`
- `permissions: ["activeTab", "storage", "scripting"]`
- `host_permissions: ["*://*.simplepractice.com/*"]`
- `content_scripts[0].run_at: "document_idle"` - Wait for DOM

### popup.html (150 lines)
User interface for data entry.

### popup.js (300 lines)
Handles user input and communication with content script.

**Data Flow:**
1. Collect form data from popup
2. Send to active tab via `chrome.tabs.sendMessage`
3. If connection fails, inject content script and retry
4. Display success/error message

### content.js (666 lines)
Main autofill engine.

## Content.js Function Reference

### Configuration

#### `FIELD_MATCHERS`

- **Benefit:** Add new fields via config, not code edits

```javascript
const FIELD_MATCHERS = [
  {
    type: 'firstName',
    keywords: [['first', 'name'], ['given', 'name']],
    getValue: data => data.firstName
  },
  // Easy to extend...
];
```

### Entry Point & Message Handling

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'autofill') {
    autofillWithRetry(request.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse(error));
  }
  return true; // Keep channel open for async response
});
```

### Core Autofill Functions

#### `autofillWithRetry(data, maxRetries=10, retryDelay=300)`
Retry mechanism for SPA dynamic forms.
- **Returns:** Promise<Object> with success status
- **Retries:** Up to 10 times, 300ms apart

#### `autofill(data, allFields=null)`
Main orchestrator that calls specialized functions.
- **Parameters:** data (form data), allFields (pre-queried DOM elements)
- **Steps:**
  1. Get all visible fields (single DOM query)
  2. Ensure dynamic contact fields
  3. Re-query (dynamic fields may have been added)
  4. Fill radio groups (passed radios array)
  5. Fill text fields (passed inputs array)
  6. Fill select dropdowns (passed selects array)
- **Returns:** Object with fieldsFilledCount

#### `getAllVisibleFields()
`Query DOM once, filter by visibility/enabled
- **Returns:** Object with { inputs, radios, selects }
Called once per autofill cycle, results passed to functions

### Field Detection & Matching

#### `getFieldMetadata(field)`
Collects metadata from sources (name, id, placeholder, aria-label, data-testid, class, etc)
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
- Async
- Waits 600ms between clicks
- Only clicks if email/phone data provided

#### `findTabByText(text)`
Safely finds tab without clicking external links.
- **Priority:**
  1. `role="tab"` elements
  2. Tab-like buttons
  3. Clickable elements (excluding external links)
- **Returns:** Element or null

### Radio Group Handling

#### `fillRadioGroups(radios, data)`
Fills client type and billing type radio buttons.
- **Parameters:** radios (pre-queried array), data (form data)
- **Matches:**
  - Client type: Adult, Minor, Couple
  - Billing type: Self-pay, Insurance
- **Returns:** Count of fields filled

### Text Field Filling

#### `fillTextFields(inputs, data)`
Main async function for text input filling.
- **Parameters:** inputs (pre-queried array), data (form data)
- Async
- Calls `fillPhoneField` for phone fields
- **Returns:** Count of fields filled

#### `matchFieldToDataType(metadata, data)`
Semantic matching.
- Uses FIELD_MATCHERS configuration array
- Iterates through matchers, checks keywords
- **Returns:** Object with { matched, type, value }
- Handles regex patterns and keyword arrays **Example:** Preferredname uses regex `/\bgo\s+by\b/`

### Phone Number Filling (The one I spent most time on)

#### `fillPhoneField(field, value)`
** Custom phone filling logic for Ember masked inputs.**

```javascript
1. Focus field
2. Try setting formatted value directly
3. If rejected, clear and type digit-by-digit
4. Wait 150ms between each digit
5. Wait for value to stabilize (max 500ms)
6. Dispatch change event
7. DO NOT dispatch blur event (causes validation failure)
```

- Wait for `waitForStableValue()` instead of fixed 1000ms

**Returns:** Promise (async)

#### `waitForStableValue(field, maxWait=500, checkInterval=100)`
- Wait until field value stops changing
- Poll every 100ms, return early if stable
- **Returns:** Promise (resolves when stable or max wait reached)

### Regular Field Filling

#### `fillRegularField(field, value)`
Fill non-masked text fields.
- **Events:** input, change, blur, focus
- **Uses:** Native value setter for Ember compatibility

### Select Dropdown Handling

#### `fillSelectDropdowns(selects, data)`
Fills month/day/year dropdowns for DOB.
- **Parameters:** selects (pre-queried array), data (form data)
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
**Bypasses React/Ember synthetic event systems**

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
** Ember components listen for keyboard events**

### 3. Async Sequential Processing
```javascript
// Use for loop, not forEach, to support await
for (let i = 0; i < fields.length; i++) {
  await fillField(fields[i], value);
}
```
** Ensures proper timing and prevents race conditions **

### 4. Configuration-Driven Matching
```javascript
const FIELD_MATCHERS = [
  {
    type: 'firstName',
    keywords: [['first', 'name'], ['given', 'name']],
    getValue: data => data.firstName
  }
];
```
** Extensible without editing function logic, supports regex patterns**

### 5. Single DOM Query Optimization
```javascript
function getAllVisibleFields() {
  // Query once, filter, return all field types
  return { inputs, radios, selects };
}
```
** Eliminates multiple redundant querySelectorAll calls **

## Data Flow Diagram

```
User enters data in popup.html
         ↓
popup.js collects data
         ↓
chrome.tabs.sendMessage → content.js
         ↓
autofillWithRetry (retry mechanism)
         ├→ getAllVisibleFields() [Single DOM query]
         ↓
autofill (orchestrator with pre-queried fields)
         ├→ getAllVisibleFields() [Query once]
         ├→ ensureDynamicContactFields()
         ├→ getAllVisibleFields() [Re-query after dynamic fields added]
         ├→ fillRadioGroups(radios, data)
         ├→ fillTextFields(inputs, data)
         │    ├→ matchFieldToDataType() [Uses FIELD_MATCHERS config]
         │    ├→ fillPhoneField() → waitForStableValue()
         │    └→ fillRegularField()
         └→ fillSelectDropdowns(selects, data)
              └→ selectDropdownOption()
                   └→ convertMonthToName()
         ↓
Returns result object
         ↓
popup.js displays success/error
```

