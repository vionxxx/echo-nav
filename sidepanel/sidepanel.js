document.addEventListener('DOMContentLoaded', () => {
    const outlineDiv = document.getElementById('outline');
    const generateButton = document.getElementById('generate-button');
        const retryButton = document.getElementById('retry-button');
        const welcomeMessage = document.getElementById('welcome-message');
        const newConversationMessage = document.getElementById('new-conversation-message');
        const errorMessage = document.getElementById('error-message');
        const errorText = errorMessage.querySelector('.error-text');
        const autoUpdateToggle = document.getElementById('auto-update-toggle');
    const generateInsightButton = document.getElementById('generate-logical-button');
    const logicalContent = document.getElementById('logical-content');
    const moreOptionsBtn = document.getElementById('more-options-btn');
    const moreOptionsPopup = document.getElementById('more-options-popup');
    const regenerateOption = document.getElementById('regenerate-option');
    const shareOption = document.getElementById('share-option');
    const fullscreenOption = document.getElementById('fullscreen-option');
    const insightWelcome = document.getElementById('insight-welcome');
    const showKeypointsToggle = document.getElementById('show-keypoints-toggle');
    const updateNotification = document.getElementById('update-notification');
    const updateCountSpan = document.getElementById('update-count');
    const manualUpdateBtn = document.getElementById('manual-update-btn');
    const summaryLevelSelect = document.getElementById('summary-level-select');
    const dialogOverlay = document.getElementById('confirm-dialog-overlay');
    const dialogConfirm = document.getElementById('dialog-confirm');
    const dialogCancel = document.getElementById('dialog-cancel');
    let pendingSummaryLevel = null; // Store pending change
    let fullTextToRead = '';
    let isSpeaking = false;
    let currentOutlineItems = [];
    let pollingInterval = null;
    let isOutlineViewMode = false;
    let isMoreOptionsOpen = false;
    let newConversationPollingInterval = null;
    let isNewConversation = false;
    let updateOutlineRetryCount = 0;
    const MAX_UPDATE_RETRY = 5;
    let isUpdatingOutline = false; // Flag to prevent concurrent updateOutline calls
    let pendingNewMessageCount = 0; // Track number of new messages waiting for update
    
    // Helper function to safely send messages and handle context invalidation
    function safeSendMessage(message, callback) {
        try {
            // Check if chrome.runtime is available
            if (!chrome.runtime || !chrome.runtime.sendMessage) {
                throw new Error('Extension context invalidated');
            }
            
            chrome.runtime.sendMessage(message, (response) => {
                // Check if there was a runtime error
                if (chrome.runtime.lastError) {
                    console.error('EchoNav: Runtime error:', chrome.runtime.lastError.message);
                    callback({ error: 'Extension context invalidated. Please reload the side panel.' });
                    return;
                }
                callback(response);
            });
        } catch (error) {
            console.error('EchoNav: Failed to send message:', error);
            callback({ error: 'Extension context invalidated. Please reload the side panel.' });
        }
    }
    
    // Helper function to manage outline landmark visibility
    function updateOutlineLandmark(hasContent) {
        // Always keep outline div transparent to screen readers
        // The tabpanel's aria-label provides the necessary context
        outlineDiv.setAttribute('role', 'presentation');
        outlineDiv.removeAttribute('aria-label');
    }
    
        // Load toggle states and settings
        chrome.storage.local.get(['autoUpdateEnabled', 'showKeypointsEnabled', 'summaryLevel'], (result) => {
            if (result.autoUpdateEnabled !== undefined) {
                autoUpdateToggle.checked = result.autoUpdateEnabled;
            }
            // Default to true if not set
            if (result.showKeypointsEnabled !== undefined) {
                showKeypointsToggle.checked = result.showKeypointsEnabled;
            } else {
                showKeypointsToggle.checked = true;
                chrome.storage.local.set({ showKeypointsEnabled: true });
            }
            // Load summary level (default to 'short' = 3 keypoints)
            const summaryLevel = result.summaryLevel || 'short';
            summaryLevelSelect.value = summaryLevel;
        });

        // Save toggle states when changed
        autoUpdateToggle.addEventListener('change', () => {
            chrome.storage.local.set({ autoUpdateEnabled: autoUpdateToggle.checked });
            console.log("EchoNav: Auto-update toggle changed to:", autoUpdateToggle.checked);
        });

        showKeypointsToggle.addEventListener('change', () => {
            const isEnabled = showKeypointsToggle.checked;
            chrome.storage.local.set({ showKeypointsEnabled: isEnabled });
            console.log("EchoNav: Show keypoints toggle changed to:", isEnabled);
            
            // Send message to content script to show/hide keypoints in the conversation page
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'toggleKeypointsDisplay',
                        showKeypoints: isEnabled
                    });
                }
            });
            
            // If fullscreen is active, refresh the outline view to apply changes
            if (isOutlineViewMode) {
                chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                    if (tabs[0]) {
                        // Exit and re-enter fullscreen to refresh with new setting
                        await chrome.tabs.sendMessage(tabs[0].id, { 
                            action: 'toggleOutlineView', 
                            mode: 'exit'
                        });
                        
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tabs[0].id, { 
                                action: 'toggleOutlineView', 
                                mode: 'enter',
                                outlineItems: currentOutlineItems
                            });
                        }, 100);
                    }
                });
            }
        });
        
        // Manual update button click handler
        manualUpdateBtn.addEventListener('click', () => {
            console.log("EchoNav: Manual update triggered");
            updateNotification.classList.add('hidden');
            pendingNewMessageCount = 0;
            updateOutline();
        });
        
        // Summary level select change handler with confirmation dialog
        summaryLevelSelect.addEventListener('change', (e) => {
            const newValue = e.target.value;
            
            // Get current saved value
            chrome.storage.local.get(['summaryLevel'], (result) => {
                const currentValue = result.summaryLevel || 'short';
                
                // If value actually changed, show confirmation dialog
                if (newValue !== currentValue) {
                    pendingSummaryLevel = newValue;
                    showDialog();
                    // Revert select to current value (will update if user confirms)
                    summaryLevelSelect.value = currentValue;
                }
            });
        });
        
        // Dialog confirm button
        dialogConfirm.addEventListener('click', () => {
            if (pendingSummaryLevel) {
                chrome.storage.local.set({ summaryLevel: pendingSummaryLevel });
                console.log("EchoNav: Summary level changed to:", pendingSummaryLevel);
                summaryLevelSelect.value = pendingSummaryLevel;
                pendingSummaryLevel = null;
            }
            hideDialog();
        });
        
        // Dialog cancel button
        dialogCancel.addEventListener('click', () => {
            pendingSummaryLevel = null;
            hideDialog();
        });
        
        // Close dialog when clicking overlay
        dialogOverlay.addEventListener('click', (e) => {
            if (e.target === dialogOverlay) {
                pendingSummaryLevel = null;
                hideDialog();
            }
        });
        
        // Helper functions for dialog
        function showDialog() {
            dialogOverlay.classList.remove('hidden');
            dialogConfirm.focus(); // Focus on confirm button for accessibility
        }
        
        function hideDialog() {
            dialogOverlay.classList.add('hidden');
        }

        // Tab switching functionality
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-panel');
        
        // Initialize more options button visibility (default to timeline tab)
        moreOptionsBtn.style.display = 'flex';
        
        // Helper function to get current active tab
        function getCurrentActiveTab() {
            const activeTabButton = document.querySelector('.tab-btn.active');
            return activeTabButton ? activeTabButton.getAttribute('data-tab') : 'timeline';
        }

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => {
                    btn.classList.remove('active');
                    btn.setAttribute('aria-selected', 'false');
                });
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked button and corresponding content
                button.classList.add('active');
                button.setAttribute('aria-selected', 'true');
                document.getElementById(`${targetTab}-tab`).classList.add('active');
                
                // Show/hide more options button based on tab
                if (targetTab === 'setting') {
                    moreOptionsBtn.style.display = 'none';
                } else {
                    moreOptionsBtn.style.display = 'flex';
                }
                
                // If switching to logical tab, handle insight welcome state
                if (targetTab === 'logical') {
                    handleInsightTabSwitch();
                }
            });
        });

        // More Options Button functionality
        moreOptionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMoreOptions();
        });

        // Close popup when clicking outside
        document.addEventListener('click', (e) => {
            if (isMoreOptionsOpen && !moreOptionsPopup.contains(e.target) && e.target !== moreOptionsBtn) {
                closeMoreOptions();
            }
        });

        // Keyboard navigation for more options menu
        const menuItems = [regenerateOption, shareOption, fullscreenOption];
        
        moreOptionsPopup.addEventListener('keydown', (e) => {
            if (!isMoreOptionsOpen) return;

            const currentIndex = menuItems.indexOf(document.activeElement);
            
            // ESC key - close menu and return focus to button
            if (e.key === 'Escape') {
                e.preventDefault();
                closeMoreOptions();
                return;
            }
            
            // Arrow keys navigation
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % menuItems.length;
                menuItems[nextIndex].focus();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
                menuItems[prevIndex].focus();
            }
            // Home key - go to first item
            else if (e.key === 'Home') {
                e.preventDefault();
                menuItems[0].focus();
            }
            // End key - go to last item
            else if (e.key === 'End') {
                e.preventDefault();
                menuItems[menuItems.length - 1].focus();
            }
        });

        // Regenerate option
        regenerateOption.addEventListener('click', () => {
            closeMoreOptions();
            const currentTab = getCurrentActiveTab();
            
            if (currentTab === 'timeline') {
                // Regenerate Timeline outline with fresh Case A/B classification
                // This clears all DOM markers and cached data, then re-extracts and re-analyzes all conversation turns
                safeSendMessage({ action: "regenerateOutline" }, (response) => {
                    if (response && response.success) {
                        // Clear the timeline content and start fresh generation
                        const outlineDiv = document.getElementById('outline');
                        outlineDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Regenerating outline with fresh analysis...</p></div>';
                        currentOutlineItems = [];
                        
                        // Start fresh generation (will re-do Case A/B classification for all turns)
                        generateOutline();
                    } else {
                        console.error("Failed to regenerate outline:", response.error);
                        if (response && response.error) {
                            showError(response.error);
                        }
                    }
                });
            } else if (currentTab === 'logical') {
                // Regenerate Insight hierarchy - clear content and restart generation
                const loadingStateElement = logicalContent.querySelector('.loading-state');
                if (loadingStateElement) {
                    loadingStateElement.remove();
                }
                logicalContent.innerHTML = '';
                
                generateInsightButton.disabled = true;
                generateInsightButton.innerHTML = '<span class="btn-icon">🧠</span> Generating...';
                logicalContent.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Generating logical hierarchy...</p></div>';
                
                safeSendMessage({ action: "generateInsightHierarchy" }, (response) => {
                    console.log("EchoNav: Insight regeneration response received:", response);
                    
                    generateInsightButton.disabled = false;
                    generateInsightButton.innerHTML = '<span class="btn-icon">🚀</span> Generate Insight';
                    
                    if (response && response.error) {
                        logicalContent.innerHTML = `<div class="error-state"><div class="error-icon">⚠️</div><h3>Error</h3><p>${response.error}</p><p class="hint">Try reloading the extension side panel.</p></div>`;
                    } else if (!response || !response.success) {
                        console.error("EchoNav: Failed to start Insight regeneration");
                        logicalContent.innerHTML = '<div id="insight-welcome" class="welcome-state"><div class="welcome-icon">🧠</div><h2>Generate Insight</h2><p>Create a hierarchical structure from your Timeline to better understand the conversation.</p><button id="generate-logical-button" class="primary-btn"><span class="btn-icon">🚀</span> Generate Insight</button></div>';
                    }
                });
            }
        });

        // Share option
        shareOption.addEventListener('click', () => {
            closeMoreOptions();
            const currentTab = getCurrentActiveTab();
            
            if (currentTab === 'timeline') {
                // Share Timeline outline
                if (currentOutlineItems && currentOutlineItems.length > 0) {
                    const shareText = currentOutlineItems.map((item, index) => {
                        let result = `${index + 1}. ${item.title}`;
                        if (item.keypoints && item.keypoints.length > 0) {
                            result += '\n   Key points:';
                            item.keypoints.forEach(point => {
                                result += `\n   • ${point}`;
                            });
                        }
                        return result;
                    }).join('\n\n');
                    
                    navigator.clipboard.writeText(shareText).then(() => {
                        alert('Timeline outline copied to clipboard!');
                    }).catch(() => {
                        alert('Failed to copy to clipboard. Please try again.');
                    });
                } else {
                    alert('No Timeline outline to share. Please generate an outline first.');
                }
            } else if (currentTab === 'logical') {
                // Share Insight hierarchy
                const logicalItems = document.querySelectorAll('.logical-item');
                if (logicalItems.length > 0) {
                    let shareText = '';
                    logicalItems.forEach(item => {
                        const level = parseInt(item.dataset.level) || 0;
                        const indent = '  '.repeat(level);
                        const title = item.querySelector('.logical-text')?.textContent || '';
                        shareText += `${indent}• ${title}\n`;
                    });
                    
                    navigator.clipboard.writeText(shareText.trim()).then(() => {
                        alert('Insight hierarchy copied to clipboard!');
                    }).catch(() => {
                        alert('Failed to copy to clipboard. Please try again.');
                    });
                } else {
                    alert('No Insight hierarchy to share. Please generate insights first.');
                }
            }
        });

        // Fullscreen option (moved from header)
        fullscreenOption.addEventListener('click', () => {
            closeMoreOptions();
            if (currentOutlineItems.length === 0) {
                alert('Please generate an outline first before entering fullscreen mode.');
                return;
            }

            // Send a message to the content script to toggle fullscreen
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'enterFullscreenWithFloatingButton',
                        outlineItems: currentOutlineItems
                    });
                }
            });
        });

        // Generate Insight Hierarchy button
        generateInsightButton.addEventListener('click', () => {
            generateInsightButton.disabled = true;
            generateInsightButton.innerHTML = '<span class="btn-icon">🧠</span> Generating...';
            logicalContent.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Generating logical hierarchy...</p></div>';
            
            safeSendMessage({ action: "generateInsightHierarchy" }, (response) => {
                generateInsightButton.disabled = false;
                generateInsightButton.innerHTML = '<span class="btn-icon">🧠</span> Generate Insight';
                
                if (response && response.error) {
                    logicalContent.innerHTML = `<div class="error-state"><div class="error-icon">⚠️</div><h3>Error</h3><p>${response.error}</p><p class="hint">Try reloading the extension side panel.</p></div>`;
                } else if (response && response.data) {
                    // Clear loading state and display hierarchy
                    logicalContent.innerHTML = '';
                    displayInsightHierarchy(response.data);
                } else {
                    logicalContent.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Generation Failed</h3><p>Failed to generate logical hierarchy. Please try again.</p></div>';
                }
            });
        });


    function showError(message) {
        welcomeMessage.style.display = 'none';
        newConversationMessage.style.display = 'none';
        newConversationMessage.classList.add('hidden');
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        outlineDiv.innerHTML = '';
        updateOutlineLandmark(false);
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }

    generateButton.addEventListener('click', () => {
        hideError();
        welcomeMessage.style.display = 'none';
        newConversationMessage.style.display = 'none';
        newConversationMessage.classList.add('hidden');
        stopNewConversationPolling(); // Stop polling when user manually generates
        outlineDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Generating outline...</p></div>';
        generateOutline();
    });

    retryButton.addEventListener('click', () => {
        hideError();
        // Check if we have existing outline items (partial outline)
        if (currentOutlineItems.length > 0) {
            // If we have existing items, retry the update operation
            outlineDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Updating outline...</p></div>';
            updateOutline();
        } else {
            // If no existing items, do full generation
            outlineDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Generating outline...</p></div>';
            generateOutline();
        }
    });


        // Listen for messages
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "downloadProgress") {
                outlineDiv.innerHTML = `<p>${request.message}</p>`;
            } else if (request.action === "streamingStarted") {
                console.log("EchoNav: Streaming started, total turns:", request.totalTurns);
                // Clear the outline and show two shimmer placeholders (consistent with addTimelineItem)
                outlineDiv.innerHTML = `
                    <div class="timeline-simple-placeholder">
                        <div class="timeline-shimmer"></div>
                    </div>
                    <div class="timeline-simple-placeholder">
                        <div class="timeline-shimmer"></div>
                    </div>
                `;
                currentOutlineItems = []; // Reset items array
                
                // Announce generation start
                if (window.EchoNavAccessibility) {
                    window.EchoNavAccessibility.announce(`Timeline for this conversation is now generating. Total ${request.totalTurns} conversation turns to process.`);
                }
            } else if (request.action === "addTimelineItem") {
                console.log("EchoNav: Adding timeline item:", request.item.title);
                // Add the item to our array
                currentOutlineItems.push(request.item);
                
                // Immediately create the final Timeline UI with all current items
                const timeline = createClickableList(currentOutlineItems);
                outlineDiv.innerHTML = '';
                outlineDiv.appendChild(timeline);
                updateOutlineLandmark(true);
                
                // Don't initialize accessibility during streaming - wait for streamingCompleted
                // This prevents multiple "Outline is ready" announcements
                
                // Add shimmer placeholders for remaining items
                if (request.index + 1 < request.total) {
                    const loadingIndicator1 = document.createElement('div');
                    loadingIndicator1.className = 'timeline-simple-placeholder';
                    loadingIndicator1.innerHTML = `<div class="timeline-shimmer"></div>`;
                    outlineDiv.appendChild(loadingIndicator1);
                    
                    const loadingIndicator2 = document.createElement('div');
                    loadingIndicator2.className = 'timeline-simple-placeholder';
                    loadingIndicator2.innerHTML = `<div class="timeline-shimmer"></div>`;
                    outlineDiv.appendChild(loadingIndicator2);
                }
                
                // Update progress
                const progressText = `Generating outline... (${request.index + 1}/${request.total})`;
                const progressElement = outlineDiv.querySelector('.loading-state p');
                if (progressElement) {
                    progressElement.textContent = progressText;
                }
                
                // Announce each turn as it's generated (concise announcement)
                if (window.EchoNavAccessibility) {
                    const turnNumber = request.index + 1;
                    const title = request.item.title;
                    // Only announce for first few items to avoid overwhelming
                    if (turnNumber <= 3 || turnNumber === request.total) {
                        window.EchoNavAccessibility.announce(`Turn ${turnNumber}: ${title}`);
                    } else if (turnNumber % 5 === 0) {
                        // Announce every 5th item for longer conversations
                        window.EchoNavAccessibility.announce(`Progress: ${turnNumber} of ${request.total} turns processed`);
                    }
                }
                
            } else if (request.action === "streamingCompleted") {
                console.log("EchoNav: Streaming completed");
                // Remove loading indicators and progress text
                const progressElement = outlineDiv.querySelector('.loading-state');
                const loadingIndicators = outlineDiv.querySelectorAll('.timeline-simple-placeholder');
                if (progressElement) {
                    progressElement.remove();
                }
                loadingIndicators.forEach(indicator => {
                    indicator.remove();
                });
                // TTS is now available through more options menu
                fullTextToRead = request.data.summary;
                
                // Announce completion with helpful instructions
                if (window.EchoNavAccessibility) {
                    const totalTurns = currentOutlineItems.length;
                    const hasSubcontent = currentOutlineItems.some(item => 
                        (item.structuredData && item.structuredData.outline && item.structuredData.outline.length > 0) ||
                        (item.keyPoints && item.keyPoints.length > 0)
                    );
                    
                    let completionMessage = `Timeline generation complete. ${totalTurns} conversation turn${totalTurns !== 1 ? 's' : ''} available.`;
                    
                    if (hasSubcontent) {
                        completionMessage += ` Each turn may contain sections and details. On macOS, content auto-expands when focused. Use arrow keys to navigate, Space to jump. VO+Shift+Down to enter content. Press Command+Shift+T to jump to first turn.`;
                    } else {
                        completionMessage += ` Use arrow keys to navigate, Space to jump. Press Command+Shift+T to jump to first turn.`;
                    }
                    
                    window.EchoNavAccessibility.announce(completionMessage);
                }
                
                // NOW initialize accessibility features once streaming is complete
                // This ensures "Outline is ready" is announced only once, AFTER keypoints are inserted and announced
                // Pass skipAnnouncement=true because we already announced completion above
                initializeAccessibilityFeatures(true);
                
                // Start polling for new messages
                startPolling();
                
                // Update Insight View state
                updateInsightWelcomeState();
                
                // NEW FLOW: Trigger keypoints generation FIRST, then enable outline view
                // This ensures cards have keypoints when they're first displayed
                if (currentOutlineItems && currentOutlineItems.length > 0) {
                    console.log("EchoNav: Streaming completed, triggering keypoints generation first");
                    triggerTimelineKeypointsGeneration(async () => {
                        // Callback: After keypoints generated, merge them into items, then enable outline view
                        console.log("EchoNav: All keypoints generated after streaming, merging into items");
                        await loadAndMergeChatKeyPoints(currentOutlineItems);
                        console.log("EchoNav: Keypoints merged, now enabling outline view");
                        safelyEnableOutlineView(currentOutlineItems, 300);
                    });
                }
                
                // Check for new messages after completion
            } else if (request.action === "logicalHierarchyUpdated") {
                // Update the logical hierarchy display
                console.log("EchoNav: Insight hierarchy updated, refreshing display");
                console.log("EchoNav: Received hierarchy data:", request.data);
                
                // Directly display the updated hierarchy instead of reloading from storage
                if (request.data) {
                    displayInsightHierarchy(request.data);
                } else {
                    // Fallback to loading from storage
                    loadInsightHierarchy();
                }
                
                checkForNewMessages();
            } else if (request.action === "timelineKeypointGenerated") {
                // Handle individual keypoint generation
                console.log(`EchoNav: Keypoint generated for turn ${request.turnIndex}:`, request.keyPoints);
                
                // Verify this update is for the current conversation
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    if (tabs && tabs.length > 0) {
                        const currentUrl = tabs[0].url;
                        const currentConversationId = currentUrl.match(/\/c\/([a-f0-9-]+)/)?.[1];
                        
                        if (currentConversationId === request.conversationId) {
                            console.log("EchoNav: Keypoint update is for current conversation, applying");
                            handleKeypointUpdate(request.turnIndex, request.keyPoints, request.messageIndex);
                        } else {
                            console.log(`EchoNav: Keypoint update is for different conversation (${request.conversationId}), ignoring`);
                        }
                    }
                });
            } else if (request.action === "timelineKeypointsCompleted") {
                console.log("EchoNav: All timeline keypoints generation completed");
                // Could show a notification or update UI state here
            } else if (request.action === "exitOutlineView") {
                // Handle exit from outline view mode
                isOutlineViewMode = false;
                // Fullscreen button is now in more options menu, no need to update button state
            } else if (request.action === "urlChanged") {
                // Handle URL change from background.js
                console.log("EchoNav: URL changed via runtime message:", request.url);
                handleUrlChange(request.url);
            }
        });

    // Smart URL change handler that decides behavior based on URL transition type
    async function handleUrlChange(newUrl) {
        const wasNewConversation = isNewConversation;
        const isNowNew = newUrl.includes('chatgpt.com') && !newUrl.includes('/c/');
        
        console.log("EchoNav: Handling URL change - was new:", wasNewConversation, "is now new:", isNowNew);
        
        if (wasNewConversation && !isNowNew) {
            // Scenario 1: From new conversation to conversation with ID
            // User started chatting - don't generate yet, wait for AI to complete and keypoints to be inserted
            console.log("EchoNav: User started conversation, waiting for AI to complete before generating outline");
            stopNewConversationPolling();
            isNewConversation = false;
            newConversationMessage.style.display = 'none';
            newConversationMessage.classList.add('hidden');
            
            // Try to load cached outline first
            safeSendMessage({ action: "getCachedOutline" }, (response) => {
                if (response && response.error) {
                    showError(response.error);
                    return;
                }
                if (response && response.data && (response.data.summary || response.data.outline)) {
                    console.log("EchoNav: Found cached outline for new conversation");
                    const { summary, outline, items } = response.data;
                    const outlineText = summary || outline;
                    hideError();
                    welcomeMessage.style.display = 'none';
                    welcomeMessage.classList.add('hidden');
                    fullTextToRead = outlineText;
                    currentOutlineItems = items || [];
                    
                    if (items && items.length > 0) {
                        // NEW: Merge chatKeyPoints before creating UI
                        loadAndMergeChatKeyPoints(items).then(() => {
                            const ul = createClickableList(items);
                            outlineDiv.innerHTML = '';
                            outlineDiv.appendChild(ul);
                            updateOutlineLandmark(true);
                            initializeAccessibilityFeatures();
                            startPolling();
                            updateInsightWelcomeState();
                            
                            // Auto-enable outline view when Timeline has content (EchoNav开启 + Timeline有目录)
                            console.log("EchoNav: Auto-enabling outline view from cached outline (URL change - Scenario 1) with", items.length, "items");
                            safelyEnableOutlineView(items, 1200); // Longer delay for URL change scenario
                        });
                    }
                } else {
                    // No cache - this is a new conversation, check if AI has completed
                    console.log("EchoNav: No cache for new conversation, checking if AI has completed");
                    welcomeMessage.style.display = 'none';
                    welcomeMessage.classList.add('hidden');
                    newConversationMessage.style.display = 'none';
                    newConversationMessage.classList.add('hidden');
                    
                    // Show "Waiting for AI response" state (do NOT show welcome message)
                    outlineDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Waiting for AI response...</p></div>';
                    updateOutlineLandmark(false);
                    
                    // Poll for AI response completion
                    let completionCheckAttempts = 0;
                    const maxCompletionCheckAttempts = 60; // Max 2 minutes (60 * 2 seconds)
                    
                    const checkForCompletion = () => {
                        completionCheckAttempts++;
                        
                        if (completionCheckAttempts > maxCompletionCheckAttempts) {
                            console.warn("EchoNav: AI response check timed out after 2 minutes");
                            outlineDiv.innerHTML = '<div class="error-state"><p>Timeout waiting for AI response. Please refresh or try generating manually.</p></div>';
                            return;
                        }
                        
                        safeSendMessage({ action: "checkNewMessages" }, (response) => {
                            if (response && response.error) {
                                showError(response.error);
                                return;
                            }
                            if (response && (response.hasNewMessages || response.completeTurns > 0)) {
                                // AI has completed, generate outline now
                                console.log(`EchoNav: AI response detected as complete for new conversation (after ${completionCheckAttempts} checks), generating outline`);
                                // Keep welcome-message hidden during outline generation
                                welcomeMessage.style.display = 'none';
                                welcomeMessage.classList.add('hidden');
                                outlineDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Generating outline...</p></div>';
                                setTimeout(() => {
                                    generateOutline();
                                }, 500);
                            } else {
                                // AI still generating, check again after delay
                                console.log(`EchoNav: AI still generating (check #${completionCheckAttempts}), will retry...`);
                                setTimeout(checkForCompletion, 2000);
                            }
                        });
                    };
                    
                    // Start checking immediately
                    checkForCompletion();
                }
            });
            
        } else if (!wasNewConversation && isNowNew) {
            // Scenario 2: From conversation with ID to new conversation
            // User clicked "New Chat" - show waiting message
            console.log("EchoNav: User started new conversation, showing waiting message");
            
            // Exit outline view before resetting and wait for completion
            chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleOutlineView', mode: 'exit' }, async () => {
                        console.log("EchoNav: Exit outline view completed for new conversation");
                        
                        // Wait a bit to ensure DOM cleanup is complete
                        setTimeout(async () => {
                            resetSidepanel();
                            await updateWelcomeState(); // This will show new conversation message and start polling
                        }, 300); // 300ms delay to ensure complete cleanup
                    });
                } else {
                    // No active tab, proceed anyway
                    resetSidepanel();
                    await updateWelcomeState();
                }
            });
            
        } else if (!wasNewConversation && !isNowNew) {
            // Scenario 3: From one conversation with ID to another conversation with ID
            // User switched conversations - try to load cache or show welcome message
            console.log("EchoNav: User switched to different conversation, loading cache or showing welcome");
            
            // Step 1: Exit outline view before switching and wait for completion
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleOutlineView', mode: 'exit' }, () => {
                        console.log("EchoNav: Exit outline view completed for conversation switch");
                        
                        // Step 2: Wait a bit to ensure DOM cleanup is complete, then proceed with loading new outline
                        setTimeout(() => {
                            loadNewConversationOutline();
                        }, 300); // 300ms delay to ensure complete cleanup
                    });
                } else {
                    // No active tab, proceed anyway
                    loadNewConversationOutline();
                }
            });
            
            // Helper function to load new conversation outline
            function loadNewConversationOutline() {
                stopPolling();
                stopNewConversationPolling();
                hideError();
                outlineDiv.innerHTML = '';
                updateOutlineLandmark(false);
                currentOutlineItems = [];
                resetInsightViewForNewURL();
                
                // Try to load cached outline for this conversation
                safeSendMessage({ action: "getCachedOutline" }, (response) => {
                    if (response && response.error) {
                        showError(response.error);
                        return;
                    }
                    if (response && response.data && (response.data.summary || response.data.outline)) {
                        console.log("EchoNav: Found cached outline for switched conversation");
                        const { summary, outline, items } = response.data;
                        const outlineText = summary || outline;
                        welcomeMessage.style.display = 'none';
                        welcomeMessage.classList.add('hidden');
                        fullTextToRead = outlineText;
                        currentOutlineItems = items || [];
                        
                        if (items && items.length > 0) {
                            // NEW: Merge chatKeyPoints before creating UI
                            loadAndMergeChatKeyPoints(items).then(() => {
                                const ul = createClickableList(items);
                                outlineDiv.appendChild(ul);
                                initializeAccessibilityFeatures();
                                startPolling();
                                updateInsightWelcomeState();
                                
                                // Auto-enable outline view when Timeline has content (EchoNav开启 + Timeline有目录)
                                console.log("EchoNav: Auto-enabling outline view from cached outline (URL change - Scenario 3) with", items.length, "items");
                                safelyEnableOutlineView(items, 1200); // Longer delay for conversation switch
                            });
                        }
                    } else {
                        // No cache for this conversation - show welcome message (user must manually generate)
                        console.log("EchoNav: No cache for switched conversation, showing welcome message");
                        welcomeMessage.style.display = 'block';
                        newConversationMessage.style.display = 'none';
                        newConversationMessage.classList.add('hidden');
                    }
                });
            }
            
        } else {
            // Scenario 4: New to new (shouldn't happen often, but handle gracefully)
            console.log("EchoNav: Staying on new conversation page");
            // Keep current state
        }
    }

    function resetSidepanel() {
        stopPolling(); // Stop polling when resetting
        stopNewConversationPolling(); // Stop new conversation polling
        welcomeMessage.style.display = 'block';
        newConversationMessage.style.display = 'none';
        newConversationMessage.classList.add('hidden');
        hideError();
        outlineDiv.innerHTML = '';
        updateOutlineLandmark(false);
        // TTS is now available through more options menu
        fullTextToRead = '';
        currentOutlineItems = [];
        isNewConversation = false;
    }

    // NEW: Load and merge chatKeyPoints from storage into items
    async function loadAndMergeChatKeyPoints(items) {
        try {
            // Get current conversation ID
            const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tabs || tabs.length === 0) return;
            
            const currentUrl = tabs[0].url;
            const conversationId = currentUrl.match(/\/c\/([a-f0-9-]+)/)?.[1];
            
            if (!conversationId) {
                console.log("EchoNav: No conversation ID, skipping chatKeyPoints merge");
                return;
            }
            
            console.log(`EchoNav: Loading chatKeyPoints for conversation ${conversationId}`);
            
            // Load chatKeyPoints from storage
            const storageKey = `echonav_keypoints_${conversationId}`;
            const result = await chrome.storage.local.get([storageKey]);
            const chatKeyPointsStorage = result[storageKey] || {};
            
            console.log("EchoNav: Found chatKeyPoints in storage:", chatKeyPointsStorage);
            
            // Merge chatKeyPoints into items
            let mergedCount = 0;
            items.forEach((item, index) => {
                const messageIndex = index.toString();
                if (chatKeyPointsStorage[messageIndex]) {
                    // Only update if item doesn't already have chatKeyPoints or if storage has newer data
                    if (!item.chatKeyPoints || item.chatKeyPoints.length === 0) {
                        item.chatKeyPoints = chatKeyPointsStorage[messageIndex];
                        mergedCount++;
                        console.log(`EchoNav: Merged chatKeyPoints for turn ${index}`);
                    }
                }
            });
            
            if (mergedCount > 0) {
                console.log(`EchoNav: ✅ Merged chatKeyPoints for ${mergedCount} turns`);
            } else {
                console.log("EchoNav: No new chatKeyPoints to merge");
            }
            
        } catch (error) {
            console.error("EchoNav: Error loading chatKeyPoints:", error);
        }
    }

    // Check for cached outline when sidepanel loads
    async function loadCachedOutline() {
        safeSendMessage({ action: "getCachedOutline" }, async (response) => {
            console.log("EchoNav: Cache response:", response);
            if (response && response.error) {
                showError(response.error);
                return;
            }
            if (response && response.data && (response.data.summary || response.data.outline)) {
                console.log("EchoNav: Found cached outline, loading it");
                const { summary, outline, items } = response.data;
                const outlineText = summary || outline;
                hideError();
                welcomeMessage.style.display = 'none';
                newConversationMessage.style.display = 'none';
                newConversationMessage.classList.add('hidden');
                fullTextToRead = outlineText;
                currentOutlineItems = items || [];
                
                if (items && items.length > 0) {
                    // NEW: Load and merge any chatKeyPoints generated in the background
                    await loadAndMergeChatKeyPoints(items);
                    
                    const ul = createClickableList(items);
                    outlineDiv.innerHTML = '';
                    outlineDiv.appendChild(ul);
                    updateOutlineLandmark(true);
                    
                    // Initialize accessibility features for the cached outline
                    initializeAccessibilityFeatures();
                    
                    // Start periodic polling for new messages
                    startPolling();
                    
                    // Update Insight View state when Timeline data changes
                    updateInsightWelcomeState();
                    
                    // Auto-enable outline view when Timeline has content (EchoNav开启 + Timeline有目录)
                    console.log("EchoNav: Auto-enabling outline view from cached outline with", items.length, "items");
                    safelyEnableOutlineView(items, 800); // Medium delay for initial load
                } else {
                    // Fallback: parse the outline text if items are not available
                    const tree = parseSummaryToTree(outlineText);
                    const ul = createTreeElement(tree);
                    outlineDiv.innerHTML = '';
                    outlineDiv.appendChild(ul);
                    updateOutlineLandmark(true);
                }
            } else {
                console.log("EchoNav: No cached outline found");
                // Check if this is a new conversation (no ID yet)
                await updateWelcomeState();
            }
        });
    }

    // Check if there are new messages since the last summary
    function checkForNewMessages() {
        try {
            if (!chrome?.runtime?.id) return; // Extension context invalidated
        } catch (_) {
            return;
        }
        
        // Skip check if an update is already in progress
        if (isUpdatingOutline) {
            console.log("EchoNav: Update already in progress, skipping checkForNewMessages");
            return;
        }
        
        safeSendMessage({ action: "checkNewMessages" }, (response) => {
            // Handle potential undefined response or runtime errors
            if (!response) {
                console.log("EchoNav: No response from checkNewMessages, skipping check");
                return;
            }
            
            if (response.error) {
                console.error("EchoNav: Error checking new messages:", response.error);
                return;
            }
            
            // Double-check the flag before triggering update (race condition protection)
            if (isUpdatingOutline) {
                console.log("EchoNav: Update started during checkNewMessages, skipping");
                return;
            }
            
            if (response.hasNewMessages) {
                if (autoUpdateToggle.checked) {
                    console.log("EchoNav: New messages detected, triggering update");
                    updateOutline();
                } else {
                    // Auto-update is disabled, show notification instead
                    console.log("EchoNav: New messages detected, showing update notification");
                    pendingNewMessageCount = response.newMessageCount || 1;
                    updateCountSpan.textContent = pendingNewMessageCount;
                    updateNotification.classList.remove('hidden');
                }
            } else if (response.pendingTurns > 0) {
                // AI is still generating, check again soon
                console.log(`EchoNav: ${response.pendingTurns} pending turns, rechecking in 2s`);
                setTimeout(() => {
                    checkForNewMessages();
                }, 2000);
            } else if (response.completeTurns > 0) {
                // Complete turns found in new conversation, trigger update
                console.log(`EchoNav: ${response.completeTurns} complete turns found, triggering update`);
                setTimeout(() => {
                    updateOutline();
                }, 500);
            }
        });
    }

    // Start periodic polling for new messages
    function startPolling() {
        // Clear any existing interval
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        
        // Only start polling if we have an existing outline
        if (currentOutlineItems.length > 0) {
            console.log("EchoNav: Starting periodic polling for new messages");
            pollingInterval = setInterval(() => {
                checkForNewMessages();
            }, 5000); // Check every 5 seconds (will increase frequency if AI is generating)
        }
    }

    // Stop periodic polling
    function stopPolling() {
        if (pollingInterval) {
            console.log("EchoNav: Stopping periodic polling");
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // Helper function to safely enable outline view with delay for page load
    function safelyEnableOutlineView(items, delay = 1000) {
        if (!items || items.length === 0) {
            console.log("EchoNav: No items to enable outline view");
            return;
        }
        
        console.log("EchoNav: Scheduling outline view enablement with", items.length, "items after", delay, "ms");
        setTimeout(() => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'autoEnableOutlineView',
                        outlineItems: items
                    });
                }
            });
        }, delay);
    }

    // Check if we're on a new conversation page (no conversation ID in URL)
    async function checkIfNewConversation() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url) return false;
            
            // Check if URL is chatgpt.com but doesn't have a conversation ID
            const isNewConv = tab.url.includes('chatgpt.com') && !tab.url.includes('/c/');
            console.log("EchoNav: Checking if new conversation:", isNewConv, "URL:", tab.url);
            return isNewConv;
        } catch (error) {
            console.error("EchoNav: Error checking conversation state:", error);
            return false;
        }
    }

    // Poll for conversation to start (URL to include conversation ID)
    function startNewConversationPolling() {
        // Clear any existing interval
        if (newConversationPollingInterval) {
            clearInterval(newConversationPollingInterval);
        }
        
        console.log("EchoNav: Starting new conversation polling");
        newConversationPollingInterval = setInterval(async () => {
            const stillNew = await checkIfNewConversation();
            
            if (!stillNew) {
                // Conversation has started (URL now has ID)
                // This will be handled by URL change detection and handleUrlChange function
                console.log("EchoNav: Conversation detected via polling - URL change should handle this");
                stopNewConversationPolling();
            }
        }, 2000); // Check every 2 seconds
    }

    // Stop polling for new conversation
    function stopNewConversationPolling() {
        if (newConversationPollingInterval) {
            console.log("EchoNav: Stopping new conversation polling");
            clearInterval(newConversationPollingInterval);
            newConversationPollingInterval = null;
        }
    }

    // Update welcome message based on conversation state
    async function updateWelcomeState() {
        const isNew = await checkIfNewConversation();
        isNewConversation = isNew;
        
        // Check if we're already in a loading state - don't override it
        const isLoading = outlineDiv.querySelector('.loading-state') !== null;
        if (isLoading) {
            console.log("EchoNav: updateWelcomeState skipped - already in loading state");
            return;
        }
        
        // Check if outline already exists - don't show welcome message
        if (currentOutlineItems && currentOutlineItems.length > 0) {
            console.log("EchoNav: updateWelcomeState skipped - outline already exists");
            return;
        }
        
        if (isNew) {
            // Show new conversation message
            welcomeMessage.style.display = 'none';
            newConversationMessage.style.display = 'block';
            newConversationMessage.classList.remove('hidden');
            
            // Start polling for conversation to begin
            startNewConversationPolling();
        } else {
            // Show normal welcome message
            newConversationMessage.style.display = 'none';
            newConversationMessage.classList.add('hidden');
            welcomeMessage.style.display = 'block';
            
            // Stop new conversation polling if active
            stopNewConversationPolling();
        }
    }

    // Stop polling when the document becomes hidden or is unloading
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
            stopNewConversationPolling();
        } else if (currentOutlineItems.length > 0) {
            startPolling();
        } else if (isNewConversation) {
            startNewConversationPolling();
        }
    });

    window.addEventListener('beforeunload', () => {
        stopPolling();
        stopNewConversationPolling();
    });

    // Update outline with new messages only
    function updateOutline(retryCount = 0) {
        // Prevent concurrent calls
        if (isUpdatingOutline) {
            console.log("EchoNav: updateOutline already in progress, ignoring duplicate call");
            return;
        }
        
        // Set the flag to indicate update is in progress
        isUpdatingOutline = true;
        console.log("EchoNav: Starting outline update (flag set)");
        
        safeSendMessage({ action: "updateOutline" }, (response) => {
            if (response && response.error) {
                // Only show error for non-retryable errors
                showError(response.error);
                updateOutlineRetryCount = 0; // Reset retry count
                isUpdatingOutline = false; // Clear flag on error
                console.log("EchoNav: Update failed with error, flag cleared");
                return;
            }
            
            if (response.pending) {
                // Handle content script not ready (temporary condition)
                if (response.contentScriptNotReady) {
                    if (retryCount < MAX_UPDATE_RETRY) {
                        console.log(`EchoNav: Content script not ready, retrying (${retryCount + 1}/${MAX_UPDATE_RETRY})...`);
                        // Clear flag before retry
                        isUpdatingOutline = false;
                        // Exponential backoff: 300ms, 600ms, 1200ms, 2400ms, 4800ms
                        const retryDelay = Math.min(300 * Math.pow(2, retryCount), 5000);
                        setTimeout(() => {
                            updateOutline(retryCount + 1);
                        }, retryDelay);
                    } else {
                        console.warn("EchoNav: Max retry attempts reached for content script initialization");
                        // Don't show error - it will likely succeed on next polling cycle
                        updateOutlineRetryCount = 0;
                        isUpdatingOutline = false; // Clear flag after max retries
                        console.log("EchoNav: Max retries reached, flag cleared");
                    }
                    return;
                }
                
                // Handle no new turns found
                if (response.message && response.message.includes("No new turns found")) {
                    // Clear flag before retry
                    isUpdatingOutline = false;
                    setTimeout(() => {
                        updateOutline(retryCount);
                    }, 1000);
                    return;
                }
                
                // Other pending cases - clear flag
                isUpdatingOutline = false;
                console.log("EchoNav: Update pending (other reason), flag cleared");
                return;
            }
            
            if (response.data && response.data.summary) {
                const { summary, items } = response.data;
                hideError();
                fullTextToRead = summary;
                currentOutlineItems = items;
                const ul = createClickableList(items);
                outlineDiv.innerHTML = '';
                outlineDiv.appendChild(ul);
                updateOutlineLandmark(true);
                
                // Reset retry count on success
                updateOutlineRetryCount = 0;
                
                // Initialize accessibility features for the updated outline
                initializeAccessibilityFeatures();
                
                // Clear flag on success
                isUpdatingOutline = false;
                console.log("EchoNav: Update completed successfully, flag cleared");
                
                // Restart polling for new messages
                startPolling();
                
                // Update Insight View state when Timeline data changes
                updateInsightWelcomeState();
                
                // Auto-enable outline view when Timeline has content (EchoNav开启 + Timeline有目录)
                if (items && items.length > 0) {
                    console.log("EchoNav: Auto-enabling outline view from updated outline with", items.length, "items");
                    safelyEnableOutlineView(items, 600); // Short delay for update scenario
                }
            } else {
                showError("Could not update outline.");
                updateOutlineRetryCount = 0; // Reset retry count
                isUpdatingOutline = false; // Clear flag on failure
                console.log("EchoNav: Update failed (no data), flag cleared");
            }
        });
    }

    // Load cached outline on startup
    loadCachedOutline();

    // Accessibility Integration Functions
    function initializeAccessibilityFeatures(skipAnnouncement = false) {
        console.log('EchoNav: Initializing accessibility features...');
        
        // Check if EchoNavAccessibility is available
        if (typeof window.EchoNavAccessibility !== 'undefined') {
            // Small delay to ensure DOM is fully rendered
            setTimeout(() => {
                const outlineContainer = document.getElementById('outline');
                const timelineContainer = outlineContainer ? outlineContainer.querySelector('.timeline-container') : null;
                
                if (timelineContainer) {
                    window.EchoNavAccessibility.initializeTreeAccessibility(timelineContainer, skipAnnouncement);
                    console.log('EchoNav: Accessibility features initialized successfully');
                } else {
                    console.warn('EchoNav: Timeline container not found for accessibility initialization');
                }
            }, 100);
        } else {
            console.warn('EchoNav: EchoNavAccessibility not found. Accessibility features may not be available.');
        }
    }

    function refreshAccessibilityFeatures() {
        console.log('EchoNav: Refreshing accessibility features...');
        
        if (typeof window.EchoNavAccessibility !== 'undefined') {
            // Small delay to ensure DOM updates are complete
            setTimeout(() => {
                window.EchoNavAccessibility.refreshTreeAccessibility();
                console.log('EchoNav: Accessibility features refreshed successfully');
            }, 50);
        }
    }

    function initializeInsightAccessibilityFeatures() {
        console.log('EchoNav: Initializing Insight accessibility features...');
        
        // Check if EchoNavAccessibility is available
        if (typeof window.EchoNavAccessibility !== 'undefined') {
            // Small delay to ensure DOM is fully rendered
            setTimeout(() => {
                const logicalContainer = document.getElementById('logical-content');
                const logicalList = logicalContainer ? logicalContainer.querySelector('.logical-list') : null;
                
                if (logicalList) {
                    window.EchoNavAccessibility.initializeInsightAccessibility(logicalList);
                    console.log('EchoNav: Insight accessibility features initialized successfully');
                } else {
                    console.warn('EchoNav: Logical list not found for accessibility initialization');
                }
            }, 100);
        } else {
            console.warn('EchoNav: EchoNavAccessibility not found. Insight accessibility features may not be available.');
        }
    }

        // More Options Functions
        function toggleMoreOptions() {
            if (isMoreOptionsOpen) {
                closeMoreOptions();
            } else {
                openMoreOptions();
            }
        }

        function openMoreOptions() {
            isMoreOptionsOpen = true;
            moreOptionsPopup.classList.remove('hidden');
            moreOptionsBtn.setAttribute('aria-expanded', 'true');
            
            // Focus on the first menu item when opening
            setTimeout(() => {
                regenerateOption.focus();
            }, 50); // Small delay to ensure DOM is updated
        }

        function closeMoreOptions() {
            isMoreOptionsOpen = false;
            moreOptionsPopup.classList.add('hidden');
            moreOptionsBtn.setAttribute('aria-expanded', 'false');
            
            // Return focus to the button when closing
            moreOptionsBtn.focus();
        }

        // Handle Insight tab switch
        function handleInsightTabSwitch() {
            updateInsightViewState();
        }

        // Reset Insight View for new URL
        function resetInsightViewForNewURL() {
            console.log("EchoNav: Resetting Insight View for new URL");
            
            // Clear existing hierarchy content
            const existingHierarchy = logicalContent.querySelector('.logical-list');
            if (existingHierarchy) {
                existingHierarchy.remove();
            }
            
            // Reset to welcome state and update based on current Timeline data
            if (insightWelcome) {
                insightWelcome.style.display = 'block';
                updateInsightWelcomeState();
            }
        }

        // Update Insight View state based on current data
        function updateInsightViewState() {
            safeSendMessage({ action: "getInsightHierarchy" }, (response) => {
                if (response && response.error) {
                    console.error("EchoNav: Error getting insight hierarchy:", response.error);
                    // Show welcome state on error
                    insightWelcome.style.display = 'block';
                    updateInsightWelcomeState();
                    return;
                }
                
                const hasTimelineData = currentOutlineItems.length > 0;
                const hasInsightData = response && response.data && response.data.length > 0;
                
                console.log("EchoNav: updateInsightViewState - hasTimelineData:", hasTimelineData, "hasInsightData:", hasInsightData);
                
                if (hasInsightData) {
                    // Case (c): Already generated - hide welcome, show hierarchy
                    insightWelcome.style.display = 'none';
                    displayInsightHierarchy(response.data);
                } else {
                    // Case (a) or (b): Show welcome with appropriate state
                    insightWelcome.style.display = 'block';
                    updateInsightWelcomeState();
                    
                    // Clear any existing hierarchy content
                    const existingHierarchy = logicalContent.querySelector('.logical-list');
                    if (existingHierarchy) {
                        existingHierarchy.remove();
                    }
                }
            });
        }

        // Update welcome state based on Timeline data availability
        function updateInsightWelcomeState() {
            const hasTimelineData = currentOutlineItems.length > 0;
            const welcomeText = insightWelcome.querySelector('p');
            const generateBtn = insightWelcome.querySelector('#generate-logical-button');
            
            if (!hasTimelineData) {
                // Case (a): Can't generate yet
                welcomeText.textContent = 'Generate a Timeline first, then create an Insight hierarchy to better understand the conversation.';
                generateBtn.disabled = true;
                generateBtn.style.opacity = '0.5';
                console.log("EchoNav: Insight state (a) - No Timeline data, can't generate");
            } else {
                // Case (b): Ready to generate
                welcomeText.textContent = 'Create a hierarchical structure from your Timeline to better understand the conversation.';
                generateBtn.disabled = false;
                generateBtn.style.opacity = '1';
                console.log("EchoNav: Insight state (b) - Has Timeline data, ready to generate");
            }
        }


        // Load logical hierarchy function (now just calls updateInsightViewState)
        function loadInsightHierarchy() {
            updateInsightViewState();
        }

        // Display logical hierarchy function
        function displayInsightHierarchy(hierarchy) {
            if (!hierarchy || hierarchy.length === 0) {
                // Show welcome message instead of empty state
                insightWelcome.style.display = 'block';
                return;
            }

            // Hide welcome message when displaying hierarchy
            insightWelcome.style.display = 'none';
            
            // Clear any loading state first
            const loadingState = logicalContent.querySelector('.loading-state');
            if (loadingState) {
                loadingState.remove();
            }

            // Flatten the hierarchy into a simple list of rows
            const rows = [];

            function walk(node, level) {
                rows.push({
                    topic: node.topic,
                    level: level,
                    traceability: node.traceability || []
                });
                if (node.subpoints && node.subpoints.length > 0) {
                    node.subpoints.forEach(sp => walk(sp, level + 1));
                }
            }

            hierarchy.forEach(root => walk(root, 0));

            const list = document.createElement('div');
            list.className = 'logical-list';

            rows.forEach((row, index) => {
                // Add section divider before each new level-0 after the first
                if (row.level === 0 && index !== 0) {
                    const divider = document.createElement('div');
                    divider.className = 'logical-divider';
                    list.appendChild(divider);
                }

                const item = document.createElement('div');
                item.className = `logical-item level-${row.level}`;
                item.dataset.level = row.level; // Add level as data attribute for easier selection

                // Leading symbol to hint hierarchy without nesting
                const symbol = document.createElement('span');
                symbol.className = row.level === 0 ? 'logical-arrow' : 'logical-dot';
                if (row.level === 0) {
                    // Level 0 uses CSS arrow, no text content
                    // Set initial expanded state - check if this level-0 item has subpoints
                    let hasSubpoints = false;
                    for (let i = index + 1; i < rows.length; i++) {
                        if (rows[i].level === 0) break; // Reached next level-0 item
                        if (rows[i].level > 0) {
                            hasSubpoints = true;
                            break;
                        }
                    }
                    if (hasSubpoints) {
                        symbol.classList.add('expanded'); // Start expanded by default
                    }
                } else {
                    symbol.textContent = '•';
                }
                item.appendChild(symbol);

                const text = document.createElement('span');
                text.className = 'logical-text';
                // Clean text: remove emojis and standardize numbering
                text.textContent = cleanTextForDisplay(row.topic);
                item.appendChild(text);

                // Add click handlers
                if (row.level === 0) {
                    // Level 0: click arrow to toggle subpoints
                    symbol.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleInsightSubpoints(item, row, rows, index);
                    });
                } else {
                    // Level > 0: click to navigate to content
                    if (row.traceability && row.traceability.length > 0) {
                        item.style.cursor = 'pointer';
                        item.addEventListener('click', () => {
                            const best = findBestTraceabilityMatch({ traceability: row.traceability, isMerged: row.isMerged });
                            if (best) {
                                console.log(`EchoNav: Navigating to ${best.itemType} item:`, best.itemText || best.originalText);
                                
                                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                                    let navigationMessage;
                                    
                                    // Choose navigation method based on item type
                                    if (best.itemType === 'heading' && best.headingId) {
                                        // Use precise heading navigation
                                        // For headings, use itemText (actual heading text) instead of originalText
                                        navigationMessage = {
                                            action: 'scrollToHeading',
                                            headingId: best.headingId,
                                            headingText: best.itemText || best.originalText,
                                            accessibilityMode: true // Enable focus for better UX
                                        };
                                    } else if (best.itemType === 'theme' && best.paragraphIds && best.paragraphIds.length > 0) {
                                        // Navigate to first paragraph of theme
                                        // For themes, use itemText (theme name) for display
                                        navigationMessage = {
                                            action: 'scrollToParagraph',
                                            paragraphId: best.paragraphIds[0],
                                            paragraphText: best.itemText || best.originalText,
                                            accessibilityMode: true
                                        };
                                    } else {
                                        // Fallback to general content navigation
                                        // For turntitle and keypoints, use originalText (user question/matched sentence)
                                        navigationMessage = {
                                            action: 'scrollToSpecificContent',
                                            originalText: best.originalText,
                                            matchedSentence: best.match?.sentence,
                                            assistantUniqueId: best.assistantUniqueId,
                                            accessibilityMode: true
                                        };
                                    }
                                    
                                    chrome.tabs.sendMessage(tabs[0].id, navigationMessage);
                                });
                            }
                        });
                    }
                }

                list.appendChild(item);
            });

            // Remove existing hierarchy content but keep welcome message
            const existingList = logicalContent.querySelector('.logical-list');
            if (existingList) {
                existingList.remove();
            }
            
            logicalContent.appendChild(list);
            
            // Initialize accessibility features for the Insight hierarchy
            initializeInsightAccessibilityFeatures();
        }

        function toggleInsightSubpoints(item, row, allRows, currentIndex) {
            const arrow = item.querySelector('.logical-arrow');
            const isExpanded = arrow.classList.contains('expanded');
            
            // Find all logical items (not dividers)
            const allLogicalItems = Array.from(logicalContent.querySelectorAll('.logical-item'));
            const currentItemIndex = allLogicalItems.indexOf(item);
            
            if (isExpanded) {
                // Collapse: hide all subpoints of this level-0 item
                arrow.classList.remove('expanded');
                let nextIndex = currentItemIndex + 1;
                while (nextIndex < allLogicalItems.length) {
                    const nextItem = allLogicalItems[nextIndex];
                    // Check if this item belongs to current heading by checking data attributes
                    const nextItemLevel = parseInt(nextItem.dataset.level || '0');
                    if (nextItemLevel === 0) break; // Reached next heading
                    if (nextItemLevel > 0) {
                        nextItem.style.display = 'none';
                    }
                    nextIndex++;
                }
            } else {
                // Expand: show all subpoints of this level-0 item
                arrow.classList.add('expanded');
                let nextIndex = currentItemIndex + 1;
                while (nextIndex < allLogicalItems.length) {
                    const nextItem = allLogicalItems[nextIndex];
                    const nextItemLevel = parseInt(nextItem.dataset.level || '0');
                    if (nextItemLevel === 0) break; // Reached next heading
                    if (nextItemLevel > 0) {
                        nextItem.style.display = 'flex';
                    }
                    nextIndex++;
                }
            }
        }

        // Create hierarchy node element
        function createHierarchyNode(node, level) {
            const nodeDiv = document.createElement('div');
            nodeDiv.className = `hierarchy-node level-${level}`;
            nodeDiv.textContent = node.topic;
            
            // Add click handler for traceability - Level 0 should not be clickable
            if (level > 0 && node.traceability && node.traceability.length > 0) {
                nodeDiv.style.cursor = 'pointer';
                nodeDiv.addEventListener('click', () => {
                    // Try to find the best match for this specific bullet point
                    const bestTrace = findBestTraceabilityMatch(node);
                    if (bestTrace) {
                        console.log("EchoNav: Clicking to scroll to specific bullet point:", bestTrace.itemText || bestTrace.match?.sentence?.substring(0, 50) || bestTrace.originalText?.substring(0, 50));
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            let navigationMessage;
                            
                            // Choose navigation method based on item type (same logic as new UI)
                            if (bestTrace.itemType === 'heading' && bestTrace.headingId) {
                                navigationMessage = {
                                    action: 'scrollToHeading',
                                    headingId: bestTrace.headingId,
                                    headingText: bestTrace.itemText || bestTrace.originalText,
                                    accessibilityMode: true
                                };
                            } else if (bestTrace.itemType === 'theme' && bestTrace.paragraphIds && bestTrace.paragraphIds.length > 0) {
                                navigationMessage = {
                                    action: 'scrollToParagraph',
                                    paragraphId: bestTrace.paragraphIds[0],
                                    paragraphText: bestTrace.itemText || bestTrace.originalText,
                                    accessibilityMode: true
                                };
                            } else {
                                navigationMessage = {
                                    action: 'scrollToSpecificContent',
                                    originalText: bestTrace.originalText,
                                    matchedSentence: bestTrace.match?.sentence,
                                    assistantUniqueId: bestTrace.assistantUniqueId
                                };
                            }
                            
                            chrome.tabs.sendMessage(tabs[0].id, navigationMessage);
                        });
                    }
                });
            } else if (level === 0) {
                // Level 0 nodes should not be clickable
                nodeDiv.style.cursor = 'default';
                nodeDiv.style.opacity = '0.8';
            }
            
            // Add subpoints recursively
            if (node.subpoints && node.subpoints.length > 0) {
                node.subpoints.forEach(subpoint => {
                    const subpointElement = createHierarchyNode(subpoint, level + 1);
                    nodeDiv.appendChild(subpointElement);
                });
            }
            
            return nodeDiv;
        }

        // Helper function to find the best traceability match for a node
        // Updated to handle merged items and prioritize primary items
        function findBestTraceabilityMatch(node) {
            if (!node.traceability || node.traceability.length === 0) {
                return null;
            }
            
            // If there's only one traceability entry, use it
            if (node.traceability.length === 1) {
                return node.traceability[0];
            }
            
            // For merged items, prioritize the primary item
            if (node.isMerged) {
                const primaryTrace = node.traceability.find(trace => trace.isPrimary);
                if (primaryTrace) {
                    console.log(`EchoNav: Using primary trace for merged item "${node.topic}":`, primaryTrace.originalText);
                    return primaryTrace;
                }
            }
            
            // Fallback: prefer the one with a good match score
            const bestMatch = node.traceability.find(trace => 
                trace.match && trace.match.score > 0.5
            );
            
            return bestMatch || node.traceability[0];
        }

    function generateOutline() {
      // 添加一个延时，确保页面和content script都已加载
      setTimeout(() => {
        safeSendMessage({ action: "summarize" }, (response) => {
          if (response && response.error) {
            showError(response.error);
            return;
          }
          
          if (response.data && response.data.summary) {
            const { summary, items } = response.data;
            hideError();
            welcomeMessage.style.display = 'none';
            welcomeMessage.classList.add('hidden');
            newConversationMessage.style.display = 'none';
            newConversationMessage.classList.add('hidden');
            fullTextToRead = summary;
            currentOutlineItems = items;
            const ul = createClickableList(items);
            outlineDiv.innerHTML = '';
            outlineDiv.appendChild(ul);
            updateOutlineLandmark(true);
            
            // Initialize accessibility features for the new outline
            initializeAccessibilityFeatures();
            
            // Start periodic polling for new messages
            startPolling();
            
            // Update Insight View state when Timeline data changes
            updateInsightWelcomeState();
            
            // NEW FLOW: Trigger keypoints generation FIRST, then enable outline view
            // This ensures cards have keypoints when they're first displayed
            if (items && items.length > 0) {
                console.log("EchoNav: Triggering keypoints generation first, then will enable outline view");
                triggerTimelineKeypointsGeneration(async () => {
                    // Callback: After keypoints generated, merge them into items, then enable outline view
                    console.log("EchoNav: All keypoints generated, merging into items");
                    await loadAndMergeChatKeyPoints(items);
                    console.log("EchoNav: Keypoints merged, now enabling outline view");
                    safelyEnableOutlineView(items, 300);
                });
            }
          } else {
            showError("Could not find a conversation to summarize. Please make sure you're on a conversation page.");
          }
        });
      }, 1000); // 等待1秒确保content script已加载
    }

    // NEW: Trigger async timeline keypoints generation with callback support
    function triggerTimelineKeypointsGeneration(onComplete) {
        console.log("EchoNav: Triggering async timeline keypoints generation");
        
        if (!currentOutlineItems || currentOutlineItems.length === 0) {
            console.warn("EchoNav: No outline items to generate keypoints for");
            if (onComplete) onComplete();
            return;
        }
        
        // Get conversation ID from current URL
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) {
                console.warn("EchoNav: No active tab found");
                if (onComplete) onComplete();
                return;
            }
            
            const currentUrl = tabs[0].url;
            const conversationId = currentUrl.match(/\/c\/([a-f0-9-]+)/)?.[1];
            
            if (!conversationId) {
                console.warn("EchoNav: No conversation ID found in URL");
                if (onComplete) onComplete();
                return;
            }
            
            // Prepare turns data for keypoints generation
            const turns = currentOutlineItems.map((item, index) => ({
                messageIndex: index,
                user: item.originalText || '',
                assistant: item.assistantText || ''
            }));
            
            console.log(`EchoNav: Sending request to generate keypoints for ${turns.length} turns`);
            
            // Set up completion listener if callback is provided
            let completionListener = null;
            if (onComplete) {
                completionListener = (request) => {
                    if (request.action === "timelineKeypointsCompleted" && 
                        request.conversationId === conversationId) {
                        console.log("EchoNav: Received completion notification for keypoints generation");
                        chrome.runtime.onMessage.removeListener(completionListener);
                        onComplete();
                    }
                };
                chrome.runtime.onMessage.addListener(completionListener);
            }
            
            // Send request to background.js to generate keypoints asynchronously
            chrome.runtime.sendMessage({
                action: "generateTimelineKeypoints",
                conversationId: conversationId,
                turns: turns
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("EchoNav: Error sending keypoints generation request:", chrome.runtime.lastError);
                    if (completionListener) {
                        chrome.runtime.onMessage.removeListener(completionListener);
                    }
                    if (onComplete) onComplete(); // Call anyway to avoid hanging
                    return;
                }
                
                if (response && response.success) {
                    console.log("EchoNav: Timeline keypoints generation request accepted");
                } else if (response && response.error) {
                    console.error("EchoNav: Timeline keypoints generation request failed:", response.error);
                    if (completionListener) {
                        chrome.runtime.onMessage.removeListener(completionListener);
                    }
                    if (onComplete) onComplete(); // Call anyway to avoid hanging
                }
            });
        });
    }

    // NEW: Handle keypoint update for a specific turn
    function handleKeypointUpdate(turnIndex, keyPoints, messageIndex) {
        console.log(`EchoNav: Handling keypoint update for turn ${turnIndex}`);
        
        // Update the item in currentOutlineItems (for caching purposes)
        if (turnIndex < currentOutlineItems.length) {
            currentOutlineItems[turnIndex].chatKeyPoints = keyPoints;
            console.log(`EchoNav: Updated chatKeyPoints for turn ${turnIndex} in memory`);
            
            // NOTE: Sidepanel does NOT display keypoints, so no need to re-render the timeline
            // The keypoints are only displayed in the ChatGPT page's outline headers
            // Content.js will receive the update directly from background.js and handle the UI update
            
            console.log(`EchoNav: ✅ Keypoints data updated for turn ${turnIndex} (no UI update needed in sidepanel)`);
        } else {
            console.warn(`EchoNav: Turn index ${turnIndex} out of bounds`);
        }
    }

    // Handle read outline functionality
    function handleReadOutline() {
        if (!isSpeaking && currentOutlineItems.length > 0) {
            // Create numbered text for TTS
            const numberedText = currentOutlineItems.map((item, index) => {
                const number = index + 1;
                const numberWord = numberToWord(number);
                return `${numberWord}, ${item.title}`;
            }).join('. ');
            
            console.log("EchoNav: Reading numbered outline:", numberedText);
            
            chrome.tts.speak(numberedText, { 
                rate: 0.8, // Slightly slower for better comprehension
                onEvent: function(event) {
                    if (event.type === 'end' || event.type === 'interrupted') {
                        isSpeaking = false;
                    }
                }
            });
            isSpeaking = true;
        } else {
            chrome.tts.stop();
            isSpeaking = false;
        }
    }

    // Handle read insight hierarchy functionality
    function handleReadInsightHierarchy() {
        if (!isSpeaking) {
            const logicalItems = document.querySelectorAll('.logical-item');
            if (logicalItems.length > 0) {
                // Create hierarchical text for TTS
                const hierarchicalText = Array.from(logicalItems).map(item => {
                    const level = parseInt(item.dataset.level) || 0;
                    const title = item.querySelector('.logical-text')?.textContent || '';
                    const prefix = level === 0 ? 'Main topic:' : 'Subtopic:';
                    return `${prefix} ${title}`;
                }).join('. ');
                
                console.log("EchoNav: Reading insight hierarchy:", hierarchicalText);
                
                chrome.tts.speak(hierarchicalText, { 
                    rate: 0.8,
                    onEvent: function(event) {
                        if (event.type === 'end' || event.type === 'interrupted') {
                            isSpeaking = false;
                        }
                    }
                });
                isSpeaking = true;
            } else {
                alert('No insight hierarchy to read. Please generate insights first.');
            }
        } else {
            chrome.tts.stop();
            isSpeaking = false;
        }
    }


    // Convert number to word (1-20)
    function numberToWord(num) {
        const words = [
            'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'
        ];
        return words[num - 1] || num.toString();
    }
    
    // Function to focus on the latest timeline item (for post-keypoints navigation)
    function focusLatestTimelineItem() {
        console.log("EchoNav: Attempting to focus on latest timeline item");
        
        // First, ensure we're on the Timeline tab
        const timelineTabButton = document.querySelector('.tab-btn[data-tab="timeline"]');
        if (timelineTabButton && !timelineTabButton.classList.contains('active')) {
            console.log("EchoNav: Switching to Timeline tab first");
            timelineTabButton.click();
            
            // Wait for tab switch to complete
            setTimeout(() => {
                performLatestItemFocus();
            }, 300);
        } else {
            // Already on Timeline tab
            performLatestItemFocus();
        }
    }
    
    function performLatestItemFocus() {
        // Find the last timeline item
        const timelineContainer = document.querySelector('.timeline-container');
        if (!timelineContainer) {
            console.warn("EchoNav: Timeline container not found - outline may not be generated yet");
            
            // Announce to user
            if (window.EchoNavAccessibility) {
                window.EchoNavAccessibility.announce("Timeline not yet generated. Please generate the outline first.");
            }
            return;
        }
        
        const timelineItems = timelineContainer.querySelectorAll('.timeline-item');
        if (timelineItems.length === 0) {
            console.warn("EchoNav: No timeline items found");
            
            if (window.EchoNavAccessibility) {
                window.EchoNavAccessibility.announce("No conversation turns found in timeline.");
            }
            return;
        }
        
        // Get the last item (most recent turn)
        const latestItem = timelineItems[timelineItems.length - 1];
        console.log("EchoNav: Found latest timeline item:", latestItem);
        
        // Expand the item if it has expandable content
        const hasExpandable = latestItem.hasAttribute('aria-expanded');
        if (hasExpandable) {
            const isExpanded = latestItem.getAttribute('aria-expanded') === 'true';
            if (!isExpanded) {
                console.log("EchoNav: Expanding latest item to show its structure");
                // Trigger expansion via accessibility manager
                if (window.EchoNavAccessibility && window.EchoNavAccessibility.toggleTimelineExpansion) {
                    window.EchoNavAccessibility.toggleTimelineExpansion(latestItem);
                }
            }
        }
        
        // Use accessibility manager to focus on this item
        if (window.EchoNavAccessibility && window.EchoNavAccessibility.setFocus) {
            console.log("EchoNav: Using accessibility manager to focus latest item");
            window.EchoNavAccessibility.setFocus(latestItem);
            
            // Announce to user
            const itemTitle = latestItem.querySelector('.timeline-title')?.textContent || 'Latest turn';
            window.EchoNavAccessibility.announce(`Focused on latest conversation turn: ${itemTitle}. Use arrow keys to navigate, Space to jump. VO+Shift+Down to enter content.`);
        } else {
            // Fallback: direct focus
            console.log("EchoNav: Accessibility manager not available, using direct focus");
            latestItem.setAttribute('tabindex', '0');
            latestItem.focus();
            
            // Scroll into view
            latestItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    window.addEventListener('message', (event) => {
        const request = event.data;
        if (request && request.action === 'urlChanged') {
            console.log("EchoNav (iframe): URL changed message received via postMessage", request.url);
            handleUrlChange(request.url);
        } else if (request && request.action === 'focusLatestTimelineItem') {
            console.log("EchoNav (iframe): Focus latest timeline item requested");
            focusLatestTimelineItem();
        }
    });
  });
  
  function createClickableList(items) {
    console.log("EchoNav: Creating clickable list with", items.length, "items");
    
    const timeline = document.createElement('div');
    timeline.className = 'timeline-container';
    
    items.forEach((item, index) => {
        console.log(`EchoNav: Processing item ${index + 1}:`, {
            title: item.title,
            structuredDataType: item.structuredData?.type,
            responseStructureType: item.responseStructure?.type,
            hasResponseOutline: !!item.responseOutline
        });
        
        const timelineItem = document.createElement('div');
        timelineItem.className = 'timeline-item';
        timelineItem.dataset.index = index;
        // Store original text for accessibility jump functionality
        timelineItem.dataset.originalText = item.originalText || item.title;

        // Determine if this item has expandable content
        let hasExpandableContent = false;
        let contentStructure = null;
        
        if (item.structuredData) {
            switch (item.structuredData.type) {
                case 'structured':
                    console.log(`EchoNav: Item ${index + 1} - STRUCTURED CONTENT detected with ${item.structuredData.outline?.length || 0} headings`);
                    hasExpandableContent = item.structuredData.outline && item.structuredData.outline.length > 0;
                    contentStructure = 'headings';
                    break;
                case 'themed_groups':
                    console.log(`EchoNav: Item ${index + 1} - THEMED GROUPS detected with ${item.structuredData.themes?.length || 0} themes`);
                    hasExpandableContent = item.structuredData.themes && item.structuredData.themes.length > 0;
                    contentStructure = 'themes';
                    break;
                case 'simple_paragraphs':
                    console.log(`EchoNav: Item ${index + 1} - SIMPLE PARAGRAPHS detected with ${item.structuredData.paragraphs?.length || 0} paragraphs`);
                    // Simple paragraphs should not have expandable content
                    hasExpandableContent = false;
                    contentStructure = 'simple';
                    break;
                case 'key_points':
                    console.log(`EchoNav: Item ${index + 1} - KEY POINTS (fallback) with ${item.structuredData.keyPoints?.length || 0} points`);
                    hasExpandableContent = item.structuredData.keyPoints && item.structuredData.keyPoints.length > 0;
                    contentStructure = 'key_points';
                    break;
                case 'error':
                    console.log(`EchoNav: Item ${index + 1} - ERROR state:`, item.structuredData.message);
                    hasExpandableContent = false;
                    contentStructure = 'error';
                    break;
                default:
                    console.log(`EchoNav: Item ${index + 1} - Unknown structured data type:`, item.structuredData.type);
                    hasExpandableContent = false;
            }
        } else {
            // Fallback to legacy keyPoints handling
            console.log(`EchoNav: Item ${index + 1} - Using LEGACY keyPoints format`);
            const keyPointsArray = Array.isArray(item.keyPoints) 
                ? item.keyPoints 
                : (typeof item.keyPoints === 'string' ? item.keyPoints.split('\n').filter(kp => kp.trim()) : []);
            hasExpandableContent = keyPointsArray && keyPointsArray.length > 0;
            contentStructure = 'legacy';
        }

        // Timeline dot with integrated arrow (if has expandable content) - purely visual, no click handler
        const dot = document.createElement('div');
        dot.className = 'timeline-dot';
        dot.setAttribute('aria-hidden', 'true'); // Hide from accessibility tree
        
        if (hasExpandableContent) {
            dot.classList.add('timeline-dot-expandable');
        }
        
        timelineItem.appendChild(dot);

        // Content container
        const content = document.createElement('div');
        content.className = 'timeline-content';

        // Main title - no click handler, accessibility will handle all interactions
        const title = document.createElement('div');
        title.className = 'timeline-title';
        title.textContent = item.title;
        title.setAttribute('aria-hidden', 'true'); // Hide from accessibility tree, parent handles focus
        content.appendChild(title);
        
        // Add structured content based on type
        if (hasExpandableContent) {
            const expandableContainer = document.createElement('div');
            expandableContainer.className = 'timeline-expandable-content hidden';
            
            if (contentStructure === 'headings') {
                // Case A: Structured headings - render as hierarchical tree like Insight view
                console.log(`EchoNav: Rendering ${item.structuredData.outline.length} headings for item ${index + 1} as hierarchical structure`);
                
                // Create a hierarchical structure similar to Insight view
                const hierarchyList = document.createElement('div');
                hierarchyList.className = 'timeline-hierarchy';
                
                // Group headings by level and create tree structure
                const headingTree = buildHeadingTree(item.structuredData.outline);
                
                // New logic: Show all headings with proper hierarchy
                // Don't filter out single Level 1 headings - they provide important structure
                const level1Headings = item.structuredData.outline.filter(h => h.level === 1);
                
                // Keep all headings to maintain proper hierarchy and indentation
                const filteredHeadings = item.structuredData.outline;
                
                console.log(`EchoNav: Total headings: ${item.structuredData.outline.length}, Level 1 headings: ${level1Headings.length}`);
                console.log(`EchoNav: Showing all headings to maintain hierarchy: ${filteredHeadings.length} headings`);
                
                // Determine the highest level (minimum level value) in all headings
                const highestLevelInFiltered = filteredHeadings.length > 0 ? Math.min(...filteredHeadings.map(h => h.level)) : 1;
                console.log(`EchoNav: Highest level in headings: ${highestLevelInFiltered}`);
                
                filteredHeadings.forEach((heading, headingIndex) => {
                    // Add divider between major sections at the highest level shown
                    if (headingIndex > 0 && heading.level === highestLevelInFiltered) {
                        const divider = document.createElement('div');
                        divider.className = 'timeline-hierarchy-divider';
                        hierarchyList.appendChild(divider);
                    }
                    
                    // Calculate relative level: top-level items start at 0
                    const relativeLevel = heading.level - highestLevelInFiltered;
                    const isTopLevel = relativeLevel === 0;
                    const headingItem = createTimelineHierarchyItem(heading, headingIndex, isTopLevel, relativeLevel);
                    hierarchyList.appendChild(headingItem);
                });
                
                expandableContainer.appendChild(hierarchyList);
            } else if (contentStructure === 'themes') {
                // Case B1: Themed groups - render like the hierarchical list (same UI style as Case A/B2)
                console.log(`EchoNav: Rendering ${item.structuredData.themes.length} themes for item ${index + 1}`);
                const hierarchyList = document.createElement('div');
                hierarchyList.className = 'timeline-hierarchy';

                item.structuredData.themes.forEach((theme, tIndex) => {
                    // Add divider between themes (same as headings)
                    if (tIndex > 0) {
                        const divider = document.createElement('div');
                        divider.className = 'timeline-hierarchy-divider';
                        hierarchyList.appendChild(divider);
                    }
                    
                    const themeItem = createTimelineThemeItem(theme, tIndex);
                    hierarchyList.appendChild(themeItem);
                });

                expandableContainer.appendChild(hierarchyList);
            } else if (contentStructure === 'simple') {
                // Case B: Simple paragraphs - no expandable content needed
                console.log(`EchoNav: Simple paragraphs detected for item ${index + 1} - no expandable content will be shown`);
                // Don't add any content to expandableContainer for simple cases
            } else if (contentStructure === 'key_points') {
                // Fallback: Key points
                console.log(`EchoNav: Rendering ${item.structuredData.keyPoints.length} key points for item ${index + 1}`);
                item.structuredData.keyPoints.forEach((keyPoint, kIndex) => {
                    const keyPointDiv = document.createElement('div');
                    keyPointDiv.className = 'timeline-keypoint';
                    keyPointDiv.textContent = keyPoint.point;
                    console.log(`EchoNav: Added key point ${kIndex + 1}: "${keyPoint.point}"`);
                    expandableContainer.appendChild(keyPointDiv);
                });
            } else if (contentStructure === 'legacy') {
                // Legacy format
                console.log(`EchoNav: Using legacy keyPoints format for item ${index + 1}`);
                const keyPointsArray = Array.isArray(item.keyPoints) 
                    ? item.keyPoints 
                    : (typeof item.keyPoints === 'string' ? item.keyPoints.split('\n').filter(kp => kp.trim()) : []);
                
                keyPointsArray.forEach(keyPoint => {
                    const keyPointDiv = document.createElement('div');
                    keyPointDiv.className = 'timeline-keypoint';
                    // Remove asterisk formatting
                    const cleanKeyPoint = keyPoint.replace(/^\*\s*/, '').trim();
                    keyPointDiv.textContent = cleanKeyPoint;
                    expandableContainer.appendChild(keyPointDiv);
                });
            }
            
            content.appendChild(expandableContainer);
        } else if (contentStructure === 'error') {
            // Show error state
            const errorDiv = document.createElement('div');
            errorDiv.className = 'timeline-error';
            errorDiv.innerHTML = `<span class="error-marker">⚠️</span><span class="error-text">Error processing response: ${item.structuredData.message}</span>`;
            content.appendChild(errorDiv);
        }

        timelineItem.appendChild(content);
        
        // Add click event to title for scrolling to turn start
        title.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent timeline item click
            console.log(`EchoNav: Title clicked for turn ${index + 1}, scrolling to turn start`);
            
            // Scroll to the beginning of this conversation turn
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { 
                    action: 'scrollToSpecificContent',
                    originalText: item.originalText || item.title,
                    assistantUniqueId: item.assistantUniqueId
                });
            });
        });
        
        // Add click event to toggle expandable content
        if (hasExpandableContent) {
            timelineItem.style.cursor = 'pointer';
            timelineItem.addEventListener('click', (e) => {
                // Don't trigger if clicking on nested elements like hierarchy items
                if (e.target !== timelineItem && e.target !== title && e.target !== dot) {
                    return;
                }
                
                console.log(`EchoNav: Timeline item ${index + 1} clicked, toggling content`);
                toggleTimelineKeyPoints(timelineItem, null);
            });
            
            // Also add click event to the dot specifically
            if (dot) {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log(`EchoNav: Timeline dot ${index + 1} clicked, toggling content`);
                    toggleTimelineKeyPoints(timelineItem, null);
                });
            }
        }
        
        timeline.appendChild(timelineItem);
    });
    
    console.log("EchoNav: Timeline container created successfully with all items");
    return timeline;
  }

  // Helper function to build heading tree structure
  function buildHeadingTree(headings) {
    const tree = [];
    let currentRoot = null;
    
    headings.forEach(heading => {
      if (heading.level === 1) {
        // Level 1 heading - create new root
        currentRoot = {
          text: heading.text,
          level: heading.level,
          uniqueId: heading.uniqueId,
          tagName: heading.tagName,
          subheadings: []
        };
        tree.push(currentRoot);
      } else if (heading.level > 1 && currentRoot) {
        // Level 2+ heading - add as subheading
        currentRoot.subheadings.push({
          text: heading.text,
          level: heading.level,
          uniqueId: heading.uniqueId,
          tagName: heading.tagName
        });
      }
    });
    
    console.log(`EchoNav: Built heading tree with ${tree.length} root headings`);
    tree.forEach((root, index) => {
      console.log(`EchoNav: Root ${index + 1}: "${root.text}" with ${root.subheadings.length} subheadings`);
    });
    
    return tree;
  }

  // Helper function to clean text: remove emojis and standardize numbering
  function cleanTextForDisplay(text) {
    if (!text) return '';
    
    // Step 1: Remove all emojis (comprehensive Unicode emoji ranges)
    let cleaned = text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu, '');
    
    // Step 2: Standardize numbering formats to "1. 2. 3." format
    // Match patterns like: (1), (I), II., ②, 一、etc.
    
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
    
    // Step 3: Remove trailing colons and normalize multiple spaces
    cleaned = cleaned.replace(/:\s*$/, ''); // Remove trailing colon (冒号)
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  // Helper function to create hierarchy item (exactly matching Insight view)
  function createTimelineHierarchyItem(heading, index, isTopLevel = false, relativeLevel = 0) {
    const item = document.createElement('div');
    
    // Use relative level for CSS class (0 for top-level, 1 for first sub-level, etc.)
    // This ensures proper indentation regardless of the actual heading level
    const cssLevel = relativeLevel;
    item.className = `timeline-hierarchy-item level-${cssLevel}`;
    item.dataset.level = cssLevel;
    item.dataset.headingId = heading.uniqueId;

    // Symbol logic: Top-level items (first level under turn title) get NO dot
    // Sub-level items get a bullet point (•)
    const symbol = document.createElement('span');
    if (isTopLevel) {
      // Top-level heading under turn title - no symbol
      symbol.className = 'timeline-hierarchy-dot';
      symbol.textContent = '';
    } else {
      // Sub-level heading - show bullet point
      symbol.className = 'timeline-hierarchy-dot';
      symbol.textContent = '•';
    }
    item.appendChild(symbol);

    const text = document.createElement('span');
    text.className = 'timeline-hierarchy-text';
    // Clean text: remove emojis and standardize numbering
    const cleanText = cleanTextForDisplay(heading.text);
    text.textContent = cleanText;
    item.appendChild(text);

    // Add click handler for navigation
    item.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent timeline item click from firing
      console.log(`EchoNav: Navigating to heading: ${heading.text} (ID: ${heading.uniqueId})`);
      // Navigate to the specific heading in the content
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'scrollToHeading', 
          headingId: heading.uniqueId,
          headingText: heading.text  // Add text as fallback
        });
      });
    });

    return item;
  }

  // Helper: create theme item matching hierarchy UI and enabling scroll to first paragraph
  function createTimelineThemeItem(theme, index) {
    const item = document.createElement('div');
    // Themes are top-level in B1 → use level-0 style
    item.className = `timeline-hierarchy-item level-0`;
    item.dataset.level = 0;
    
    // Set identifiers for accessibility and navigation
    // Use first paragraphId as the navigation target
    const firstPara = Array.isArray(theme.paragraphs) && theme.paragraphs.length > 0 ? theme.paragraphs[0] : null;
    const firstId = firstPara && firstPara.uniqueId ? firstPara.uniqueId : (Array.isArray(theme.paragraphIds) && theme.paragraphIds.length > 0 ? theme.paragraphIds[0] : null);
    
    if (firstId) {
      // For theme items, use paragraphId as the navigation target
      // accessibility.js will check for this when headingId is not available
      item.dataset.paragraphId = firstId;
      // Also set as headingId for compatibility with existing accessibility code
      item.dataset.headingId = firstId;
    }

    const symbol = document.createElement('span');
    symbol.className = 'timeline-hierarchy-dot';
    symbol.textContent = '';
    item.appendChild(symbol);

    const text = document.createElement('span');
    text.className = 'timeline-hierarchy-text';
    // Clean text: remove emojis and standardize numbering
    text.textContent = cleanTextForDisplay(theme.themeName || `Theme ${index + 1}`);
    item.appendChild(text);

    // Click → scroll to first paragraph of this theme
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const firstText = firstPara && firstPara.text ? firstPara.text : null;
      
      if (!firstId) {
        console.warn('EchoNav: Theme has no paragraphs to navigate:', theme);
        return;
      }
      
      console.log(`EchoNav: Navigating to first paragraph of theme "${text.textContent}": ${firstId}`);
      console.log(`EchoNav: First paragraph text: "${firstText ? firstText.substring(0, 100) : 'N/A'}..."`);
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'scrollToParagraph',
          paragraphId: firstId,
          paragraphText: firstText  // Add text as fallback, like Case A does with headingText
        });
      });
    });

    return item;
  }

  // Helper function to toggle subheadings visibility
  function toggleTimelineSubheadings(item, heading) {
    const arrow = item.querySelector('.timeline-hierarchy-arrow');
    const isExpanded = arrow.classList.contains('expanded');
    
    // Find all hierarchy items (not dividers)
    const allItems = Array.from(item.parentNode.querySelectorAll('.timeline-hierarchy-item'));
    const currentItemIndex = allItems.indexOf(item);
    
    if (isExpanded) {
      // Collapse: hide all subheadings of this level-0 item
      arrow.classList.remove('expanded');
      let nextIndex = currentItemIndex + 1;
      while (nextIndex < allItems.length) {
        const nextItem = allItems[nextIndex];
        const nextItemLevel = parseInt(nextItem.dataset.level || '0');
        if (nextItemLevel === 0) break; // Reached next heading
        if (nextItemLevel > 0) {
          nextItem.style.display = 'none';
        }
        nextIndex++;
      }
    } else {
      // Expand: show all subheadings of this level-0 item
      arrow.classList.add('expanded');
      let nextIndex = currentItemIndex + 1;
      while (nextIndex < allItems.length) {
        const nextItem = allItems[nextIndex];
        const nextItemLevel = parseInt(nextItem.dataset.level || '0');
        if (nextItemLevel === 0) break; // Reached next heading
        if (nextItemLevel > 0) {
          nextItem.style.display = 'flex';
        }
        nextIndex++;
      }
    }
  }

  function toggleTimelineKeyPoints(timelineItem, keyPointsArray) {
    // Support both legacy and new structured content
    const expandableContainer = timelineItem.querySelector('.timeline-expandable-content') || 
                               timelineItem.querySelector('.timeline-keypoints');
    const dot = timelineItem.querySelector('.timeline-dot-expandable');
    
    if (expandableContainer && dot) {
        if (expandableContainer.classList.contains('hidden')) {
            expandableContainer.classList.remove('hidden');
            dot.classList.add('expanded');
            console.log("EchoNav: Expanded timeline item content");
        } else {
            expandableContainer.classList.add('hidden');
            dot.classList.remove('expanded');
            console.log("EchoNav: Collapsed timeline item content");
        }
    }
  }

  function toggleKeyPoints(itemDiv, item) {
    const keyPointsContainer = itemDiv.parentNode.querySelector(`.outline-keypoints[data-index="${itemDiv.dataset.index}"]`);
    const arrow = itemDiv.querySelector('.outline-arrow');
    
    if (keyPointsContainer) {
        if (keyPointsContainer.classList.contains('hidden')) {
            keyPointsContainer.classList.remove('hidden');
            arrow.textContent = '▾';
        } else {
            keyPointsContainer.classList.add('hidden');
            arrow.textContent = '▸';
        }
    }
  }

  function parseSummaryToTree(summary) {
    const lines = summary.split('\n').filter(line => line.trim() !== '');
    const root = { children: [] };
    const stack = [{ node: root, indent: -1 }];
  
    lines.forEach(line => {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;
      const content = line.trim();
  
      const newNode = { content: content, children: [] };
  
      while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }
  
      stack[stack.length - 1].node.children.push(newNode);
      stack.push({ node: newNode, indent: indent });
    });
  
    return root;
  }
  
  function createTreeElement(node) {
    if (node.children.length === 0) {
      return null;
    }
  
    const ul = document.createElement('ul');
    node.children.forEach(childNode => {
      const li = document.createElement('li');
      li.textContent = childNode.content.replace(/^- /, ''); // Clean up bullet points
      
      li.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent parent li elements from firing
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'scrollToText', text: childNode.content.replace(/^- /, '') });
        });
      });

      const childUl = createTreeElement(childNode);
      if (childUl) {
        li.appendChild(childUl);
      }
      ul.appendChild(li);
    });
  
    return ul;
  }
