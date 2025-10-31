/**
 * EchoNav Accessibility Manager
 * 
 * This module handles all accessibility features for the EchoNav Chrome extension,
 * focusing on screen reader support (especially VoiceOver on macOS) and
 * keyboard navigation according to WCAG 2.2 AA standards.
 */

class AccessibilityManager {
    constructor() {
        this.currentFocusedNode = null;
        this.treeContainer = null;
        this.ariaLiveRegion = null;
        this.isVoiceMode = false;
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('EchoNav Accessibility: Initializing...');
        
        // Get reference to ARIA live region
        this.ariaLiveRegion = document.getElementById('aria-announcements');
        
        if (!this.ariaLiveRegion) {
            console.error('EchoNav Accessibility: ARIA live region not found');
            return;
        }

        // Initialize tree accessibility when outline is generated
        this.observeOutlineChanges();
        
        // Add global keyboard shortcuts for quick navigation
        this.initializeGlobalShortcuts();
        
        // Announce welcome message on plugin open
        this.announceWelcome();
        
        console.log('EchoNav Accessibility: Initialized successfully');
    }

    /**
     * Announce welcome message based on current state
     */
    announceWelcome() {
        // Wait much longer for VoiceOver to completely finish web content announcement
        // VoiceOver typically takes 3-5 seconds to finish reading web area information
        setTimeout(() => {
            const welcomeMessage = document.getElementById('welcome-message');
            const newConversationMessage = document.getElementById('new-conversation-message');
            const outlineExists = document.querySelector('.timeline-container');
            
            let welcomeText = '';
            
            if (outlineExists) {
                // Timeline already exists
                const itemCount = outlineExists.querySelectorAll('.timeline-item').length;
                welcomeText = `Welcome to EchoNav for navigating ChatGPT conversations. Timeline with ${itemCount} conversation turns is ready. Press Tab to enter navigation, or use Command+Shift+T to jump directly to first turn.`;
            } else if (newConversationMessage && !newConversationMessage.classList.contains('hidden')) {
                // New conversation - waiting for user to start chatting
                welcomeText = `Welcome to EchoNav for navigating ChatGPT conversations. Start your conversation in ChatGPT, and EchoNav will automatically generate a timeline.`;
            } else if (welcomeMessage && welcomeMessage.style.display !== 'none') {
                // Existing conversation but no timeline generated yet
                welcomeText = `Welcome to EchoNav for navigating ChatGPT conversations. You can generate a timeline to structure the current conversation. Press Tab to access the generate button.`;
            }
            
            if (welcomeText) {
                // Use only VoiceOver-native announcement methods
                this.announceVoiceOverNative(welcomeText);
            }
        }, 5000); // Wait 5 seconds to ensure VoiceOver finishes web content announcement
    }

    /**
     * Announce using only VoiceOver-native methods (no Chrome TTS)
     */
    announceVoiceOverNative(message) {
        console.log('EchoNav: Announcing with VoiceOver native methods:', message);
        
        // Method 1: Temporary title change (most reliable for VoiceOver)
        const originalTitle = document.title;
        document.title = message;
        
        // Restore original title after VoiceOver reads it
        setTimeout(() => {
            document.title = originalTitle;
        }, 6000);
        
        // Method 2: Use assertive ARIA live region (backup method)
        setTimeout(() => {
            if (this.ariaLiveRegion) {
                this.ariaLiveRegion.setAttribute('aria-live', 'assertive');
                this.ariaLiveRegion.textContent = '';
                
                // Small delay to ensure VoiceOver notices the change
                setTimeout(() => {
                    this.ariaLiveRegion.textContent = message;
                }, 100);
                
                // Reset to polite after announcement
                setTimeout(() => {
                    this.ariaLiveRegion.setAttribute('aria-live', 'polite');
                }, 4000);
            }
        }, 1000);
        
        // Method 3: Focus management to help VoiceOver locate content
        setTimeout(() => {
            const firstFocusableElement = document.querySelector('button:not([aria-hidden="true"]), .tab-btn, [tabindex="0"]');
            if (firstFocusableElement) {
                firstFocusableElement.focus();
                console.log('EchoNav: Set focus to help VoiceOver locate content:', firstFocusableElement);
            }
        }, 3000);
    }

    /**
     * Initialize global keyboard shortcuts
     */
    initializeGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Command+Shift+T (or Ctrl+Shift+T on non-Mac) to jump to first timeline item
            const isModifier = e.metaKey || e.ctrlKey;
            
            if (isModifier && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                e.stopPropagation();
                this.jumpToFirstTimelineItem();
            }
        });
    }

    /**
     * Jump directly to the first timeline item
     */
    jumpToFirstTimelineItem() {
        // First, ensure we're on the Timeline tab
        const timelineTabButton = document.querySelector('.tab-btn[data-tab="timeline"]');
        if (timelineTabButton && !timelineTabButton.classList.contains('active')) {
            timelineTabButton.click();
            
            // Wait for tab switch
            setTimeout(() => {
                this.performJumpToFirst();
            }, 200);
        } else {
            this.performJumpToFirst();
        }
    }

    /**
     * Perform the actual jump to first timeline item
     */
    performJumpToFirst() {
        const timelineContainer = document.querySelector('.timeline-container');
        
        if (!timelineContainer) {
            this.announce('Timeline not yet generated. Please generate the timeline first.');
            return;
        }
        
        const timelineItems = timelineContainer.querySelectorAll('.timeline-item');
        
        if (timelineItems.length === 0) {
            this.announce('No conversation turns found in timeline.');
            return;
        }
        
        // Focus on the first item
        const firstItem = timelineItems[0];
        this.treeContainer = timelineContainer;
        this.setFocus(firstItem);
        
        // Announce successful jump with instructions
        const titleElement = firstItem.querySelector('.timeline-title');
        const title = titleElement ? titleElement.textContent.trim() : 'First turn';
        this.announce(`Jumped to first conversation turn: ${title}. Use arrow keys to navigate, Space to jump to content. Multiple expand/collapse keys available: Enter, 0-9, E/T/X, VO combinations.`);
    }

    /**
     * Initialize ARIA tree view for the Insight hierarchy
     */
    initializeInsightAccessibility(logicalList) {
        console.log('EchoNav Accessibility: Initializing Insight accessibility');
        
        // Count total categories for better description
        const categories = logicalList.querySelectorAll('.logical-item[data-level="0"]');
        const categoryCount = categories.length;
        
        // Apply ARIA tree role to logical list container with informative description
        logicalList.setAttribute('role', 'tree');
        logicalList.setAttribute('aria-label', `${categoryCount} content categories. Use arrow keys to navigate, Space to jump, VO+Right to enter tree`);
        logicalList.setAttribute('tabindex', '0');
        
        // Apply ARIA attributes to all logical items
        this.applyAriaAttributesToLogicalItems(logicalList);
        
        // Add keyboard event listeners for logical hierarchy
        this.addInsightKeyboardNavigation(logicalList);
        
        // Announce that the insight tree is ready with clear instructions
        this.announce('EchoNav insights ready! Use arrow keys to navigate, Space to jump, VO+Right to enter tree. Multiple expand/collapse keys available: Enter, 0-9, E/T/X, VO combinations.');
    }

    /**
     * Apply ARIA attributes to all logical items in the Insight hierarchy
     */
    applyAriaAttributesToLogicalItems(logicalList) {
        if (!logicalList) return;

        const logicalItems = logicalList.querySelectorAll('.logical-item');
        
        logicalItems.forEach((item, index) => {
            // Apply treeitem role
            item.setAttribute('role', 'treeitem');
            
            // Get level from dataset or class name
            const level = parseInt(item.dataset.level) || 0;
            item.setAttribute('aria-level', (level + 1).toString()); // Convert 0-based to 1-based
            item.setAttribute('tabindex', index === 0 ? '0' : '-1');
            
            // Check if item has subpoints (expandable) - only level-0 items can be expandable
            if (level === 0) {
                const arrow = item.querySelector('.logical-arrow');
                const hasSubpoints = this.checkIfLogicalItemHasSubpoints(item, logicalItems);
                
                if (hasSubpoints) {
                    const isExpanded = arrow && arrow.classList.contains('expanded');
                    item.setAttribute('aria-expanded', isExpanded.toString());
                    
                    // Generate descriptive aria-label for expandable items
                    const textElement = item.querySelector('.logical-text');
                    const title = textElement ? textElement.textContent.trim() : 'Untitled';
                    const subpointCount = this.countLogicalSubpoints(item, logicalItems);
                    
                    const ariaLabel = `Category: ${title}. Has ${subpointCount} subpoint${subpointCount !== 1 ? 's' : ''}. Space: Jump. VO+Space: Expand/Collapse`;
                    item.setAttribute('aria-label', ariaLabel);
                } else {
                    // No subpoints, just a simple item
                    const textElement = item.querySelector('.logical-text');
                    const title = textElement ? textElement.textContent.trim() : 'Untitled';
                    const ariaLabel = `Category: ${title}. Space: Jump to conversation`;
                    item.setAttribute('aria-label', ariaLabel);
                }
            } else {
                // Level 1+ items are subpoints
                const textElement = item.querySelector('.logical-text');
                const content = textElement ? textElement.textContent.trim() : 'Untitled';
                const ariaLabel = `Subpoint: ${content}. Space: Jump to this part of conversation`;
                item.setAttribute('aria-label', ariaLabel);
            }
        });

        // Set initial focusable item but do NOT automatically focus it
        // This allows users to Tab into the Insight tree naturally
        if (logicalItems.length > 0 && (!this.currentFocusedNode || !this.treeContainer)) {
            this.currentFocusedNode = logicalItems[0];
            this.treeContainer = logicalList; // Update current tree container reference
            // The first item keeps tabindex="0" but we don't call focus()
        }
    }

    /**
     * Check if a logical item has subpoints
     */
    checkIfLogicalItemHasSubpoints(item, allItems) {
        const currentIndex = Array.from(allItems).indexOf(item);
        const currentLevel = parseInt(item.dataset.level) || 0;
        
        // Look for next items to see if any are subpoints of this item
        for (let i = currentIndex + 1; i < allItems.length; i++) {
            const nextItem = allItems[i];
            const nextLevel = parseInt(nextItem.dataset.level) || 0;
            
            if (nextLevel > currentLevel) {
                return true; // Found a subpoint
            }
            if (nextLevel <= currentLevel) {
                break; // Reached next sibling or parent, no subpoints
            }
        }
        return false;
    }

    /**
     * Count subpoints for a logical item
     */
    countLogicalSubpoints(item, allItems) {
        const currentIndex = Array.from(allItems).indexOf(item);
        const currentLevel = parseInt(item.dataset.level) || 0;
        let count = 0;
        
        for (let i = currentIndex + 1; i < allItems.length; i++) {
            const nextItem = allItems[i];
            const nextLevel = parseInt(nextItem.dataset.level) || 0;
            
            if (nextLevel === currentLevel + 1) {
                count++; // Direct subpoint
            } else if (nextLevel <= currentLevel) {
                break; // Reached next sibling or parent
            }
        }
        return count;
    }

    /**
     * Add keyboard navigation for Insight hierarchy
     */
    addInsightKeyboardNavigation(logicalList) {
        if (!logicalList) return;

        // Listen for keydown events on the logical list container
        logicalList.addEventListener('keydown', (e) => {
            // Update tree container reference for this navigation session
            this.treeContainer = logicalList;
            this.handleKeyDown(e);
        });

        // Also listen for focus events to update current focused node
        logicalList.addEventListener('focus', (e) => {
            if (e.target.hasAttribute('role') && e.target.getAttribute('role') === 'treeitem') {
                this.treeContainer = logicalList;
                this.setFocus(e.target);
            }
        }, true);

        // Add individual event listeners to each logical item for better compatibility
        const logicalItems = logicalList.querySelectorAll('[role="treeitem"]');
        logicalItems.forEach(item => {
            item.addEventListener('keydown', (e) => {
                // Ensure this item is the focused one and update container reference
                if (item === this.currentFocusedNode) {
                    this.treeContainer = logicalList;
                    this.handleKeyDown(e);
                }
            });

            item.addEventListener('focus', (e) => {
                this.treeContainer = logicalList;
                this.setFocus(item);
            });
        });
    }

    /**
     * Observe changes to both outline containers and apply ARIA attributes
     */
    observeOutlineChanges() {
        const outlineContainer = document.getElementById('outline');
        const logicalContainer = document.getElementById('logical-content');
        
        if (!outlineContainer) {
            console.error('EchoNav Accessibility: Outline container not found');
            return;
        }
        
        if (!logicalContainer) {
            console.error('EchoNav Accessibility: Logical container not found');
            return;
        }

        // Create MutationObserver to watch for Timeline changes
        const outlineObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    const timelineContainer = outlineContainer.querySelector('.timeline-container');
                    if (timelineContainer && !timelineContainer.hasAttribute('role')) {
                        this.initializeTreeAccessibility(timelineContainer);
                    }
                }
            });
        });

        // Create MutationObserver to watch for Insight hierarchy changes
        const logicalObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    const logicalList = logicalContainer.querySelector('.logical-list');
                    if (logicalList && !logicalList.hasAttribute('role')) {
                        this.initializeInsightAccessibility(logicalList);
                    }
                }
            });
        });

        outlineObserver.observe(outlineContainer, {
            childList: true,
            subtree: true
        });
        
        logicalObserver.observe(logicalContainer, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Initialize ARIA tree view for the generated outline
     */
    initializeTreeAccessibility(treeContainer, skipAnnouncement = false) {
        console.log('EchoNav Accessibility: Initializing tree accessibility');
        
        this.treeContainer = treeContainer;
        
        // Count total items for better description
        const items = treeContainer.querySelectorAll('.timeline-item');
        const itemCount = items.length;
        
        // Make container transparent to VoiceOver - focus goes directly to timeline items
        treeContainer.setAttribute('role', 'presentation');
        // Remove all focus-related attributes from container
        treeContainer.removeAttribute('tabindex');
        treeContainer.removeAttribute('aria-label');
        
        // Apply ARIA attributes to all timeline items
        this.applyAriaAttributesToNodes();
        
        // Add keyboard event listeners
        this.addKeyboardNavigation();
        
        // Only announce if not skipping (e.g., if completion was already announced)
        if (!skipAnnouncement) {
            this.announce('EchoNav outline ready! Use arrow keys to navigate, Space to jump to content. Multiple keys for expand/collapse: Enter, numbers 0-9, letters E/T/X. VO combinations also supported. Command+Shift+T to jump to first turn.');
        }
    }

    /**
     * Apply ARIA attributes to all tree nodes
     */
    applyAriaAttributesToNodes() {
        if (!this.treeContainer) return;

        const timelineItems = this.treeContainer.querySelectorAll('.timeline-item');
        
        timelineItems.forEach((item, index) => {
            // Apply treeitem role
            item.setAttribute('role', 'treeitem');
            item.setAttribute('aria-level', '1');
            item.setAttribute('tabindex', index === 0 ? '0' : '-1');
            
            // Check if item has expandable content (legacy keypoints or new structured content)
            const keyPointsContainer = item.querySelector('.timeline-keypoints');
            const expandableContainer = item.querySelector('.timeline-expandable-content');
            const hierarchyContainer = item.querySelector('.timeline-hierarchy');
            
            const hasExpandableContent = (keyPointsContainer && keyPointsContainer.children.length > 0) ||
                                       (expandableContainer && !expandableContainer.classList.contains('hidden')) ||
                                       (hierarchyContainer && hierarchyContainer.children.length > 0);
            
            if (hasExpandableContent) {
                const isExpanded = expandableContainer ? 
                    !expandableContainer.classList.contains('hidden') :
                    !keyPointsContainer.classList.contains('hidden');
                    
                item.setAttribute('aria-expanded', isExpanded.toString());
                
                // Generate descriptive aria-label based on content type
                const titleElement = item.querySelector('.timeline-title');
                const title = titleElement ? titleElement.textContent.trim() : 'Untitled';
                const roundNumber = index + 1; // Convert 0-based to 1-based
                
                let contentCount = 0;
                let contentType = 'details';
                
                if (hierarchyContainer) {
                    // Count hierarchy items (headings or themes)
                    const hierarchyItems = hierarchyContainer.querySelectorAll('.timeline-hierarchy-item');
                    contentCount = hierarchyItems.length;
                    contentType = 'sections';
                } else if (keyPointsContainer) {
                    // Count legacy keypoints
                    contentCount = keyPointsContainer.children.length;
                    contentType = 'details';
                }
                
                const ariaLabel = `Conversation round ${roundNumber}: ${title}. Has ${contentCount} ${contentType}. Space: Jump. Multiple keys for expand/collapse: Enter, 0-9, E/T/X, VO+Space/Enter/0-9/E/T/X`;
                item.setAttribute('aria-label', ariaLabel);
                
                // Apply ARIA attributes to expandable content
                if (hierarchyContainer) {
                    this.applyAriaAttributesToHierarchy(hierarchyContainer, title);
                } else if (keyPointsContainer) {
                    this.applyAriaAttributesToKeyPoints(keyPointsContainer, title);
                }
            } else {
                // No expandable content, just a simple item
                const titleElement = item.querySelector('.timeline-title');
                const title = titleElement ? titleElement.textContent.trim() : 'Untitled';
                const roundNumber = index + 1; // Convert 0-based to 1-based
                const ariaLabel = `Conversation round ${roundNumber}: ${title}. Space: Jump to conversation. No expandable content`;
                item.setAttribute('aria-label', ariaLabel);
            }
        });

        // Set initial focusable item but do NOT automatically focus it
        // This allows users to Tab into the tree naturally after exploring the page structure
        if (timelineItems.length > 0 && !this.currentFocusedNode) {
            this.currentFocusedNode = timelineItems[0];
            // The first item keeps tabindex="0" but we don't call focus()
        }
    }

    /**
     * Apply ARIA attributes to keypoint items (level 2 in hierarchy)
     */
    applyAriaAttributesToKeyPoints(keyPointsContainer, parentTitle) {
        if (!keyPointsContainer) return;

        const keyPoints = keyPointsContainer.querySelectorAll('.timeline-keypoint');
        
        keyPoints.forEach((keyPoint, index) => {
            keyPoint.setAttribute('role', 'treeitem');
            keyPoint.setAttribute('aria-level', '2');
            keyPoint.setAttribute('tabindex', '-1');
            
            const keyPointText = keyPoint.textContent.trim();
            const ariaLabel = `Detail ${index + 1}: ${keyPointText}. Space: Jump to this part of conversation`;
            keyPoint.setAttribute('aria-label', ariaLabel);
        });
    }

    /**
     * Apply ARIA attributes to hierarchy items (Case A headings and Case B1 themes)
     */
    applyAriaAttributesToHierarchy(hierarchyContainer, parentTitle) {
        if (!hierarchyContainer) return;

        const hierarchyItems = hierarchyContainer.querySelectorAll('.timeline-hierarchy-item');
        
        hierarchyItems.forEach((item, index) => {
            item.setAttribute('role', 'treeitem');
            
            // Get level from CSS class or data attribute
            const level = parseInt(item.dataset.level) || 0;
            item.setAttribute('aria-level', (level + 2).toString()); // +2 because parent is level 1
            item.setAttribute('tabindex', '-1');
            
            // Generate descriptive aria-label based on content type
            const textElement = item.querySelector('.timeline-hierarchy-text');
            const itemText = textElement ? textElement.textContent.trim() : 'Untitled';
            
            // Determine if this is a heading (Case A) or theme (Case B1)
            let itemType = 'section';
            if (level === 0) {
                itemType = 'main section';
            } else {
                itemType = 'subsection';
            }
            
            const ariaLabel = `${itemType}: ${itemText}. Space: Jump to this part of conversation`;
            item.setAttribute('aria-label', ariaLabel);
            
            // Add click handler for navigation
            if (!item._accessibilityClickHandler) {
                const clickHandler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('EchoNav Accessibility: Hierarchy item clicked:', itemText);
                    this.jumpToHierarchyContent(item);
                };
                item._accessibilityClickHandler = clickHandler;
                item.addEventListener('click', clickHandler);
            }
        });
    }

    /**
     * Add keyboard navigation event listeners
     */
    addKeyboardNavigation() {
        if (!this.treeContainer) return;

        // Remove any existing listeners to avoid duplicates
        const oldHandler = this.treeContainer._accessibilityKeyHandler;
        if (oldHandler) {
            this.treeContainer.removeEventListener('keydown', oldHandler);
        }

        // Create a new handler and store reference for cleanup
        const keyHandler = (e) => {
            // Handle if the target is within our tree
            if (this.treeContainer.contains(e.target)) {
                console.log('EchoNav Accessibility: Handling keydown:', e.key, 'target:', e.target, 'currentFocusedNode:', this.currentFocusedNode);
                this.handleKeyDown(e);
            }
        };
        
        this.treeContainer._accessibilityKeyHandler = keyHandler;
        this.treeContainer.addEventListener('keydown', keyHandler, true); // Use capture phase

        // Focus management - listen for focus events on tree items
        const treeItems = this.treeContainer.querySelectorAll('[role="treeitem"]');
        
        // Container is now role="presentation" and should never receive focus
        treeItems.forEach((item, index) => {
            // Remove any existing focus listeners
            const oldFocusHandler = item._accessibilityFocusHandler;
            if (oldFocusHandler) {
                item.removeEventListener('focus', oldFocusHandler);
            }

            // Add new focus listener
            const focusHandler = (e) => {
                console.log('EchoNav Accessibility: Focus event on item:', item);
                // Update currentFocusedNode without calling setFocus to avoid infinite loop
                if (this.currentFocusedNode && this.currentFocusedNode !== item) {
                    this.currentFocusedNode.setAttribute('tabindex', '-1');
                }
                this.currentFocusedNode = item;
                item.setAttribute('tabindex', '0');
            };
            
            item._accessibilityFocusHandler = focusHandler;
            item.addEventListener('focus', focusHandler);

            // Add click handler for mouse users
            const clickHandler = (e) => {
                console.log('EchoNav Accessibility: Click event on item:', item);
                this.setFocus(item);
                // If it's a main timeline item, jump to conversation
                if (item.classList.contains('timeline-item')) {
                    this.jumpToContent(item);
                }
            };
            
            item.addEventListener('click', clickHandler);

            // Ensure proper tabindex management - only first item is tabbable
            item.setAttribute('tabindex', index === 0 ? '0' : '-1');
            
            // Make sure timeline items are directly accessible to screen readers (role already set in applyAriaAttributesToNodes)
            item.removeAttribute('aria-hidden');
        });

        console.log('EchoNav Accessibility: Event listeners added to', treeItems.length, 'tree items');
    }

    /**
     * Handle keyboard navigation
     * Supports both standard keyboard navigation and VoiceOver shortcuts
     */
    handleKeyDown(e) {
        console.log('EchoNav Accessibility: handleKeyDown key:', e.key, 'ctrlKey:', e.ctrlKey, 'altKey:', e.altKey, 'shiftKey:', e.shiftKey, 'focused node:', this.currentFocusedNode);

        // If no focused node or focused on container, try to focus the first available item
        if (!this.currentFocusedNode || this.currentFocusedNode === this.treeContainer || 
            this.currentFocusedNode.classList?.contains('timeline-container')) {
            console.log('EchoNav Accessibility: No focused node or on container, trying to focus first item');
            const allNodes = this.getAllVisibleTreeItems();
            if (allNodes.length > 0) {
                this.setFocus(allNodes[0]);
                this.announce('Entered first conversation turn');
                console.log('EchoNav Accessibility: Focused first item:', allNodes[0]);
                return; // Important: return here to prevent further processing
            } else {
                console.log('EchoNav Accessibility: No items available to focus');
                this.announce('No items available');
                return;
            }
        }

        const isVoiceOverModifier = e.ctrlKey && e.altKey; // Control + Option (VO modifier on macOS)

        // Handle Space key - always jumps to content
        if (e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            console.log('EchoNav Accessibility: Space key - jumping to content');
            this.jumpToContent(this.currentFocusedNode);
            return;
        }

        // Handle VoiceOver navigation
        // VoiceOver uses Control + Option as the primary modifier
        const isVoiceOver = e.ctrlKey && e.altKey;
        
        console.log('EchoNav Accessibility: Key event details:', {
            key: e.key,
            keyCode: e.keyCode,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            shiftKey: e.shiftKey,
            isVoiceOver: isVoiceOver,
            target: e.target?.className,
            currentNode: this.currentFocusedNode?.className,
            currentNodeHasExpanded: this.currentFocusedNode?.hasAttribute('aria-expanded'),
            currentNodeExpanded: this.currentFocusedNode?.getAttribute('aria-expanded')
        });
        
        // VoiceOver tree navigation - VO+Right/Left for hierarchical movement
        if (isVoiceOver) {
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: VO+Right detected on:', this.currentFocusedNode);
                
                // Make sure we're on a timeline item that can be expanded
                if (this.currentFocusedNode && this.currentFocusedNode.classList.contains('timeline-item')) {
                    console.log('EchoNav Accessibility: VO+Right - expanding timeline item');
                    this.expandOrMoveToChild();
                } else if (this.currentFocusedNode === this.treeContainer) {
                    // If somehow still on container, focus first item
                    const allNodes = this.getAllVisibleTreeItems();
                    if (allNodes.length > 0) {
                        this.setFocus(allNodes[0]);
                        this.announce('Entered tree, first item');
                    }
                } else {
                    console.log('EchoNav Accessibility: VO+Right - current node is not a timeline item:', this.currentFocusedNode?.className);
                    this.announce('Use VO+Right on timeline items to expand content');
                }
                return;
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: VO+Left - previous item or collapse');
                // If we're on an item, try to collapse it or move to parent
                if (this.currentFocusedNode !== this.treeContainer) {
                    this.collapseOrMoveToParent();
                } else {
                    // If we're on the tree container, announce we're at the top level
                    this.announce('At top level');
                }
                return;
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: VO+Down - expand and enter or move down');
                
                // If on a timeline item, expand it and move to first child
                if (this.currentFocusedNode && this.currentFocusedNode.classList.contains('timeline-item')) {
                    const isExpanded = this.currentFocusedNode.getAttribute('aria-expanded') === 'true';
                    
                    if (!isExpanded) {
                        // Expand the item first
                        console.log('EchoNav Accessibility: VO+Down - expanding collapsed item');
                        this.toggleExpansion(this.currentFocusedNode);
                        
                        // Then move to first child after a brief delay to ensure expansion completes
                        setTimeout(() => {
                            const firstChild = this.getFirstChildOfExpandedItem(this.currentFocusedNode);
                            if (firstChild) {
                                console.log('EchoNav Accessibility: VO+Down - moving to first child after expansion');
                                this.setFocus(firstChild);
                                this.announce('Expanded and entered child level');
                            } else {
                                this.announce('Expanded, but no child content found');
                            }
                        }, 50);
                    } else {
                        // Already expanded, just move to first child
                        const firstChild = this.getFirstChildOfExpandedItem(this.currentFocusedNode);
                        if (firstChild) {
                            console.log('EchoNav Accessibility: VO+Down - moving to first child of expanded item');
                            this.setFocus(firstChild);
                            this.announce('Entered child level');
                        } else {
                            // No children, fall back to regular down navigation
                            this.moveToNext();
                        }
                    }
                } else {
                    // Not on a timeline item, use regular navigation
                    this.moveToNext();
                }
                return;
            } else if (e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: VO+Space - activate item');
                // VO+Space should activate the current item (expand/collapse or jump)
                this.activateNode();
                return;
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: VO+Enter - expand/collapse shortcut');
                this.forceToggleExpansion('VO+Enter');
                return;
            } else if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: VO+' + e.key + ' - expand/collapse shortcut');
                this.forceToggleExpansion('VO+' + e.key);
                return;
            } else if (['e', 'E', 't', 'T', 'x', 'X'].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: VO+' + e.key + ' - expand/collapse shortcut');
                this.forceToggleExpansion('VO+' + e.key.toLowerCase());
                return;
            }
        }

        // Standard keyboard shortcuts (without VO modifier)
        // Handle Enter key as universal expand/collapse
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            console.log('EchoNav Accessibility: Enter key - expand/collapse shortcut');
            this.forceToggleExpansion('Enter');
            return;
        }

        // Handle number keys as expand/collapse shortcuts
        if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            console.log('EchoNav Accessibility: Number key ' + e.key + ' - expand/collapse shortcut');
            this.forceToggleExpansion(e.key);
            return;
        }

        // Handle letter keys as expand/collapse shortcuts
        if (['e', 'E', 't', 'T', 'x', 'X'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            console.log('EchoNav Accessibility: Letter key ' + e.key + ' - expand/collapse shortcut');
            this.forceToggleExpansion(e.key.toLowerCase());
            return;
        }

        // Handle all arrow keys as sibling navigation (simple and universal)
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: Arrow Down/Right - next sibling');
                this.moveToNext();
                break;
            case 'ArrowUp':
            case 'ArrowLeft':
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: Arrow Up/Left - previous sibling');
                this.moveToPrevious();
                break;
            case 'Home':
                e.preventDefault();
                e.stopPropagation();
                this.moveToFirst();
                break;
            case 'End':
                e.preventDefault();
                e.stopPropagation();
                this.moveToLast();
                break;
        }
    }

    /**
     * Move focus to next visible node (standard navigation)
     */
    moveToNext() {
        const allVisibleNodes = this.getAllVisibleTreeItems();
        console.log('EchoNav Accessibility: moveToNext - allVisibleNodes:', allVisibleNodes.length, 'currentFocusedNode:', this.currentFocusedNode);
        
        if (allVisibleNodes.length === 0) {
            console.log('EchoNav Accessibility: No visible nodes found');
            this.announce('No items available');
            return;
        }
        
        const currentIndex = allVisibleNodes.indexOf(this.currentFocusedNode);
        console.log('EchoNav Accessibility: moveToNext - currentIndex:', currentIndex);
        
        if (currentIndex < allVisibleNodes.length - 1) {
            const nextNode = allVisibleNodes[currentIndex + 1];
            this.setFocus(nextNode);
            
            // Announce with round number if it's a timeline item
            if (nextNode.classList.contains('timeline-item')) {
                const timelineItems = this.treeContainer.querySelectorAll('.timeline-item');
                const itemIndex = Array.from(timelineItems).indexOf(nextNode);
                if (itemIndex >= 0) {
                    const roundNumber = itemIndex + 1;
                    this.announce(`Conversation round ${roundNumber}`);
                } else {
                    this.announce('Next item');
                }
            } else {
                this.announce('Next item');
            }
        } else {
            this.announce('End of items');
        }
    }




    /**
     * Move focus to previous visible node
     */
    moveToPrevious() {
        const allVisibleNodes = this.getAllVisibleTreeItems();
        console.log('EchoNav Accessibility: moveToPrevious - allVisibleNodes:', allVisibleNodes.length, 'currentFocusedNode:', this.currentFocusedNode);
        
        if (allVisibleNodes.length === 0) {
            console.log('EchoNav Accessibility: No visible nodes found');
            this.announce('No items available');
            return;
        }
        
        const currentIndex = allVisibleNodes.indexOf(this.currentFocusedNode);
        console.log('EchoNav Accessibility: moveToPrevious - currentIndex:', currentIndex);
        
        if (currentIndex > 0) {
            const prevNode = allVisibleNodes[currentIndex - 1];
            this.setFocus(prevNode);
            
            // Announce with round number if it's a timeline item
            if (prevNode.classList.contains('timeline-item')) {
                const timelineItems = this.treeContainer.querySelectorAll('.timeline-item');
                const itemIndex = Array.from(timelineItems).indexOf(prevNode);
                if (itemIndex >= 0) {
                    const roundNumber = itemIndex + 1;
                    this.announce(`Conversation round ${roundNumber}`);
                } else {
                    this.announce('Previous item');
                }
            } else {
                this.announce('Previous item');
            }
        } else {
            this.announce('Beginning of items');
        }
    }

    /**
     * Expand node or move to first child if already expanded
     */
    expandOrMoveToChild() {
        const isExpanded = this.currentFocusedNode.getAttribute('aria-expanded') === 'true';
        
        // Support both legacy and new expandable content structures
        const keyPointsContainer = this.currentFocusedNode.querySelector('.timeline-keypoints');
        const expandableContainer = this.currentFocusedNode.querySelector('.timeline-expandable-content');
        const hierarchyContainer = this.currentFocusedNode.querySelector('.timeline-hierarchy');
        
        console.log('EchoNav Accessibility: expandOrMoveToChild - isExpanded:', isExpanded, 
                   'keyPointsContainer:', !!keyPointsContainer, 
                   'expandableContainer:', !!expandableContainer,
                   'hierarchyContainer:', !!hierarchyContainer);
        
        const hasExpandableContent = keyPointsContainer || expandableContainer || hierarchyContainer;
        
        if (hasExpandableContent && !isExpanded) {
            // Expand the node
            console.log('EchoNav Accessibility: Expanding timeline item');
            this.toggleExpansion(this.currentFocusedNode);
        } else if (hasExpandableContent && isExpanded) {
            // Move to first child - check different container types
            let firstChild = null;
            
            if (hierarchyContainer) {
                firstChild = hierarchyContainer.querySelector('.timeline-hierarchy-item');
            } else if (keyPointsContainer) {
                firstChild = keyPointsContainer.querySelector('.timeline-keypoint');
            } else if (expandableContainer) {
                firstChild = expandableContainer.querySelector('.timeline-keypoint, .timeline-hierarchy-item');
            }
            
            if (firstChild) {
                console.log('EchoNav Accessibility: Moving to first child:', firstChild);
                this.setFocus(firstChild);
                this.announce('Entered child level');
            } else {
                console.log('EchoNav Accessibility: No first child found to move to');
                this.announce('No child content available');
            }
        } else {
            console.log('EchoNav Accessibility: No expandable content found');
            this.announce('This item has no expandable content');
        }
    }

    /**
     * Get first child element of an expanded timeline item
     */
    getFirstChildOfExpandedItem(timelineItem) {
        if (!timelineItem) return null;
        
        // Check different container types for child elements
        const keyPointsContainer = timelineItem.querySelector('.timeline-keypoints');
        const expandableContainer = timelineItem.querySelector('.timeline-expandable-content');
        const hierarchyContainer = timelineItem.querySelector('.timeline-hierarchy');
        
        let firstChild = null;
        
        // Priority: hierarchy items > keypoints
        if (hierarchyContainer && !hierarchyContainer.classList.contains('hidden')) {
            firstChild = hierarchyContainer.querySelector('.timeline-hierarchy-item');
        } else if (expandableContainer && !expandableContainer.classList.contains('hidden')) {
            // Check if expandable container has hierarchy items first, then keypoints
            firstChild = expandableContainer.querySelector('.timeline-hierarchy-item') ||
                        expandableContainer.querySelector('.timeline-keypoint');
        } else if (keyPointsContainer && !keyPointsContainer.classList.contains('hidden')) {
            firstChild = keyPointsContainer.querySelector('.timeline-keypoint');
        }
        
        console.log('EchoNav Accessibility: getFirstChildOfExpandedItem found:', firstChild?.className);
        return firstChild;
    }

    /**
     * Collapse node or move to parent if already collapsed
     */
    collapseOrMoveToParent() {
        const level = parseInt(this.currentFocusedNode.getAttribute('aria-level'));
        
        if (level === 2) {
            // Move to parent (level 1 item)
            const parentItem = this.currentFocusedNode.closest('.timeline-item');
            if (parentItem) {
                this.setFocus(parentItem);
                this.announce('Exited to parent level');
            }
        } else if (level === 1) {
            const isExpanded = this.currentFocusedNode.getAttribute('aria-expanded') === 'true';
            if (isExpanded) {
                // Collapse the node
                this.toggleExpansion(this.currentFocusedNode);
            }
        }
    }

    /**
     * Toggle expansion only (for Enter key)
     */
    toggleExpansionOnly() {
        const hasExpandableContent = this.currentFocusedNode.hasAttribute('aria-expanded');
        
        if (hasExpandableContent) {
            this.toggleExpansion(this.currentFocusedNode);
        } else {
            this.announce('This item has no expandable details');
        }
    }

    /**
     * Activate the current node (VO+Space)
     */
    activateNode() {
        if (!this.currentFocusedNode) return;
        
        const hasExpandableContent = this.currentFocusedNode.hasAttribute('aria-expanded');
        
        if (hasExpandableContent) {
            // If it has expandable content, toggle expansion
            console.log('EchoNav Accessibility: VO+Space - toggling expansion');
            this.toggleExpansion(this.currentFocusedNode);
        } else {
            // If it doesn't have expandable content, jump to conversation
            console.log('EchoNav Accessibility: VO+Space - jumping to conversation');
            this.jumpToContent(this.currentFocusedNode);
        }
    }

    /**
     * Expand an item (VO+Shift+Down)
     */
    expandItem(node) {
        if (node.classList.contains('timeline-item')) {
            const isExpanded = node.getAttribute('aria-expanded') === 'true';
            if (!isExpanded) {
                console.log('EchoNav Accessibility: Expanding timeline item');
                this.toggleTimelineExpansion(node);
            } else {
                console.log('EchoNav Accessibility: Timeline item already expanded');
                this.announce('Already expanded');
            }
        } else if (node.classList.contains('logical-item')) {
            const isExpanded = node.getAttribute('aria-expanded') === 'true';
            if (!isExpanded) {
                console.log('EchoNav Accessibility: Expanding logical item');
                this.toggleInsightExpansion(node);
            } else {
                console.log('EchoNav Accessibility: Logical item already expanded');
                this.announce('Already expanded');
            }
        } else {
            console.log('EchoNav Accessibility: Item cannot be expanded');
            this.announce('This item cannot be expanded');
        }
    }

    /**
     * Collapse an item (VO+Shift+Up)
     */
    collapseItem(node) {
        if (node.classList.contains('timeline-item')) {
            const isExpanded = node.getAttribute('aria-expanded') === 'true';
            if (isExpanded) {
                console.log('EchoNav Accessibility: Collapsing timeline item');
                this.toggleTimelineExpansion(node);
            } else {
                console.log('EchoNav Accessibility: Timeline item already collapsed');
                this.announce('Already collapsed');
            }
        } else if (node.classList.contains('logical-item')) {
            const isExpanded = node.getAttribute('aria-expanded') === 'true';
            if (isExpanded) {
                console.log('EchoNav Accessibility: Collapsing logical item');
                this.toggleInsightExpansion(node);
            } else {
                console.log('EchoNav Accessibility: Logical item already collapsed');
                this.announce('Already collapsed');
            }
        } else {
            console.log('EchoNav Accessibility: Item cannot be collapsed');
            this.announce('This item cannot be collapsed');
        }
    }

    /**
     * Activate the current node (expand/collapse or jump to content)
     */
    activateNode() {
        const hasKeyPoints = this.currentFocusedNode.hasAttribute('aria-expanded');
        
        if (hasKeyPoints) {
            // For expandable nodes, always jump to content first
            // Users can use arrow keys to expand if needed
            this.jumpToContent(this.currentFocusedNode);
        } else {
            // For non-expandable nodes, just jump to content
            this.jumpToContent(this.currentFocusedNode);
        }
    }

    /**
     * Force toggle expansion - multiple direct approaches for reliability
     */
    forceToggleExpansion(shortcutUsed) {
        console.log(`EchoNav Accessibility: forceToggleExpansion called with ${shortcutUsed} on:`, this.currentFocusedNode);
        
        if (!this.currentFocusedNode) {
            console.log('EchoNav Accessibility: No focused node for expansion');
            this.announce('No item selected');
            return;
        }

        if (!this.currentFocusedNode.classList.contains('timeline-item')) {
            console.log('EchoNav Accessibility: Current node is not a timeline item, trying Insight expansion');
            
            // Try Insight expansion for logical items
            if (this.currentFocusedNode.classList.contains('logical-item')) {
                this.toggleInsightExpansion(this.currentFocusedNode);
            } else {
                this.announce(`${shortcutUsed} only works on conversation turns or categories`);
            }
            return;
        }

        // Timeline item processing
        const keyPointsContainer = this.currentFocusedNode.querySelector('.timeline-keypoints');
        const expandableContainer = this.currentFocusedNode.querySelector('.timeline-expandable-content');
        const hierarchyContainer = this.currentFocusedNode.querySelector('.timeline-hierarchy');
        const dot = this.currentFocusedNode.querySelector('.timeline-dot-expandable');

        console.log(`EchoNav Accessibility: Found containers - keypoints:${!!keyPointsContainer} expandable:${!!expandableContainer} hierarchy:${!!hierarchyContainer} dot:${!!dot}`);

        const hasAnyContent = keyPointsContainer || expandableContainer || hierarchyContainer;

        if (!hasAnyContent) {
            console.log('EchoNav Accessibility: No expandable content found');
            this.announce('This conversation turn has no expandable content');
            return;
        }

        // Determine current state - check multiple containers
        let isCurrentlyExpanded = false;
        let targetContainer = null;

        if (expandableContainer) {
            targetContainer = expandableContainer;
            isCurrentlyExpanded = !expandableContainer.classList.contains('hidden');
        } else if (keyPointsContainer) {
            targetContainer = keyPointsContainer;
            isCurrentlyExpanded = !keyPointsContainer.classList.contains('hidden');
        }

        console.log(`EchoNav Accessibility: Target container:${targetContainer?.className} currently expanded:${isCurrentlyExpanded}`);

        if (!targetContainer) {
            console.log('EchoNav Accessibility: No target container found');
            this.announce('Unable to expand/collapse this item');
            return;
        }

        // Force toggle the state
        const newExpandedState = !isCurrentlyExpanded;
        console.log(`EchoNav Accessibility: Forcing toggle from ${isCurrentlyExpanded} to ${newExpandedState}`);

        try {
            // Method 1: Direct DOM manipulation
            if (newExpandedState) {
                // Expand
                targetContainer.classList.remove('hidden');
                targetContainer.style.display = '';
                if (dot) {
                    dot.classList.add('expanded');
                }
                this.currentFocusedNode.setAttribute('aria-expanded', 'true');
                console.log('EchoNav Accessibility: Direct expansion completed');
            } else {
                // Collapse
                targetContainer.classList.add('hidden');
                targetContainer.style.display = 'none';
                if (dot) {
                    dot.classList.remove('expanded');
                }
                this.currentFocusedNode.setAttribute('aria-expanded', 'false');
                console.log('EchoNav Accessibility: Direct collapse completed');
            }

            // Method 2: Try clicking the timeline item as backup
            setTimeout(() => {
                if (this.currentFocusedNode.click) {
                    console.log('EchoNav Accessibility: Backup click method triggered');
                    this.currentFocusedNode.click();
                }
            }, 100);

            // Update ARIA label
            this.updateTimelineItemAriaLabel(this.currentFocusedNode, newExpandedState);

            // Announce result
            const action = newExpandedState ? 'expanded' : 'collapsed';
            this.announce(`Content ${action} using ${shortcutUsed}`);
            
            // Refresh tree accessibility after state change
            setTimeout(() => {
                this.refreshTreeAccessibility();
            }, 150);

        } catch (error) {
            console.error('EchoNav Accessibility: Error in forceToggleExpansion:', error);
            this.announce('Failed to toggle expansion');
        }
    }

    /**
     * Update aria-label for timeline item
     */
    updateTimelineItemAriaLabel(item, isExpanded) {
        const titleElement = item.querySelector('.timeline-title');
        const title = titleElement ? titleElement.textContent.trim() : 'Untitled';
        const timelineItems = this.treeContainer.querySelectorAll('.timeline-item');
        const itemIndex = Array.from(timelineItems).indexOf(item);
        const roundNumber = itemIndex >= 0 ? itemIndex + 1 : 0;

        // Count content
        let contentCount = 0;
        let contentType = 'details';
        
        const hierarchyContainer = item.querySelector('.timeline-hierarchy');
        const expandableContainer = item.querySelector('.timeline-expandable-content');
        const keyPointsContainer = item.querySelector('.timeline-keypoints');
        
        if (hierarchyContainer || (expandableContainer && expandableContainer.querySelector('.timeline-hierarchy'))) {
            const hierarchyItems = (hierarchyContainer || expandableContainer).querySelectorAll('.timeline-hierarchy-item');
            contentCount = hierarchyItems.length;
            contentType = 'sections';
        } else if (keyPointsContainer || (expandableContainer && expandableContainer.querySelector('.timeline-keypoint'))) {
            const keyPoints = (keyPointsContainer || expandableContainer).querySelectorAll('.timeline-keypoint');
            contentCount = keyPoints.length;
            contentType = 'details';
        }

        const expandedState = isExpanded ? 'expanded' : 'collapsed';
        const ariaLabel = `Conversation round ${roundNumber}: ${title}. Has ${contentCount} ${contentType} (${expandedState}). Space: Jump. Multiple keys available for expand/collapse: Enter, 0-9, E/T/X, VO combinations`;
        item.setAttribute('aria-label', ariaLabel);
        
        console.log('EchoNav Accessibility: Updated aria-label:', ariaLabel);
    }

    /**
     * Toggle expansion state of a node (works for both Timeline and Insight views)
     */
    toggleExpansion(node) {
        // Check if this is a Timeline item or Insight logical item
        if (node.classList.contains('timeline-item')) {
            this.toggleTimelineExpansion(node);
        } else if (node.classList.contains('logical-item')) {
            this.toggleInsightExpansion(node);
        }
    }

    /**
     * Toggle expansion for Timeline items
     */
    toggleTimelineExpansion(node) {
        // Support both legacy (.timeline-keypoints) and new (.timeline-expandable-content) structures
        const keyPointsContainer = node.querySelector('.timeline-keypoints');
        const expandableContainer = node.querySelector('.timeline-expandable-content');
        const hierarchyContainer = node.querySelector('.timeline-hierarchy');
        const dot = node.querySelector('.timeline-dot-expandable');
        
        console.log('EchoNav Accessibility: toggleTimelineExpansion called on', node, 
                   'keypoints:', !!keyPointsContainer, 'expandable:', !!expandableContainer, 
                   'hierarchy:', !!hierarchyContainer, 'dot:', !!dot);
        
        const targetContainer = expandableContainer || keyPointsContainer;
        
        if (targetContainer) {
            const isCurrentlyExpanded = node.getAttribute('aria-expanded') === 'true';
            const newExpandedState = !isCurrentlyExpanded;
            
            console.log('EchoNav Accessibility: Toggling from', isCurrentlyExpanded, 'to', newExpandedState);
            
            // Update visual state
            if (newExpandedState) {
                targetContainer.classList.remove('hidden');
                if (dot) dot.classList.add('expanded');
            } else {
                targetContainer.classList.add('hidden');
                if (dot) dot.classList.remove('expanded');
            }
            
            // Update ARIA state
            node.setAttribute('aria-expanded', newExpandedState.toString());
            
            // Update aria-label - get round number and content info
            const titleElement = node.querySelector('.timeline-title');
            const title = titleElement ? titleElement.textContent.trim() : 'Untitled';
            const timelineItems = this.treeContainer.querySelectorAll('.timeline-item');
            const itemIndex = Array.from(timelineItems).indexOf(node);
            const roundNumber = itemIndex >= 0 ? itemIndex + 1 : 0;
            
            let contentCount = 0;
            let contentType = 'details';
            
            if (hierarchyContainer || (expandableContainer && expandableContainer.querySelector('.timeline-hierarchy'))) {
                const hierarchyItems = (hierarchyContainer || expandableContainer).querySelectorAll('.timeline-hierarchy-item');
                contentCount = hierarchyItems.length;
                contentType = 'sections';
            } else if (keyPointsContainer || (expandableContainer && expandableContainer.querySelector('.timeline-keypoint'))) {
                const keyPoints = (keyPointsContainer || expandableContainer).querySelectorAll('.timeline-keypoint');
                contentCount = keyPoints.length;
                contentType = 'details';
            }
            
            const ariaLabel = `Conversation round ${roundNumber}: ${title}. Has ${contentCount} ${contentType}. Space: Jump. Multiple keys for expand/collapse: Enter, 0-9, E/T/X, VO combinations`;
            node.setAttribute('aria-label', ariaLabel);
            
            // Re-apply ARIA attributes to content when expanded
            if (newExpandedState) {
                if (hierarchyContainer || (expandableContainer && expandableContainer.querySelector('.timeline-hierarchy'))) {
                    this.applyAriaAttributesToHierarchy(hierarchyContainer || expandableContainer.querySelector('.timeline-hierarchy'), title);
                } else if (keyPointsContainer || (expandableContainer && expandableContainer.querySelector('.timeline-keypoint'))) {
                    this.applyAriaAttributesToKeyPoints(keyPointsContainer || expandableContainer, title);
                }
            }
            
            // Announce the change
            this.announce(newExpandedState ? `${contentType} shown` : `${contentType} hidden`);
            
            return true;
        } else {
            console.log('EchoNav Accessibility: No expandable container found for expansion');
            this.announce('This item has no expandable details');
            return false;
        }
    }

    /**
     * Toggle expansion for Insight logical items
     */
    toggleInsightExpansion(node) {
        const arrow = node.querySelector('.logical-arrow');
        
        // Only level-0 items can be expanded
        const level = parseInt(node.dataset.level) || 0;
        if (level !== 0 || !arrow) return;
        
        const isCurrentlyExpanded = node.getAttribute('aria-expanded') === 'true';
        const newExpandedState = !isCurrentlyExpanded;
        
        // Update visual state
        if (newExpandedState) {
            arrow.classList.add('expanded');
        } else {
            arrow.classList.remove('expanded');
        }
        
        // Find and show/hide all direct subpoints of this item
        const allLogicalItems = Array.from(this.treeContainer.querySelectorAll('.logical-item'));
        const currentIndex = allLogicalItems.indexOf(node);
        
        for (let i = currentIndex + 1; i < allLogicalItems.length; i++) {
            const nextItem = allLogicalItems[i];
            const nextLevel = parseInt(nextItem.dataset.level) || 0;
            
            if (nextLevel === 0) {
                break; // Reached next top-level item
            }
            
            if (nextLevel > 0) {
                // This is a subpoint, show/hide it
                if (newExpandedState) {
                    nextItem.style.display = '';
                } else {
                    nextItem.style.display = 'none';
                }
            }
        }
        
        // Update ARIA state
        node.setAttribute('aria-expanded', newExpandedState.toString());
        
        // Update aria-label
        const textElement = node.querySelector('.logical-text');
        const title = textElement ? textElement.textContent.trim() : 'Untitled';
        const subpointCount = this.countLogicalSubpoints(node, allLogicalItems);
        const ariaLabel = `Category: ${title}. Has ${subpointCount} subpoint${subpointCount !== 1 ? 's' : ''}. Space: Jump. VO+Space: Expand/Collapse`;
        node.setAttribute('aria-label', ariaLabel);
        
        // Announce the change
        this.announce(newExpandedState ? 'Details shown' : 'Details hidden');
    }

    /**
     * Jump to content in ChatGPT conversation (works for both Timeline and Insight views)
     */
    jumpToContent(node) {
        console.log('EchoNav Accessibility: jumpToContent called with node:', node);
        console.log('EchoNav Accessibility: Node classes:', node?.className);
        console.log('EchoNav Accessibility: Node dataset:', node?.dataset);
        
        // Determine what content to jump to
        let textToFind = '';
        let nodeType = '';
        
        if (node.classList.contains('timeline-keypoint')) {
            // Timeline keypoint - use its text content
            textToFind = node.textContent.trim();
            nodeType = 'keypoint';
            console.log('EchoNav Accessibility: Timeline keypoint detected, text:', textToFind.substring(0, 100));
        } else if (node.classList.contains('timeline-hierarchy-item')) {
            // Timeline hierarchy item (headings/themes) - handle separately
            console.log('EchoNav Accessibility: Timeline hierarchy item detected, delegating to jumpToHierarchyContent');
            this.jumpToHierarchyContent(node);
            return; // Exit early as we're delegating to specific handler
        } else if (node.classList.contains('timeline-item')) {
            // Timeline main item - get original text from data or title
            const titleElement = node.querySelector('.timeline-title');
            console.log('EchoNav Accessibility: Timeline item detected, titleElement:', !!titleElement);
            
            if (titleElement) {
                // Try to get original text from dataset if available
                const datasetOriginal = node.dataset.originalText;
                const titleText = titleElement.textContent.trim();
                const originalText = datasetOriginal || titleText;
                
                console.log('EchoNav Accessibility: Dataset originalText:', datasetOriginal);
                console.log('EchoNav Accessibility: Title text:', titleText);
                console.log('EchoNav Accessibility: Final originalText:', originalText);
                
                textToFind = originalText;
                nodeType = 'conversation turn';
                
                // Also check for assistantUniqueId for more precise navigation
                const assistantId = node.dataset.assistantUniqueId;
                console.log('EchoNav Accessibility: Assistant unique ID:', assistantId);
            }
        } else if (node.classList.contains('logical-item')) {
            // Insight logical item - get text content
            const textElement = node.querySelector('.logical-text');
            if (textElement) {
                textToFind = textElement.textContent.trim();
                const level = parseInt(node.dataset.level) || 0;
                nodeType = level === 0 ? 'category' : 'subpoint';
            }
        } else {
            console.warn('EchoNav Accessibility: Unknown node type for jump:', node?.className);
        }
        
        if (textToFind) {
            console.log('EchoNav Accessibility: Attempting to jump to:', nodeType, textToFind.substring(0, 100));
            
            // Announce jump intention with return instruction BEFORE jumping
            this.announce(`Jumping to ${nodeType}. To return to EchoNav, use browser back button or click EchoNav extension icon.`);
            
            // Small delay to ensure the announcement is heard before jumping
            setTimeout(() => {
                // Send message to content script to perform the jump
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs[0]) {
                        console.log('EchoNav Accessibility: Sending message to tab:', tabs[0].id);
                        
                        // Prepare message based on node type and available data
                        let message;
                        
                        if (node.classList.contains('timeline-item')) {
                            // For timeline items, use more specific navigation if assistantUniqueId is available
                            const assistantId = node.dataset.assistantUniqueId;
                            if (assistantId) {
                                message = {
                                    action: 'scrollToSpecificContent',
                                    originalText: textToFind,
                                    assistantUniqueId: assistantId,
                                    accessibilityMode: true
                                };
                            } else {
                                message = {
                                    action: 'scrollToText', 
                                    text: textToFind,
                                    accessibilityMode: true
                                };
                            }
                        } else {
                            // For other node types, use general text search
                            message = {
                                action: 'scrollToText', 
                                text: textToFind,
                                accessibilityMode: true
                            };
                        }
                        
                        console.log('EchoNav Accessibility: Sending message:', message);
                        
                        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
                            console.log('EchoNav Accessibility: Received response:', response);
                            
                            // Check for chrome.runtime.lastError
                            if (chrome.runtime.lastError) {
                                console.error('EchoNav Accessibility: Chrome runtime error:', chrome.runtime.lastError);
                                this.announce(`Jump failed: ${chrome.runtime.lastError.message}`);
                                return;
                            }
                            
                            // Only announce if jump failed (success is obvious from content reading)
                            if (!response || !response.success) {
                                this.announce(`Could not find ${nodeType} in conversation. The content may have been edited or moved.`);
                            }
                        });
                    } else {
                        console.error('EchoNav Accessibility: No active tab found');
                        this.announce('Jump failed: No active tab found');
                    }
                });
            }, 1000); // 1 second delay to hear the announcement
        } else {
            console.warn('EchoNav Accessibility: No text to find for jump');
            this.announce('Jump failed: No content found to jump to');
        }
    }

    /**
     * Jump to hierarchy content (Case A headings or Case B1 themes)
     */
    jumpToHierarchyContent(hierarchyItem) {
        const textElement = hierarchyItem.querySelector('.timeline-hierarchy-text');
        const itemText = textElement ? textElement.textContent.trim() : '';
        const headingId = hierarchyItem.dataset.headingId;
        
        if (!itemText && !headingId) {
            console.warn('EchoNav Accessibility: No content to jump to for hierarchy item');
            this.announce('Jump failed: No content found');
            return;
        }
        
        console.log('EchoNav Accessibility: Attempting to jump to hierarchy content:', itemText);
        
        // Announce jump intention
        this.announce(`Jumping to section: ${itemText}. Focus will move to the content.`);
        
        // Small delay to ensure the announcement is heard
        setTimeout(() => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                    // Determine the appropriate action based on available data
                    let message;
                    
                    if (headingId) {
                        // Case A: Heading with ID
                        message = {
                            action: 'scrollToHeading',
                            headingId: headingId,
                            headingText: itemText,
                            accessibilityMode: true
                        };
                    } else {
                        // Case B1: Theme - try to find by text or use paragraph scroll
                        message = {
                            action: 'scrollToText',
                            text: itemText,
                            accessibilityMode: true
                        };
                    }
                    
                    chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
                        console.log('EchoNav Accessibility: Hierarchy jump response:', response);
                        
                        if (chrome.runtime.lastError) {
                            console.error('EchoNav Accessibility: Chrome runtime error:', chrome.runtime.lastError);
                            this.announce(`Jump failed: ${chrome.runtime.lastError.message}`);
                            return;
                        }
                        
                        if (!response || !response.success) {
                            this.announce(`Could not find section in conversation. The content may have been edited or moved.`);
                        }
                    });
                } else {
                    console.error('EchoNav Accessibility: No active tab found');
                    this.announce('Jump failed: No active tab found');
                }
            });
        }, 800); // Shorter delay for hierarchy navigation
    }

    /**
     * Move focus to first tree item
     */
    moveToFirst() {
        const allVisibleNodes = this.getAllVisibleTreeItems();
        if (allVisibleNodes.length > 0) {
            this.setFocus(allVisibleNodes[0]);
            this.announce('First item');
        }
    }

    /**
     * Move focus to last visible tree item
     */
    moveToLast() {
        const allVisibleNodes = this.getAllVisibleTreeItems();
        if (allVisibleNodes.length > 0) {
            this.setFocus(allVisibleNodes[allVisibleNodes.length - 1]);
            this.announce('Last item');
        }
    }

    /**
     * Set focus to a specific node
     */
    setFocus(node) {
        if (this.currentFocusedNode) {
            this.currentFocusedNode.setAttribute('tabindex', '-1');
        }
        
        this.currentFocusedNode = node;
        node.setAttribute('tabindex', '0');
        node.focus();
    }

    /**
     * Get all currently visible tree items (including expanded keypoints/subpoints)
     */
    getAllVisibleTreeItems() {
        if (!this.treeContainer) {
            console.log('EchoNav Accessibility: No treeContainer found');
            return [];
        }
        
        console.log('EchoNav Accessibility: getAllVisibleTreeItems - treeContainer:', this.treeContainer, 'classes:', this.treeContainer.className);
        
        const visibleNodes = [];
        
        // Check if this is a Timeline container or Insight logical container
        if (this.treeContainer.classList.contains('timeline-container')) {
            console.log('EchoNav Accessibility: Processing timeline-container');
            // Timeline logic
            const timelineItems = this.treeContainer.querySelectorAll('.timeline-item');
            console.log('EchoNav Accessibility: Found timeline items:', timelineItems.length);
            
            timelineItems.forEach(item => {
                visibleNodes.push(item);
                
                // Check if this item is expanded and has visible content
                const isExpanded = item.getAttribute('aria-expanded') === 'true';
                if (isExpanded) {
                    // Check for legacy keypoints
                    const keyPoints = item.querySelectorAll('.timeline-keypoint');
                    keyPoints.forEach(keyPoint => {
                        visibleNodes.push(keyPoint);
                    });
                    
                    // Check for new hierarchy items (Case A headings and Case B1 themes)
                    const hierarchyItems = item.querySelectorAll('.timeline-hierarchy-item');
                    hierarchyItems.forEach(hierarchyItem => {
                        visibleNodes.push(hierarchyItem);
                    });
                }
            });
        } else if (this.treeContainer.classList.contains('logical-list')) {
            console.log('EchoNav Accessibility: Processing logical-list');
            // Insight hierarchy logic
            const logicalItems = this.treeContainer.querySelectorAll('.logical-item');
            console.log('EchoNav Accessibility: Found logical items:', logicalItems.length);
            
            logicalItems.forEach(item => {
                // Check if item is currently visible (not hidden by parent collapse)
                const isVisible = !item.style.display || item.style.display !== 'none';
                if (isVisible) {
                    visibleNodes.push(item);
                }
            });
        } else {
            console.log('EchoNav Accessibility: Unknown container type, trying to find any tree items');
            // Fallback: try to find any tree items in the container
            const anyTreeItems = this.treeContainer.querySelectorAll('[role="treeitem"]');
            console.log('EchoNav Accessibility: Found any tree items:', anyTreeItems.length);
            anyTreeItems.forEach(item => {
                visibleNodes.push(item);
            });
        }
        
        console.log('EchoNav Accessibility: getAllVisibleTreeItems returning:', visibleNodes.length, 'nodes');
        return visibleNodes;
    }

    /**
     * Announce message to screen reader
     */
    announce(message) {
        if (this.ariaLiveRegion) {
            // Clear previous message first
            this.ariaLiveRegion.textContent = '';
            
            // Use a small delay to ensure screen reader picks up the change
            setTimeout(() => {
                this.ariaLiveRegion.textContent = message;
            }, 100);
        }
        
        console.log('EchoNav Accessibility Announcement:', message);
    }

    /**
     * Update tree accessibility when content changes
     * This method should be called when the outline is regenerated
     */
    refreshTreeAccessibility() {
        if (this.treeContainer) {
            // Check what type of container this is and refresh accordingly
            if (this.treeContainer.classList.contains('timeline-container')) {
                this.applyAriaAttributesToNodes();
                this.addKeyboardNavigation(); // Re-bind event listeners
            } else if (this.treeContainer.classList.contains('logical-list')) {
                this.applyAriaAttributesToLogicalItems(this.treeContainer);
                this.addInsightKeyboardNavigation(this.treeContainer); // Re-bind event listeners
            }
            this.announce('EchoNav outline refreshed with latest conversation content');
        }
    }
}

// Initialize the accessibility manager
window.EchoNavAccessibility = new AccessibilityManager();

// Export for use by sidepanel.js if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AccessibilityManager;
}
