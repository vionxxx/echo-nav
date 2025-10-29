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
        
        console.log('EchoNav Accessibility: Initialized successfully');
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
        this.announce('EchoNav insights ready! Use arrow keys to navigate, Space to jump, VO+Right to enter tree, VO+Space to expand/collapse.');
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

        // Create MutationObserver to watch for Flow timeline changes
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
    initializeTreeAccessibility(treeContainer) {
        console.log('EchoNav Accessibility: Initializing tree accessibility');
        
        this.treeContainer = treeContainer;
        
        // Count total items for better description
        const items = treeContainer.querySelectorAll('.timeline-item');
        const itemCount = items.length;
        
        // Apply ARIA tree role to container with informative description
        treeContainer.setAttribute('role', 'tree');
        treeContainer.setAttribute('aria-label', `${itemCount} conversation turns. Use arrow keys to navigate, Space to jump, VO+Right to enter tree`);
        treeContainer.setAttribute('tabindex', '0');
        
        // Apply ARIA attributes to all timeline items
        this.applyAriaAttributesToNodes();
        
        // Add keyboard event listeners
        this.addKeyboardNavigation();
        
        // Announce that the tree is ready with clear instructions
        this.announce('EchoNav outline ready! Use arrow keys to navigate, Space to jump, VO+Right to enter tree, VO+Space to expand/collapse.');
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
                
                const ariaLabel = `${title}. Has ${contentCount} ${contentType}. Space: Jump. VO+Space: Expand/Collapse`;
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
                const ariaLabel = `${title}. Space: Jump to conversation`;
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
        treeItems.forEach((item, index) => {
            // Remove any existing focus listeners
            const oldFocusHandler = item._accessibilityFocusHandler;
            if (oldFocusHandler) {
                item.removeEventListener('focus', oldFocusHandler);
            }

            // Add new focus listener
            const focusHandler = (e) => {
                console.log('EchoNav Accessibility: Focus event on item:', item);
                this.setFocus(item);
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

            // Ensure proper tabindex management
            item.setAttribute('tabindex', index === 0 ? '0' : '-1');
        });

        console.log('EchoNav Accessibility: Event listeners added to', treeItems.length, 'tree items');
    }

    /**
     * Handle keyboard navigation
     * Supports both standard keyboard navigation and VoiceOver shortcuts
     */
    handleKeyDown(e) {
        console.log('EchoNav Accessibility: handleKeyDown key:', e.key, 'ctrlKey:', e.ctrlKey, 'altKey:', e.altKey, 'shiftKey:', e.shiftKey, 'focused node:', this.currentFocusedNode);

        // If no focused node, try to focus the first available item
        if (!this.currentFocusedNode) {
            console.log('EchoNav Accessibility: No focused node, trying to focus first item');
            const allNodes = this.getAllVisibleTreeItems();
            if (allNodes.length > 0) {
                this.setFocus(allNodes[0]);
                console.log('EchoNav Accessibility: Focused first item:', allNodes[0]);
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

        // Handle VoiceOver hierarchical navigation (VO + Shift + Up/Down)
        // Try multiple VoiceOver modifier combinations
        const isVO1 = e.ctrlKey && e.altKey; // Control + Option (standard VO)
        const isVO2 = e.metaKey && e.altKey; // Command + Option (alternative VO)
        const isVO3 = e.ctrlKey && e.metaKey; // Control + Command (another alternative)
        const isVO4 = e.ctrlKey && e.shiftKey; // Control + Shift (another combination)
        const isVO5 = e.metaKey && e.shiftKey; // Command + Shift (another combination)
        
        console.log('EchoNav Accessibility: VO modifiers - ctrlKey:', e.ctrlKey, 'altKey:', e.altKey, 'metaKey:', e.metaKey, 'shiftKey:', e.shiftKey);
        console.log('EchoNav Accessibility: VO combinations - isVO1:', isVO1, 'isVO2:', isVO2, 'isVO3:', isVO3, 'isVO4:', isVO4, 'isVO5:', isVO5);
        
        // VoiceOver standard tree navigation - VO+Right/Left + VO+Space
        if (isVO1 || isVO2 || isVO3) {
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: VO+Right - next item or expand');
                // If we're on the tree container, focus the first item
                if (this.currentFocusedNode === this.treeContainer) {
                    const allNodes = this.getAllVisibleTreeItems();
                    if (allNodes.length > 0) {
                        this.setFocus(allNodes[0]);
                        this.announce('Entered tree, first item');
                        return;
                    }
                } else {
                    // If we're on an item, try to expand it or move to next
                    this.expandOrMoveToChild();
                    return;
                }
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
            } else if (e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                console.log('EchoNav Accessibility: VO+Space - activate item');
                // VO+Space should activate the current item (expand/collapse or jump)
                this.activateNode();
                return;
            }
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
            this.setFocus(allVisibleNodes[currentIndex + 1]);
            this.announce('Next item');
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
            this.setFocus(allVisibleNodes[currentIndex - 1]);
            this.announce('Previous item');
        } else {
            this.announce('Beginning of items');
        }
    }

    /**
     * Expand node or move to first child if already expanded
     */
    expandOrMoveToChild() {
        const isExpanded = this.currentFocusedNode.getAttribute('aria-expanded') === 'true';
        const keyPointsContainer = this.currentFocusedNode.querySelector('.timeline-keypoints');
        
        if (keyPointsContainer && !isExpanded) {
            // Expand the node
            this.toggleExpansion(this.currentFocusedNode);
        } else if (keyPointsContainer && isExpanded) {
            // Move to first child
            const firstChild = keyPointsContainer.querySelector('.timeline-keypoint');
            if (firstChild) {
                this.setFocus(firstChild);
                this.announce('Entered child level');
            }
        }
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
                this.toggleFlowExpansion(node);
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
                this.toggleFlowExpansion(node);
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
     * Toggle expansion state of a node (works for both Flow and Insight views)
     */
    toggleExpansion(node) {
        // Check if this is a Flow timeline item or Insight logical item
        if (node.classList.contains('timeline-item')) {
            this.toggleFlowExpansion(node);
        } else if (node.classList.contains('logical-item')) {
            this.toggleInsightExpansion(node);
        }
    }

    /**
     * Toggle expansion for Flow timeline items
     */
    toggleFlowExpansion(node) {
        const keyPointsContainer = node.querySelector('.timeline-keypoints');
        const dot = node.querySelector('.timeline-dot-expandable');
        
        console.log('EchoNav Accessibility: toggleFlowExpansion called on', node, 'keypoints:', keyPointsContainer, 'dot:', dot);
        
        if (keyPointsContainer) {
            const isCurrentlyExpanded = node.getAttribute('aria-expanded') === 'true';
            const newExpandedState = !isCurrentlyExpanded;
            
            console.log('EchoNav Accessibility: Toggling from', isCurrentlyExpanded, 'to', newExpandedState);
            
            // Update visual state
            if (newExpandedState) {
                keyPointsContainer.classList.remove('hidden');
                if (dot) dot.classList.add('expanded');
            } else {
                keyPointsContainer.classList.add('hidden');
                if (dot) dot.classList.remove('expanded');
            }
            
            // Update ARIA state
            node.setAttribute('aria-expanded', newExpandedState.toString());
            
            // Update aria-label
            const titleElement = node.querySelector('.timeline-title');
            const title = titleElement ? titleElement.textContent.trim() : 'Untitled';
            const keyPointCount = keyPointsContainer.children.length;
            const ariaLabel = `${title}. Has ${keyPointCount} detail${keyPointCount !== 1 ? 's' : ''}. Space: Jump. VO+Space: Expand/Collapse`;
            node.setAttribute('aria-label', ariaLabel);
            
            // Re-apply ARIA attributes to keypoints when expanded
            if (newExpandedState) {
                this.applyAriaAttributesToKeyPoints(keyPointsContainer, title);
            }
            
            // Announce the change
            this.announce(newExpandedState ? 'Details shown' : 'Details hidden');
            
            return true;
        } else {
            console.log('EchoNav Accessibility: No keypoints container found for expansion');
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
     * Jump to content in ChatGPT conversation (works for both Flow and Insight views)
     */
    jumpToContent(node) {
        // Determine what content to jump to
        let textToFind = '';
        let nodeType = '';
        
        if (node.classList.contains('timeline-keypoint')) {
            // Flow keypoint - use its text content
            textToFind = node.textContent.trim();
            nodeType = 'keypoint';
        } else if (node.classList.contains('timeline-item')) {
            // Flow main item - get original text from data or title
            const titleElement = node.querySelector('.timeline-title');
            if (titleElement) {
                // Try to get original text from dataset if available
                const originalText = node.dataset.originalText || titleElement.textContent.trim();
                textToFind = originalText;
                nodeType = 'headline';
            }
        } else if (node.classList.contains('logical-item')) {
            // Insight logical item - get text content
            const textElement = node.querySelector('.logical-text');
            if (textElement) {
                textToFind = textElement.textContent.trim();
                const level = parseInt(node.dataset.level) || 0;
                nodeType = level === 0 ? 'category' : 'subpoint';
            }
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
                        
                        chrome.tabs.sendMessage(tabs[0].id, { 
                            action: 'scrollToText', 
                            text: textToFind,
                            accessibilityMode: true  // Flag to indicate this is an accessibility jump
                        }, (response) => {
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
        
        // Check if this is a Flow timeline container or Insight logical container
        if (this.treeContainer.classList.contains('timeline-container')) {
            console.log('EchoNav Accessibility: Processing timeline-container');
            // Flow timeline logic
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
