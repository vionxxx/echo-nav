console.log("EchoNav content script loaded successfully!");
console.log("EchoNav: Current URL:", window.location.href);
console.log("EchoNav: Document ready state:", document.readyState);
console.log("EchoNav: Content script version:", "1.0.0");

// Clean up any leftover outline headers from previous sessions
// This prevents the issue where headers remain visible even when plugin is closed
setTimeout(() => {
    // Clean up ALL outline headers, not just temporary ones
    // This ensures a clean slate when page loads
    const staleHeaders = document.querySelectorAll('.echonav-outline-header');
    staleHeaders.forEach(header => {
        if (header.parentNode) {
            header.parentNode.removeChild(header);
        }
    });
    if (staleHeaders.length > 0) {
        console.log(`EchoNav: Cleaned up ${staleHeaders.length} stale outline headers on page load`);
    }
}, 1000); // Wait 1 second for page to stabilize

// Ensure the script is properly loaded
if (typeof chrome !== 'undefined' && chrome.runtime) {
    console.log("EchoNav: Chrome runtime available");
} else {
    console.error("EchoNav: Chrome runtime not available!");
}

// Variables for monitoring AI response completion and VoiceOver interruption
let responseObserver = null;
let lastResponseElement = null;
let activeMonitoringTimers = new Set();
let currentResponseData = null; // Store current response data for user options
let responseOptionsKeyHandler = null; // Store keyboard handler for cleanup

// ===== VOICEOVER OPTIMIZATION FOR CHATGPT RESPONSES =====
// Strategy: Disable ChatGPT's aria-live, announce status, then read key points

console.log("EchoNav: VoiceOver optimization initialized");

// Create ARIA live region for screen reader announcements
let ariaLiveRegion = null;
let ariaLiveRegionPolite = null; // Separate region for longer announcements that shouldn't be interrupted

function createAriaLiveRegion() {
    if (!ariaLiveRegion) {
        ariaLiveRegion = document.createElement('div');
        ariaLiveRegion.id = 'echonav-aria-live';
        ariaLiveRegion.setAttribute('aria-live', 'assertive');
        ariaLiveRegion.setAttribute('aria-atomic', 'true');
        ariaLiveRegion.style.cssText = `
            position: absolute;
            left: -10000px;
            width: 1px;
            height: 1px;
            overflow: hidden;
        `;
        document.body.appendChild(ariaLiveRegion);
        console.log("EchoNav: Created ARIA live region (assertive) for VoiceOver announcements");
    }
    
    // Create a separate polite region for long announcements (keypoints)
    if (!ariaLiveRegionPolite) {
        ariaLiveRegionPolite = document.createElement('div');
        ariaLiveRegionPolite.id = 'echonav-aria-live-polite';
        ariaLiveRegionPolite.setAttribute('aria-live', 'polite');
        ariaLiveRegionPolite.setAttribute('aria-atomic', 'true');
        ariaLiveRegionPolite.style.cssText = `
            position: absolute;
            left: -10000px;
            width: 1px;
            height: 1px;
            overflow: hidden;
        `;
        document.body.appendChild(ariaLiveRegionPolite);
        console.log("EchoNav: Created ARIA live region (polite) for long announcements");
    }
}

function announceToScreenReader(message) {
    createAriaLiveRegion();
    
    console.log("EchoNav: DEBUG - announceToScreenReader called with:", message ? `"${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"` : '(empty)');
    
    if (ariaLiveRegion) {
        // If message is empty, clear immediately without delay
        if (!message || message === '') {
        ariaLiveRegion.textContent = '';
            console.log("EchoNav: ✅ Cleared aria-live region");
            return;
        }
        
        // For non-empty messages, update directly without clearing first
        // This prevents interrupting ongoing VoiceOver announcements
            ariaLiveRegion.textContent = message;
        console.log("EchoNav: ✅ Set aria-live region text to:", message ? `"${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"` : '(empty)');
    } else {
        console.error("EchoNav: ERROR - aria-live region not found!");
    }
}

// Avoid redeclaration when content script is injected multiple times
// Use window-scoped variable and allow safe re-execution
var treeUIIframe = window.treeUIIframe || null;
window.treeUIIframe = treeUIIframe;

// Function to clear all DOM markers for fresh extraction during regeneration
function clearAllDOMMarkers() {
    console.log("EchoNav: Starting to clear all DOM markers");
    
    // Clear all data-echonav-id markers from message elements
    const elementsWithId = document.querySelectorAll('[data-echonav-id]');
    console.log(`EchoNav: Found ${elementsWithId.length} elements with data-echonav-id`);
    elementsWithId.forEach(el => {
        el.removeAttribute('data-echonav-id');
    });
    
    // Clear all heading markers
    const elementsWithHeadingId = document.querySelectorAll('[data-echonav-heading-id]');
    console.log(`EchoNav: Found ${elementsWithHeadingId.length} elements with data-echonav-heading-id`);
    elementsWithHeadingId.forEach(el => {
        el.removeAttribute('data-echonav-heading-id');
    });
    
    // Clear all paragraph markers
    const elementsWithParagraphId = document.querySelectorAll('[data-echonav-paragraph-id]');
    console.log(`EchoNav: Found ${elementsWithParagraphId.length} elements with data-echonav-paragraph-id`);
    elementsWithParagraphId.forEach(el => {
        el.removeAttribute('data-echonav-paragraph-id');
    });
    
    // Clear all monitored markers from response monitoring
    const elementsWithMonitored = document.querySelectorAll('[data-echonav-monitored]');
    console.log(`EchoNav: Found ${elementsWithMonitored.length} elements with data-echonav-monitored`);
    elementsWithMonitored.forEach(el => {
        el.removeAttribute('data-echonav-monitored');
    });
    
    console.log("EchoNav: ✅ All DOM markers cleared for fresh extraction");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("EchoNav received message:", request.action);
    
    if (request.action === "toggleUI") {
        toggleEchoNavUI();
        sendResponse({ success: true });
    } else if (request.action === "ping") {
        console.log("EchoNav: Pong! Content script is ready");
        sendResponse({ status: "ready", url: window.location.href });
    } else if (request.action === "clearDOMMarkers") {
        console.log("EchoNav: Clearing all DOM markers for fresh extraction");
        clearAllDOMMarkers();
        sendResponse({ success: true });
    } else if (request.action === "extractText") {
      console.log("EchoNav extracting conversation...");
      const conversation = extractConversation();
      console.log("EchoNav extracted conversation:", conversation);
      sendResponse({ data: conversation });
        } else if (request.action === "scrollToText") {
            console.log("EchoNav scrolling to text:", request.text);
            const isAccessibilityMode = request.accessibilityMode === true;
            const found = findAndScroll(request.text, isAccessibilityMode);
            sendResponse({ success: found });
        } else if (request.action === "scrollToSpecificContent") {
            console.log("EchoNav scrolling to specific content:", request);
            const found = findAndScrollToSpecificContent(request);
            sendResponse({ success: found });
        } else if (request.action === "scrollToHeading") {
            console.log("EchoNav scrolling to heading:", request.headingId, "with text:", request.headingText);
            try {
                let headingElement = findHeadingElement(request.headingId, request.headingText);
                
                if (headingElement) {
                    const isAccessibilityMode = request.accessibilityMode === true;
                    
                    headingElement.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest' 
                    });
                    console.log(`EchoNav: ✅ Scrolled to heading: ${headingElement.textContent}`);
                    
                    // Handle accessibility mode
                    if (isAccessibilityMode) {
                        // Make heading focusable and focus it for VoiceOver
                        headingElement.setAttribute('tabindex', '-1');
                        
                        // Announce navigation
                        announceToScreenReader(`Navigated to heading: ${headingElement.textContent}`);
                        
                        // Focus after scroll completes
                        setTimeout(() => {
                            headingElement.focus();
                            console.log("EchoNav: Focused heading for VoiceOver navigation");
                            
                            // Additional announcement after focus
                            setTimeout(() => {
                                announceToScreenReader("Focus moved to heading. Use VoiceOver to read content.");
                            }, 200);
                        }, 600);
                        
                        // Add ARIA attributes for better screen reader support
                        if (!headingElement.hasAttribute('role')) {
                            headingElement.setAttribute('role', 'heading');
                        }
                    }
                    
                    // Add a flag to prevent other scrolling for a short time
                    window.echoNavScrolling = true;
                    setTimeout(() => {
                        window.echoNavScrolling = false;
                    }, 2000); // 2 second protection window
                    
                    sendResponse({ success: true });
                } else {
                    console.error(`EchoNav: ❌ Heading with ID ${request.headingId} not found anywhere`);
                    sendResponse({ success: false, error: 'Heading not found' });
                }
            } catch (error) {
                console.error('EchoNav: Error scrolling to heading:', error);
                sendResponse({ success: false, error: error.message });
            }
        } else if (request.action === "scrollToParagraph") {
            console.log("EchoNav scrolling to paragraph:", request.paragraphId, "with text:", request.paragraphText);
            try {
                let paragraphElement = findParagraphElement(request.paragraphId, request.paragraphText);
                
                if (paragraphElement) {
                    const isAccessibilityMode = request.accessibilityMode === true;
                    
                    paragraphElement.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
                    console.log(`EchoNav: ✅ Scrolled to paragraph: ${paragraphElement.textContent.substring(0, 50)}...`);
                    
                    // Handle accessibility mode
                    if (isAccessibilityMode) {
                        // Make paragraph focusable and focus it for VoiceOver
                        paragraphElement.setAttribute('tabindex', '-1');
                        
                        // Announce navigation
                        const paragraphPreview = paragraphElement.textContent.substring(0, 100);
                        announceToScreenReader(`Navigated to paragraph: ${paragraphPreview}${paragraphElement.textContent.length > 100 ? '...' : ''}`);
                        
                        // Focus after scroll completes
                        setTimeout(() => {
                            paragraphElement.focus();
                            console.log("EchoNav: Focused paragraph for VoiceOver navigation");
                            
                            // Additional announcement after focus
                            setTimeout(() => {
                                announceToScreenReader("Focus moved to paragraph. Use VoiceOver to read content.");
                            }, 200);
                        }, 600);
                        
                        // Add ARIA attributes for better screen reader support
                        if (!paragraphElement.hasAttribute('role')) {
                            paragraphElement.setAttribute('role', 'region');
                        }
                    }
                    
                    // Prevent interference
                    window.echoNavScrolling = true;
                    setTimeout(() => { window.echoNavScrolling = false; }, 2000);
                    
                    sendResponse({ success: true });
                } else {
                    console.error(`EchoNav: ❌ Paragraph with ID ${request.paragraphId} not found anywhere`);
                    sendResponse({ success: false, error: 'Paragraph not found' });
                }
            } catch (error) {
                console.error('EchoNav: Error scrolling to paragraph:', error);
                sendResponse({ success: false, error: error.message });
            }
        } else if (request.action === "toggleOutlineView") {
            console.log("EchoNav toggling outline view mode:", request.mode);
            if (request.mode === 'enter') {
                enterOutlineView(request.outlineItems);
            } else if (request.mode === 'exit') {
                exitOutlineView();
            }
            sendResponse({ success: true });
        } else if (request.action === "enterFullscreenWithFloatingButton") {
            enterFullscreenWithFloatingButton(request.outlineItems);
            sendResponse({ success: true });
        } else if (request.action === "autoEnableOutlineView") {
            // Auto-enable outline view when Timeline has content (without hiding side panel)
            console.log("EchoNav auto-enabling outline view with", request.outlineItems?.length, "items");
            if (request.outlineItems && request.outlineItems.length > 0) {
                enterOutlineView(request.outlineItems);
            }
            sendResponse({ success: true });
        } else if (request.action === "urlChanged") {
            if (treeUIIframe && treeUIIframe.contentWindow) {
                // Relay the message to the iframe so it can update its content
                treeUIIframe.contentWindow.postMessage({ action: "urlChanged", url: request.url }, '*');
            }
        } else if (request.action === "voiceOverOptimizationChanged") {
            console.log("EchoNav: VoiceOver optimization changed to:", request.enabled);
            if (request.enabled) {
                startResponseMonitoring();
            } else {
                stopResponseMonitoring();
            }
        } else if (request.action === "readFullAnswer") {
            // Handle VO+Y shortcut command
            console.log("EchoNav: Received readFullAnswer command from background");
            readFullAnswerArticle();
            sendResponse({ success: true });
        } else if (request.action === "updateOutlineHeaderTitle") {
            // Update temporary outline header with the newly generated title
            console.log(`EchoNav: Received title update for message ${request.messageIndex}: "${request.title}"`);
            updateOutlineHeaderTitle(request.messageIndex, request.title, request.item);
            sendResponse({ success: true });
        } else if (request.action === "updateOutlineHeaderKeypoints") {
            // NEW: Update outline header with newly generated keypoints
            console.log(`EchoNav: Received keypoints update for message ${request.messageIndex}`);
            updateOutlineHeaderKeypoints(request.messageIndex, request.keyPoints);
            sendResponse({ success: true });
        } else if (request.action === "timelineKeypointGenerated") {
            // NEW: Handle keypoint generation from background.js (direct listener)
            console.log(`EchoNav: Received timeline keypoint generation for turn ${request.turnIndex}`);
            
            // Verify this update is for the current conversation
            const currentUrl = window.location.href;
            const currentConversationId = currentUrl.match(/\/c\/([a-f0-9-]+)/)?.[1];
            
            if (currentConversationId === request.conversationId) {
                console.log("EchoNav: Keypoint update is for current conversation, updating outline header");
                updateOutlineHeaderKeypoints(request.messageIndex, request.keyPoints);
                sendResponse({ success: true });
            } else {
                console.log(`EchoNav: Keypoint update is for different conversation (${request.conversationId}), ignoring`);
                sendResponse({ success: false, reason: "different_conversation" });
            }
        } else if (request.action === "toggleKeypointsDisplay") {
            // Toggle visibility of keypoints in conversation page
            console.log("EchoNav: Toggling keypoints display to:", request.showKeypoints);
            toggleKeypointsDisplay(request.showKeypoints);
            sendResponse({ success: true });
        }
    return true; // Keep the message channel open for async response
  });
  
  // Function to toggle keypoints display in the conversation page
  function toggleKeypointsDisplay(showKeypoints) {
    // Set CSS variable for future keypoints
    document.documentElement.style.setProperty('--echonav-keypoints-display', showKeypoints ? '' : 'none');
    
    // Update existing keypoints
    const keypointElements = document.querySelectorAll('.echonav-outline-keypoints');
    console.log(`EchoNav: Found ${keypointElements.length} keypoint elements to toggle`);
    
    keypointElements.forEach(element => {
        if (showKeypoints) {
            element.style.display = '';
        } else {
            element.style.display = 'none';
        }
    });
    
    console.log(`EchoNav: Keypoints display ${showKeypoints ? 'enabled' : 'disabled'}`);
  }
  
  // Initialize keypoints display state on page load
  chrome.storage.local.get(['showKeypointsEnabled'], (result) => {
    const showKeypoints = result.showKeypointsEnabled !== false; // Default to true
    if (!showKeypoints) {
        console.log("EchoNav: Initializing with keypoints hidden");
        // Set CSS variable to hide keypoints globally
        document.documentElement.style.setProperty('--echonav-keypoints-display', 'none');
        // Also hide any existing keypoints
        setTimeout(() => {
            toggleKeypointsDisplay(false);
        }, 1000);
    } else {
        document.documentElement.style.setProperty('--echonav-keypoints-display', '');
    }
  });

  // Function to update outline header title when the real title is generated
  function updateOutlineHeaderTitle(messageIndex, newTitle, fullItem) {
    try {
        console.log(`EchoNav: Updating outline header title for message ${messageIndex}`);
        
        // Find the temporary outline header with this message index
        const tempHeaders = document.querySelectorAll('[data-echonav-temp-header="true"]');
        let targetHeader = null;
        
        for (const header of tempHeaders) {
            if (header.getAttribute('data-echonav-message-index') === messageIndex.toString()) {
                targetHeader = header;
                break;
            }
        }
        
        if (!targetHeader) {
            console.warn(`EchoNav: Could not find temporary outline header for message ${messageIndex}`);
            return;
        }
        
        console.log(`EchoNav: Found outline header to update:`, targetHeader);
        
        // Find the title element within the header and update it
        const titleElement = targetHeader.querySelector('.echonav-outline-title');
        if (titleElement) {
            const oldTitle = titleElement.textContent;
            titleElement.textContent = newTitle;
            console.log(`EchoNav: ✅ Updated title from "${oldTitle}" to "${newTitle}"`);
        } else {
            console.warn("EchoNav: Could not find title element within outline header");
        }
        
        // Remove the temporary flag since it now has the real title
        targetHeader.removeAttribute('data-echonav-temp-header');
        console.log("EchoNav: Removed temporary flag from outline header");
        
    } catch (error) {
        console.error("EchoNav: Error updating outline header title:", error);
    }
  }

  // NEW: Function to update outline header keypoints when they are generated
  function updateOutlineHeaderKeypoints(messageIndex, keyPoints) {
    try {
        console.log(`EchoNav: Updating outline header keypoints for message ${messageIndex}`);
        
        // Find all outline headers (both temporary and permanent)
        const allHeaders = document.querySelectorAll('.echonav-outline-header');
        let targetHeader = null;
        
        // Try to find by message index attribute
        for (const header of allHeaders) {
            if (header.getAttribute('data-echonav-message-index') === messageIndex.toString()) {
                targetHeader = header;
                break;
            }
        }
        
        if (!targetHeader) {
            console.warn(`EchoNav: Could not find outline header for message ${messageIndex}`);
            return;
        }
        
        console.log(`EchoNav: Found outline header to update keypoints:`, targetHeader);
        
        // Check if keypoints container already exists
        let keypointsContainer = targetHeader.querySelector('.echonav-outline-keypoints');
        
        if (!keypointsContainer) {
            // Create new keypoints container if it doesn't exist
            console.log("EchoNav: Creating new keypoints container");
            keypointsContainer = document.createElement('div');
            keypointsContainer.className = 'echonav-outline-keypoints';
            keypointsContainer.setAttribute('role', 'list');
            keypointsContainer.setAttribute('aria-label', 'Key points summary');
            
            // Insert after the header-top section
            const headerTop = targetHeader.querySelector('.echonav-outline-header-top');
            if (headerTop && headerTop.nextSibling) {
                targetHeader.insertBefore(keypointsContainer, headerTop.nextSibling);
            } else {
                targetHeader.appendChild(keypointsContainer);
            }
        }
        
        // Generate keypoints HTML
        const keypointsHtml = keyPoints.map(kp => 
            `<div class="echonav-keypoint" role="listitem">
              <span class="echonav-keypoint-icon">▸</span>
              <span>${kp}</span>
            </div>`
        ).join('');
        
        // Update the container with new keypoints
        keypointsContainer.innerHTML = keypointsHtml;
        
        // Apply the current keypoints display setting
        chrome.storage.local.get(['showKeypointsEnabled'], (result) => {
            const showKeypoints = result.showKeypointsEnabled !== false;
            if (!showKeypoints) {
                keypointsContainer.style.display = 'none';
            }
        });
        
        console.log(`EchoNav: ✅ Updated keypoints for outline header (${keyPoints.length} points)`);
        
    } catch (error) {
        console.error("EchoNav: Error updating outline header keypoints:", error);
    }
  }

  // Helper function to clean text for matching: remove emojis and standardize numbering
  function cleanTextForMatching(text) {
    if (!text) return '';
    
    // Step 1: Remove all emojis (comprehensive Unicode emoji ranges)
    let cleaned = text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu, '');
    
    // Step 2: Standardize numbering formats to "1. 2. 3." format
    // Pattern: (1) or （1） -> 1.
    cleaned = cleaned.replace(/[（(]\s*(\d+)\s*[）)]/g, '$1.');
    
    // Pattern: Roman numerals (I, II, III, IV, etc.) at start -> convert to Arabic
    const romanToArabic = { 'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5', 
                           'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10' };
    cleaned = cleaned.replace(/^([IVX]+)\.\s*/i, (match, roman) => {
      const arabic = romanToArabic[roman.toUpperCase()];
      return arabic ? arabic + '. ' : match;
    });
    
    // Pattern: Circled numbers ① ② ③ -> 1. 2. 3.
    cleaned = cleaned.replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, (match) => {
      const circledNumbers = '①②③④⑤⑥⑦⑧⑨⑩';
      const index = circledNumbers.indexOf(match);
      return index >= 0 ? (index + 1) + '. ' : match;
    });
    
    // Pattern: Chinese numbers 一、二、三、 -> 1. 2. 3.
    const chineseToArabic = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
                             '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };
    cleaned = cleaned.replace(/^([一二三四五六七八九十])、/g, (match, chinese) => {
      const arabic = chineseToArabic[chinese];
      return arabic ? arabic + '. ' : match;
    });
    
    // Step 3: Normalize multiple spaces and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  // Helper function to find heading element with robust fallback strategies
  function findHeadingElement(headingId, headingText) {
    console.log(`EchoNav: Looking for heading with ID: ${headingId}, text: "${headingText}"`);
    
    // Strategy 1: Try to find by our custom attribute
    let headingElement = document.querySelector(`[data-echonav-heading-id="${headingId}"]`);
    if (headingElement) {
        console.log(`EchoNav: ✅ Found heading by attribute: ${headingElement.textContent}`);
        return headingElement;
    }
    
    // Strategy 2: Find by text content and re-mark with ID
    if (headingText) {
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        console.log(`EchoNav: Searching among ${allHeadings.length} headings for text match`);
        
        // Clean the target text (remove emojis and standardize numbering)
        const cleanTargetText = cleanTextForMatching(headingText);
        
        for (let i = 0; i < allHeadings.length; i++) {
            const heading = allHeadings[i];
            // Also clean the heading text from DOM for proper comparison
            const headingTextClean = cleanTextForMatching(heading.textContent);
            
            console.log(`EchoNav: Comparing "${cleanTargetText}" with "${headingTextClean}"`);
            
            // Try exact match first
            if (headingTextClean === cleanTargetText) {
                console.log(`EchoNav: ✅ Found exact text match: ${headingTextClean}`);
                // Re-add the missing attribute
                heading.setAttribute('data-echonav-heading-id', headingId);
                return heading;
            }
            
            // Try partial match (in case of truncation)
            if (headingTextClean.includes(cleanTargetText) || cleanTargetText.includes(headingTextClean)) {
                console.log(`EchoNav: ✅ Found partial text match: ${headingTextClean}`);
                // Re-add the missing attribute
                heading.setAttribute('data-echonav-heading-id', headingId);
                return heading;
            }
        }
    }
    
    // Strategy 3: Debug current state
    console.warn(`EchoNav: ❌ Could not find heading. Debug info:`);
    const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    console.log(`EchoNav: Total headings in DOM: ${allHeadings.length}`);
    allHeadings.forEach((h, i) => {
        const hasAttr = h.hasAttribute('data-echonav-heading-id');
        const attrValue = h.getAttribute('data-echonav-heading-id');
        console.log(`EchoNav: Heading ${i+1}: ${h.tagName} - "${h.textContent.substring(0, 50)}..." - Has attr: ${hasAttr} - Attr: ${attrValue}`);
    });
    
    return null;
  }

  // Helper function to find paragraph element with robust fallback strategies (similar to findHeadingElement)
  function findParagraphElement(paragraphId, paragraphText) {
    console.log(`EchoNav: Looking for paragraph with ID: ${paragraphId}, text: "${paragraphText ? paragraphText.substring(0, 50) : 'N/A'}..."`);
    
    // Strategy 1: Try to find by our custom attribute
    let paragraphElement = document.querySelector(`[data-echonav-paragraph-id="${paragraphId}"]`);
    if (paragraphElement) {
        console.log(`EchoNav: ✅ Found paragraph by attribute: ${paragraphElement.textContent.substring(0, 50)}...`);
        return paragraphElement;
    }
    
    // Strategy 2: Find by text content and re-mark with ID
    if (paragraphText) {
        const allParagraphs = document.querySelectorAll('p');
        console.log(`EchoNav: Searching among ${allParagraphs.length} paragraphs for text match`);
        
        const cleanTargetText = paragraphText.trim();
        
        for (let i = 0; i < allParagraphs.length; i++) {
            const paragraph = allParagraphs[i];
            const paragraphTextClean = paragraph.textContent.trim();
            
            console.log(`EchoNav: Comparing paragraph ${i+1}: "${paragraphTextClean.substring(0, 50)}..."`);
            
            // Try exact match first
            if (paragraphTextClean === cleanTargetText) {
                console.log(`EchoNav: ✅ Found exact text match for paragraph`);
                // Re-add the missing attribute
                paragraph.setAttribute('data-echonav-paragraph-id', paragraphId);
                return paragraph;
            }
            
            // Try partial match (paragraph text contains target or vice versa)
            if (paragraphTextClean.includes(cleanTargetText.substring(0, 100)) || 
                cleanTargetText.includes(paragraphTextClean.substring(0, 100))) {
                console.log(`EchoNav: ✅ Found partial text match for paragraph`);
                // Re-add the missing attribute
                paragraph.setAttribute('data-echonav-paragraph-id', paragraphId);
                return paragraph;
            }
        }
    }
    
    // Strategy 3: Debug current state
    console.warn(`EchoNav: ❌ Could not find paragraph. Debug info:`);
    const allParagraphs = document.querySelectorAll('p');
    console.log(`EchoNav: Total paragraphs in DOM: ${allParagraphs.length}`);
    allParagraphs.forEach((p, i) => {
        const hasAttr = p.hasAttribute('data-echonav-paragraph-id');
        const attrValue = p.getAttribute('data-echonav-paragraph-id');
        console.log(`EchoNav: Paragraph ${i+1}: "${p.textContent.substring(0, 50)}..." - Has attr: ${hasAttr} - Attr: ${attrValue}`);
    });
    
    return null;
  }

      // Helper function to find message elements using multiple selectors
      function findMessageElements() {
        const selectors = [
            'div[data-message-author-role]',
            '[data-testid*="conversation-turn"]',
            '.group\\/conversation-turn',
            '[data-testid*="turn"]',
            '[class*="message"], [class*="turn"], [class*="conversation"]'
        ];
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) return elements;
        }
        
        return [];
      }

      function extractConversation() {
        const conversationTurns = [];
        const messageElements = findMessageElements();
        
        let currentTurn = { user: null, assistant: null };

        messageElements.forEach((element, index) => {
            console.log(`EchoNav: Processing element ${index}:`, element);
            
            const role = element.getAttribute('data-message-author-role');
            console.log(`EchoNav: Element ${index} role:`, role);
            
            let contentElement = element.querySelector('.prose, .markdown, div[dir="auto"]');
            if (!contentElement) {
                contentElement = element.querySelector('[class*="prose"], [class*="markdown"]');
            }
            if (!contentElement) {
                contentElement = element.querySelector('div');
            }
            
            console.log(`EchoNav: Element ${index} content element:`, contentElement);
            
            if (role && contentElement) {
                const content = (contentElement.innerText || contentElement.textContent);
                console.log(`EchoNav: Element ${index} content (first 100 chars):`, content.substring(0, 100));
                
                // Extract DOM path and create unique identifier
                const domPath = getElementPath(contentElement);
                const uniqueId = `echonav-${Date.now()}-${index}`;
                
                // Add unique ID to the element for future reference
                contentElement.setAttribute('data-echonav-id', uniqueId);
                
                if (role === 'user') {
                    // If we have a complete previous turn, push it
                    if (currentTurn.user && currentTurn.assistant) {
                        conversationTurns.push(currentTurn);
                        console.log("EchoNav: Pushed complete turn:", currentTurn);
                    }
                    // Start a new turn
                    currentTurn = { 
                        user: content, 
                        assistant: null,
                        userDomPath: domPath,
                        userUniqueId: uniqueId
                    };
                    console.log("EchoNav: Started new user turn");
                } else if (role === 'assistant' && currentTurn.user) {
                    // Analyze the assistant response structure
                    const responseStructure = analyzeAssistantResponseStructure(contentElement);
                    
                    currentTurn.assistant = content;
                    currentTurn.assistantDomPath = domPath;
                    currentTurn.assistantUniqueId = uniqueId;
                    currentTurn.responseStructure = responseStructure;
                    conversationTurns.push(currentTurn);
                    console.log("EchoNav: Completed turn:", currentTurn);
                    // Reset for the next turn
                    currentTurn = { user: null, assistant: null };
                }
            } else {
                console.log(`EchoNav: Element ${index} - no role or content found`);
            }
        });

        // Add the last turn if it's still pending
        if (currentTurn.user && currentTurn.assistant) {
            conversationTurns.push(currentTurn);
            console.log("EchoNav: Pushed final turn:", currentTurn);
        }
        
        console.log(`EchoNav: Successfully extracted ${conversationTurns.length} conversation turns`);
        console.log("EchoNav: All conversation turns:", conversationTurns);
        return conversationTurns;
      }

      // Helper function to calculate word count for English text
      function calculateWordCount(text) {
        if (!text || text.trim().length === 0) return 0;
        
        // Remove extra whitespace and count space-separated words
        const cleanText = text.trim();
        return cleanText.split(/\s+/).filter(word => word.length > 0).length;
      }

      // Function to analyze assistant response structure for accessibility navigation
      function analyzeAssistantResponseStructure(contentElement) {
        console.log("EchoNav: 🔍 ANALYZING ASSISTANT RESPONSE STRUCTURE");
        console.log("EchoNav: Content element:", contentElement);
        
        // Check for headings (h1, h2, h3, h4, h5, h6) only
        const headings = contentElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
        
        console.log(`EchoNav: Found ${headings.length} headings`);
        
        // IMPORTANT: Only treat as structured if there are 2+ headings
        // A single heading is likely just a title and should be treated as plain text
        if (headings.length >= 2) {
            console.log(`EchoNav: ✅ CASE A - STRUCTURED RESPONSE: Found ${headings.length} headings (≥2)`);
            console.log("EchoNav: Heading tags found:", Array.from(headings).map(h => h.tagName));
            
            // Extract heading structure from headings only
            const headingStructure = [];
            
            // Process actual headings
            Array.from(headings).forEach((heading, index) => {
                const level = parseInt(heading.tagName.substring(1)); // Extract number from h1, h2, etc.
                const text = heading.innerText || heading.textContent || '';
                const uniqueId = `heading-${Date.now()}-${index}`;
                
                // Add unique ID to the heading element for future navigation
                heading.setAttribute('data-echonav-heading-id', uniqueId);
                
                console.log(`EchoNav: Extracted heading ${index + 1}: ${heading.tagName} - "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
                
                headingStructure.push({
                    level: level,
                    text: text.trim(),
                    tagName: heading.tagName.toLowerCase(),
                    uniqueId: uniqueId,
                    element: heading,
                    type: 'heading'
                });
            });
            
            // Normalize heading levels (map to our hierarchy levels starting from 1)
            const minLevel = Math.min(...headingStructure.map(h => h.level));
            const normalizedStructure = headingStructure.map(h => ({
                ...h,
                normalizedLevel: h.level - minLevel + 1 // Start from level 1
            }));
            
            console.log(`EchoNav: Normalized heading levels (starting from ${minLevel}):`, 
                normalizedStructure.map(h => `${h.tagName} -> Level ${h.normalizedLevel}`));
            
            const totalWords = calculateWordCount(contentElement.innerText || contentElement.textContent || '');
            console.log(`EchoNav: Total words in structured response: ${totalWords}`);
            
            return {
                type: 'structured',
                hasHeadings: true,
                headings: normalizedStructure,
                paragraphCount: 0,
                totalWordCount: totalWords
            };
        } else {
            // No headings found OR only 1 heading (treated as plain text), analyze paragraph structure
            if (headings.length === 1) {
                console.log("EchoNav: ⚠️ CASE B - PLAIN TEXT RESPONSE: Only 1 heading found (treating as plain text title), analyzing paragraphs");
            } else {
                console.log("EchoNav: ⚠️ CASE B - PLAIN TEXT RESPONSE: No headings found, analyzing paragraphs");
            }
            
            const paragraphs = contentElement.querySelectorAll('p');
            const paragraphContent = [];
            
            if (paragraphs.length > 0) {
                console.log(`EchoNav: Found ${paragraphs.length} <p> tags in DOM`);
                paragraphs.forEach((p, index) => {
                    const text = p.innerText || p.textContent || '';
                    if (text.trim().length > 0) {
                        const uniqueId = `paragraph-${Date.now()}-${index}`;
                        p.setAttribute('data-echonav-paragraph-id', uniqueId);
                        
                        // Better word count calculation for both Chinese and English text
                        const wordCount = calculateWordCount(text.trim());
                        console.log(`EchoNav: Paragraph ${index + 1}: ${wordCount} words - "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
                        
                        paragraphContent.push({
                            text: text.trim(),
                            wordCount: wordCount,
                            uniqueId: uniqueId,
                            element: p
                        });
                    }
                });
            } else {
                // Fallback: split by double line breaks if no <p> tags
                console.log("EchoNav: No <p> tags found, using text-based paragraph splitting");
                const fullText = contentElement.innerText || contentElement.textContent || '';
                const textParagraphs = fullText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
                
                console.log(`EchoNav: Split text into ${textParagraphs.length} text-based paragraphs`);
                textParagraphs.forEach((text, index) => {
                    const wordCount = calculateWordCount(text.trim());
                    console.log(`EchoNav: Text paragraph ${index + 1}: ${wordCount} words - "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
                    
                    paragraphContent.push({
                        text: text.trim(),
                        wordCount: wordCount,
                        uniqueId: `text-paragraph-${Date.now()}-${index}`,
                        element: null // No specific DOM element
                    });
                });
            }
            
            const totalWords = paragraphContent.reduce((sum, p) => sum + p.wordCount, 0);
            
            console.log(`EchoNav: 📊 PARAGRAPH ANALYSIS COMPLETE:`);
            console.log(`EchoNav: - Total paragraphs: ${paragraphContent.length}`);
            console.log(`EchoNav: - Total words: ${totalWords}`);
            console.log(`EchoNav: - Average words per paragraph: ${Math.round(totalWords / paragraphContent.length)}`);
            
            // Determine if this needs theme grouping
            if (paragraphContent.length > 3 && totalWords > 200) {
                console.log(`EchoNav: 🎯 This response qualifies for THEME GROUPING (${paragraphContent.length} paragraphs, ${totalWords} words)`);
            } else {
                console.log(`EchoNav: 📝 This response will use SIMPLE PARAGRAPH structure (${paragraphContent.length} paragraphs, ${totalWords} words)`);
            }
            
            return {
                type: 'plain_text',
                hasHeadings: false,
                paragraphs: paragraphContent,
                paragraphCount: paragraphContent.length,
                totalWordCount: totalWords
            };
        }
      }

      // Helper function to get DOM path for an element
      function getElementPath(element) {
        const path = [];
        let current = element;
        
        while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            
            if (current.id) {
                selector += `#${current.id}`;
            } else if (current.className) {
                const classes = current.className.split(' ').filter(c => c.trim()).slice(0, 2); // Limit to first 2 classes
                if (classes.length > 0) {
                    selector += `.${classes.join('.')}`;
                }
            }
            
            // Add nth-child if there are siblings with same tag
            const siblings = Array.from(current.parentNode?.children || []).filter(s => s.tagName === current.tagName);
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-child(${index})`;
            }
            
            path.unshift(selector);
            current = current.parentElement;
        }
        
        return path.join(' > ');
      }

      // Enhanced function to scroll to specific content (bullet point level)
      function findAndScrollToSpecificContent(request) {
        const { originalText, matchedSentence, assistantUniqueId } = request;
        const messageElements = findMessageElements();
        
        // First, try to find the assistant message by unique ID
        if (assistantUniqueId) {
            const assistantElement = document.querySelector(`[data-echonav-id="${assistantUniqueId}"]`);
            if (assistantElement) {
                console.log("EchoNav: Found assistant element by unique ID");
                
                // If we have a matched sentence, try to find it within this element
                if (matchedSentence) {
                    const sentences = assistantElement.innerText.split(/[.!?]+/).map(s => s.trim());
                    const matchingSentence = sentences.find(s => 
                        s.toLowerCase().includes(matchedSentence.toLowerCase().substring(0, 20))
                    );
                    
                    if (matchingSentence) {
                        console.log("EchoNav: Found matching sentence within assistant element");
                        assistantElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // Highlight the element
                        assistantElement.style.transition = 'background-color 0.5s ease';
                        assistantElement.style.backgroundColor = 'rgba(255, 255, 0, 0.4)';
                        setTimeout(() => {
                            assistantElement.style.backgroundColor = '';
                        }, 3000);
                        
                        return true;
                    }
                }
                
                // Fallback: scroll to the assistant element
                assistantElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                assistantElement.style.transition = 'background-color 0.5s ease';
                assistantElement.style.backgroundColor = 'rgba(255, 255, 0, 0.4)';
                setTimeout(() => {
                    assistantElement.style.backgroundColor = '';
                }, 3000);
                
                return true;
            }
        }
        
        // Fallback: use the original text matching approach
        for (let i = 0; i < messageElements.length; i++) {
            const element = messageElements[i];
            const role = element.getAttribute('data-message-author-role');
            
            if (role === 'user') {
                let contentElement = element.querySelector('.prose, .markdown, div[dir="auto"]');
                if (!contentElement) {
                    contentElement = element.querySelector('[class*="prose"], [class*="markdown"]');
                }
                if (!contentElement) {
                    contentElement = element.querySelector('div');
                }
                
                if (contentElement) {
                    const content = contentElement.innerText || contentElement.textContent;
                    
                    if (content.trim() === originalText.trim()) {
                        console.log(`EchoNav: Found exact match in user message ${i}`);
                        
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.style.transition = 'background-color 0.5s ease';
                        element.style.backgroundColor = 'rgba(255, 255, 0, 0.4)';
                        setTimeout(() => {
                            element.style.backgroundColor = '';
                        }, 3000);
                        
                        return true;
                    }
                }
            }
        }
        
        console.warn("EchoNav: No specific content match found");
        return false;
      }

  // Helper function to perform scroll and focus operations
  function performScrollAndFocus(element, content, isAccessibilityMode, matchType) {
    console.log(`EchoNav: Performing scroll and focus (${matchType} match)`);
    
    // Scroll to the element
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // For accessibility mode: make element focusable and focus it for VoiceOver
    if (isAccessibilityMode) {
        // Make element focusable for screen readers
        element.setAttribute('tabindex', '-1');
        
        // Add ARIA live region announcement
        announceToScreenReader(`Navigated to content: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
        
        // Focus the element after scroll completes (small delay for smooth scroll)
        setTimeout(() => {
            element.focus();
            console.log("EchoNav: Focused element for VoiceOver navigation");
            
            // Additional announcement after focus
            setTimeout(() => {
                announceToScreenReader("Focus moved to content. Use VoiceOver to read.");
            }, 200);
        }, 600);
        
        // Add descriptive aria-label based on match type
        const matchTypeDesc = matchType === 'exact' ? 'Exact match' : 
                            matchType === 'partial' ? 'Partial match' : 'Related content';
        element.setAttribute('aria-label', `${matchTypeDesc}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
        
        // Add role for better screen reader recognition
        if (!element.hasAttribute('role')) {
            element.setAttribute('role', 'region');
        }
    }
    
    // Highlight the element briefly
    element.style.transition = 'background-color 0.5s ease';
    element.style.backgroundColor = 'rgba(255, 255, 0, 0.4)';
    setTimeout(() => {
        element.style.backgroundColor = '';
    }, 2000);
    
    // Return detailed success info for better feedback
    return {
        success: true,
        matchType: matchType,
        contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        focusApplied: isAccessibilityMode
    };
  }

  function findAndScroll(text, isAccessibilityMode = false) {
    const messageElements = findMessageElements();
    
    // Look for exact match in all messages (user and assistant)
    for (let i = 0; i < messageElements.length; i++) {
        const element = messageElements[i];
        const role = element.getAttribute('data-message-author-role');
        
        // Check both user and assistant messages
        if (role === 'user' || role === 'assistant') {
            let contentElement = element.querySelector('.prose, .markdown, div[dir="auto"]');
            if (!contentElement) {
                contentElement = element.querySelector('[class*="prose"], [class*="markdown"]');
            }
            if (!contentElement) {
                contentElement = element.querySelector('div');
            }
            
            if (contentElement) {
                const content = contentElement.innerText || contentElement.textContent;
                console.log(`EchoNav: Checking ${role} message ${i}:`, content.substring(0, 100));
                
                // Exact match check first
                if (content.trim() === text.trim()) {
                    console.log(`EchoNav: Found exact match in ${role} message ${i}`);
                    return performScrollAndFocus(element, content, isAccessibilityMode, 'exact');
                }
                
                // For accessibility mode (Insight view), also try partial matching
                if (isAccessibilityMode) {
                    const searchText = text.toLowerCase().trim();
                    const contentLower = content.toLowerCase();
                    
                    // Check if search text is contained in content (for keypoints/summaries)
                    if (searchText.length > 10 && contentLower.includes(searchText)) {
                        console.log(`EchoNav: Found partial match in ${role} message ${i}`);
                        return performScrollAndFocus(element, content, isAccessibilityMode, 'partial');
                    }
                    
                    // Check if content contains significant portion of search text
                    if (contentLower.includes(searchText.substring(0, Math.min(50, searchText.length)))) {
                        console.log(`EchoNav: Found fuzzy match in ${role} message ${i}`);
                        return performScrollAndFocus(element, content, isAccessibilityMode, 'fuzzy');
                    }
                }
            }
        }
    }
    
    console.warn("EchoNav: No match found for text");
    return { success: false, reason: 'No matching content found' };
  }

  // Outline view functionality
  let isOutlineViewActive = false;
  let originalConversationElements = new Map(); // Store original elements and their states
  let outlineHeaders = new Map(); // Store injected outline headers
  
  /**
   * Add main landmark region for conversation in fullscreen mode
   * Provides clear description of the conversation structure
   */
  function addConversationLandmark(roundCount) {
    // Find the main conversation container
    const mainElement = document.querySelector('main');
    if (mainElement && !mainElement.hasAttribute('data-echonav-landmark-added')) {
      // Store original attributes for restoration
      const originalRole = mainElement.getAttribute('role');
      const originalLabel = mainElement.getAttribute('aria-label');
      
      mainElement.setAttribute('data-echonav-original-role', originalRole || '');
      mainElement.setAttribute('data-echonav-original-aria-label', originalLabel || '');
      mainElement.setAttribute('data-echonav-landmark-added', 'true');
      
      // Set enhanced landmark label with round count
      const roundText = roundCount === 1 ? '1 round' : `${roundCount} rounds`;
      mainElement.setAttribute('role', 'main');
      mainElement.setAttribute('aria-label', `ChatGPT conversation with ${roundText}. Navigate using VoiceOver Rotor Headings or use Arrow keys.`);
      
      console.log(`EchoNav: Added main landmark for conversation with ${roundCount} rounds`);
    }
  }
  
  /**
   * Remove main landmark region when exiting outline view
   */
  function removeConversationLandmark() {
    const mainElement = document.querySelector('main[data-echonav-landmark-added]');
    if (mainElement) {
      // Restore original attributes
      const originalRole = mainElement.getAttribute('data-echonav-original-role');
      const originalLabel = mainElement.getAttribute('data-echonav-original-aria-label');
      
      if (originalRole) {
        mainElement.setAttribute('role', originalRole);
      } else {
        mainElement.removeAttribute('role');
      }
      
      if (originalLabel) {
        mainElement.setAttribute('aria-label', originalLabel);
      } else {
        mainElement.removeAttribute('aria-label');
      }
      
      mainElement.removeAttribute('data-echonav-original-role');
      mainElement.removeAttribute('data-echonav-original-aria-label');
      mainElement.removeAttribute('data-echonav-landmark-added');
      
      console.log('EchoNav: Removed main landmark region');
    }
  }

  function enterOutlineView(outlineItems, shouldCollapseAll = false) {
    if (isOutlineViewActive) {
      console.log("EchoNav: Outline view already active");
      return;
    }

    console.log("EchoNav: Entering outline view mode with", outlineItems.length, "items", shouldCollapseAll ? "(collapsed)" : "(expanded)");
    
    // Clean up any existing immediate outline headers before creating formal ones
    const immediateHeaders = document.querySelectorAll('.echonav-outline-header[data-echonav-temp-header="true"]');
    immediateHeaders.forEach(header => {
      if (header.parentNode) {
        header.parentNode.removeChild(header);
      }
    });
    if (immediateHeaders.length > 0) {
      console.log(`EchoNav: Cleaned up ${immediateHeaders.length} immediate outline headers before entering outline view`);
    }
    
    // Add body class for outline view
    document.body.classList.add('echonav-outline-view-active');
      
    // Add outline view styles
    addOutlineViewStyles();
    
    // Add main landmark region for better VoiceOver navigation in fullscreen mode
    addConversationLandmark(outlineItems.length);
    
    const allMessageElements = Array.from(findMessageElements());
    
    // Process each outline item
    outlineItems.forEach((item, index) => {
      const isLastItem = index === outlineItems.length - 1;
      console.log(`EchoNav: Processing outline item ${index}:`, item.title);
      
      // Find the first message element that matches this turn
      const userText = item.originalText.split('\n\n')[0];
      const startElement = findMessageElementByText(userText, allMessageElements);
      
      if (startElement) {
        const startIndex = allMessageElements.indexOf(startElement);
        console.log(`EchoNav: Found start element for turn ${index} at position ${startIndex}`);
        
        // Find the end element (next turn's start or end of all elements)
        let endIndex;
        if (index < outlineItems.length - 1) {
          // Find the start of the next turn
          const nextUserText = outlineItems[index + 1].originalText.split('\n\n')[0];
          const nextStartElement = findMessageElementByText(nextUserText, allMessageElements);
          endIndex = nextStartElement ? allMessageElements.indexOf(nextStartElement) : allMessageElements.length;
        } else {
          // Last turn - go to the end
          endIndex = allMessageElements.length;
        }
        
        console.log(`EchoNav: Turn ${index} spans from element ${startIndex} to ${endIndex}`);
        
        // Collect all elements for this turn
        const turnElements = allMessageElements.slice(startIndex, endIndex);
        
        // Find the parent containers that need to be hidden
        const containersToHide = new Set();
        
        turnElements.forEach(messageElement => {
          // Find the outermost container for this message
          let container = messageElement;
          
          // Look for common conversation turn containers
          while (container && container !== document.body) {
            const classList = container.classList;
            if (classList.contains('agent-turn') || 
                classList.contains('user-turn') ||
                classList.contains('conversation-turn') ||
                container.hasAttribute('data-testid') ||
                (classList.contains('group') && classList.contains('turn-messages'))) {
              containersToHide.add(container);
              break;
            }
            container = container.parentElement;
          }
          
          // If no specific container found, use the message element itself
          if (container === document.body) {
            containersToHide.add(messageElement);
          }
        });
        
        // Also look for interaction buttons in the same containers
        const interactionButtons = [];
        containersToHide.forEach(container => {
          const buttons = container.querySelectorAll('button[aria-label*="复制"], button[aria-label*="编辑"], button[aria-label*="regenerate"], button[aria-label*="thumbs"], button[aria-label*="share"], button[data-testid*="copy"], button[data-testid*="edit"], button[aria-label*="最佳回复"], button[aria-label*="错误回复"], button[aria-label*="共享"]');
          buttons.forEach(button => {
            if (!interactionButtons.includes(button)) {
              interactionButtons.push(button);
            }
          });
        });
        
        // Combine containers and interaction buttons
        const allTurnElements = [...Array.from(containersToHide), ...interactionButtons];
        console.log(`EchoNav: Turn ${index} contains ${containersToHide.size} containers and ${interactionButtons.length} interaction buttons`);
        
        // ===== VOICEOVER ROTOR LANDMARKS CUSTOMIZATION =====
        // Override VoiceOver Rotor landmarks with round titles for better accessibility
        const roundTitle = `Round ${index + 1}: ${item.title}`;
        const containersArray = Array.from(containersToHide);
        
        // Find the actual landmark containers (outermost <article> with sr-only heading)
        const landmarkContainers = new Set();
        containersArray.forEach(container => {
          // Look for the outermost article element that contains sr-only heading
          let current = container;
          let articleElement = null;
          
          while (current && current !== document.body) {
            if (current.tagName === 'ARTICLE') {
              // Check if this article has a sr-only heading
              const srHeading = current.querySelector('h5.sr-only, h6.sr-only');
              if (srHeading) {
                articleElement = current;
                break;
              }
            }
            current = current.parentElement;
          }
          
          if (articleElement) {
            landmarkContainers.add(articleElement);
          }
        });
        
        const landmarkArray = Array.from(landmarkContainers);
        console.log(`EchoNav: Found ${landmarkArray.length} landmark containers for turn ${index}`);
        
        landmarkArray.forEach((landmarkContainer, containerIndex) => {
          const srHeading = landmarkContainer.querySelector('h5.sr-only, h6.sr-only');
          
          // Store original ARIA attributes and sr-only text for restoration
          if (!landmarkContainer.hasAttribute('data-echonav-original-role')) {
            const originalRole = landmarkContainer.getAttribute('role');
            const originalLabel = landmarkContainer.getAttribute('aria-label');
            const originalLabelledby = landmarkContainer.getAttribute('aria-labelledby');
            const originalHeadingText = srHeading ? srHeading.textContent : '';
            
            landmarkContainer.setAttribute('data-echonav-original-role', originalRole || '');
            landmarkContainer.setAttribute('data-echonav-original-label', originalLabel || '');
            landmarkContainer.setAttribute('data-echonav-original-labelledby', originalLabelledby || '');
            landmarkContainer.setAttribute('data-echonav-original-heading', originalHeadingText);
          }
          
          if (containerIndex === 0) {
            // First landmark: User's question
            // Get user question text for "You said:" label
            const userQuestionText = item.originalText ? item.originalText.split('\n\n')[0].trim() : '';
            const userLabel = userQuestionText ? `You said: ${userQuestionText}` : roundTitle;
            
            // Strategy: Set aria-label on article, hide sr-only heading from Rotor
            // We don't want "You said" to appear in Rotor Headings
            landmarkContainer.setAttribute('aria-label', userLabel);
            
            if (srHeading) {
              // Hide the sr-only heading from Rotor Headings
              if (!srHeading.hasAttribute('data-echonav-original-aria-hidden')) {
                const originalAriaHidden = srHeading.getAttribute('aria-hidden');
                srHeading.setAttribute('data-echonav-original-aria-hidden', originalAriaHidden || '');
              }
              srHeading.setAttribute('aria-hidden', 'true');
              
              // Store that we modified this heading for restoration
              landmarkContainer.setAttribute('data-echonav-hidden-user-heading', 'true');
            }
            console.log(`EchoNav: Set user question aria-label (hidden from Rotor) for turn ${index}:`, userLabel);
          } else if (containerIndex === 1) {
            // Second landmark: ChatGPT's response
            // Count words in AI response
            const responseText = landmarkContainer.innerText || landmarkContainer.textContent || '';
            const wordCount = responseText.trim().split(/\s+/).filter(word => word.length > 0).length;
            
            const aiResponseLabel = `AI Response for Round ${index + 1}, ${wordCount} words in total`;
            
            // Strategy: Set aria-label on article, hide sr-only heading from Rotor
            // We don't want "AI Response" to appear in Rotor Headings, only actual content headings
            landmarkContainer.setAttribute('aria-label', aiResponseLabel);
            
            if (srHeading) {
              // Hide the sr-only heading from Rotor Headings
              if (!srHeading.hasAttribute('data-echonav-original-aria-hidden')) {
                const originalAriaHidden = srHeading.getAttribute('aria-hidden');
                srHeading.setAttribute('data-echonav-original-aria-hidden', originalAriaHidden || '');
              }
              srHeading.setAttribute('aria-hidden', 'true');
              
              // Store that we modified this heading for restoration
              landmarkContainer.setAttribute('data-echonav-hidden-ai-heading', 'true');
            }
            console.log(`EchoNav: Set AI response aria-label (hidden from Rotor) for turn ${index}:`, aiResponseLabel);
          } else {
            // Additional landmarks: Hide from Rotor
            landmarkContainer.setAttribute('role', 'group');
            landmarkContainer.removeAttribute('aria-label');
            landmarkContainer.removeAttribute('aria-labelledby');
            if (srHeading) {
              srHeading.setAttribute('aria-hidden', 'true');
            }
            console.log(`EchoNav: Hidden additional landmark for turn ${index}`);
          }
        });
        
        // ===== OPTIMIZE HEADINGS FOR VOICEOVER ROTOR =====
        // Hide h5 and h6 headings, and remove emoji from all headings
        landmarkArray.forEach(landmarkContainer => {
          // Find all h5 and h6 headings and hide them from Rotor Headings
          const h5h6Headings = landmarkContainer.querySelectorAll('h5:not(.sr-only), h6:not(.sr-only)');
          h5h6Headings.forEach(heading => {
            if (!heading.hasAttribute('data-echonav-original-aria-hidden')) {
              const originalAriaHidden = heading.getAttribute('aria-hidden');
              heading.setAttribute('data-echonav-original-aria-hidden', originalAriaHidden || '');
            }
            heading.setAttribute('aria-hidden', 'true');
          });
          
          // Find all headings (h2, h3, h4) and determine the highest level in this turn
          const headingsToClean = landmarkContainer.querySelectorAll('h2:not(.sr-only), h3:not(.sr-only), h4:not(.sr-only)');
          
          // Determine the highest heading level (lowest number)
          let highestLevel = 6; // Start with lowest priority
          headingsToClean.forEach(heading => {
            const level = parseInt(heading.tagName.substring(1));
            if (level < highestLevel) {
              highestLevel = level;
            }
          });
          
          console.log(`EchoNav: Turn ${index} highest heading level:`, highestLevel);
          
          // Clean and add Section/Subsection prefix to headings using aria-label
          headingsToClean.forEach(heading => {
            if (!heading.hasAttribute('data-echonav-original-aria-label')) {
              const originalText = heading.textContent;
              const originalAriaLabel = heading.getAttribute('aria-label');
              
              // Store original aria-label for restoration
              heading.setAttribute('data-echonav-original-aria-label', originalAriaLabel || '');
              
              // First, CONVERT emoji numbers to regular numbers, then remove other emoji
              let cleanedText = originalText;
              
              // Step 1: Convert keycap number emoji (1️⃣2️⃣3️⃣) to regular numbers
              cleanedText = cleanedText
                .replace(/0\uFE0F?\u20E3/gu, '0. ')
                .replace(/1\uFE0F?\u20E3/gu, '1. ')
                .replace(/2\uFE0F?\u20E3/gu, '2. ')
                .replace(/3\uFE0F?\u20E3/gu, '3. ')
                .replace(/4\uFE0F?\u20E3/gu, '4. ')
                .replace(/5\uFE0F?\u20E3/gu, '5. ')
                .replace(/6\uFE0F?\u20E3/gu, '6. ')
                .replace(/7\uFE0F?\u20E3/gu, '7. ')
                .replace(/8\uFE0F?\u20E3/gu, '8. ')
                .replace(/9\uFE0F?\u20E3/gu, '9. ');
              
              // Step 2: Convert enclosed alphanumerics (①②③) to regular numbers
              cleanedText = cleanedText
                .replace(/\u2460/gu, '1. ')  // ①
                .replace(/\u2461/gu, '2. ')  // ②
                .replace(/\u2462/gu, '3. ')  // ③
                .replace(/\u2463/gu, '4. ')  // ④
                .replace(/\u2464/gu, '5. ')  // ⑤
                .replace(/\u2465/gu, '6. ')  // ⑥
                .replace(/\u2466/gu, '7. ')  // ⑦
                .replace(/\u2467/gu, '8. ')  // ⑧
                .replace(/\u2468/gu, '9. ')  // ⑨
                .replace(/\u2469/gu, '10. '); // ⑩
              
              // Step 3: Convert Roman numerals to Arabic numbers
              function romanToArabic(roman) {
                const romanMap = { 'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000 };
                let arabic = 0;
                for (let i = 0; i < roman.length; i++) {
                  const current = romanMap[roman[i]];
                  const next = romanMap[roman[i + 1]];
                  if (next && current < next) {
                    arabic -= current;
                  } else {
                    arabic += current;
                  }
                }
                return arabic;
              }
              
              // Match Roman numerals at the start (after optional decorative chars)
              // Supports: "I. ", "II: ", "III - ", "IV) ", etc.
              cleanedText = cleanedText.replace(/^([^\w\s]*?)([IVXLCDM]+)(\s*[\.．:：\-\)]\s*)/gi, (match, prefix, roman, suffix) => {
                const arabic = romanToArabic(roman.toUpperCase());
                return arabic + '. ';
              });
              
              // Step 4: Remove remaining emoji and special characters
              cleanedText = cleanedText
                // Remove standard emoji
                .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '')
                // Remove variation selectors and combining characters
                .replace(/[\uFE00-\uFE0F\u20D0-\u20FF]/gu, '')
                // Remove any remaining enclosed alphanumerics
                .replace(/[\u2460-\u24FF]/gu, '')
                .trim();
              
              // Add Section/Subsection prefix to ALL headings
              const currentLevel = parseInt(heading.tagName.substring(1));
              const isHighestLevel = (currentLevel === highestLevel);
              
              // Check if the heading starts with a number
              const numberMatch = cleanedText.match(/^(\d+)\s*[\.．:：]\s*/);
              
              if (numberMatch) {
                // Has a number - use prefix WITHOUT colon
                const prefix = isHighestLevel ? 'Section ' : 'Subsection ';
                cleanedText = cleanedText.replace(/^(\d+)\s*[\.．:：]\s*/, prefix + '$1. ');
              } else {
                // No number - use prefix WITH colon
                const prefix = isHighestLevel ? 'Section: ' : 'Subsection: ';
                // First clean up any decorative patterns
                cleanedText = cleanedText.replace(/^[^\d\w\s]+\s*/, '');
                cleanedText = prefix + cleanedText;
              }
              
              // Set aria-label instead of changing textContent
              // This way VoiceOver reads the cleaned text, but visual users see the original
              heading.setAttribute('aria-label', cleanedText);
              console.log(`EchoNav: Set aria-label for heading in turn ${index}:`, originalText, '→', cleanedText);
            }
          });
        });
        
        // ===== INSERT THEME HEADINGS FOR CASE B =====
        // For Case B responses (no inherent structure), insert h3 headings for theme groups
        const insertedHeadings = [];
        if (item.structuredData && item.structuredData.themes && item.structuredData.themes.length > 0) {
          console.log(`EchoNav: Turn ${index} has ${item.structuredData.themes.length} theme groups (Case B) - inserting h3 headings`);
          
          item.structuredData.themes.forEach((theme, themeIndex) => {
            // Find the first paragraph of this theme
            const firstPara = Array.isArray(theme.paragraphs) && theme.paragraphs.length > 0 ? theme.paragraphs[0] : null;
            
            if (!firstPara || !firstPara.text) {
              console.warn(`EchoNav: Theme ${themeIndex} has no paragraphs, skipping heading insertion`);
              return;
            }
            
            // Try to find the paragraph element in the DOM
            const firstParaId = firstPara.uniqueId || (Array.isArray(theme.paragraphIds) && theme.paragraphIds.length > 0 ? theme.paragraphIds[0] : null);
            let paraElement = null;
            
            // Search by data attribute first
            if (firstParaId) {
              paraElement = document.querySelector(`[data-echonav-paragraph-id="${firstParaId}"]`);
            }
            
            // If not found, search by text content within this turn's containers
            if (!paraElement) {
              const searchText = firstPara.text.trim().substring(0, 100);
              for (const container of containersArray) {
                const paragraphs = container.querySelectorAll('p');
                for (const p of paragraphs) {
                  const pText = (p.textContent || '').trim();
                  if (pText.substring(0, 100) === searchText) {
                    paraElement = p;
                    if (firstParaId) {
                      paraElement.setAttribute('data-echonav-paragraph-id', firstParaId);
                    }
                    break;
                  }
                }
                if (paraElement) break;
              }
            }
            
            if (paraElement) {
              // Create h3 heading
              const heading = document.createElement('h3');
              heading.className = 'echonav-inserted-theme-heading';
              heading.setAttribute('data-echonav-inserted', 'true');
              heading.setAttribute('data-echonav-theme-index', themeIndex.toString());
              
              // Clean theme name and set aria-label
              const themeName = theme.themeName || `Theme ${themeIndex + 1}`;
              const cleanedThemeName = themeName
                .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '')
                .replace(/[\uFE00-\uFE0F\u20D0-\u20FF]/gu, '')
                .trim();
              
              // Set visual text (with emoji) and aria-label (cleaned with Section prefix)
              heading.textContent = themeName;
              heading.setAttribute('aria-label', `Section ${themeIndex + 1}. ${cleanedThemeName}`);
              
              // Add CSS for styling (reduced margins to match native heading spacing)
              heading.style.cssText = `
                margin-top: 0.75em;
                margin-bottom: 0.5em;
                font-size: 1em;
                font-weight: 700;
                color: inherit;
              `;
              
              // Insert before the first paragraph
              paraElement.parentNode.insertBefore(heading, paraElement);
              insertedHeadings.push(heading);
              
              console.log(`EchoNav: Inserted h3 heading for theme ${themeIndex}: "${themeName}"`);
            } else {
              console.warn(`EchoNav: Could not find paragraph element for theme ${themeIndex}`);
            }
          });
        }
        
        // Store original elements and landmark containers for restoration
        originalConversationElements.set(index, {
          elements: allTurnElements,
          originalDisplays: allTurnElements.map(el => el.style.display || 'block'),
          containers: containersArray,
          landmarkContainers: landmarkArray,
          insertedHeadings: insertedHeadings // Store for cleanup
        });
        
        // Conditionally hide elements based on shouldCollapseAll parameter
        if (shouldCollapseAll) {
          allTurnElements.forEach((element, i) => {
            console.log(`EchoNav: Hiding element ${i} for turn ${index}:`, element);
            element.style.display = 'none';
          });
        } else {
          console.log(`EchoNav: Keeping turn ${index} expanded (${allTurnElements.length} elements visible)`);
        }
        
        // Create and inject outline header before the first container
        const outlineHeader = createOutlineHeader(item, index, !shouldCollapseAll); // Pass expansion state
        const firstContainer = Array.from(containersToHide)[0];
        
        // Step 1: Add pre-insert class for initial hidden state
        outlineHeader.classList.add('echonav-pre-insert');
        
        // Step 2: Insert into DOM
        if (firstContainer && firstContainer.parentNode) {
          firstContainer.parentNode.insertBefore(outlineHeader, firstContainer);
        } else {
          startElement.parentNode.insertBefore(outlineHeader, startElement);
        }
        
        outlineHeaders.set(index, outlineHeader);
        
        // Step 3: Trigger staggered animation (each card after the previous with delay)
        const animationDelay = index * 150; // 150ms delay between each card
        
        setTimeout(() => {
          // Force reflow
          void outlineHeader.offsetHeight;
          
          // Trigger animation on next frame
          requestAnimationFrame(() => {
            outlineHeader.classList.remove('echonav-pre-insert');
            outlineHeader.classList.add('echonav-inserting');
            console.log(`EchoNav: Animation triggered for turn ${index}`);
          });
          
          // Remove animation class after it completes
          setTimeout(() => {
            outlineHeader.classList.remove('echonav-inserting');
            console.log(`EchoNav: Animation complete for turn ${index}`);
          }, 1300); // 1.2s animation + buffer
          
        }, animationDelay);
        
        console.log(`EchoNav: Injected outline header for turn ${index} (animation delay: ${animationDelay}ms)`);
      } else {
        console.warn("EchoNav: Could not find start element for turn", index);
      }
    });
    
    isOutlineViewActive = true;
    console.log("EchoNav: Outline view mode activated");
  }

  function findMessageElementByText(text, messageElements) {
    for (const element of messageElements) {
      const elementText = element.innerText || element.textContent || '';
      if (elementText.includes(text.substring(0, 50))) {
        console.log("EchoNav: Found message element by text:", element);
        return element;
      }
    }
    return null;
  }

  function exitOutlineView() {
    if (!isOutlineViewActive) {
      console.log("EchoNav: Outline view not active");
      return;
    }

    console.log("EchoNav: Exiting outline view mode");
    
    // Remove all injected outline headers
    outlineHeaders.forEach((header, index) => {
      if (header && header.parentNode) {
        header.parentNode.removeChild(header);
      }
    });
    outlineHeaders.clear();
    
    // Restore all original conversation elements and ARIA attributes
    originalConversationElements.forEach((data, index) => {
      if (data.elements && data.originalDisplays) {
        data.elements.forEach((element, i) => {
          if (element && data.originalDisplays[i]) {
            element.style.display = data.originalDisplays[i];
          }
        });
      }
      
      // ===== REMOVE INSERTED THEME HEADINGS =====
      // Remove h3 headings that were inserted for Case B theme groups
      if (data.insertedHeadings && data.insertedHeadings.length > 0) {
        data.insertedHeadings.forEach((heading, headingIndex) => {
          if (heading && heading.parentNode) {
            heading.parentNode.removeChild(heading);
            console.log(`EchoNav: Removed inserted theme heading ${headingIndex} for turn ${index}`);
          }
        });
      }
      
      // ===== RESTORE VOICEOVER ROTOR LANDMARKS =====
      // Restore original ARIA attributes and sr-only headings for VoiceOver
      if (data.landmarkContainers) {
        data.landmarkContainers.forEach((landmarkContainer, containerIndex) => {
          if (landmarkContainer.hasAttribute('data-echonav-original-role')) {
            const originalRole = landmarkContainer.getAttribute('data-echonav-original-role');
            const originalLabel = landmarkContainer.getAttribute('data-echonav-original-label');
            const originalLabelledby = landmarkContainer.getAttribute('data-echonav-original-labelledby');
            const originalHeadingText = landmarkContainer.getAttribute('data-echonav-original-heading');
            
            // Restore or remove ARIA attributes
            if (originalRole) {
              landmarkContainer.setAttribute('role', originalRole);
            } else {
              landmarkContainer.removeAttribute('role');
            }
            
            if (originalLabel) {
              landmarkContainer.setAttribute('aria-label', originalLabel);
            } else {
              landmarkContainer.removeAttribute('aria-label');
            }
            
            if (originalLabelledby) {
              landmarkContainer.setAttribute('aria-labelledby', originalLabelledby);
            } else {
              landmarkContainer.removeAttribute('aria-labelledby');
            }
            
            // Restore sr-only heading visibility
            if (landmarkContainer.hasAttribute('data-echonav-hidden-user-heading')) {
              // We hid the user question heading, need to restore visibility
              const srHeading = landmarkContainer.querySelector('.sr-only');
              if (srHeading) {
                const originalAriaHidden = srHeading.getAttribute('data-echonav-original-aria-hidden');
                if (originalAriaHidden) {
                  srHeading.setAttribute('aria-hidden', originalAriaHidden);
                } else {
                  srHeading.removeAttribute('aria-hidden');
                }
                srHeading.removeAttribute('data-echonav-original-aria-hidden');
                
                // Restore original text
                if (originalHeadingText) {
                  srHeading.textContent = originalHeadingText;
                }
              }
              landmarkContainer.removeAttribute('data-echonav-hidden-user-heading');
            } else if (landmarkContainer.hasAttribute('data-echonav-hidden-ai-heading')) {
              // We hid the AI response heading, need to restore visibility
              const srHeading = landmarkContainer.querySelector('.sr-only');
              if (srHeading) {
                const originalAriaHidden = srHeading.getAttribute('data-echonav-original-aria-hidden');
                if (originalAriaHidden) {
                  srHeading.setAttribute('aria-hidden', originalAriaHidden);
                } else {
                  srHeading.removeAttribute('aria-hidden');
                }
                srHeading.removeAttribute('data-echonav-original-aria-hidden');
                
                // Restore original text
                if (originalHeadingText) {
                  srHeading.textContent = originalHeadingText;
                }
              }
              landmarkContainer.removeAttribute('data-echonav-hidden-ai-heading');
            } else {
              // Normal restoration for other headings
              const srHeading = landmarkContainer.querySelector('h5.sr-only, h6.sr-only');
              if (srHeading && originalHeadingText) {
                srHeading.textContent = originalHeadingText;
              }
            }
            
            // ===== RESTORE HEADINGS =====
            // Restore h5 and h6 headings visibility
            const h5h6Headings = landmarkContainer.querySelectorAll('h5:not(.sr-only)[data-echonav-original-aria-hidden], h6:not(.sr-only)[data-echonav-original-aria-hidden]');
            h5h6Headings.forEach(heading => {
              const originalAriaHidden = heading.getAttribute('data-echonav-original-aria-hidden');
              if (originalAriaHidden) {
                heading.setAttribute('aria-hidden', originalAriaHidden);
              } else {
                heading.removeAttribute('aria-hidden');
              }
              heading.removeAttribute('data-echonav-original-aria-hidden');
            });
            
            // Restore original aria-label for headings
            const headingsWithCustomAriaLabel = landmarkContainer.querySelectorAll('h2[data-echonav-original-aria-label], h3[data-echonav-original-aria-label], h4[data-echonav-original-aria-label]');
            headingsWithCustomAriaLabel.forEach(heading => {
              const originalAriaLabel = heading.getAttribute('data-echonav-original-aria-label');
              if (originalAriaLabel) {
                heading.setAttribute('aria-label', originalAriaLabel);
              } else {
                heading.removeAttribute('aria-label');
              }
              heading.removeAttribute('data-echonav-original-aria-label');
            });
            
            // Clean up our custom data attributes
            landmarkContainer.removeAttribute('data-echonav-original-role');
            landmarkContainer.removeAttribute('data-echonav-original-label');
            landmarkContainer.removeAttribute('data-echonav-original-labelledby');
            landmarkContainer.removeAttribute('data-echonav-original-heading');
            
            console.log(`EchoNav: Restored original VoiceOver landmarks for turn ${index}, landmark ${containerIndex}`);
          }
        });
      }
    });
    originalConversationElements.clear();
    
    // Disable heading collapsible if enabled
    if (isHeadingCollapsibleEnabled) {
      disableHeadingCollapsible();
    }
    
    // Remove outline view styles
    removeOutlineViewStyles();
    
    // Remove conversation landmark
    removeConversationLandmark();
    
    isOutlineViewActive = false;
    console.log("EchoNav: Outline view mode deactivated");
    
    // Remove body class for outline view
    document.body.classList.remove('echonav-outline-view-active');
    
    removeFloatingButton(); // Also remove floating button on exit
  }

  // --- Floating Button Fullscreen Mode ---

  let floatingContainer = null;

  function enterFullscreenWithFloatingButton(outlineItems) {
      // Fullscreen mode now ONLY hides side panel - outline view is auto-enabled when Timeline has content
      console.log("EchoNav: Entering fullscreen mode (hiding side panel)");

      // Hide iframe
    if (treeUIIframe) {
        treeUIIframe.style.display = 'none';
    }

    // Remove margin from main content when entering fullscreen
    const mainContainer = document.querySelector('main')?.parentElement;
    if (mainContainer) {
        mainContainer.style.marginRight = '0px';
    }

    // Add fullscreen class to body for CSS styling
    document.body.classList.add('echonav-fullscreen-mode');

    // Note: We don't call enterOutlineView here anymore - it's auto-enabled when Timeline has content
    createFloatingButton();
    
    // In Fullscreen mode, enable heading-level collapsible and collapse all headings (but keep turns expanded)
    if (isOutlineViewActive) {
      // Enable heading collapsible functionality
      enableHeadingCollapsible();
      
      // Collapse all headings (but keep turn cards expanded)
      collapseAllHeadings();
    }
  }

  function createFloatingButton() {
      if (document.getElementById('echonav-floating-container')) return;

      floatingContainer = document.createElement('div');
      floatingContainer.id = 'echonav-floating-container';

      const floatingButton = document.createElement('div');
      floatingButton.id = 'echonav-floating-btn';
      
      // Use logo as background image instead of emoji
      const logoImg = document.createElement('img');
      logoImg.src = chrome.runtime.getURL('icons/icon128.png');
      logoImg.alt = 'EchoNav Logo';
      logoImg.style.cssText = `
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
      `;
      
      // Add error handling - fallback to emoji if logo fails to load
      logoImg.onerror = function() {
          console.log('EchoNav: Logo failed to load, using fallback');
          floatingButton.removeChild(logoImg);
          floatingButton.textContent = '🌳';
          floatingButton.style.fontSize = '28px';
          floatingButton.style.backgroundColor = '#2563eb';
          floatingButton.style.color = 'white';
      };
      
      // Add success handler for debugging
      logoImg.onload = function() {
          console.log('EchoNav: Logo loaded successfully');
      };
      
      floatingButton.appendChild(logoImg);

      const floatingOptions = document.createElement('div');
      floatingOptions.id = 'echonav-floating-options';
      floatingOptions.innerHTML = `
          <button id="echonav-exit-fullscreen-btn">Exit Fullscreen</button>
          <button id="echonav-close-plugin-btn">Close Plugin</button>
      `;

      floatingContainer.appendChild(floatingButton);
      floatingContainer.appendChild(floatingOptions);
      document.body.appendChild(floatingContainer);

      // Event Listeners with delay for better UX
      let hideTimeout = null;
      
      floatingContainer.addEventListener('mouseenter', () => {
          if (hideTimeout) {
              clearTimeout(hideTimeout);
              hideTimeout = null;
          }
          floatingOptions.style.display = 'flex';
      });
      
      floatingContainer.addEventListener('mouseleave', () => {
          hideTimeout = setTimeout(() => {
              floatingOptions.style.display = 'none';
          }, 200); // 200ms delay before hiding
      });

      document.getElementById('echonav-exit-fullscreen-btn').addEventListener('click', exitFullscreenAndReopenSidePanel);
      document.getElementById('echonav-close-plugin-btn').addEventListener('click', closePlugin);

      addFloatingButtonStyles();
  }

  function removeFloatingButton() {
      if (floatingContainer) {
          floatingContainer.remove();
          floatingContainer = null;
      }
  }

  function exitFullscreenAndReopenSidePanel() {
      // Fullscreen mode now ONLY shows side panel - outline view remains active
      console.log("EchoNav: Exiting fullscreen mode (showing side panel)");
      
      // Remove floating button when exiting fullscreen
      removeFloatingButton();

      // Remove fullscreen class from body
      document.body.classList.remove('echonav-fullscreen-mode');      
      
      // Show iframe
      if (treeUIIframe) {
          treeUIIframe.style.display = 'block';
      }
      
      // Restore margin to main content when exiting fullscreen
      const mainContainer = document.querySelector('main')?.parentElement;
      if (mainContainer) {
          mainContainer.style.marginRight = '380px';
      }
      
      // When exiting Fullscreen, disable heading collapsible (back to default state)
      if (isOutlineViewActive) {
          // Disable heading collapsible functionality (which will also expand all headings)
          disableHeadingCollapsible();
      }
      
      // Note: We don't call exitOutlineView here anymore - outline view stays active
  }

  function closePlugin() {
      // Disable heading collapsible if enabled
      if (isHeadingCollapsibleEnabled) {
          disableHeadingCollapsible();
      }
      exitOutlineView();
  }

  function addFloatingButtonStyles() {
      const styleId = 'echonav-floating-styles';
      if (document.getElementById(styleId)) return;

      const styles = document.createElement('style');
      styles.id = styleId;
      styles.textContent = `
          #echonav-floating-container {
              position: fixed;
              bottom: 30px;
              right: 30px;
              z-index: 2147483647;
          }
          #echonav-floating-btn {
              width: 60px;
              height: 60px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 28px;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2);
              transition: transform 0.2s ease;
              overflow: hidden;
          }
          #echonav-floating-container:hover #echonav-floating-btn {
              transform: scale(1.1);
          }
          #echonav-floating-options {
              display: none;
              position: absolute;
              bottom: 75px;
              right: 0;
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2);
              padding: 8px;
              flex-direction: column;
              width: 160px;
          }
          #echonav-floating-options button {
              display: block;
              width: 100%;
              padding: 10px 15px;
              background: none;
              border: none;
              text-align: left;
              cursor: pointer;
              font-size: 14px;
              color: #333;
              border-radius: 4px;
          }
          #echonav-floating-options button:hover {
              background-color: #f0f0f0;
          }
      `;
      document.head.appendChild(styles);
  }

  function toggleEchoNavUI() {
    const mainContainer = document.querySelector('main')?.parentElement;

    if (!treeUIIframe) {
        // Create iframe
        treeUIIframe = document.createElement('iframe');
        treeUIIframe.id = 'echonav-iframe';
        treeUIIframe.src = chrome.runtime.getURL('sidepanel/sidepanel.html');
        treeUIIframe.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 380px;
            height: 100%;
            border: none;
            z-index: 2147483646;
            box-shadow: -2px 0 15px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(treeUIIframe);

        // Push content
        if (mainContainer) {
            mainContainer.style.transition = 'margin-right 0.3s ease';
            mainContainer.style.marginRight = '380px';
        }
    } else {
        // Toggle visibility
        const isVisible = treeUIIframe.style.display !== 'none';
        treeUIIframe.style.display = isVisible ? 'none' : 'block';
        
        // Toggle content push
        if (mainContainer) {
            mainContainer.style.marginRight = isVisible ? '0px' : '380px';
        }
        
        // ⚠️ CLEANUP: Remove all outline headers when closing plugin
        if (isVisible) {
            console.log("EchoNav: Closing plugin, cleaning up all outline headers");
            const allHeaders = document.querySelectorAll('.echonav-outline-header');
            allHeaders.forEach(header => {
                if (header.parentNode) {
                    header.parentNode.removeChild(header);
                }
            });
            if (allHeaders.length > 0) {
                console.log(`EchoNav: Removed ${allHeaders.length} outline headers on plugin close`);
            }
            
            // Also exit outline view if active
            if (isOutlineViewActive) {
                exitOutlineView();
            }
        }
    }
}

  function findConversationElement(originalText) {
    // First, try to find elements by their unique IDs that were set during extraction
    // The originalText should contain both user and assistant content
    const userText = originalText.split('\n\n')[0]; // First part is usually user text
    const assistantText = originalText.split('\n\n')[1]; // Second part is usually assistant text
    
    console.log("EchoNav: Looking for user text:", userText.substring(0, 50));
    console.log("EchoNav: Looking for assistant text:", assistantText ? assistantText.substring(0, 50) : "No assistant text");
    
    // Find user element by text content
    const userElement = findElementByText(userText);
    const assistantElement = assistantText ? findElementByText(assistantText) : null;
    
    if (userElement && assistantElement) {
      console.log("EchoNav: Found both user and assistant elements");
      // Find the common parent container that contains both elements
      const turnContainer = findCommonParent(userElement, assistantElement);
      if (turnContainer) {
        console.log("EchoNav: Found common parent container:", turnContainer);
        return turnContainer;
      }
    } else if (userElement) {
      console.log("EchoNav: Found only user element, looking for container");
      const turnContainer = findSpecificTurnContainer(userElement);
      if (turnContainer) {
        console.log("EchoNav: Found turn container for user element:", turnContainer);
        return turnContainer;
      }
    }
    
    // Fallback to text matching if unique ID approach fails
    console.log("EchoNav: Falling back to text matching");
    const selectors = [
      'div[data-message-author-role]',
      '[data-testid*="conversation-turn"]',
      '.group\\/conversation-turn',
      '[data-testid*="turn"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const textContent = element.innerText || element.textContent || '';
        if (textContent.includes(originalText.substring(0, 100))) {
          const turnContainer = findSpecificTurnContainer(element);
          if (turnContainer) {
            console.log("EchoNav: Found specific turn container for element:", turnContainer);
            return turnContainer;
          }
          return element;
        }
      }
    }
    
    return null;
  }

  function findElementByText(text) {
    // Look for elements with data-echonav-id first
    const elementsWithId = document.querySelectorAll('[data-echonav-id]');
    for (const element of elementsWithId) {
      const elementText = element.innerText || element.textContent || '';
      if (elementText.includes(text.substring(0, 50))) {
        console.log("EchoNav: Found element by unique ID:", element);
        return element;
      }
    }
    
    // Fallback to searching all message elements
    const selectors = [
      'div[data-message-author-role]',
      '[data-testid*="conversation-turn"]',
      '.group\\/conversation-turn'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const elementText = element.innerText || element.textContent || '';
        if (elementText.includes(text.substring(0, 50))) {
          console.log("EchoNav: Found element by text matching:", element);
          return element;
        }
      }
    }
    
    return null;
  }

  function findCommonParent(element1, element2) {
    // Find the common parent that contains both elements
    let current = element1;
    while (current && current !== document.body) {
      if (current.contains(element2)) {
        console.log("EchoNav: Found common parent:", current);
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function findSpecificTurnContainer(element) {
    // Strategy: Find the smallest container that contains both user and assistant messages
    // Start from the element and work up the DOM tree
    
    console.log("EchoNav: Starting container search for element:", element);
    console.log("EchoNav: Element text content (first 100 chars):", (element.innerText || element.textContent || '').substring(0, 100));
    
    let current = element;
    let bestContainer = null;
    
    // First, try to find a direct conversation turn container
    const directSelectors = [
      '[data-testid*="conversation-turn"]',
      '.group\\/conversation-turn',
      '[class*="conversation-turn"]'
    ];
    
    for (const selector of directSelectors) {
      const container = current.closest(selector);
      if (container) {
        console.log("EchoNav: Found direct turn container:", container);
        console.log("EchoNav: Direct container children count:", container.children.length);
        console.log("EchoNav: Direct container user elements:", container.querySelectorAll('[data-message-author-role="user"]').length);
        console.log("EchoNav: Direct container assistant elements:", container.querySelectorAll('[data-message-author-role="assistant"]').length);
        return container;
      }
    }
    
    // If no direct container, look for the smallest parent that contains both user and assistant
    current = element.parentElement;
    let level = 0;
    while (current && current !== document.body && level < 10) {
      level++;
      console.log(`EchoNav: Checking parent level ${level}:`, current);
      
      // Check if this container has both user and assistant messages
      const userElements = current.querySelectorAll('[data-message-author-role="user"]');
      const assistantElements = current.querySelectorAll('[data-message-author-role="assistant"]');
      
      console.log(`EchoNav: Level ${level} - User elements: ${userElements.length}, Assistant elements: ${assistantElements.length}`);
      
      if (userElements.length > 0 && assistantElements.length > 0) {
        // Check if this is a reasonable size container (not too large)
        const allMessageElements = current.querySelectorAll('[data-message-author-role]');
        console.log(`EchoNav: Level ${level} - Total message elements: ${allMessageElements.length}`);
        
        if (allMessageElements.length <= 4) { // Reasonable limit for a single turn
          console.log("EchoNav: Found specific turn container with user and assistant:", current);
          console.log("EchoNav: Container HTML structure:", current.outerHTML.substring(0, 500));
          return current;
        }
      }
      
      // Also check for elements that might be part of the same turn
      const messageElements = current.querySelectorAll('[data-message-author-role], [class*="message"], [class*="turn"]');
      if (messageElements.length >= 2 && messageElements.length <= 4) {
        // Check if this contains both user and assistant content
        const hasUser = Array.from(messageElements).some(el => 
          el.getAttribute('data-message-author-role') === 'user' ||
          el.className.includes('user') ||
          el.className.includes('human')
        );
        const hasAssistant = Array.from(messageElements).some(el => 
          el.getAttribute('data-message-author-role') === 'assistant' ||
          el.className.includes('assistant') ||
          el.className.includes('ai') ||
          el.className.includes('bot')
        );
        
        console.log(`EchoNav: Level ${level} - Has user: ${hasUser}, Has assistant: ${hasAssistant}`);
        
        if (hasUser && hasAssistant) {
          console.log("EchoNav: Found specific container with multiple message types:", current);
          console.log("EchoNav: Container HTML structure:", current.outerHTML.substring(0, 500));
          return current;
        }
      }
      
      current = current.parentElement;
    }
    
    // Last resort: return the element's immediate parent
    console.log("EchoNav: Using immediate parent as turn container");
    console.log("EchoNav: Immediate parent:", element.parentElement);
    return element.parentElement;
  }

  function createOutlineHeader(item, index, isExpanded) {
    const header = document.createElement('div');
    header.className = 'echonav-outline-header';
    header.dataset.index = index;
    
    // IMPORTANT: Set message index attribute for keypoints updates to work
    if (item.assistantUniqueId !== undefined) {
      header.setAttribute('data-echonav-message-index', item.assistantUniqueId.toString());
    } else {
      // Fallback: use index as message index
      header.setAttribute('data-echonav-message-index', index.toString());
    }
    
    // Add ARIA attributes for accessibility - Enhanced for VoiceOver
    const roundTitle = `Round ${index + 1}: ${item.title}`;
    const keypointCount = (item.chatKeyPoints?.length || item.parsedKeyPoints?.length || 0);
    const keypointSummary = keypointCount > 0 ? `, ${keypointCount} key points` : '';
    
    // Enhanced ARIA label for better VoiceOver experience
    const ariaLabel = `${roundTitle}${keypointSummary}. ${isExpanded ? 'Expanded' : 'Collapsed'}. Press Space or Enter to ${isExpanded ? 'collapse' : 'expand'}.`;
    
    header.setAttribute('role', 'button');
    header.setAttribute('aria-label', ariaLabel);
    header.setAttribute('aria-expanded', isExpanded.toString());
    header.setAttribute('tabindex', '0');
    
    // Build keypoints HTML synchronously (no async storage calls)
    let keypointsHtml = '';
    
    // Prioritize chatKeyPoints (from ChatGPT interface generation)
    if (item.chatKeyPoints && item.chatKeyPoints.length > 0) {
      console.log(`EchoNav: Using chatKeyPoints for outline header ${index}:`, item.chatKeyPoints);
      keypointsHtml = item.chatKeyPoints.map(kp => 
        `<div class="echonav-keypoint" role="listitem">
          <span class="echonav-keypoint-icon">▸</span>
          <span>${kp}</span>
        </div>`
      ).join('');
    } else if (item.parsedKeyPoints && item.parsedKeyPoints.length > 0) {
      // Fallback to parsedKeyPoints (structured keypoints from outline generation)
      console.log(`EchoNav: Using parsedKeyPoints for outline header ${index}:`, item.parsedKeyPoints);
      keypointsHtml = item.parsedKeyPoints.map(kp => 
        `<div class="echonav-keypoint" role="listitem">
          <span class="echonav-keypoint-icon">▸</span>
          <span>${kp.point}</span>
        </div>`
      ).join('');
    }
      
    // Set HTML content synchronously
    const hasKeypoints = keypointsHtml.trim().length > 0;
    // Strategy: Create a screen-reader-only heading for VoiceOver Rotor, visual title without "Round X:"
    header.innerHTML = `
      <h1 class="sr-only" role="heading" aria-level="1">${roundTitle}</h1>
      <div class="echonav-outline-header-top" onclick="event.stopPropagation()">
        <div class="echonav-outline-badge" aria-hidden="true">${index + 1}</div>
        <div class="echonav-outline-title-wrapper">
          <div class="echonav-outline-title" id="echonav-round-title-${index}" aria-hidden="true">${item.title}</div>
          <div class="echonav-outline-toggle ${isExpanded ? 'expanded' : ''}" aria-hidden="true">▼</div>
        </div>
      </div>
      ${hasKeypoints ? `<div class="echonav-outline-keypoints" role="list" aria-label="Key points summary">
        ${keypointsHtml}
      </div>` : ''}
    `;
    
    // Add click event listener
    header.addEventListener('click', () => {
      toggleConversationElement(index, header);
    });
    
    // Add keyboard support for accessibility
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleConversationElement(index, header);
      }
    });
    
    return header;
  }

  function toggleConversationElement(index, header) {
    const originalData = originalConversationElements.get(index);
    const toggleIcon = header.querySelector('.echonav-outline-toggle');
    
    if (originalData && originalData.elements && originalData.originalDisplays) {
      // Check if any element is currently hidden
      const isCurrentlyHidden = originalData.elements.some(element => element.style.display === 'none');
      
      if (isCurrentlyHidden) {
        // Show all elements in this turn
        originalData.elements.forEach((element, i) => {
          element.style.display = originalData.originalDisplays[i];
        });
        if (toggleIcon) {
          toggleIcon.classList.add('expanded');
        }
        
        // Update ARIA attributes for expanded state
        header.setAttribute('aria-expanded', 'true');
        const currentLabel = header.getAttribute('aria-label');
        if (currentLabel) {
          header.setAttribute('aria-label', currentLabel.replace(/Collapsed/gi, 'Expanded').replace(/to collapse/gi, 'to collapse').replace(/to expand/gi, 'to collapse'));
        }
        
        console.log(`EchoNav: Expanded turn ${index} with ${originalData.elements.length} elements`);
      } else {
        // Hide all elements in this turn
        originalData.elements.forEach((element, i) => {
          element.style.display = 'none';
        });
        if (toggleIcon) {
          toggleIcon.classList.remove('expanded');
        }
        
        // Update ARIA attributes for collapsed state
        header.setAttribute('aria-expanded', 'false');
        const currentLabel = header.getAttribute('aria-label');
        if (currentLabel) {
          header.setAttribute('aria-label', currentLabel.replace(/Expanded/gi, 'Collapsed').replace(/to collapse/gi, 'to expand'));
        }
        
        console.log(`EchoNav: Collapsed turn ${index} with ${originalData.elements.length} elements`);
      }
    }
  }
  
  // Helper function to collapse all turns in outline view
  function collapseAllTurns() {
    if (!isOutlineViewActive) {
      console.log("EchoNav: Outline view not active, cannot collapse turns");
      return;
    }
    
    console.log("EchoNav: Collapsing all turns");
    originalConversationElements.forEach((originalData, index) => {
      const header = outlineHeaders.get(index);
      const toggleIcon = header ? header.querySelector('.echonav-outline-toggle') : null;
      
      if (originalData && originalData.elements && originalData.originalDisplays) {
        // Hide all elements in this turn
        originalData.elements.forEach((element, i) => {
          element.style.display = 'none';
        });
        
        if (header) {
          // Update ARIA attributes for collapsed state
          header.setAttribute('aria-expanded', 'false');
          const currentLabel = header.getAttribute('aria-label');
          if (currentLabel) {
            header.setAttribute('aria-label', currentLabel.replace('expanded', 'collapsed').replace('collapse', 'expand'));
          }
        }
        if (toggleIcon) {
          toggleIcon.classList.remove('expanded');
        }
      }
    });
    console.log("EchoNav: All turns collapsed");
  }
  
  // Helper function to expand all turns in outline view
  function expandAllTurns() {
    if (!isOutlineViewActive) {
      console.log("EchoNav: Outline view not active, cannot expand turns");
      return;
    }
    
    console.log("EchoNav: Expanding all turns");
    originalConversationElements.forEach((originalData, index) => {
      const header = outlineHeaders.get(index);
      const toggleIcon = header ? header.querySelector('.echonav-outline-toggle') : null;
      
      if (originalData && originalData.elements && originalData.originalDisplays) {
        // Show all elements in this turn
        originalData.elements.forEach((element, i) => {
          element.style.display = originalData.originalDisplays[i];
        });
        
        if (header) {
          // Update ARIA attributes for expanded state
          header.setAttribute('aria-expanded', 'true');
          const currentLabel = header.getAttribute('aria-label');
          if (currentLabel) {
            header.setAttribute('aria-label', currentLabel.replace('collapsed', 'expanded').replace('expand', 'collapse'));
          }
        }
        if (toggleIcon) {
          toggleIcon.classList.add('expanded');
        }
      }
    });
    console.log("EchoNav: All turns expanded");
  }

  // ===== HEADING-LEVEL COLLAPSIBLE FUNCTIONALITY =====
  
  // Storage for heading collapsible state
  let headingCollapsibleData = new Map(); // Map<turnIndex, Array<headingData>>
  let isHeadingCollapsibleEnabled = false;

  /**
   * Parse and extract heading hierarchy from a turn's DOM elements
   * @param {Array} turnElements - DOM elements for a specific turn
   * @param {Number} turnIndex - Index of the turn
   * @returns {Array} - Array of heading data with hierarchy
   */
  function parseHeadingHierarchy(turnElements, turnIndex) {
    console.log(`EchoNav: Parsing heading hierarchy for turn ${turnIndex}`);
    const headings = [];
    
    // Find all assistant response containers in this turn
    const assistantContainers = [];
    turnElements.forEach(element => {
      if (element.getAttribute('data-message-author-role') === 'assistant') {
        assistantContainers.push(element);
      } else {
        const assistantElement = element.querySelector('[data-message-author-role="assistant"]');
        if (assistantElement) {
          assistantContainers.push(assistantElement);
        }
      }
    });
    
    console.log(`EchoNav: Found ${assistantContainers.length} assistant containers in turn ${turnIndex}`);
    
    // Extract all headings from assistant responses
    assistantContainers.forEach(container => {
      const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      console.log(`EchoNav: Found ${headingElements.length} headings in assistant container`);
      
      headingElements.forEach((headingEl, index) => {
        const level = parseInt(headingEl.tagName.substring(1)); // Extract number from h1, h2, etc.
        const text = headingEl.textContent.trim();
        const uniqueId = headingEl.getAttribute('data-echonav-heading-id') || `turn-${turnIndex}-heading-${index}`;
        
        // Get all sibling elements after this heading until the next heading
        const contentElements = getContentUntilNextHeading(headingEl);
        
        headings.push({
          element: headingEl,
          level: level,
          text: text,
          uniqueId: uniqueId,
          contentElements: contentElements,
          isCollapsed: false, // Initially expanded
          parentIndex: null, // Will be calculated below
          nestingDepth: 0 // Will be calculated below
        });
      });
    });
    
    // Calculate parent-child relationships and nesting depth
    for (let i = 0; i < headings.length; i++) {
      const currentHeading = headings[i];
      
      // Find parent: scan backwards to find the first heading with a lower level
      for (let j = i - 1; j >= 0; j--) {
        if (headings[j].level < currentHeading.level) {
          currentHeading.parentIndex = j;
          currentHeading.nestingDepth = headings[j].nestingDepth + 1;
          break;
        }
      }
    }
    
    console.log(`EchoNav: Parsed ${headings.length} headings for turn ${turnIndex}`);
    headings.forEach((h, idx) => {
      console.log(`  Heading ${idx}: level=${h.level}, depth=${h.nestingDepth}, parent=${h.parentIndex}, text="${h.text.substring(0, 40)}..."`);
    });
    return headings;
  }

  /**
   * Get all DOM elements between a heading and the next heading (or end of container)
   * @param {HTMLElement} headingElement - The heading element
   * @returns {Array} - Array of DOM elements that belong to this heading section
   */
  function getContentUntilNextHeading(headingElement) {
    const content = [];
    let currentElement = headingElement.nextElementSibling;
    const currentLevel = parseInt(headingElement.tagName.substring(1));
    
    while (currentElement) {
      // Stop if we encounter a heading of same or higher level
      if (/^H[1-6]$/.test(currentElement.tagName)) {
        const nextLevel = parseInt(currentElement.tagName.substring(1));
        if (nextLevel <= currentLevel) {
          break;
        }
      }
      content.push(currentElement);
      currentElement = currentElement.nextElementSibling;
    }
    
    return content;
  }

  /**
   * Enable heading-level collapsible functionality for all turns
   */
  function enableHeadingCollapsible() {
    if (isHeadingCollapsibleEnabled) {
      console.log("EchoNav: Heading collapsible already enabled");
      return;
    }
    
    if (!isOutlineViewActive) {
      console.log("EchoNav: Outline view not active, cannot enable heading collapsible");
      return;
    }
    
    console.log("EchoNav: Enabling heading-level collapsible functionality");
    
    // Parse heading hierarchy for each turn
    originalConversationElements.forEach((originalData, turnIndex) => {
      if (originalData && originalData.elements) {
        const headings = parseHeadingHierarchy(originalData.elements, turnIndex);
        
        if (headings.length > 0) {
          headingCollapsibleData.set(turnIndex, headings);
          
          // Add collapsible UI to each heading
          headings.forEach((headingData, headingIndex) => {
            addHeadingCollapsibleUI(headingData, turnIndex, headingIndex);
          });
        }
      }
    });
    
    isHeadingCollapsibleEnabled = true;
    console.log("EchoNav: Heading collapsible enabled for", headingCollapsibleData.size, "turns");
  }

  /**
   * Add collapsible UI controls to a heading
   * @param {Object} headingData - Heading data object
   * @param {Number} turnIndex - Turn index
   * @param {Number} headingIndex - Heading index within turn
   */
  function addHeadingCollapsibleUI(headingData, turnIndex, headingIndex) {
    const headingElement = headingData.element;
    
    // Check if UI already added
    if (headingElement.querySelector('.echonav-heading-toggle')) {
      return;
    }
    
    // Skip if heading has no content elements to toggle
    if (headingData.contentElements.length === 0) {
      console.log(`EchoNav: Skipping collapsible UI for heading "${headingData.text}" - no content`);
      return;
    }
    
    // Wrap heading content in a container for better control
    const originalHTML = headingElement.innerHTML;
    const headingLevel = headingData.level;
    const nestingDepth = headingData.nestingDepth || 0;
    
    // Create toggle icon
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'echonav-heading-toggle expanded';
    toggleIcon.innerHTML = '▼';
    toggleIcon.setAttribute('aria-hidden', 'true');
    
    // Create wrapper for heading content
    const contentWrapper = document.createElement('span');
    contentWrapper.className = 'echonav-heading-content';
    contentWrapper.innerHTML = originalHTML;
    
    // Clear heading and add new structure
    headingElement.innerHTML = '';
    headingElement.appendChild(toggleIcon);
    headingElement.appendChild(contentWrapper);
    
    // Add data attributes
    headingElement.setAttribute('data-echonav-collapsible', 'true');
    headingElement.setAttribute('data-turn-index', turnIndex);
    headingElement.setAttribute('data-heading-index', headingIndex);
    headingElement.setAttribute('data-nesting-depth', nestingDepth.toString());
    
    // Add ARIA attributes with enhanced VoiceOver support
    // DON'T use aria-label - it prevents VoiceOver from reading the full heading text
    // Instead, let VoiceOver read the actual heading content naturally
    
    // CRITICAL: Keep role="heading" to ensure VoiceOver Rotor can find these headings
    // DON'T use role="button" as it hides them from the Headings list
    headingElement.setAttribute('role', 'heading');
    headingElement.setAttribute('aria-level', headingLevel.toString());
    
    // CRITICAL: Remove aria-hidden to ensure headings are visible to VoiceOver Rotor
    // Some headings (h5/h6) might have been hidden earlier, we need to unhide them for collapsible mode
    headingElement.removeAttribute('aria-hidden');
    
    headingElement.setAttribute('aria-expanded', 'true');
    headingElement.setAttribute('tabindex', '0');
    headingElement.style.cursor = 'pointer';
    
    // Add aria-description for additional context (doesn't override content)
    headingElement.setAttribute('aria-description', 'Collapsible section. Press Space or Enter to toggle.');
    
    // Apply nesting-based indentation and font size
    // Base font sizes for each level (in rem)
    const baseFontSizes = [1.25, 1.1, 1.075, 1.05, 1.02, 1]; // h1-h6
    const baseFontSize = baseFontSizes[headingLevel - 1] || 1;
    
    // Calculate font size: decrease by 0.15rem for each nesting level
    // This ensures child headings are visibly smaller than their parents
    const fontSize = Math.max(baseFontSize - (nestingDepth * 0.15), 0.75); // Minimum 0.75rem
    
    // Calculate left padding: base 0.75rem + 2rem per nesting level
    const basePadding = 0.75;
    const nestingIndent = nestingDepth * 2; // 2rem per level
    const totalPadding = basePadding + nestingIndent;
    
    // Apply styles
    headingElement.style.paddingLeft = `${totalPadding}rem`;
    headingElement.style.fontSize = `${fontSize}rem`;
    
    console.log(`EchoNav: Heading "${headingData.text.substring(0, 30)}..." depth=${nestingDepth}, level=h${headingLevel}, fontSize=${fontSize}rem, padding=${totalPadding}rem`);
    
    // Add click event
    headingElement.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHeadingSection(turnIndex, headingIndex);
    });
    
    // Add keyboard support
    headingElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        toggleHeadingSection(turnIndex, headingIndex);
      }
    });
    
    console.log(`EchoNav: Added collapsible UI to heading "${headingData.text}" with ${headingData.contentElements.length} content elements`);
  }

  /**
   * Toggle (collapse/expand) a heading section
   * @param {Number} turnIndex - Turn index
   * @param {Number} headingIndex - Heading index within turn
   */
  function toggleHeadingSection(turnIndex, headingIndex) {
    const turnHeadings = headingCollapsibleData.get(turnIndex);
    if (!turnHeadings || !turnHeadings[headingIndex]) {
      console.warn(`EchoNav: No heading data found for turn ${turnIndex}, heading ${headingIndex}`);
      return;
    }
    
    const headingData = turnHeadings[headingIndex];
    const headingElement = headingData.element;
    const toggleIcon = headingElement.querySelector('.echonav-heading-toggle');
    const contentElements = headingData.contentElements;
    
    // Toggle collapsed state
    headingData.isCollapsed = !headingData.isCollapsed;
    
    if (headingData.isCollapsed) {
      // Collapse: hide content including sub-headings
      contentElements.forEach(el => {
        el.style.display = 'none';
      });
      
      // Also collapse all sub-headings (headings with higher level numbers)
      collapseSubHeadings(turnIndex, headingIndex);
      
      if (toggleIcon) {
        toggleIcon.classList.remove('expanded');
      }
      
      // Update ARIA attributes for collapsed state
      headingElement.setAttribute('aria-expanded', 'false');
      
      console.log(`EchoNav: Collapsed heading "${headingData.text}"`);
    } else {
      // Expand: show content
      contentElements.forEach(el => {
        el.style.display = '';
      });
      
      // Expand immediate sub-headings (but not their content, let user control that)
      expandImmediateSubHeadings(turnIndex, headingIndex);
      
      if (toggleIcon) {
        toggleIcon.classList.add('expanded');
      }
      
      // Update ARIA attributes for expanded state
      headingElement.setAttribute('aria-expanded', 'true');
      
      console.log(`EchoNav: Expanded heading "${headingData.text}"`);
    }
  }

  /**
   * Collapse all sub-headings under a parent heading
   * @param {Number} turnIndex - Turn index
   * @param {Number} parentHeadingIndex - Parent heading index
   */
  function collapseSubHeadings(turnIndex, parentHeadingIndex) {
    const turnHeadings = headingCollapsibleData.get(turnIndex);
    if (!turnHeadings) return;
    
    const parentHeading = turnHeadings[parentHeadingIndex];
    if (!parentHeading) return;
    
    const parentLevel = parentHeading.level;
    
    // Find all headings that are children of this parent
    for (let i = parentHeadingIndex + 1; i < turnHeadings.length; i++) {
      const heading = turnHeadings[i];
      
      // Stop when we reach a heading of same or higher level (not a child)
      if (heading.level <= parentLevel) {
        break;
      }
      
      // Collapse this sub-heading if not already collapsed
      if (!heading.isCollapsed) {
        heading.isCollapsed = true;
        
        // Hide its content
        heading.contentElements.forEach(el => {
          el.style.display = 'none';
        });
        
        // Update UI
        const toggleIcon = heading.element.querySelector('.echonav-heading-toggle');
        if (toggleIcon) {
          toggleIcon.classList.remove('expanded');
        }
        heading.element.setAttribute('aria-expanded', 'false');
      }
    }
  }

  /**
   * Expand immediate sub-headings (only direct children, not their content)
   * @param {Number} turnIndex - Turn index
   * @param {Number} parentHeadingIndex - Parent heading index
   */
  function expandImmediateSubHeadings(turnIndex, parentHeadingIndex) {
    const turnHeadings = headingCollapsibleData.get(turnIndex);
    if (!turnHeadings) return;
    
    const parentHeading = turnHeadings[parentHeadingIndex];
    if (!parentHeading) return;
    
    const parentLevel = parentHeading.level;
    const immediateChildLevel = parentLevel + 1;
    
    // Find all immediate child headings (level = parentLevel + 1)
    for (let i = parentHeadingIndex + 1; i < turnHeadings.length; i++) {
      const heading = turnHeadings[i];
      
      // Stop when we reach a heading of same or higher level
      if (heading.level <= parentLevel) {
        break;
      }
      
      // Only expand immediate children (not grandchildren)
      if (heading.level === immediateChildLevel) {
        if (heading.isCollapsed) {
          heading.isCollapsed = false;
          
          // Show its content
          heading.contentElements.forEach(el => {
            el.style.display = '';
          });
          
          // Update UI
          const toggleIcon = heading.element.querySelector('.echonav-heading-toggle');
          if (toggleIcon) {
            toggleIcon.classList.add('expanded');
          }
          heading.element.setAttribute('aria-expanded', 'true');
        }
      }
    }
  }

  /**
   * Collapse all heading sections in all turns
   */
  function collapseAllHeadings() {
    if (!isHeadingCollapsibleEnabled) {
      console.log("EchoNav: Heading collapsible not enabled");
      return;
    }
    
    console.log("EchoNav: Collapsing all headings");
    headingCollapsibleData.forEach((headings, turnIndex) => {
      headings.forEach((headingData, headingIndex) => {
        if (!headingData.isCollapsed) {
          // Directly collapse without triggering sub-heading logic (more efficient for batch operations)
          headingData.isCollapsed = true;
          
          const headingElement = headingData.element;
          const toggleIcon = headingElement.querySelector('.echonav-heading-toggle');
          
          // Hide content
          headingData.contentElements.forEach(el => {
            el.style.display = 'none';
          });
          
          // Update UI
          if (toggleIcon) {
            toggleIcon.classList.remove('expanded');
          }
          headingElement.setAttribute('aria-expanded', 'false');
        }
      });
    });
    console.log("EchoNav: All headings collapsed");
  }

  /**
   * Expand all heading sections in all turns
   */
  function expandAllHeadings() {
    if (!isHeadingCollapsibleEnabled) {
      console.log("EchoNav: Heading collapsible not enabled");
      return;
    }
    
    console.log("EchoNav: Expanding all headings");
    headingCollapsibleData.forEach((headings, turnIndex) => {
      headings.forEach((headingData, headingIndex) => {
        if (headingData.isCollapsed) {
          // Directly expand without triggering sub-heading logic (more efficient for batch operations)
          headingData.isCollapsed = false;
          
          const headingElement = headingData.element;
          const toggleIcon = headingElement.querySelector('.echonav-heading-toggle');
          
          // Show content
          headingData.contentElements.forEach(el => {
            el.style.display = '';
          });
          
          // Update UI
          if (toggleIcon) {
            toggleIcon.classList.add('expanded');
          }
          headingElement.setAttribute('aria-expanded', 'true');
        }
      });
    });
    console.log("EchoNav: All headings expanded");
  }

  /**
   * Disable heading-level collapsible functionality
   */
  function disableHeadingCollapsible() {
    if (!isHeadingCollapsibleEnabled) {
      return;
    }
    
    console.log("EchoNav: Disabling heading-level collapsible functionality");
    
    // Expand all headings first
    expandAllHeadings();
    
    // Remove UI from all headings
    headingCollapsibleData.forEach((headings) => {
      headings.forEach((headingData) => {
        const headingElement = headingData.element;
        
        // Restore original HTML
        const contentWrapper = headingElement.querySelector('.echonav-heading-content');
        if (contentWrapper) {
          headingElement.innerHTML = contentWrapper.innerHTML;
        }
        
        // Remove attributes
        headingElement.removeAttribute('data-echonav-collapsible');
        headingElement.removeAttribute('data-turn-index');
        headingElement.removeAttribute('data-heading-index');
        headingElement.removeAttribute('data-nesting-depth');
        headingElement.removeAttribute('role');
        headingElement.removeAttribute('aria-expanded');
        headingElement.removeAttribute('aria-description');
        headingElement.removeAttribute('tabindex');
        headingElement.style.cursor = '';
        headingElement.style.paddingLeft = '';
        headingElement.style.fontSize = '';
      });
    });
    
    // Clear data
    headingCollapsibleData.clear();
    isHeadingCollapsibleEnabled = false;
    
    console.log("EchoNav: Heading collapsible disabled");
  }

  // Function to detect ChatGPT's theme by checking class attribute
  function detectChatGPTTheme() {
    const html = document.documentElement;
    const body = document.body;
    
    // Check if 'dark' class is present on html or body element
    if (html.classList.contains('dark') || body.classList.contains('dark')) {
      console.log('✓ EchoNav: DARK theme detected');
      return 'dark';
    }
    
    console.log('✓ EchoNav: LIGHT theme detected');
    return 'light';
  }

  function addOutlineViewStyles() {
    if (document.getElementById('echonav-outline-view-styles')) {
      return;
    }
    
    const currentTheme = detectChatGPTTheme();
    console.log(`🎨 EchoNav: Applying ${currentTheme.toUpperCase()} theme to turn cards`);

    const styles = document.createElement('style');
    styles.id = 'echonav-outline-view-styles';
    
    // Define colors for both themes
    const colors = currentTheme === 'dark' ? {
      bgPrimary: '#353535',
      bgSecondary: '#2d2d2d',
      bgTertiary: '#353535',
      borderColor: '#4a4a4a',
      borderHover: '#4a4a4a',
      textPrimary: '#ffffff',
      textSecondary: '#e0e0e0',
      textMuted: '#b0b0b0',
      toggleBg: '#353535'
    } : {
      bgPrimary: '#ffffff',
      bgSecondary: '#f8fafc',
      bgTertiary: '#f1f5f9',
      borderColor: '#e2e8f0',
      borderHover: '#cbd5e1',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#64748b',
      toggleBg: 'white'
    };
    
    styles.textContent = `
      /* Screen Reader Only - Visually hidden but accessible to screen readers */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }

      /* EchoNav Design System Variables - Theme: ${currentTheme} */
      :root {
        --echonav-primary-color: #2563eb;
        --echonav-primary-hover: #1d4ed8;
        --echonav-bg-primary: ${colors.bgPrimary};
        --echonav-bg-secondary: ${colors.bgSecondary};
        --echonav-bg-tertiary: ${colors.bgTertiary};
        --echonav-border-color: ${colors.borderColor};
        --echonav-border-hover: ${colors.borderHover};
        --echonav-text-primary: ${colors.textPrimary};
        --echonav-text-secondary: ${colors.textSecondary};
        --echonav-text-muted: ${colors.textMuted};
        --echonav-space-sm: 0.5rem;
        --echonav-space-md: 1rem;
        --echonav-space-lg: 1.5rem;
        --echonav-font-size-keypoint: 0.9rem;
        --echonav-font-size-title: 1rem;
        --echonav-font-size-badge: 0.75rem;
        --echonav-radius-lg: 0.9rem;
        --echonav-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        --echonav-transition-normal: 250ms ease-in-out;
        
        /* Card Spacing - Adjust these values to change gaps */
        --echonav-card-gap-vertical: 12px;
        --echonav-card-gap-horizontal: 48px;
      
      /* Turn Card Container */
      .echonav-outline-header {
        background: var(--echonav-bg-primary);
        border: 1px solid var(--echonav-border-color);
        border-radius: var(--echonav-radius-lg);
        margin: var(--echonav-card-gap-vertical) var(--echonav-card-gap-horizontal);
        padding: 0;
        transition: all var(--echonav-transition-normal);
        overflow: hidden;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        outline: none;
      }

      .echonav-outline-header:hover {
        border-color: var(--echonav-primary-color);
        box-shadow: var(--echonav-shadow-md);
      }
      
      .echonav-outline-header:focus {
        outline: 3px solid var(--echonav-primary-color);
        outline-offset: 2px;
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
      }

      /* Fullscreen Mode - Wider margins (10% instead of 48px) */
      body.echonav-fullscreen-mode .echonav-outline-header {
        margin-left: 10%;
        margin-right: 10%;
      }

      /* Header Top Section */
      .echonav-outline-header-top {
        display: flex;
        align-items: flex-start;  /* Changed from center to flex-start for top alignment */
        gap: var(--echonav-space-md);
        cursor: pointer;
        user-select: none;
        padding: var(--echonav-space-lg);
        padding-top: var(--echonav-space-md);
        padding-bottom: var(--echonav-space-md);
        background: var(--echonav-bg-secondary);
        transition: background var(--echonav-transition-normal);
      }

      .echonav-outline-header-top:hover {
        background: var(--echonav-bg-tertiary);
      }

      /* Badge (Round Number) */
      .echonav-outline-badge {
        background: var(--echonav-primary-color);
        color: white;
        font-size: var(--echonav-font-size-badge);
        font-weight: 720;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Title Wrapper */
      .echonav-outline-title-wrapper {
        display: flex;
        align-items: flex-start;  /* Changed from center to flex-start for first line alignment */
        gap: var(--echonav-space-md);
        flex: 1;
        min-width: 0;
      }

      /* Title */
      .echonav-outline-title {
        font-size: var(--echonav-font-size-title);
        font-weight: 600;
        color: var(--echonav-text-primary);
        margin: 0;
        padding: 0;
        border: 0;
        line-height: 1.5;
        flex: 1;
      }

      /* Toggle Button */
      .echonav-outline-toggle {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--echonav-text-muted);
        font-size: 14px;  /* 🔧 Triangle size - decrease this value to make triangle smaller */
        transition: all var(--echonav-transition-normal);
        border-radius: 50%;
        background: ${colors.toggleBg};
        border: 2px solid var(--echonav-border-color);
        flex-shrink: 0;
        opacity: 1;
        margin-top: 2px;  /* Fine-tune vertical alignment with title first line */
      }

      .echonav-outline-toggle:hover {
        background: var(--echonav-bg-tertiary);
        border-color: var(--echonav-border-hover);
        color: var(--echonav-text-secondary);
        opacity: 0.7;  /* Slightly more visible on hover */
      }

      .echonav-outline-toggle.expanded {
        transform: rotate(180deg);
        background: var(--echonav-primary-color), 50%;
        color: white;
        border-color: var(--echonav-primary-color);
        opacity: 1;  /* Full opacity when expanded */
      }
      
      .echonav-outline-toggle.expanded:hover {
        background: var(--echonav-primary-hover);
        opacity: 1;
      }

      /* ===== HEADING COLLAPSIBLE STYLES ===== */
      /* Heading with collapsible toggle */
      [data-echonav-collapsible="true"] {
        display: flex !important;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        transition: background-color 0.2s ease;
        padding: 0.5rem 0.75rem;
        padding-left: 0.75rem; /* Base padding, will be overridden by JS for nested headings */
        margin-left: -0.75rem;
        margin-right: -0.75rem;
        border-radius: 0.5rem;
      }
      
      [data-echonav-collapsible="true"]:hover {
        background-color: var(--echonav-bg-tertiary);
      }
      
      [data-echonav-collapsible="true"]:focus {
        outline: 2px solid var(--echonav-primary-color);
        outline-offset: 2px;
      }
      
      /* Heading toggle icon */
      .echonav-heading-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        font-size: 12px;
        color: var(--echonav-text-muted);
        transition: transform 0.25s ease, color 0.2s ease;
        user-select: none;
      }
      
      .echonav-heading-toggle.expanded {
        transform: rotate(0deg);
        color: var(--echonav-primary-color);
      }
      
      .echonav-heading-toggle:not(.expanded) {
        transform: rotate(-90deg);
      }
      
      /* Heading content wrapper */
      .echonav-heading-content {
        flex: 1;
        min-width: 0;
      }
      
      /* Note: Font sizes and left padding are now dynamically set in JavaScript 
         based on nesting depth (not h1-h6 level) to create proper visual hierarchy */
      
      /* Keypoints Container */
      .echonav-outline-keypoints {
        display: flex;
        flex-direction: column;
        gap: var(--echonav-space-sm);
        padding: var(--echonav-space-lg);
        padding-top: var(--echonav-space-md);
        padding-bottom: var(--echonav-space-md);
        margin: 0;
      }

      /* Keypoint Item */
      .echonav-keypoint {
        display: flex;
        align-items: flex-start;
        gap: var(--echonav-space-sm);
        font-size: var(--echonav-font-size-keypoint);
        color: var(--echonav-text-primary);
        line-height: 1.6;
        opacity: 0.8;  /* 80% transparency for keypoint text */
      }

      /* Keypoint Icon */
      .echonav-keypoint-icon {
        color: var(--echonav-primary-color);
        font-size: 1.2rem;  /* 🔧 Arrow size - increase this value to make arrow larger */
        flex-shrink: 0;
        line-height: 1.6;
        opacity: 1;  /* Full opacity for arrow icon */
      }
      
      /* ===== CARD INSERTION ANIMATION ===== */
      /* Push-split animation: card pushes down from text, creating space smoothly */
      @keyframes echonav-card-insert {
        0% {
          opacity: 0;
          max-height: 0;
          margin-top: 0;
          margin-bottom: 0;
          transform: translateY(-20px);
          padding-top: 0;
          padding-bottom: 0;
        }
        60% {
          opacity: 1;
          max-height: 1000px;
          transform: translateY(5px);
        }
        100% {
          opacity: 1;
          max-height: 1000px;
          margin-top: var(--echonav-card-gap-vertical);
          margin-bottom: var(--echonav-card-gap-vertical);
          transform: translateY(0);
        }
      }
      
      /* Initial state for cards about to be inserted */
      .echonav-outline-header.echonav-pre-insert {
        opacity: 0;
        max-height: 0;
        margin-top: 0;
        margin-bottom: 0;
        overflow: hidden;
        transform: translateY(-20px);
      }
      
      /* Apply animation to newly inserted cards */
      .echonav-outline-header.echonav-inserting {
        animation: echonav-card-insert 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        overflow: hidden;
      }
      
      /* Highlight effect for surrounding text when card is inserted */
      @keyframes echonav-text-highlight {
        0%, 100% {
          background: transparent;
        }
        50% {
          background: rgba(37, 99, 235, 0.08);
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.05);
        }
      }
      
      .echonav-inserting-context {
        animation: echonav-text-highlight 0.8s ease-out;
      }
    `;

    document.head.appendChild(styles);
    
    // Setup theme change monitoring
    setupThemeChangeMonitoring();
  }
  
  // Monitor for theme changes in ChatGPT
  function setupThemeChangeMonitoring() {
    // Prevent duplicate monitoring
    if (window.echoNavThemeMonitoring) {
      return;
    }
    window.echoNavThemeMonitoring = true;
    
    let lastTheme = detectChatGPTTheme();
    
    // Monitor DOM changes (class/attribute changes)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme')) {
          const newTheme = detectChatGPTTheme();
          if (newTheme !== lastTheme) {
            console.log('🔄 EchoNav: Theme changed via DOM:', lastTheme, '->', newTheme);
            lastTheme = newTheme;
            removeOutlineViewStyles();
            setTimeout(() => addOutlineViewStyles(), 100);
          }
        }
      }
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });
    
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });
    
    // Periodic check as fallback
    const intervalId = setInterval(() => {
      const newTheme = detectChatGPTTheme();
      if (newTheme !== lastTheme) {
        console.log('🔄 EchoNav: Theme changed (periodic check):', lastTheme, '->', newTheme);
        lastTheme = newTheme;
        removeOutlineViewStyles();
        setTimeout(() => addOutlineViewStyles(), 100);
      }
    }, 3000); // Check every 3 seconds
    
    // Store references for cleanup
    window.echoNavThemeObserver = observer;
    window.echoNavThemeInterval = intervalId;
  }

  function removeOutlineViewStyles() {
    const styles = document.getElementById('echonav-outline-view-styles');
    if (styles) {
      styles.remove();
    }
    
    // Clean up monitoring
    if (window.echoNavThemeObserver) {
      window.echoNavThemeObserver.disconnect();
      window.echoNavThemeObserver = null;
    }
    if (window.echoNavThemeInterval) {
      clearInterval(window.echoNavThemeInterval);
      window.echoNavThemeInterval = null;
    }
    window.echoNavThemeMonitoring = false;
  }

  // ===== VoiceOver Response Monitoring and Interruption Functions =====

  function startResponseMonitoring() {
    if (responseObserver) {
        console.log("EchoNav: Response monitoring already active");
        return;
    }
    
    console.log("EchoNav: Starting AI response monitoring for VoiceOver optimization");
    
    responseObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        let assistantElement = null;
                        
                        if (node.getAttribute && node.getAttribute('data-message-author-role') === 'assistant') {
                            assistantElement = node;
                        } else if (node.querySelector) {
                            assistantElement = node.querySelector('[data-message-author-role="assistant"]');
                        }
                        
                        if (assistantElement) {
                            console.log("EchoNav: New AI response detected, allowing native 'ChatGPT is generating' announcement");
                            
                            // DO NOT disable aria-live immediately - let ChatGPT's native "ChatGPT is generating" play first
                            // We'll interrupt when response is complete (in monitorResponseCompletion)
                            
                            // Monitor for completion - interruption will happen when response is done
                            let contentElement = assistantElement.querySelector('.prose, .markdown, div[dir="auto"]') || 
                                               assistantElement.querySelector('[class*="prose"], [class*="markdown"]') ||
                                               assistantElement.querySelector('div');
                            
                            if (contentElement) {
                                monitorResponseCompletion(contentElement);
                            }
                        }
                    }
                });
            }
        });
    });
    
    responseObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    console.log("EchoNav: AI response monitoring started");
  }

  function stopResponseMonitoring() {
    if (responseObserver) {
        console.log("EchoNav: Stopping AI response monitoring");
        responseObserver.disconnect();
        responseObserver = null;
        
        activeMonitoringTimers.forEach(timer => {
            if (timer) clearInterval(timer);
        });
        activeMonitoringTimers.clear();
        
        const monitoredElements = document.querySelectorAll('[data-echonav-monitored]');
        monitoredElements.forEach(element => {
            delete element.dataset.echonavMonitored;
        });
        
        console.log("EchoNav: AI response monitoring stopped and cleaned up");
    }
  }

  function monitorResponseCompletion(responseElement) {
    if (responseElement.dataset && responseElement.dataset.echonavMonitored) {
        console.log("EchoNav: Element already being monitored, skipping");
        return;
    }
    
    responseElement.dataset.echonavMonitored = 'true';
    console.log("EchoNav: 🎯 STARTED monitoring response element for completion");
    console.log("EchoNav: Response element:", responseElement);
    
    // Ensure aria-live region is created BEFORE we need to announce
    createAriaLiveRegion();
    console.log("EchoNav: Aria-live region pre-created for immediate announcement");
    
    let completionCheckTimer = null;
    let lastTextLength = 0;
    let stableCount = 0;
    let checkCount = 0;
    
    function checkCompletion() {
        try {
            checkCount++;
            const currentText = responseElement.innerText || responseElement.textContent || '';
            const currentLength = currentText.length;
            
            if (checkCount % 10 === 0) {
                console.log(`EchoNav: Completion check #${checkCount}, length: ${currentLength}, stable: ${stableCount}`);
            }
            
            if (currentLength < 20) return;
            
            // Enhanced completion detection with multiple indicators
            const hasCompletionIndicators = 
                currentText.includes('Copy code') ||
                (responseElement.querySelector && responseElement.querySelector('button[aria-label*="Copy"]')) ||
                (responseElement.querySelector && !responseElement.querySelector('.result-streaming'));
            
            // Check for ChatGPT's streaming cursor indicator
            const hasStreamingCursor = responseElement.querySelector && 
                (responseElement.querySelector('.result-streaming') || 
                 responseElement.querySelector('[class*="cursor"]') ||
                 responseElement.querySelector('[class*="typing"]'));
            
            if (currentLength === lastTextLength && currentLength > 0) {
                stableCount++;
                console.log(`EchoNav: Text stable for ${stableCount} checks, length: ${currentLength}, hasIndicators: ${hasCompletionIndicators}, hasStreamingCursor: ${hasStreamingCursor}`);
                
                // ULTRA-FAST detection: Only 1 stable check (100ms) if we have clear completion indicators
                const minStableChecks = hasCompletionIndicators && !hasStreamingCursor ? 1 : 3;
                
                if (stableCount >= minStableChecks && (hasCompletionIndicators || currentLength > 100)) {
                    console.log("EchoNav: ⚡ AI response complete detected, triggering IMMEDIATE interruption");
                    console.log(`EchoNav: Detection details - stableCount: ${stableCount}, minStableChecks: ${minStableChecks}, hasIndicators: ${hasCompletionIndicators}, hasStreamingCursor: ${hasStreamingCursor}`);
                    
                    // IMMEDIATELY interrupt VoiceOver - disable AND CLEAR ALL potential ChatGPT aria-live regions
                    const chatGPTAriaLive = document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"]');
                    let disabledCount = 0;
                    chatGPTAriaLive.forEach((el) => {
                        if (el.id !== 'echonav-aria-live' && el.id !== 'echonav-aria-live-polite') {
                            // Save original content and aria-live value for potential restoration
                            if (!el.hasAttribute('data-echonav-original-aria-live')) {
                                const originalAriaLive = el.getAttribute('aria-live');
                                if (originalAriaLive) {
                                    el.setAttribute('data-echonav-original-aria-live', originalAriaLive);
                                }
                                // Save original content
                                if (el.textContent) {
                                    el.setAttribute('data-echonav-original-content', el.textContent);
                                }
                            }
                            // AGGRESSIVE interruption: disable AND clear content
                            el.setAttribute('aria-live', 'off');
                            el.setAttribute('aria-hidden', 'true');
                            el.textContent = ''; // Clear content to stop VoiceOver from reading
                            disabledCount++;
                            console.log(`EchoNav: Disabled and cleared aria-live on element:`, el.className, el.getAttribute('role'));
                        }
                    });
                    console.log(`EchoNav: ✅ Disabled and cleared ${disabledCount} ChatGPT aria-live regions after completion (found ${chatGPTAriaLive.length} total)`);
                    
                    // ALSO disable any role="status" elements that might announce
                    const statusElements = document.querySelectorAll('[role="status"]');
                    let statusDisabledCount = 0;
                    statusElements.forEach((el) => {
                        if (el.id !== 'echonav-aria-live' && el.id !== 'echonav-aria-live-polite' && !el.hasAttribute('data-echonav-disabled')) {
                            if (el.textContent) {
                                el.setAttribute('data-echonav-original-status-content', el.textContent);
                            }
                            el.setAttribute('aria-live', 'off');
                            el.setAttribute('aria-hidden', 'true');
                            el.textContent = ''; // Clear content
                            el.setAttribute('data-echonav-disabled', 'true');
                            statusDisabledCount++;
                        }
                    });
                    if (statusDisabledCount > 0) {
                        console.log(`EchoNav: ✅ Also disabled and cleared ${statusDisabledCount} role="status" elements`);
                    }
                    
                    // Announce "EchoNav is summarizing" IMMEDIATELY after clearing ChatGPT's voice
                    const statusAnnouncement = `EchoNav is summarizing`;
                    announceToScreenReader(statusAnnouncement);
                    console.log("EchoNav: ✅ Announced 'EchoNav is summarizing' via VoiceOver");
                    
                    if (completionCheckTimer) {
                        clearInterval(completionCheckTimer);
                        completionCheckTimer = null;
                        activeMonitoringTimers.delete(completionCheckTimer);
                    }
                    
                    handleResponseCompletion(responseElement, currentText);
                    return;
                }
            } else {
                stableCount = 0;
                lastTextLength = currentLength;
            }
        } catch (error) {
            console.warn("EchoNav: Error in completion check:", error);
            if (completionCheckTimer) {
                clearInterval(completionCheckTimer);
                completionCheckTimer = null;
                activeMonitoringTimers.delete(completionCheckTimer);
            }
        }
    }
    
    // Check ULTRA-frequently for fastest detection: every 100ms
    completionCheckTimer = setInterval(checkCompletion, 100);
    activeMonitoringTimers.add(completionCheckTimer);
    
    // Safety timeout - stop after 3 minutes
    setTimeout(() => {
        if (completionCheckTimer) {
            clearInterval(completionCheckTimer);
            activeMonitoringTimers.delete(completionCheckTimer);
            completionCheckTimer = null;
            if (responseElement.dataset) {
                delete responseElement.dataset.echonavMonitored;
            }
        }
    }, 180000);
  }

  async function handleResponseCompletion(responseElement, responseText) {
    console.log("EchoNav: Processing completed AI response for VoiceOver optimization");
    
    // Check word count - only process if >= 200 words
    const wordCount = calculateWordCount(responseText);
    console.log(`EchoNav: Response contains ${wordCount} words`);
    
    if (wordCount < 200) {
        console.log("EchoNav: Response too short (<200 words), skipping VoiceOver optimization");
        // Re-enable aria-live regions so VoiceOver can read the short response normally
        const chatGPTAriaLive = document.querySelectorAll('[aria-live="off"]');
        let reEnabledCount = 0;
        chatGPTAriaLive.forEach((el) => {
            if (el.id !== 'echonav-aria-live') {
                const originalAriaLive = el.getAttribute('data-echonav-original-aria-live');
                if (originalAriaLive) {
                    el.setAttribute('aria-live', originalAriaLive);
                    el.removeAttribute('aria-hidden');
                    el.removeAttribute('data-echonav-original-aria-live');
                    reEnabledCount++;
                } else {
                    // Fallback: restore to polite if no original value saved
                    el.setAttribute('aria-live', 'polite');
                    el.removeAttribute('aria-hidden');
                    reEnabledCount++;
                }
            }
        });
        if (reEnabledCount > 0) {
            console.log(`EchoNav: Re-enabled ${reEnabledCount} aria-live regions for short response`);
        }
        return;
    }
    
    console.log("EchoNav: Response meets threshold (>=200 words), proceeding with VoiceOver optimization");

    try {
        // Note: aria-live regions are already disabled and "EchoNav is summarizing" already announced
        // in monitorResponseCompletion when response completion was detected
        // Just ensure any newly created aria-live regions are also disabled
        const chatGPTAriaLive = document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"]');
        let disabledCount = 0;
        chatGPTAriaLive.forEach((el) => {
            if (el.id !== 'echonav-aria-live') {
                const currentAriaLive = el.getAttribute('aria-live');
                if (currentAriaLive !== 'off') {
                    // Save original if not already saved
                    if (!el.hasAttribute('data-echonav-original-aria-live')) {
                        el.setAttribute('data-echonav-original-aria-live', currentAriaLive);
                    }
                el.setAttribute('aria-live', 'off');
                el.setAttribute('aria-hidden', 'true');
                    disabledCount++;
                }
            }
        });
        if (disabledCount > 0) {
            console.log(`EchoNav: ✅ Disabled ${disabledCount} additional ChatGPT aria-live regions`);
        }
        
        // Get messageIndex before generating keypoints (needed for storage in background.js)
        let messageContainer = responseElement;
        while (messageContainer && messageContainer !== document.body) {
            const hasMessageRole = messageContainer.hasAttribute('data-message-author-role');
            if (hasMessageRole && messageContainer.getAttribute('data-message-author-role') === 'assistant') {
                break;
            }
            messageContainer = messageContainer.parentElement;
        }
        
        let messageIndex;
        if (messageContainer && messageContainer !== document.body) {
            messageIndex = messageContainer.getAttribute('data-echonav-message-index');
            if (!messageIndex) {
                // Count existing assistant messages to get a unique index
                const allAssistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                const messageIndexNum = Array.from(allAssistantMessages).indexOf(messageContainer);
                messageIndex = messageIndexNum >= 0 ? messageIndexNum.toString() : Date.now().toString();
                messageContainer.setAttribute('data-echonav-message-index', messageIndex);
            }
        } else {
            messageIndex = Date.now().toString();
        }
        
        // Step 1: Get key points from Summarizer API (now stored in background.js)
        let keyPoints;
        try {
            keyPoints = await generateKeyPointsFromAPI(responseText, messageIndex);
            console.log("EchoNav: Generated key points from API (stored in background.js):", keyPoints);
        } catch (error) {
            console.error("EchoNav: Error generating keypoints, using fallback:", error);
            keyPoints = generateKeyPointsFallback(responseText);
        }

        // Ensure keyPoints is valid (use empty array as last resort)
        if (!keyPoints || !Array.isArray(keyPoints) || keyPoints.length === 0) {
            console.warn("EchoNav: No valid keypoints, using simple fallback");
            keyPoints = ["Key point extraction unavailable"];
        }

        // Step 2: Visual keypoints insertion removed (inline summary card removed from UI)

        // Step 3: Store current response data for user options
        currentResponseData = {
            responseElement: responseElement,
            responseText: responseText,
            wordCount: wordCount,
            keyPoints: keyPoints
        };
        
        // Step 4: Set up keyboard handler for user options
        try {
        setupResponseOptionsKeyHandler();
        } catch (error) {
            console.error("EchoNav: Error setting up keyboard handler:", error);
        }

        // Step 5: Announce key points via VoiceOver (only if enabled)
        chrome.storage.local.get(['voiceOverOptimizationEnabled'], (result) => {
            if (result.voiceOverOptimizationEnabled !== false) {
                const finalAnnouncement = createCompletionAnnouncement(wordCount, keyPoints);
                console.log("EchoNav: Final announcement prepared:", finalAnnouncement);
                console.log("EchoNav: DEBUG - keyPoints:", keyPoints);
                console.log("EchoNav: DEBUG - wordCount:", wordCount);
                
                // Clear status and announce key points after a short delay
                setTimeout(() => {
                    // Clear previous announcement
                    announceToScreenReader('');
                    console.log("EchoNav: DEBUG - Cleared previous announcement");
                    
                    // Announce key points via our ARIA live region
                    // Increased delay to ensure VoiceOver registers the clear before new announcement
                    setTimeout(() => {
                        console.log("EchoNav: DEBUG - About to announce:", finalAnnouncement);
                        announceToScreenReader(finalAnnouncement);
                        console.log("EchoNav: ✅ Key points announced via VoiceOver");
                        console.log("EchoNav: User can now press Command+Shift+Y to read full answer or Command+Shift+E to navigate to outline");
                        
                        // Step 5.5: Insert outline header AFTER announcement (to avoid interfering with VoiceOver)
                        setTimeout(() => {
                            try {
                                insertImmediateOutlineHeader(responseElement, responseText, keyPoints, messageIndex);
                            } catch (error) {
                                console.error("EchoNav: Error inserting immediate outline header:", error);
                            }
                        }, 1000); // Wait 1 second after announcement to ensure it completes
                    }, 500);
                }, 800);
            } else {
                console.log("EchoNav: DEBUG - VoiceOver optimization is DISABLED");
                // If VoiceOver is disabled, still insert outline header but with minimal delay
                setTimeout(() => {
                    try {
                        insertImmediateOutlineHeader(responseElement, responseText, keyPoints, messageIndex);
                    } catch (error) {
                        console.error("EchoNav: Error inserting immediate outline header:", error);
                    }
                }, 500);
            }
        });
        
    } catch (error) {
        console.error("EchoNav: Error in VoiceOver optimization:", error);
    }
  }


  function createCompletionAnnouncement(wordCount, keyPoints) {
    const keyPointCount = keyPoints && keyPoints.length > 0 ? keyPoints.length : 0;
    let announcement = `EchoNav summarized ${keyPointCount} key points. `;
    
    // First read the key points
    if (keyPoints && keyPoints.length > 0) {
        keyPoints.forEach((point, index) => {
            const number = numberToEnglish(index + 1);
            announcement += `${number}, ${point}. `;
        });
    }
    
    // Then mention word count and options
    announcement += `The full AI response contains ${wordCount} words. Press Command+Shift+Y to read the full answer, or press Command+Shift+E to explore its structure in EchoNav. `;
    
    return announcement;
  }

  function numberToEnglish(num) {
    const englishNumbers = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
    return englishNumbers[num - 1] || `${num}th`;
  }

  async function generateKeyPointsFromAPI(text, messageIndex) {
    console.log("EchoNav: Calling background.js to generate and store key points");
    
    const conversationId = getConversationId();
    if (!conversationId) {
        console.warn("EchoNav: No conversation ID, using fallback");
        return generateKeyPointsFallback(text);
    }
    
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: "generateAndStoreKeyPoints",
                text: text,
                conversationId: conversationId,
                messageIndex: messageIndex
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        
        if (response && response.success && response.keyPoints) {
            console.log("EchoNav: Successfully received key points from background.js (already stored):", response.keyPoints);
            return response.keyPoints.slice(0, 3); // Ensure max 3 points
        } else if (response && response.useFallback) {
            console.warn("EchoNav: Background.js suggested fallback, using fallback");
            return generateKeyPointsFallback(text);
        } else {
            console.warn("EchoNav: No key points returned, using fallback");
            return generateKeyPointsFallback(text);
        }
        
    } catch (error) {
        console.error("EchoNav: Error calling background.js for keypoints:", error);
        return generateKeyPointsFallback(text);
    }
  }

  function generateKeyPointsFallback(text) {
    console.log("EchoNav: Using fallback key points generation");
    
    try {
        const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
        const keyPoints = [];
        
        for (let i = 0; i < Math.min(3, paragraphs.length); i++) {
            const paragraph = paragraphs[i].trim();
            let keyPoint = paragraph.split(/[.!?]/)[0];
            if (keyPoint.length > 80) {
                keyPoint = keyPoint.substring(0, 77) + '...';
            }
            keyPoints.push(keyPoint.trim());
        }
        
        console.log(`EchoNav: Generated ${keyPoints.length} fallback key points`);
        return keyPoints.slice(0, 3);
        
    } catch (error) {
        console.error("EchoNav: Error generating fallback key points:", error);
        return ["Unable to generate key points summary"];
    }
  }

  // ===== VISUAL KEYPOINTS INSERTION WITH PERSISTENCE =====
  
  // Helper function to get conversation ID from URL
  function getConversationId() {
    const url = window.location.href;
    // ChatGPT URL format: https://chatgpt.com/c/[conversation-id]
    const match = url.match(/\/c\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }
  
  // Storage helper functions removed - no longer needed without inline keypoints UI
  
  // ===== INLINE VISUAL KEYPOINTS FUNCTIONS REMOVED =====
  // The inline summary card (purple gradient with 3 keypoints) has been removed from the UI.
  // KeyPoints generation and storage are preserved for use in timeline cards.

  // ===== POST-KEYPOINTS USER OPTIONS =====
  
  function setupResponseOptionsKeyHandler() {
    console.log("EchoNav: DEBUG - setupResponseOptionsKeyHandler called");
    console.log("EchoNav: DEBUG - currentResponseData:", currentResponseData ? "exists" : "null");
    
    // Remove existing handler if any
    if (responseOptionsKeyHandler) {
        document.removeEventListener('keydown', responseOptionsKeyHandler);
        console.log("EchoNav: DEBUG - Removed previous keyboard handler");
    }
    
    // Create new handler with VoiceOver-compatible shortcuts
    responseOptionsKeyHandler = (event) => {
        // Only handle if we have current response data
        if (!currentResponseData) {
            // Don't log for every keypress, too noisy
            return;
        }
        
        // Improved input detection - ignore if user is typing in any editable element
        const target = event.target;
        if (target.tagName === 'INPUT' || 
            target.tagName === 'TEXTAREA' || 
            target.isContentEditable ||
            target.closest('[contenteditable="true"]') ||
            target.closest('textarea') ||
            target.closest('input')) {
            return;
        }
        
        // Check for VoiceOver modifier keys (Control + Option on macOS)
        const isVoiceOverModifier = event.ctrlKey && event.altKey;
        const key = event.key.toLowerCase();
        
        // This handler is now DEPRECATED - we use Chrome commands API instead
        // Keeping it here for backward compatibility during transition
        // The actual shortcuts are now Command+Shift+Y and Command+Shift+E
        // which are registered in manifest.json and handled by background.js
    };
    
    // Add listener
    document.addEventListener('keydown', responseOptionsKeyHandler);
    console.log("EchoNav: ✅ Keyboard handler set up for response options (Command+Shift+Y/E)");
  }
  
  function readFullAnswerArticle() {
    console.log("EchoNav: readFullAnswerArticle called");
    
    if (!currentResponseData) {
        console.warn("EchoNav: No current response data available");
        announceToScreenReader("No response available to read");
        return;
    }
    
    const { responseText, responseElement } = currentResponseData;
    console.log("EchoNav: Response element:", responseElement);
    
    // Find the article element that contains this response
    // According to ChatGPT structure: <article data-testid="conversation-turn-X" data-turn="assistant">
    let articleElement = null;
    if (responseElement) {
        // Try to find the closest article element
        articleElement = responseElement.closest('article[data-testid*="conversation-turn"]');
        
        // If not found, try alternative selectors
        if (!articleElement) {
            articleElement = responseElement.closest('article[data-turn="assistant"]');
        }
        
        // Fallback: use the responseElement itself
        if (!articleElement) {
            console.warn("EchoNav: Could not find article element, using responseElement as fallback");
            articleElement = responseElement;
        }
    }
    
    if (!articleElement) {
        console.warn("EchoNav: No article element found to read");
        announceToScreenReader("No content available to read");
        return;
    }
    
    console.log("EchoNav: Found article element:", articleElement.tagName, articleElement.getAttribute('data-testid'));
    
    // Announce that we're reading the full answer
    announceToScreenReader("Reading full ChatGPT answer");
    
    // Make article focusable if not already (KEY: tabindex="-1")
    if (!articleElement.hasAttribute('tabindex')) {
        articleElement.setAttribute('tabindex', '-1');
    }
    
    // Get full text content for better aria-label
    const fullText = articleElement.textContent || responseText;
    const preview = fullText.substring(0, 150).trim();
    articleElement.setAttribute('aria-label', `ChatGPT response: ${preview}...`);
    
    // Small delay before focusing to let announcement complete
    setTimeout(() => {
        // Initial focus
        articleElement.focus();
        console.log("EchoNav: Initial focus on article element");
        
        // CRITICAL FOR VOICEOVER: Repeat focus multiple times to ensure VoiceOver picks it up
        let focusCount = 0;
        const focusInterval = setInterval(() => {
            articleElement.focus();
            focusCount++;
            console.log(`EchoNav: Repeated focus attempt ${focusCount}`);
            
            if (focusCount >= 5) {
                clearInterval(focusInterval);
                console.log("EchoNav: ✅ Article focused, VoiceOver should now read it");
            }
        }, 10); // Repeat every 10ms for 50ms total
        
    }, 100); // Shorter delay for better responsiveness
  }
  
  function navigateToOutlineView() {
    if (!currentResponseData) {
        console.warn("EchoNav: No current response data available");
        announceToScreenReader("No response available to navigate");
        return;
    }
    
    // Announce navigation intent
    announceToScreenReader("Opening Conversation Outline. Navigate to the EchoNav sidepanel to explore the outline.");
    
    // Strategy: Open Chrome sidepanel with EchoNav outline
    setTimeout(() => {
        // Send message to background script to open sidepanel
        chrome.runtime.sendMessage({
            action: "openSidePanel"
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("EchoNav: Error opening sidepanel:", chrome.runtime.lastError.message);
                announceToScreenReader("Could not open outline view. Please click the EchoNav icon in the toolbar.");
        } else {
                console.log("EchoNav: Sidepanel open request sent");
            
                // After sidepanel opens, send message to focus on outline landmark
            setTimeout(() => {
                    chrome.runtime.sendMessage({
                        action: "focusOutlineLandmark"
                    }, (focusResponse) => {
                        if (chrome.runtime.lastError) {
                            console.warn("EchoNav: Could not send focus message:", chrome.runtime.lastError.message);
                        }
                    });
            }, 1000);
        
        // Announce completion
        setTimeout(() => {
                    announceToScreenReader("Outline view opened. Use VoiceOver to navigate to the EchoNav landmark, conversation outline region. Then use arrow keys to explore conversation structure.");
        }, 1500);
            }
        });
    }, 500);
  }

  // Start monitoring when content script loads
  setTimeout(() => {
    console.log("EchoNav: Starting response monitoring for VoiceOver optimization");
    startResponseMonitoring();
  }, 2000); // 2 second delay to avoid conflicts with page load

  // Function to immediately insert outline header when AI response completes
  function insertImmediateOutlineHeader(responseElement, responseText, keyPoints, messageIndex) {
    console.log("EchoNav: Inserting immediate outline header after AI response completion");
    
    // ⚠️ CRITICAL CHECK: Only insert header if plugin is enabled and visible
    if (!treeUIIframe || treeUIIframe.style.display === 'none') {
        console.log("EchoNav: Plugin is not active, skipping outline header insertion");
        return;
    }
    
    // Check if outline view is active - only insert if it is
    if (!isOutlineViewActive) {
        console.log("EchoNav: Outline view is not active, skipping outline header insertion");
        return;
    }
    
    try {
        // Find the user message that corresponds to this AI response
        const allMessageElements = Array.from(findMessageElements());
        const assistantIndex = allMessageElements.findIndex(el => el.contains(responseElement));
        
        if (assistantIndex <= 0) {
            console.warn("EchoNav: Could not find assistant message position for immediate outline header");
            return;
        }
        
        // Find the user message (should be before the assistant)
        let userElement = null;
        for (let i = assistantIndex - 1; i >= 0; i--) {
            const el = allMessageElements[i];
            if (el.getAttribute('data-message-author-role') === 'user' ||
                el.querySelector('[data-message-author-role="user"]')) {
                userElement = el;
                break;
            }
        }
        
        if (!userElement) {
            console.warn("EchoNav: Could not find user message for immediate outline header");
            return;
        }
        
        const userText = userElement.innerText || userElement.textContent || '';
        console.log("EchoNav: Found user message for immediate outline header:", userText.substring(0, 100));
        
        // Generate a temporary title from the user's question (first line, truncated)
        const tempTitle = userText.split('\n')[0].substring(0, 60) + (userText.length > 60 ? '...' : '');
        
        // Create a temporary item for the outline header
        const tempItem = {
            title: tempTitle,
            originalText: userText,
            assistantText: responseText,
            chatKeyPoints: keyPoints,
            assistantUniqueId: messageIndex,
            isTemporary: true // Mark as temporary so it can be updated later with proper title
        };
        
        console.log(`EchoNav: Creating immediate outline header with temp title: "${tempTitle}"`);
        
        // Find the containers to work with
        const userContainer = findTurnContainer(userElement);
        const assistantContainer = findTurnContainer(responseElement);
        
        if (!userContainer || !assistantContainer) {
            console.warn("EchoNav: Could not find containers for immediate outline header");
            return;
        }
        
        // Check if an outline header already exists for this turn
        const existingHeader = userContainer.previousElementSibling;
        if (existingHeader && existingHeader.classList.contains('echonav-outline-header')) {
            console.log("EchoNav: Outline header already exists, skipping immediate insertion");
            return;
        }
        
        // Create and insert the outline header immediately
        const outlineHeader = createOutlineHeader(tempItem, parseInt(messageIndex), true); // expanded by default
        
        // Insert before the user container
        if (userContainer.parentNode) {
            // Step 1: Add pre-insert class to set initial hidden state
            outlineHeader.classList.add('echonav-pre-insert');
            
            // Step 2: Insert into DOM (invisible at this point)
            userContainer.parentNode.insertBefore(outlineHeader, userContainer);
            
            // Store reference for potential later updates
            outlineHeader.setAttribute('data-echonav-temp-header', 'true');
            outlineHeader.setAttribute('data-echonav-message-index', messageIndex);
            
            // Step 3: Force a reflow to ensure pre-insert styles are applied
            void outlineHeader.offsetHeight;
            
            // Step 4: Use requestAnimationFrame to trigger animation on next frame
            requestAnimationFrame(() => {
                // Remove pre-insert and add inserting to trigger animation
                outlineHeader.classList.remove('echonav-pre-insert');
                outlineHeader.classList.add('echonav-inserting');
                
                // Add highlight to surrounding context
                if (userContainer) {
                    userContainer.classList.add('echonav-inserting-context');
                }
                if (assistantContainer) {
                    assistantContainer.classList.add('echonav-inserting-context');
                }
                
                console.log("EchoNav: ✅ Immediate outline header animation triggered");
            });
            
            // Step 5: Remove animation classes after animation completes
            setTimeout(() => {
                outlineHeader.classList.remove('echonav-inserting');
                if (userContainer) {
                    userContainer.classList.remove('echonav-inserting-context');
                }
                if (assistantContainer) {
                    assistantContainer.classList.remove('echonav-inserting-context');
                }
                console.log("EchoNav: Animation complete, classes removed");
            }, 1300); // 1.2s animation + 100ms buffer
            
            // Scroll to the new header (optional, may be distracting)
            // setTimeout(() => {
            //     outlineHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // }, 100);
        }
        
    } catch (error) {
        console.error("EchoNav: Error inserting immediate outline header:", error);
    }
  }
  
  // Helper function to find the turn container for a message element
  function findTurnContainer(messageElement) {
    let container = messageElement;
    
    // Look for common conversation turn containers
    while (container && container !== document.body) {
        const classList = container.classList;
        if (classList.contains('agent-turn') || 
            classList.contains('user-turn') ||
            classList.contains('conversation-turn') ||
            container.hasAttribute('data-testid') ||
            (classList.contains('group') && classList.contains('turn-messages'))) {
            return container;
        }
        container = container.parentElement;
    }
    
    // If no specific container found, use the message element itself
    return messageElement.parentElement || messageElement;
  }

