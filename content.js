console.log("EchoNav content script loaded successfully!");
console.log("EchoNav: Current URL:", window.location.href);
console.log("EchoNav: Document ready state:", document.readyState);
console.log("EchoNav: Content script version:", "1.0.0");

// Clean up any leftover temporary outline headers from previous sessions
setTimeout(() => {
    const staleHeaders = document.querySelectorAll('.echonav-outline-header[data-echonav-temp-header="true"]');
    staleHeaders.forEach(header => {
        if (header.parentNode) {
            header.parentNode.removeChild(header);
        }
    });
    if (staleHeaders.length > 0) {
        console.log(`EchoNav: Cleaned up ${staleHeaders.length} stale temporary outline headers on page load`);
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
        }
    return true; // Keep the message channel open for async response
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
            landmarkContainer.setAttribute('role', 'region');
            landmarkContainer.setAttribute('aria-label', roundTitle);
            if (srHeading) {
              // Store original heading tag name for restoration
              const originalTag = srHeading.tagName.toLowerCase();
              landmarkContainer.setAttribute('data-echonav-original-heading-tag', originalTag);
              
              // Change to h1 for highest heading hierarchy in VoiceOver Rotor
              const newHeading = document.createElement('h1');
              newHeading.className = 'sr-only';
              newHeading.textContent = roundTitle;
              
              // Replace the old heading with new h1
              srHeading.parentNode.replaceChild(newHeading, srHeading);
              
              // Store reference to new heading for later restoration
              landmarkContainer.setAttribute('data-echonav-replaced-heading', 'true');
            }
            console.log(`EchoNav: Set user question landmark for turn ${index} as h1:`, roundTitle);
          } else if (containerIndex === 1) {
            // Second landmark: ChatGPT's response - override "ChatGPT said: article"
            // Count words in AI response
            const responseText = landmarkContainer.innerText || landmarkContainer.textContent || '';
            const wordCount = responseText.trim().split(/\s+/).filter(word => word.length > 0).length;
            
            const aiResponseLabel = `AI Response for Round ${index + 1}, ${wordCount} words in total`;
            landmarkContainer.setAttribute('role', 'region');
            landmarkContainer.setAttribute('aria-label', aiResponseLabel);
            if (srHeading) {
              // Hide from Rotor Headings but keep for Landmarks
              srHeading.setAttribute('aria-hidden', 'true');
              srHeading.textContent = aiResponseLabel;
            }
            console.log(`EchoNav: Set AI response landmark for turn ${index}:`, aiResponseLabel);
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
              
              // Step 3: Remove remaining emoji and special characters
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
        
        // Store original elements and landmark containers for restoration
        originalConversationElements.set(index, {
          elements: allTurnElements,
          originalDisplays: allTurnElements.map(el => el.style.display || 'block'),
          containers: containersArray,
          landmarkContainers: landmarkArray
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
        if (firstContainer && firstContainer.parentNode) {
          firstContainer.parentNode.insertBefore(outlineHeader, firstContainer);
        } else {
          startElement.parentNode.insertBefore(outlineHeader, startElement);
        }
        outlineHeaders.set(index, outlineHeader);
        console.log(`EchoNav: Injected outline header for turn ${index}`);
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
            
            // Restore sr-only heading text and tag
            if (landmarkContainer.hasAttribute('data-echonav-replaced-heading')) {
              // We replaced the heading with h1, need to restore original tag
              const currentHeading = landmarkContainer.querySelector('h1.sr-only');
              const originalTag = landmarkContainer.getAttribute('data-echonav-original-heading-tag') || 'h5';
              
              if (currentHeading && originalHeadingText) {
                const restoredHeading = document.createElement(originalTag);
                restoredHeading.className = 'sr-only';
                restoredHeading.textContent = originalHeadingText;
                currentHeading.parentNode.replaceChild(restoredHeading, currentHeading);
              }
              
              landmarkContainer.removeAttribute('data-echonav-replaced-heading');
              landmarkContainer.removeAttribute('data-echonav-original-heading-tag');
            } else {
              // Normal restoration for headings we didn't replace
              const srHeading = landmarkContainer.querySelector('h5.sr-only, h6.sr-only');
              if (srHeading && originalHeadingText) {
                srHeading.textContent = originalHeadingText;
                srHeading.removeAttribute('aria-hidden');
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
    
    // Remove outline view styles
    removeOutlineViewStyles();
    
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

    // Note: We don't call enterOutlineView here anymore - it's auto-enabled when Timeline has content
    createFloatingButton();
    
    // In Fullscreen mode, collapse all turns
    if (isOutlineViewActive) {
      collapseAllTurns();
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
      
      // Show iframe
      if (treeUIIframe) {
          treeUIIframe.style.display = 'block';
      }
      
      // Restore margin to main content when exiting fullscreen
      const mainContainer = document.querySelector('main')?.parentElement;
      if (mainContainer) {
          mainContainer.style.marginRight = '380px';
      }
      
      // When exiting Fullscreen, expand all turns (back to default state)
      if (isOutlineViewActive) {
          expandAllTurns();
      }
      
      // Note: We don't call exitOutlineView here anymore - outline view stays active
  }

  function closePlugin() {
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
    
    // Set initial expansion state
    if (isExpanded) {
      header.classList.add('expanded');
    }
    
    // Add ARIA attributes for accessibility
    const roundTitle = `Round ${index + 1}: ${item.title}`;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-label', `${roundTitle}, ${isExpanded ? 'expanded' : 'collapsed'}, click to ${isExpanded ? 'collapse' : 'expand'}`);
    header.setAttribute('aria-expanded', isExpanded.toString());
    header.setAttribute('tabindex', '0');
    
    // Build keypoints HTML synchronously (no async storage calls)
    let keypointsHtml = '';
    
    // Prioritize chatKeyPoints (from ChatGPT interface generation)
    if (item.chatKeyPoints && item.chatKeyPoints.length > 0) {
      console.log(`EchoNav: Using chatKeyPoints for outline header ${index}:`, item.chatKeyPoints);
      keypointsHtml = `
        <div class="echonav-outline-keypoints" role="list" aria-label="Key points summary">
          ${item.chatKeyPoints.map(kp => `<div class="echonav-keypoint" role="listitem">• ${kp}</div>`).join('')}
        </div>
      `;
    } else if (item.parsedKeyPoints && item.parsedKeyPoints.length > 0) {
      // Fallback to parsedKeyPoints (structured keypoints from outline generation)
      console.log(`EchoNav: Using parsedKeyPoints for outline header ${index}:`, item.parsedKeyPoints);
      keypointsHtml = `
        <div class="echonav-outline-keypoints" role="list" aria-label="Key points">
          ${item.parsedKeyPoints.map(kp => `<div class="echonav-keypoint" role="listitem">• ${kp.point}</div>`).join('')}
        </div>
      `;
    }
    
    // Set HTML content synchronously
    header.innerHTML = `
      <div class="echonav-outline-content">
        <div class="echonav-outline-number" aria-hidden="true">${index + 1}</div>
        <div class="echonav-outline-title" id="echonav-round-title-${index}">${item.title}</div>
        <div class="echonav-outline-toggle ${isExpanded ? 'expanded' : ''}" aria-hidden="true"></div>
      </div>
      ${keypointsHtml}
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
        header.classList.add('expanded');
        toggleIcon.classList.add('expanded');
        
        // Update ARIA attributes for expanded state
        header.setAttribute('aria-expanded', 'true');
        const currentLabel = header.getAttribute('aria-label');
        if (currentLabel) {
          header.setAttribute('aria-label', currentLabel.replace('collapsed', 'expanded').replace('expand', 'collapse'));
        }
        
        console.log(`EchoNav: Expanded turn ${index} with ${originalData.elements.length} elements`);
      } else {
        // Hide all elements in this turn
        originalData.elements.forEach((element, i) => {
          element.style.display = 'none';
        });
        header.classList.remove('expanded');
        toggleIcon.classList.remove('expanded');
        
        // Update ARIA attributes for collapsed state
        header.setAttribute('aria-expanded', 'false');
        const currentLabel = header.getAttribute('aria-label');
        if (currentLabel) {
          header.setAttribute('aria-label', currentLabel.replace('expanded', 'collapsed').replace('collapse', 'expand'));
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
          header.classList.remove('expanded');
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
          header.classList.add('expanded');
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

  function addOutlineViewStyles() {
    if (document.getElementById('echonav-outline-view-styles')) {
      return;
    }

    const styles = document.createElement('style');
    styles.id = 'echonav-outline-view-styles';
    styles.textContent = `
      .echonav-outline-header {
        background: #f7f7f8;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        margin: 12px 72px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: calc(100vw - 48px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        outline: none;
      }

      .echonav-outline-header:hover {
        background: #f0f0f0;
        border-color: #d0d0d0;
      }
      
      .echonav-outline-header:focus {
        outline: 3px solid #2563eb;
        outline-offset: 2px;
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
      }

      .echonav-outline-header.expanded {
        background: #e8f4fd;
        border-color: #b3d9ff;
      }

      .echonav-outline-content {
        display: flex;
        align-items: center;
        padding: 12px 16px;
        gap: 12px;
      }

      .echonav-outline-number {
        background: #2563eb;
        color: white;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
        flex-shrink: 0;
      }

      .echonav-outline-title {
        flex: 1;
        font-size: 16px;
        font-weight: 500;
        color: #374151;
        line-height: 1.4;
      }

      .echonav-outline-toggle {
        font-size: 14px;
        color: #6b7280;
        flex-shrink: 0;
        transition: transform 0.2s ease;
        position: relative;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        cursor: pointer;
      }

      .echonav-outline-toggle::before {
        content: '';
        position: absolute;
        width: 6px;
        height: 6px;
        border-right: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        transform: translate(-50%, -50%) rotate(-45deg);
        transition: transform 0.2s ease;
        top: 50%;
        left: 50%;
      }

      .echonav-outline-toggle.expanded::before {
        transform: translate(-50%, -50%) rotate(45deg);
      }

      .echonav-outline-toggle:hover {
        background-color: rgba(37, 99, 235, 0.1);
        color: #2563eb;
      }

      .echonav-outline-keypoints {
        margin-top: 8px;
        padding-left: 36px;
      }

      .echonav-keypoint {
        font-size: 14px;
        color: #e2e8f0;
        margin: 2px 0;
        margin-bottom: 1rem;
        line-height: 1.3;
      }

      /* Dark theme support */
      @media (prefers-color-scheme: dark) {
        .echonav-outline-header {
          background: #2d2d2d;
          border-color: #404040;
        }

        .echonav-outline-header:hover {
          background: #3a3a3a;
          border-color: #505050;
        }

        .echonav-outline-header.expanded {
          background: #1e3a5f;
          border-color: #2563eb;
        }

        .echonav-outline-title {
          color: #e5e5e5;
        }

        .echonav-outline-toggle {
          color: #9ca3af;
        }

        .echonav-outline-toggle:hover {
          background-color: rgba(37, 99, 235, 0.1);
          color: #2563eb;
        }

        .echonav-keypoint {
          color: #e2e8f0;
        }
      }
    `;

    document.head.appendChild(styles);
  }

  function removeOutlineViewStyles() {
    const styles = document.getElementById('echonav-outline-view-styles');
    if (styles) {
      styles.remove();
    }
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
    let announcement = `ChatGPT generated ${wordCount} words. EchoNav summarized ${keyPointCount} key points. `;
    
    if (keyPoints && keyPoints.length > 0) {
        keyPoints.forEach((point, index) => {
            const number = numberToEnglish(index + 1);
            announcement += `${number}, ${point}. `;
        });
    }
    
    // Add options prompt after keypoints
    announcement += `Press Command+Shift+Y to read the full answer, or press Command+Shift+E to navigate to outline view. `;
    
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
            userContainer.parentNode.insertBefore(outlineHeader, userContainer);
            console.log("EchoNav: ✅ Immediate outline header inserted successfully");
            
            // Store reference for potential later updates
            outlineHeader.setAttribute('data-echonav-temp-header', 'true');
            outlineHeader.setAttribute('data-echonav-message-index', messageIndex);
            
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

