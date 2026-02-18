# SimplePractice Autofill Extension

A Chrome extension that automatically fills client information forms on SimplePractice.

## Features

-  Auto-fills client information in SimplePractice forms
- Handles complex Ember.js components and masked inputs
- Supports client type and billing type selection
- Phone number formatting with automatic masking
- Date of birth support (month/day/year dropdowns)
- Works with dynamically loaded SPA forms
- Automatic retry mechanism for slow-loading forms

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Navigate to any SimplePractice client form (e.g., Create Client page)
2. Click the extension icon in your Chrome toolbar
3. Fill in the client information in the popup:
   - Client Type (Adult/Minor/Couple)
   - Billing Type (Self-pay/Insurance)
   - First Name
   - Last Name
   - Preferred Name (optional)
   - Email
   - Phone Number (automatically formatted)
   - Date of Birth (MM/DD/YYYY)
4. Click "Fill Form"
5. The extension will automatically fill all matching fields

## Supported Fields

- **Client Type:** Adult, Minor, Couple
- **Billing Type:** Self-pay, Insurance
- **Text Fields:** First name, Last name, Preferred name, Email
- **Phone Number:** Automatically formats as (XXX) XXX-XXXX
- **Date of Birth:** Month (name), Day, Year dropdowns

## Technical Details

### Permissions Required
- `activeTab` - Access the current SimplePractice tab
- `storage` - Save form data for reuse
- `scripting` - Inject content scripts when needed)

### Domain Restrictions
Only works on `*.simplepractice.com` domains for security.

## Troubleshooting

### Extension doesn't fill the form
- Make sure you're on a SimplePractice page
- Ensure the form is fully loaded (wait a few seconds after page load)
- Check the browser console for any error messages
- Try clicking "Fill Form" again (the extension has a 10-attempt retry mechanism)

### Phone number shows partial digits
- This is normal behavior during filling
- Wait for the extension to complete (about 3 seconds)
- The phone number fills with delays to work with SimplePractice's input mask

### Form fields aren't detected
- SimplePractice may have updated their form structure
- Check the console logs for diagnostic information
- The extension logs detailed field detection data

## Development

For detailed development documentation, technical challenges, and solutions, see [DEVELOPMENT.md](DEVELOPMENT.md).

### Project Structure
```
extension-sp/
├── manifest.json       # Chrome extension configuration
├── popup.html         # Extension popup interface
├── popup.js           # Popup logic and message passing
├── content.js         # Main autofill engine (~1,760 lines)
├── README.md          # User documentation (this file)
└── DEVELOPMENT.md     # Developer documentation
```

### Key Technologies
- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks)
- Chrome Storage API
- Chrome Tabs & Scripting API
- Native DOM Events
- Ember.js compatibility layer

## Privacy & Security

- **No data collection:** All data stays on your computer
- **No external requests:** Extension only interacts with SimplePractice
- **Local storage only:** Data saved using Chrome's sync storage
- **Domain restricted:** Only activates on SimplePractice domains
- **No tracking or analytics**

## License

This is a personal utility extension. Use at your own discretion.

---

**Note:** This extension is not affiliated with or endorsed by SimplePractice.
