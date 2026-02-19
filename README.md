# SimplePractice Autofill Extension

A Chrome extension that automatically fills client information forms on SimplePractice.

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the extension folder

<img width="1860" height="1728" alt="image" src="https://github.com/user-attachments/assets/741f7943-55c1-4f3b-9d3f-d4f5c83ba5aa" />

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


## Privacy & Security

- **No data collection:**
- **No external requests:** 
- **Local storage only:** 
- **Domain restricted:** Only activates on SimplePractice domains
- **No tracking or analytics**

## License

This is a personal utility extension. Use at your own discretion.

---

**Note:** This extension is not affiliated with or endorsed by SimplePractice.
