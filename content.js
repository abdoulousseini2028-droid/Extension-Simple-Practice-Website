// Content script - runs in the context of web pages
console.log('Extension SP content script loaded');

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'buttonClicked') {
    console.log('Button was clicked in popup!');
    
    // Perform some action on the page
    const timestamp = new Date().toLocaleTimeString();
    
    // Save the action to storage
    chrome.storage.sync.set({ lastAction: timestamp }, () => {
      console.log('Action timestamp saved:', timestamp);
    });
    
    // Send response back to popup
    sendResponse({ message: 'Content script received the message at ' + timestamp });
    
    // Example: You could modify the page here
    // document.body.style.border = '5px solid red';
  }
  
  return true; // Keep the message channel open for async response
});

// Example: Monitor page interactions
document.addEventListener('click', (event) => {
  console.log('Page clicked at:', event.target);
});
