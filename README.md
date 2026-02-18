# Extension SP

A browser extension built with Manifest V3.

## Features

- Popup interface with interactive button
- Content script that runs on web pages
- Message passing between popup and content script
- Data persistence using Chrome storage API

## Installation

1. Clone this repository
```bash
git clone <repository-url>
```

2. Open Chrome (or any Chromium-based browser)
3. Navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked"
6. Select the extension folder

## Files

- `manifest.json` - Extension configuration and permissions
- `popup.html` - Popup UI interface
- `popup.js` - Popup logic and event handlers
- `content.js` - Content script that runs on web pages
- `README.md` - This file

## Usage

1. Click the extension icon in your browser toolbar
2. Click the "Click Me" button in the popup
3. The extension will send a message to the content script
4. Check the browser console to see logged messages

## Development

To modify the extension:

1. Make your changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on your extension card
4. Test your changes

## License

MIT
