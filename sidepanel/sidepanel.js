document.addEventListener('DOMContentLoaded', () => {
    const outlineDiv = document.getElementById('outline');
    const outlineViewButton = document.getElementById('outline-view-button');
    const generateButton = document.getElementById('generate-button');
        const retryButton = document.getElementById('retry-button');
        const welcomeMessage = document.getElementById('welcome-message');
        const errorMessage = document.getElementById('error-message');
        const errorText = errorMessage.querySelector('.error-text');
        const autoUpdateToggle = document.getElementById('auto-update-toggle');
    const generateInsightButton = document.getElementById('generate-logical-button');
    const logicalContent = document.getElementById('logical-content');
    const moreOptionsBtn = document.getElementById('more-options-btn');
    const moreOptionsPopup = document.getElementById('more-options-popup');
    const regenerateOption = document.getElementById('regenerate-option');
    const shareOption = document.getElementById('share-option');
    const readOption = document.getElementById('read-option');
    const insightWelcome = document.getElementById('insight-welcome');
    const showKeypointsToggle = document.getElementById('show-keypoints-toggle');
    let fullTextToRead = '';
    let isSpeaking = false;
    let currentOutlineItems = [];
    let pollingInterval = null;
    let isOutlineViewMode = false;
    let isMoreOptionsOpen = false;
    
        // Load toggle states
        chrome.storage.local.get(['autoUpdateEnabled', 'showKeypointsEnabled'], (result) => {
            if (result.autoUpdateEnabled !== undefined) {
                autoUpdateToggle.checked = result.autoUpdateEnabled;
            }
            if (result.showKeypointsEnabled !== undefined) {
                showKeypointsToggle.checked = result.showKeypointsEnabled;
            }
        });

        // Save toggle states when changed
        autoUpdateToggle.addEventListener('change', () => {
            chrome.storage.local.set({ autoUpdateEnabled: autoUpdateToggle.checked });
            console.log("EchoNav: Auto-update toggle changed to:", autoUpdateToggle.checked);
        });

        showKeypointsToggle.addEventListener('change', () => {
            const isEnabled = showKeypointsToggle.checked;
            chrome.storage.local.set({ 
                showKeypointsEnabled: isEnabled,
                showKeypointsInFullscreen: isEnabled 
            });
            console.log("EchoNav: Show keypoints toggle changed to:", isEnabled);
            
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

        // Regenerate option
        regenerateOption.addEventListener('click', () => {
            closeMoreOptions();
            const currentTab = getCurrentActiveTab();
            
            if (currentTab === 'timeline') {
                // Regenerate Flow outline
                chrome.runtime.sendMessage({ action: "regenerateOutline" }, (response) => {
                    if (response && response.success) {
                        // Clear the timeline content and start generation
                        const outlineDiv = document.getElementById('outline');
                        outlineDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Regenerating outline...</p></div>';
                        currentOutlineItems = [];
                        
                        // Start generation
                        generateOutline();
                    } else {
                        console.error("Failed to regenerate outline:", response.error);
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
                
                chrome.runtime.sendMessage({ action: "generateInsightHierarchy" }, (response) => {
                    console.log("EchoNav: Insight regeneration response received:", response);
                    
                    generateInsightButton.disabled = false;
                    generateInsightButton.innerHTML = '<span class="btn-icon">🚀</span> Generate Insight';
                    
                    if (!response || !response.success) {
                        console.error("EchoNav: Failed to start Insight regeneration");
                        logicalContent.innerHTML = '<div id="insight-welcome" class="welcome-state"><div class="welcome-icon">🧠</div><h2>Generate Insight</h2><p>Create a hierarchical structure from your Flow timeline to better understand the conversation.</p><button id="generate-logical-button" class="primary-btn"><span class="btn-icon">🚀</span> Generate Insight</button></div>';
                    }
                });
            }
        });

        // Share option
        shareOption.addEventListener('click', () => {
            closeMoreOptions();
            const currentTab = getCurrentActiveTab();
            
            if (currentTab === 'timeline') {
                // Share Flow outline
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
                        alert('Flow outline copied to clipboard!');
                    }).catch(() => {
                        alert('Failed to copy to clipboard. Please try again.');
                    });
                } else {
                    alert('No Flow outline to share. Please generate an outline first.');
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

        // Read option (moved from header)
        readOption.addEventListener('click', () => {
            closeMoreOptions();
            const currentTab = getCurrentActiveTab();
            
            if (currentTab === 'timeline') {
                // Read Flow outline
                handleReadOutline();
            } else if (currentTab === 'logical') {
                // Read Insight hierarchy
                handleReadInsightHierarchy();
            }
        });

        // Generate Insight Hierarchy button
        generateInsightButton.addEventListener('click', () => {
            generateInsightButton.disabled = true;
            generateInsightButton.innerHTML = '<span class="btn-icon">🧠</span> Generating...';
            logicalContent.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Generating logical hierarchy...</p></div>';
            
            chrome.runtime.sendMessage({ action: "generateInsightHierarchy" }, (response) => {
                generateInsightButton.disabled = false;
                generateInsightButton.innerHTML = '<span class="btn-icon">🧠</span> Generate Insight';
                
                if (response && response.error) {
                    logicalContent.innerHTML = `<p class="error-text">Error: ${response.error}</p>`;
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
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        outlineDiv.innerHTML = '';
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }

    generateButton.addEventListener('click', () => {
        hideError();
        welcomeMessage.style.display = 'none';
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
                // Clear the outline and show two shimmer placeholders (consistent with addFlowItem)
                outlineDiv.innerHTML = `
                    <div class="timeline-simple-placeholder">
                        <div class="timeline-shimmer"></div>
                    </div>
                    <div class="timeline-simple-placeholder">
                        <div class="timeline-shimmer"></div>
                    </div>
                `;
                currentOutlineItems = []; // Reset items array
            } else if (request.action === "addFlowItem") {
                console.log("EchoNav: Adding timeline item:", request.item.title);
                // Add the item to our array
                currentOutlineItems.push(request.item);
                
                // Immediately create the final Timeline UI with all current items
                const timeline = createClickableList(currentOutlineItems);
                outlineDiv.innerHTML = '';
                outlineDiv.appendChild(timeline);
                
                // Refresh accessibility features for streaming updates
                refreshAccessibilityFeatures();
                
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
            } else if (request.action === "exitOutlineView") {
                // Handle exit from outline view mode
                isOutlineViewMode = false;
                outlineViewButton.innerHTML = '<span class="icon">⛶</span><span class="text">Enter Fullscreen</span>';
                outlineViewButton.classList.remove('active');
            }
        });

    function resetSidepanel() {
        stopPolling(); // Stop polling when resetting
        welcomeMessage.style.display = 'block';
        hideError();
        outlineDiv.innerHTML = '';
        // TTS is now available through more options menu
        fullTextToRead = '';
        currentOutlineItems = [];
    }

    // Check for cached outline when sidepanel loads
    function loadCachedOutline() {
        chrome.runtime.sendMessage({ action: "getCachedOutline" }, (response) => {
            console.log("EchoNav: Cache response:", response);
            if (response && response.data && (response.data.summary || response.data.outline)) {
                console.log("EchoNav: Found cached outline, loading it");
                const { summary, outline, items } = response.data;
                const outlineText = summary || outline;
                hideError();
                welcomeMessage.style.display = 'none';
                fullTextToRead = outlineText;
                currentOutlineItems = items || [];
                
                if (items && items.length > 0) {
                    const ul = createClickableList(items);
                    outlineDiv.innerHTML = '';
                    outlineDiv.appendChild(ul);
                    
                    // Initialize accessibility features for the cached outline
                    initializeAccessibilityFeatures();
                    
                    // Start periodic polling for new messages
                    startPolling();
                    
                    // Update Insight View state when Flow data changes
                    updateInsightWelcomeState();
                } else {
                    // Fallback: parse the outline text if items are not available
                    const tree = parseSummaryToTree(outlineText);
                    const ul = createTreeElement(tree);
                    outlineDiv.innerHTML = '';
                    outlineDiv.appendChild(ul);
                }
            } else {
                console.log("EchoNav: No cached outline found");
                // Show welcome message
                welcomeMessage.style.display = 'block';
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
        chrome.runtime.sendMessage({ action: "checkNewMessages" }, (response) => {
            if (response && response.hasNewMessages) {
                if (autoUpdateToggle.checked) {
                    updateOutline();
                }
            } else if (response && response.pendingTurns > 0) {
                setTimeout(() => {
                    checkForNewMessages();
                }, 2000);
            } else if (response && response.completeTurns > 0) {
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

    // Stop polling when the document becomes hidden or is unloading
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else if (currentOutlineItems.length > 0) {
            startPolling();
        }
    });

    window.addEventListener('beforeunload', () => {
        stopPolling();
    });

    // Update outline with new messages only
    function updateOutline() {
        chrome.runtime.sendMessage({ action: "updateOutline" }, (response) => {
            if (response.error) {
                showError(response.error);
                return;
            }
            
            if (response.pending) {
                if (response.message && response.message.includes("No new turns found")) {
                    setTimeout(() => {
                        updateOutline();
                    }, 1000);
                }
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
                
                // Initialize accessibility features for the updated outline
                initializeAccessibilityFeatures();
                
                // Restart polling for new messages
                startPolling();
                
                // Update Insight View state when Flow data changes
                updateInsightWelcomeState();
            } else {
                showError("Could not update outline.");
            }
        });
    }

    // Load cached outline on startup
    loadCachedOutline();

    // Accessibility Integration Functions
    function initializeAccessibilityFeatures() {
        console.log('EchoNav: Initializing accessibility features...');
        
        // Check if EchoNavAccessibility is available
        if (typeof window.EchoNavAccessibility !== 'undefined') {
            // Small delay to ensure DOM is fully rendered
            setTimeout(() => {
                const outlineContainer = document.getElementById('outline');
                const timelineContainer = outlineContainer ? outlineContainer.querySelector('.timeline-container') : null;
                
                if (timelineContainer) {
                    window.EchoNavAccessibility.initializeTreeAccessibility(timelineContainer);
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
        }

        function closeMoreOptions() {
            isMoreOptionsOpen = false;
            moreOptionsPopup.classList.add('hidden');
            moreOptionsBtn.setAttribute('aria-expanded', 'false');
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
            
            // Reset to welcome state and update based on current Flow data
            if (insightWelcome) {
                insightWelcome.style.display = 'block';
                updateInsightWelcomeState();
            }
        }

        // Update Insight View state based on current data
        function updateInsightViewState() {
            chrome.runtime.sendMessage({ action: "getInsightHierarchy" }, (response) => {
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

        // Update welcome state based on Flow data availability
        function updateInsightWelcomeState() {
            const hasTimelineData = currentOutlineItems.length > 0;
            const welcomeText = insightWelcome.querySelector('p');
            const generateBtn = insightWelcome.querySelector('#generate-logical-button');
            
            if (!hasTimelineData) {
                // Case (a): Can't generate yet
                welcomeText.textContent = 'Generate a Flow timeline first, then create an Insight hierarchy to better understand the conversation.';
                generateBtn.disabled = true;
                generateBtn.style.opacity = '0.5';
                console.log("EchoNav: Insight state (a) - No Flow data, can't generate");
            } else {
                // Case (b): Ready to generate
                welcomeText.textContent = 'Create a hierarchical structure from your Flow timeline to better understand the conversation.';
                generateBtn.disabled = false;
                generateBtn.style.opacity = '1';
                console.log("EchoNav: Insight state (b) - Has Flow data, ready to generate");
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
                text.textContent = row.topic;
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
                            const best = findBestTraceabilityMatch({ traceability: row.traceability });
                            if (best) {
                                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                                    chrome.tabs.sendMessage(tabs[0].id, { 
                                        action: 'scrollToSpecificContent', 
                                        originalText: best.originalText,
                                        matchedSentence: best.match?.sentence,
                                        assistantUniqueId: best.assistantUniqueId
                                    });
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
                        console.log("EchoNav: Clicking to scroll to specific bullet point:", bestTrace.match?.sentence?.substring(0, 50) || bestTrace.originalText?.substring(0, 50));
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            // Send both the original text and the matched sentence for more precise navigation
                            chrome.tabs.sendMessage(tabs[0].id, { 
                                action: 'scrollToSpecificContent', 
                                originalText: bestTrace.originalText,
                                matchedSentence: bestTrace.match?.sentence,
                                assistantUniqueId: bestTrace.assistantUniqueId
                            });
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
        function findBestTraceabilityMatch(node) {
            if (!node.traceability || node.traceability.length === 0) {
                return null;
            }
            
            // If there's only one traceability entry, use it
            if (node.traceability.length === 1) {
                return node.traceability[0];
            }
            
            // If there are multiple entries, prefer the one with a good match
            const bestMatch = node.traceability.find(trace => 
                trace.match && trace.match.score > 0.5
            );
            
            return bestMatch || node.traceability[0];
        }

    function generateOutline() {
      // 添加一个延时，确保页面和content script都已加载
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: "summarize" }, (response) => {
          if (chrome.runtime.lastError) {
            showError("Connection error. Please make sure you're on a conversation page and try again.");
            return;
          }

          if (response.error) {
            showError(response.error);
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
            
            // Initialize accessibility features for the new outline
            initializeAccessibilityFeatures();
            
            // Start periodic polling for new messages
            startPolling();
            
            // Update Insight View state when Flow data changes
            updateInsightWelcomeState();
          } else {
            showError("Could not find a conversation to summarize. Please make sure you're on a conversation page.");
          }
        });
      }, 1000); // 等待1秒确保content script已加载
    }

    // Outline view mode toggle (renamed to "Enter Fullscreen")
    outlineViewButton.addEventListener('click', () => {
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
                        updateReadOptionText();
                    }
                }
            });
            isSpeaking = true;
            updateReadOptionText();
        } else {
            chrome.tts.stop();
            isSpeaking = false;
            updateReadOptionText();
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
                            updateReadOptionText();
                        }
                    }
                });
                isSpeaking = true;
                updateReadOptionText();
            } else {
                alert('No insight hierarchy to read. Please generate insights first.');
            }
        } else {
            chrome.tts.stop();
            isSpeaking = false;
            updateReadOptionText();
        }
    }

    // Update read option text based on speaking state
    function updateReadOptionText() {
        if (readOption) {
            const iconSpan = readOption.querySelector('.popup-icon');
            const textSpan = readOption.querySelector('.popup-text');
            
            if (isSpeaking) {
                iconSpan.textContent = '⏹️';
                textSpan.textContent = 'Stop';
            } else {
                iconSpan.textContent = '🔊';
                textSpan.textContent = 'Read';
            }
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

    window.addEventListener('message', (event) => {
        const request = event.data;
        if (request && request.action === 'urlChanged') {
            console.log("EchoNav (iframe): URL changed message received via postMessage", request.url);
            resetSidepanel();
            loadCachedOutline();
            resetInsightViewForNewURL();
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

        // Flow dot with integrated arrow (if has expandable content) - purely visual, no click handler
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
                
                // Render all headings in a flat structure exactly like Insight view
                // Filter out the heading that was used as turn title to avoid duplication
                const turnTitleText = item.title.trim();
                const filteredHeadings = item.structuredData.outline.filter(heading => {
                    const headingText = heading.text.trim();
                    return headingText !== turnTitleText;
                });
                
                console.log(`EchoNav: Filtered ${item.structuredData.outline.length} headings to ${filteredHeadings.length} (removed turn title: "${turnTitleText}")`);
                
                filteredHeadings.forEach((heading, headingIndex) => {
                    // Add divider between major sections (level 1 headings)
                    if (headingIndex > 0 && heading.level === 1) {
                        const divider = document.createElement('div');
                        divider.className = 'timeline-hierarchy-divider';
                        hierarchyList.appendChild(divider);
                    }
                    
                    const headingItem = createTimelineHierarchyItem(heading, headingIndex);
                    hierarchyList.appendChild(headingItem);
                });
                
                expandableContainer.appendChild(hierarchyList);
            } else if (contentStructure === 'themes') {
                // Case B1: Themed groups - render like the hierarchical list (same UI style as Case A/B2)
                console.log(`EchoNav: Rendering ${item.structuredData.themes.length} themes for item ${index + 1}`);
                const hierarchyList = document.createElement('div');
                hierarchyList.className = 'timeline-hierarchy';

                item.structuredData.themes.forEach((theme, tIndex) => {
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
                toggleFlowKeyPoints(timelineItem, null);
            });
            
            // Also add click event to the dot specifically
            if (dot) {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log(`EchoNav: Timeline dot ${index + 1} clicked, toggling content`);
                    toggleFlowKeyPoints(timelineItem, null);
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

  // Helper function to create hierarchy item (exactly matching Insight view)
  function createTimelineHierarchyItem(heading, index) {
    const item = document.createElement('div');
    // Map heading level to CSS level (h1=0, h2=1, h3=2, etc.)
    const cssLevel = heading.level - 1;
    item.className = `timeline-hierarchy-item level-${cssLevel}`;
    item.dataset.level = cssLevel;
    item.dataset.headingId = heading.uniqueId;

    // Add dot or arrow based on level and whether it has children
    const symbol = document.createElement('span');
    if (cssLevel === 0) {
      // Level 0 (h1) - no symbol for main headings
      symbol.className = 'timeline-hierarchy-dot';
      symbol.textContent = '';
    } else {
      // Level 1+ (h2, h3, etc.) - show bullet point
      symbol.className = 'timeline-hierarchy-dot';
      symbol.textContent = '•';
    }
    item.appendChild(symbol);

    const text = document.createElement('span');
    text.className = 'timeline-hierarchy-text';
    // Remove emojis and clean up text
    const cleanText = heading.text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
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

    const symbol = document.createElement('span');
    symbol.className = 'timeline-hierarchy-dot';
    symbol.textContent = '';
    item.appendChild(symbol);

    const text = document.createElement('span');
    text.className = 'timeline-hierarchy-text';
    text.textContent = theme.themeName || `Theme ${index + 1}`;
    item.appendChild(text);

    // Click → scroll to first paragraph of this theme
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const firstPara = Array.isArray(theme.paragraphs) && theme.paragraphs.length > 0 ? theme.paragraphs[0] : null;
      const firstId = firstPara && firstPara.uniqueId ? firstPara.uniqueId : (Array.isArray(theme.paragraphIds) && theme.paragraphIds.length > 0 ? theme.paragraphIds[0] : null);
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

  function toggleFlowKeyPoints(timelineItem, keyPointsArray) {
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
