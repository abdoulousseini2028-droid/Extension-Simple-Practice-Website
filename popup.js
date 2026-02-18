// Get references to DOM elements
const actionBtn = document.getElementById('actionBtn');
const statusDiv = document.getElementById('status');

// Add click event listener to button
actionBtn.addEventListener('click', async () => {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send a message to the content script
    chrome.tabs.sendMessage(tab.id, { action: 'buttonClicked' }, (response) => {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
      } else {
        statusDiv.textContent = 'Message sent! Response: ' + (response?.message || 'No response');
      }
    });
  } catch (error) {
    statusDiv.textContent = 'Error: ' + error.message;
  }
});

// Load and display any saved data when popup opens
chrome.storage.sync.get(['lastAction'], (result) => {
  if (result.lastAction) {
    statusDiv.textContent = 'Last action: ' + result.lastAction;
  }
});
