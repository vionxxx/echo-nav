console.log("EchoNav content script loaded successfully!");
console.log("EchoNav: Current URL:", window.location.href);
console.log("EchoNav: Document ready state:", document.readyState);
console.log("EchoNav: Content script version:", "1.0.0");

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
        console.log("EchoNav: Created ARIA live region for VoiceOver announcements");
    }
}

function announceToScreenReader(message) {
    createAriaLiveRegion();
    
    if (ariaLiveRegion) {
        // Clear previous message
        ariaLiveRegion.textContent = '';
        
        // Set new message with small delay to ensure screen reader picks it up
        setTimeout(() => {
            ariaLiveRegion.textContent = message;
            console.log("EchoNav: Announced to screen reader:", message);
        }, 100);
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
        }
    return true; // Keep the message channel open for async response
  });

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

  function enterOutlineView(outlineItems) {
    if (isOutlineViewActive) {
      console.log("EchoNav: Outline view already active");
      return;
    }

    console.log("EchoNav: Entering outline view mode with", outlineItems.length, "items");
    
    // Add body class to hide inline keypoints during fullscreen
    document.body.classList.add('echonav-fullscreen-active');
      
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
        
        // Store original elements
        originalConversationElements.set(index, {
          elements: allTurnElements,
          originalDisplays: allTurnElements.map(el => el.style.display || 'block')
        });
        
        // Hide all elements in this turn (including the latest turn)
        allTurnElements.forEach((element, i) => {
          console.log(`EchoNav: Hiding element ${i} for turn ${index}:`, element);
          element.style.display = 'none';
        });
        
        // Create and inject outline header before the first container
        const outlineHeader = createOutlineHeader(item, index, false); // Always treat as not last item for consistent behavior
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
    
    // Restore all original conversation elements
    originalConversationElements.forEach((data, index) => {
      if (data.elements && data.originalDisplays) {
        data.elements.forEach((element, i) => {
          if (element && data.originalDisplays[i]) {
            element.style.display = data.originalDisplays[i];
          }
        });
      }
    });
    originalConversationElements.clear();
    
    // Remove outline view styles
    removeOutlineViewStyles();
    
    isOutlineViewActive = false;
    console.log("EchoNav: Outline view mode deactivated");
    
    // Remove body class to show inline keypoints again
    document.body.classList.remove('echonav-fullscreen-active');
    
    removeFloatingButton(); // Also remove floating button on exit
  }

  // --- Floating Button Fullscreen Mode ---

  let floatingContainer = null;

  function enterFullscreenWithFloatingButton(outlineItems) {
      if (isOutlineViewActive) return;

      // Hide iframe
    if (treeUIIframe) {
        treeUIIframe.style.display = 'none';
    }

    // Remove margin from main content when entering fullscreen
    const mainContainer = document.querySelector('main')?.parentElement;
    if (mainContainer) {
        mainContainer.style.marginRight = '0px';
    }

    enterOutlineView(outlineItems);
      createFloatingButton();
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
      exitOutlineView();
      // Show iframe instead of sending message
      if (treeUIIframe) {
          treeUIIframe.style.display = 'block';
      }
      
      // Restore margin to main content when exiting fullscreen
      const mainContainer = document.querySelector('main')?.parentElement;
      if (mainContainer) {
          mainContainer.style.marginRight = '380px';
      }
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

  function createOutlineHeader(item, index, isLastItem) {
    const header = document.createElement('div');
    header.className = 'echonav-outline-header';
    header.dataset.index = index;
    
    const isExpanded = isLastItem; // Latest item is expanded by default
    
    // Check if keypoints should be shown
    chrome.storage.local.get(['showKeypointsInFullscreen'], (result) => {
      const showKeypoints = result.showKeypointsInFullscreen !== false; // Default to true
      
      let keypointsHtml = '';
      if (showKeypoints && item.parsedKeyPoints && item.parsedKeyPoints.length > 0) {
        keypointsHtml = `
          <div class="echonav-outline-keypoints">
            ${item.parsedKeyPoints.map(kp => `<div class="echonav-keypoint">• ${kp.point}</div>`).join('')}
          </div>
        `;
      }
      
      header.innerHTML = `
        <div class="echonav-outline-content">
          <div class="echonav-outline-number">${index + 1}</div>
          <div class="echonav-outline-title">${item.title}</div>
          <div class="echonav-outline-toggle"></div>
        </div>
        ${keypointsHtml}
      `;
    });
    
    // Add click event listener
    header.addEventListener('click', () => {
      toggleConversationElement(index, header);
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
        console.log(`EchoNav: Expanded turn ${index} with ${originalData.elements.length} elements`);
      } else {
        // Hide all elements in this turn
        originalData.elements.forEach((element, i) => {
          element.style.display = 'none';
        });
        header.classList.remove('expanded');
        toggleIcon.classList.remove('expanded');
        console.log(`EchoNav: Collapsed turn ${index} with ${originalData.elements.length} elements`);
      }
    }
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
      }

      .echonav-outline-header:hover {
        background: #f0f0f0;
        border-color: #d0d0d0;
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
                            console.log("EchoNav: New AI response detected, monitoring for completion");
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
    console.log("EchoNav: Monitoring response element for completion");
    
    let completionCheckTimer = null;
    let lastTextLength = 0;
    let stableCount = 0;
    
    function checkCompletion() {
        try {
            const currentText = responseElement.innerText || responseElement.textContent || '';
            const currentLength = currentText.length;
            
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
        return;
    }
    
    console.log("EchoNav: Response meets threshold (>=200 words), proceeding with VoiceOver optimization");

    try {
        // Step 1: Disable ChatGPT's aria-live regions to prevent native VoiceOver
        const chatGPTAriaLive = document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"]');
        const originalAriaLiveValues = [];
        chatGPTAriaLive.forEach((el, index) => {
            if (el.id !== 'echonav-aria-live') {
                originalAriaLiveValues[index] = el.getAttribute('aria-live');
                el.setAttribute('aria-live', 'off');
                el.setAttribute('aria-hidden', 'true');
            }
        });
        console.log(`EchoNav: ✅ Disabled ${chatGPTAriaLive.length} ChatGPT aria-live regions`);
        
        // Step 2: Announce status to user
        const statusAnnouncement = `EchoNav is summarizing`;
        announceToScreenReader(statusAnnouncement);
        console.log("EchoNav: ✅ Announced status via VoiceOver");

        // Step 3: Get key points from Summarizer API
        const keyPoints = await generateKeyPointsFromAPI(responseText);
        console.log("EchoNav: Generated key points from API:", keyPoints);

        // Step 4: Insert visual keypoints in ChatGPT interface (with persistence)
        insertVisualKeyPoints(responseElement, keyPoints);

        // Step 5: Store current response data for user options
        currentResponseData = {
            responseElement: responseElement,
            responseText: responseText,
            wordCount: wordCount,
            keyPoints: keyPoints
        };
        
        // Step 6: Set up keyboard handler for user options
        setupResponseOptionsKeyHandler();

        // Step 7: Announce key points via VoiceOver (only if enabled)
        chrome.storage.local.get(['voiceOverOptimizationEnabled'], (result) => {
            if (result.voiceOverOptimizationEnabled !== false) {
                const finalAnnouncement = createCompletionAnnouncement(wordCount, keyPoints);
                console.log("EchoNav: Final announcement prepared:", finalAnnouncement);
                
                // Clear status and announce key points after a short delay
                setTimeout(() => {
                    // Clear previous announcement
                    announceToScreenReader('');
                    
                    // Announce key points via our ARIA live region
                    setTimeout(() => {
                        announceToScreenReader(finalAnnouncement);
                        console.log("EchoNav: ✅ Key points announced via VoiceOver");
                        console.log("EchoNav: User can now press VO+R to read full answer or VO+T to navigate to timeline");
                    }, 200);
                }, 800);
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
    announcement += `Press VO+R to read the full answer, or press VO+T to navigate to timeline view for this turn. `;
    
    return announcement;
  }

  function numberToEnglish(num) {
    const englishNumbers = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
    return englishNumbers[num - 1] || `${num}th`;
  }

  async function generateKeyPointsFromAPI(text) {
    console.log("EchoNav: Calling SummarizerAPI for key points generation");
    
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: "callSummarizerAPI",
                text: text,
                requestType: "keypoints"
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        
        if (response && response.success && response.keyPoints) {
            console.log("EchoNav: Successfully received key points from SummarizerAPI:", response.keyPoints);
            return response.keyPoints.slice(0, 3); // Ensure max 3 points
        } else {
            console.warn("EchoNav: SummarizerAPI returned no key points, using fallback");
            return generateKeyPointsFallback(text);
        }
        
    } catch (error) {
        console.error("EchoNav: Error calling SummarizerAPI:", error);
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
  
  function insertVisualKeyPoints(responseElement, keyPoints) {
    console.log("EchoNav: Inserting visual keypoints in ChatGPT interface");
    
    if (!keyPoints || keyPoints.length === 0) {
        console.warn("EchoNav: No keypoints to insert");
        return;
    }
    
    // Ensure we have exactly 3 keypoints
    const displayKeyPoints = keyPoints.slice(0, 3);
    
    // Find the message container for persistence
    let messageContainer = responseElement;
    while (messageContainer && messageContainer !== document.body) {
        const hasMessageRole = messageContainer.hasAttribute('data-message-author-role');
        if (hasMessageRole && messageContainer.getAttribute('data-message-author-role') === 'assistant') {
            break;
        }
        messageContainer = messageContainer.parentElement;
    }
    
    if (!messageContainer || messageContainer === document.body) {
        console.warn("EchoNav: Could not find message container for persistence");
        messageContainer = responseElement.parentElement;
    }
    
    // Check if keypoints already exist for this response (prevent duplicates)
    const existingKeyPoints = messageContainer.nextElementSibling?.classList.contains('echonav-inline-keypoints');
    if (existingKeyPoints) {
        console.log("EchoNav: Keypoints already exist for this response, skipping insertion");
        return;
    }
    
    // Store keypoints in message container for persistence
    messageContainer.setAttribute('data-echonav-has-keypoints', 'true');
    messageContainer.setAttribute('data-echonav-keypoints', JSON.stringify(displayKeyPoints));
    
    // Create and insert keypoints UI
    createKeyPointsUI(messageContainer, displayKeyPoints);
  }
  
  function createKeyPointsUI(messageContainer, keyPoints) {
    // Create keypoints container (matching fullscreen mode style, but wider)
    const keyPointsContainer = document.createElement('div');
    keyPointsContainer.className = 'echonav-inline-keypoints';
    keyPointsContainer.setAttribute('role', 'complementary');
    keyPointsContainer.setAttribute('aria-label', 'EchoNav Key Points Summary');
    
    // Add header
    const header = document.createElement('div');
    header.className = 'echonav-inline-keypoints-header';
    header.innerHTML = '<span class="echonav-logo">🔷</span><span class="echonav-header-text">EchoNav Summary</span>';
    keyPointsContainer.appendChild(header);
    
    // Add each keypoint
    keyPoints.forEach((keyPoint, index) => {
        const keyPointDiv = document.createElement('div');
        keyPointDiv.className = 'echonav-inline-keypoint';
        keyPointDiv.setAttribute('role', 'listitem');
        
        // Add bullet point marker
        const bullet = document.createElement('span');
        bullet.className = 'echonav-keypoint-bullet';
        bullet.textContent = '•';
        bullet.setAttribute('aria-hidden', 'true');
        
        // Add keypoint text
        const text = document.createElement('span');
        text.className = 'echonav-keypoint-text';
        text.textContent = keyPoint;
        
        keyPointDiv.appendChild(bullet);
        keyPointDiv.appendChild(text);
        keyPointsContainer.appendChild(keyPointDiv);
        
        console.log(`EchoNav: Added visual keypoint ${index + 1}: "${keyPoint}"`);
    });
    
    // Insert after the message container
    if (messageContainer && messageContainer.parentElement) {
        messageContainer.parentElement.insertBefore(keyPointsContainer, messageContainer.nextSibling);
        console.log("EchoNav: ✅ Visual keypoints inserted successfully");
        
        // Add styles if not already added
        addInlineKeyPointsStyles();
    }
  }
  
  function addInlineKeyPointsStyles() {
    // Check if styles already exist
    if (document.getElementById('echonav-inline-keypoints-styles')) {
        return;
    }
    
    const styles = document.createElement('style');
    styles.id = 'echonav-inline-keypoints-styles';
    styles.textContent = `
        /* EchoNav Inline KeyPoints Styles - Full Width */
        .echonav-inline-keypoints {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            padding: 20px 24px;
            margin: 20px 0;
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .echonav-inline-keypoints-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .echonav-logo {
            font-size: 20px;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }
        
        .echonav-header-text {
            font-size: 15px;
            font-weight: 600;
            color: white;
            letter-spacing: 0.5px;
        }
        
        .echonav-inline-keypoint {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin: 12px 0;
            padding-left: 4px;
        }
        
        .echonav-keypoint-bullet {
            color: white;
            font-size: 20px;
            font-weight: bold;
            line-height: 1.5;
            flex-shrink: 0;
            margin-top: -2px;
        }
        
        .echonav-keypoint-text {
            color: white;
            font-size: 15px;
            line-height: 1.6;
            flex: 1;
        }
        
        /* Hide when in fullscreen mode */
        body.echonav-fullscreen-active .echonav-inline-keypoints {
            display: none;
        }
        
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            .echonav-inline-keypoints {
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
            }
        }
        
        /* Responsive adjustments */
        @media (max-width: 768px) {
            .echonav-inline-keypoints {
                padding: 16px 18px;
                margin: 16px 0;
            }
            
            .echonav-inline-keypoint {
                gap: 10px;
            }
        }
    `;
    
    document.head.appendChild(styles);
    console.log("EchoNav: ✅ Inline keypoints styles added");
  }
  
  // Restore keypoints on page load (for persistence after switching conversations)
  function restoreInlineKeyPoints() {
    console.log("EchoNav: 🔄 Restoring inline keypoints from DOM persistence");
    
    // Find all assistant messages that have keypoints data but no visual UI
    const messagesWithKeyPoints = document.querySelectorAll('[data-echonav-has-keypoints="true"]');
    console.log(`EchoNav: Found ${messagesWithKeyPoints.length} messages with stored keypoints data`);
    
    if (messagesWithKeyPoints.length === 0) {
        console.log("EchoNav: No messages with keypoints data found");
        return;
    }
    
    let restoredCount = 0;
    let alreadyExistsCount = 0;
    
    messagesWithKeyPoints.forEach((messageContainer, index) => {
        // Check if keypoints UI already exists
        const nextElement = messageContainer.nextElementSibling;
        if (nextElement && nextElement.classList.contains('echonav-inline-keypoints')) {
            console.log(`EchoNav: Message ${index + 1}: Keypoints UI already exists ✓`);
            alreadyExistsCount++;
            return;
        }
        
        try {
            const keyPointsData = messageContainer.getAttribute('data-echonav-keypoints');
            if (keyPointsData) {
                const keyPoints = JSON.parse(keyPointsData);
                console.log(`EchoNav: Message ${index + 1}: Restoring ${keyPoints.length} keypoints...`);
                createKeyPointsUI(messageContainer, keyPoints);
                restoredCount++;
                console.log(`EchoNav: Message ${index + 1}: ✅ Restored successfully`);
            } else {
                console.warn(`EchoNav: Message ${index + 1}: Has marker but no keypoints data`);
            }
        } catch (error) {
            console.error(`EchoNav: Message ${index + 1}: Error restoring keypoints:`, error);
        }
    });
    
    console.log(`EchoNav: 📊 Restoration summary: ${restoredCount} restored, ${alreadyExistsCount} already existed, ${messagesWithKeyPoints.length} total`);
  }

  // ===== POST-KEYPOINTS USER OPTIONS =====
  
  function setupResponseOptionsKeyHandler() {
    // Remove existing handler if any
    if (responseOptionsKeyHandler) {
        document.removeEventListener('keydown', responseOptionsKeyHandler);
    }
    
    // Create new handler with VoiceOver-compatible shortcuts
    responseOptionsKeyHandler = (event) => {
        // Only handle if we have current response data
        if (!currentResponseData) return;
        
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
        
        if (isVoiceOverModifier && key === 'r') {
            // VO+R: Read full answer
            event.preventDefault();
            event.stopPropagation();
            console.log("EchoNav: User pressed VO+R - reading full answer");
            readFullAnswer();
        } else if (isVoiceOverModifier && key === 't') {
            // VO+T: Navigate to timeline view
            event.preventDefault();
            event.stopPropagation();
            console.log("EchoNav: User pressed VO+T - navigating to timeline view");
            navigateToTimelineView();
        }
    };
    
    // Add listener
    document.addEventListener('keydown', responseOptionsKeyHandler);
    console.log("EchoNav: Keyboard handler set up for response options (VO+R/VO+T)");
  }
  
  function readFullAnswer() {
    if (!currentResponseData) {
        console.warn("EchoNav: No current response data available");
        announceToScreenReader("No response available to read");
        return;
    }
    
    const { responseText, responseElement } = currentResponseData;
    
    // Announce that we're reading the full answer
    announceToScreenReader("Reading full answer. Press Escape to stop.");
    
    // Focus on the response element for VoiceOver to read
    if (responseElement) {
        // Make element focusable if not already
        if (!responseElement.hasAttribute('tabindex')) {
            responseElement.setAttribute('tabindex', '-1');
        }
        
        // Add aria-label for better screen reader support
        responseElement.setAttribute('aria-label', `Full ChatGPT response: ${responseText.substring(0, 100)}...`);
        
        // Small delay before focusing to let announcement complete
        setTimeout(() => {
            responseElement.focus();
            console.log("EchoNav: Focused on response element for VoiceOver to read");
            
            // Optional: Use Web Speech API as a backup for reading
            // This gives users TTS control even if VoiceOver reading doesn't work as expected
            setTimeout(() => {
                const utterance = new SpeechSynthesisUtterance(responseText);
                utterance.rate = 0.9; // Slightly slower for comprehension
                utterance.lang = 'en-US';
                
                utterance.onstart = () => {
                    console.log("EchoNav: Started reading full answer via TTS");
                };
                
                utterance.onend = () => {
                    console.log("EchoNav: Finished reading full answer");
                    announceToScreenReader("Finished reading full answer. Press VO+R to read again, or VO+T to navigate to timeline.");
                };
                
                utterance.onerror = (error) => {
                    console.error("EchoNav: TTS error:", error);
                };
                
                // Optional: Only use TTS if explicitly requested
                // For now, relying on VoiceOver focus is the primary method
                // speechSynthesis.speak(utterance);
                
            }, 1000);
        }, 500);
    }
  }
  
  function navigateToTimelineView() {
    if (!currentResponseData) {
        console.warn("EchoNav: No current response data available");
        announceToScreenReader("No response available to navigate");
        return;
    }
    
    // Announce navigation intent
    announceToScreenReader("Opening Timeline View. You can navigate the conversation structure using arrow keys.");
    
    // Strategy: Open/show the sidepanel iframe and trigger outline generation if needed
    setTimeout(() => {
        // Option 1: If iframe exists, show it and send message to focus on latest turn
        if (treeUIIframe) {
            // Show iframe if hidden
            if (treeUIIframe.style.display === 'none') {
                treeUIIframe.style.display = 'block';
                
                // Adjust main container margin
                const mainContainer = document.querySelector('main')?.parentElement;
                if (mainContainer) {
                    mainContainer.style.marginRight = '380px';
                }
            }
            
            // Send message to iframe to focus on the latest timeline item
            try {
                treeUIIframe.contentWindow.postMessage({
                    action: 'focusLatestTimelineItem'
                }, '*');
                console.log("EchoNav: Sent message to iframe to focus latest timeline item");
            } catch (error) {
                console.error("EchoNav: Error sending message to iframe:", error);
            }
            
        } else {
            // Option 2: Create iframe if it doesn't exist
            console.log("EchoNav: Creating iframe for timeline navigation");
            toggleEchoNavUI();
            
            // Wait for iframe to load, then send focus message
            setTimeout(() => {
                if (treeUIIframe && treeUIIframe.contentWindow) {
                    try {
                        treeUIIframe.contentWindow.postMessage({
                            action: 'focusLatestTimelineItem'
                        }, '*');
                    } catch (error) {
                        console.error("EchoNav: Error sending message to iframe:", error);
                    }
                }
            }, 1000);
        }
        
        // Announce completion
        setTimeout(() => {
            announceToScreenReader("Timeline View opened. Use Tab to navigate to the panel, then use arrow keys to explore conversation turns.");
        }, 1500);
        
    }, 500);
  }

  // Start monitoring when content script loads
  // Note: Monitoring runs always to insert visual keypoints, not just for VoiceOver
  setTimeout(() => {
    console.log("EchoNav: Starting response monitoring for visual keypoints and VoiceOver optimization");
    startResponseMonitoring();
    
    // Restore keypoints on page load
    restoreInlineKeyPoints();
    
    // Set up MutationObserver to restore keypoints when navigating between conversations
    const conversationObserver = new MutationObserver((mutations) => {
        // Check for any DOM changes that might indicate conversation switch
        mutations.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    // Check if new assistant messages were added
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const hasKeypoints = node.hasAttribute && node.hasAttribute('data-echonav-has-keypoints');
                        const containsKeypoints = node.querySelector && node.querySelector('[data-echonav-has-keypoints]');
                        
                        if (hasKeypoints || containsKeypoints) {
                            console.log("EchoNav: Detected messages with keypoints data via MutationObserver");
                            setTimeout(() => restoreInlineKeyPoints(), 300);
                        }
                    }
                });
            }
        });
    });
    
    // Observe the main content area for changes
    const mainContent = document.querySelector('main') || document.body;
    conversationObserver.observe(mainContent, {
        childList: true,
        subtree: true
    });
    
    console.log("EchoNav: ✅ Keypoints restoration observer initialized");
    
    // Set up periodic check as fallback (every 3 seconds)
    let lastUrl = window.location.href;
    setInterval(() => {
        const currentUrl = window.location.href;
        
        // Check if URL changed (conversation switched)
        if (currentUrl !== lastUrl) {
            console.log("EchoNav: URL changed, restoring keypoints");
            lastUrl = currentUrl;
            setTimeout(() => restoreInlineKeyPoints(), 500);
        } else {
            // Even if URL didn't change, check for missing keypoints UI
            const messagesWithData = document.querySelectorAll('[data-echonav-has-keypoints="true"]');
            if (messagesWithData.length > 0) {
                // Check if any are missing UI
                let needsRestore = false;
                messagesWithData.forEach(msg => {
                    const nextElement = msg.nextElementSibling;
                    if (!nextElement || !nextElement.classList.contains('echonav-inline-keypoints')) {
                        needsRestore = true;
                    }
                });
                
                if (needsRestore) {
                    console.log("EchoNav: Periodic check detected missing keypoints UI, restoring");
                    restoreInlineKeyPoints();
                }
            }
        }
    }, 3000); // Check every 3 seconds
    
    console.log("EchoNav: ✅ Periodic restoration check initialized (every 3s)");
  }, 2000); // 2 second delay to avoid conflicts with page load

