// Feature detection for AI APIs
if (!('Summarizer' in self)) {
    console.warn("EchoNav: Summarizer API not available. Please use Chrome 138+");
}

if (!('LanguageModel' in self)) {
    console.warn("EchoNav: Prompt API not available. Please use Chrome 138+");
}

// Cache the summarizer instance to avoid re-downloading
let cachedSummarizer = null;

// Debug data storage - keyed by URL
let debugDataStorage = {};

// Helper function to parse key points from AI response
function parseKeyPoints(keyPointsText) {
    // Split by bullet points, numbered lists, or line breaks
    const points = keyPointsText
        .split(/\n|•|\*|\d+\./)
        .map(point => point.trim())
        .filter(point => point.length > 0 && !point.match(/^(key points?|summary|main points?)$/i));
    
    return points.slice(0, 3); // Limit to 3 key points
}

// Helper function to match key points with original text
async function matchKeyPointsWithText(keyPoints, originalText, uniqueId) {
    const matchedPoints = [];
    
    for (const point of keyPoints) {
        // Simple text matching - find the most similar sentence
        const sentences = originalText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
        
        let bestMatch = null;
        let bestScore = 0;
        
        for (const sentence of sentences) {
            // Calculate similarity score based on common words
            const pointWords = point.toLowerCase().split(/\s+/);
            const sentenceWords = sentence.toLowerCase().split(/\s+/);
            
            const commonWords = pointWords.filter(word => 
                sentenceWords.some(sWord => sWord.includes(word) || word.includes(sWord))
            );
            
            const score = commonWords.length / Math.max(pointWords.length, 1);
            
            if (score > bestScore && score > 0.3) { // Minimum 30% similarity
                bestScore = score;
                bestMatch = {
                    sentence: sentence,
                    score: score,
                    uniqueId: uniqueId
                };
            }
        }
        
        matchedPoints.push({
            point: point,
            match: bestMatch,
            fallbackId: uniqueId // Use the entire assistant response as fallback
        });
    }
    
    return matchedPoints;
}

// Function to group paragraphs by themes using PromptAPI (simplified format)
async function groupParagraphsByThemes(paragraphs, currentUrl) {
    try {
        console.log("EchoNav: Starting paragraph theme grouping...");
        
        // Check if Prompt API is available
        if (!('LanguageModel' in self)) {
            throw new Error("Prompt API is not available. Please use Chrome 138+ and ensure your system meets the requirements.");
        }
        
        // Check Prompt API availability
        const availability = await LanguageModel.availability();
        if (availability === 'unavailable') {
            throw new Error("Prompt API is unavailable. Please check your browser version and system requirements.");
        }
        
        // Create Prompt API session with simpler parameters
        const session = await LanguageModel.create({
            temperature: 0.1,  // Lower temperature for more consistent output
            topK: 1           // More deterministic responses
        });
        
        // Build simplified paragraph list for prompt
        const paragraphList = paragraphs.map((p, index) => {
            const preview = p.text.length > 200 ? p.text.substring(0, 200) + '...' : p.text;
            return `P${index + 1} (${p.uniqueId}): ${preview}`;
        }).join('\n\n');
        
        const prompt = `Group these ${paragraphs.length} paragraphs into 2-4 themes. Each paragraph must belong to exactly one theme.

${paragraphList}

Respond in this exact format:
Theme 1: P1,P2; Theme Name Here
Theme 2: P3,P4; Another Theme Name
Theme 3: P5,P6,P7; Final Theme Name

Rules:
- Use "P1", "P2" etc. to reference paragraphs
- Each paragraph appears in exactly one theme
- Give each theme a clear, descriptive name
- Create 2-4 themes total`;

        console.log("EchoNav: Sending theme grouping request to PromptAPI...");
        
        // Add timeout wrapper for the API call
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('PromptAPI request timed out after 30 seconds')), 30000);
        });
        
        const apiCall = session.prompt(prompt);
        const result = await Promise.race([apiCall, timeoutPromise]);
        
        console.log("EchoNav: Raw PromptAPI response:", result);
        
        // Parse the simplified response format
        const themes = [];
        const rawLines = result.split('\n');
        
        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            try {
                // Handle the actual PromptAPI format: "Theme 1: Theme Name; P1, P2, P3"
                // or "Theme 1: P1, P2, P3; Theme Name"
                const themeMatch = line.match(/^\s*Theme\s+\d+:\s*(.+)\s*$/i);
                if (themeMatch) {
                    const content = themeMatch[1].trim();
                    console.log(`EchoNav: Processing theme line: "${content}"`);
                    
                    // Split by semicolon to separate theme name and paragraph refs
                    const parts = content.split(';').map(part => part.trim());
                    if (parts.length >= 2) {
                        let themeName = '';
                        let paragraphRefsStr = '';
                        
                        // Determine which part contains paragraph references (P1, P2, etc.)
                        const part1HasParagraphs = /P\d+/.test(parts[0]);
                        const part2HasParagraphs = /P\d+/.test(parts[1]);
                        
                        if (part1HasParagraphs && !part2HasParagraphs) {
                            // Format: "Theme 1: P1, P2, P3; Theme Name"
                            paragraphRefsStr = parts[0];
                            themeName = parts[1];
                        } else if (!part1HasParagraphs && part2HasParagraphs) {
                            // Format: "Theme 1: Theme Name; P1, P2, P3"
                            themeName = parts[0];
                            paragraphRefsStr = parts[1];
                        } else {
                            console.warn(`EchoNav: Could not determine theme format for: ${content}`);
                            continue;
                        }
                        
                        console.log(`EchoNav: Extracted theme name: "${themeName}", paragraphs: "${paragraphRefsStr}"`);
                        
                        // Look ahead for an optional explicit name line: "Theme Name: ..."
                        let j = i + 1;
                        while (j < rawLines.length && rawLines[j].trim() === '') j++;
                        if (j < rawLines.length) {
                            const nameLine = rawLines[j].trim();
                            const nameMatch = nameLine.match(/^Theme\s+Name:\s*(.+)$/i);
                            if (nameMatch && nameMatch[1]) {
                                themeName = nameMatch[1].trim();
                                console.log(`EchoNav: Updated theme name from next line: "${themeName}"`);
                                // Skip the consumed name line
                                i = j;
                            }
                        }
                        
                        // Extract paragraph references
                        const paragraphRefs = paragraphRefsStr.split(',').map(ref => ref.trim());
                        console.log(`EchoNav: Paragraph references: ${JSON.stringify(paragraphRefs)}`);
                        
                        // Convert P1, P2 etc. to actual paragraph IDs
                        const paragraphIds = [];
                        const themeParagraphs = [];
                        
                        for (const ref of paragraphRefs) {
                            const pIndex = parseInt(ref.replace('P', '')) - 1; // P1 -> index 0
                            if (!Number.isNaN(pIndex) && pIndex >= 0 && pIndex < paragraphs.length) {
                                const paragraph = paragraphs[pIndex];
                                paragraphIds.push(paragraph.uniqueId);
                                themeParagraphs.push(paragraph);
                                console.log(`EchoNav: Mapped ${ref} to paragraph ${pIndex}: ${paragraph.text.substring(0, 50)}...`);
                            } else {
                                console.warn(`EchoNav: Invalid paragraph reference: ${ref} (index: ${pIndex})`);
                            }
                        }
                        
                        if (paragraphIds.length > 0) {
                            themes.push({
                                themeName: themeName,
                                description: `Theme covering ${paragraphIds.length} paragraph${paragraphIds.length > 1 ? 's' : ''}`,
                                paragraphIds: paragraphIds,
                                paragraphs: themeParagraphs,
                                level: 1,
                                wordCount: themeParagraphs.reduce((sum, p) => sum + p.wordCount, 0)
                            });
                            console.log(`EchoNav: Successfully created theme: "${themeName}" with ${paragraphIds.length} paragraphs`);
                        }
                    }
                }
            } catch (parseError) {
                console.warn("EchoNav: Could not parse theme line:", line, parseError);
            }
        }
        
        console.log("EchoNav: Parsed themes:", themes.map(t => `${t.themeName} (${t.paragraphs.length} paragraphs)`));
        
        // Validate that all paragraphs are assigned
        const assignedIds = new Set();
        themes.forEach(theme => {
            theme.paragraphIds.forEach(id => assignedIds.add(id));
        });
        
        const unassignedParagraphs = paragraphs.filter(p => !assignedIds.has(p.uniqueId));
        if (unassignedParagraphs.length > 0) {
            console.warn("EchoNav: Some paragraphs were not assigned to themes:", unassignedParagraphs.map(p => p.uniqueId));
            
            // Add unassigned paragraphs to a "Other Topics" theme
            themes.push({
                themeName: "Other Topics",
                description: "Additional content not grouped into main themes",
                paragraphIds: unassignedParagraphs.map(p => p.uniqueId),
                paragraphs: unassignedParagraphs,
                level: 1,
                wordCount: unassignedParagraphs.reduce((sum, p) => sum + p.wordCount, 0)
            });
        }
        
        if (themes.length === 0) {
            throw new Error("No valid themes could be parsed from PromptAPI response");
        }
        
        // Store the grouping in debug data
        if (debugDataStorage[currentUrl]) {
            debugDataStorage[currentUrl].paragraphGrouping = {
                timestamp: new Date().toISOString(),
                originalParagraphs: paragraphs,
                generatedThemes: themes,
                rawResponse: result,
                promptUsed: prompt,
                validationResults: {
                    totalParagraphs: paragraphs.length,
                    assignedParagraphs: assignedIds.size,
                    unassignedParagraphs: unassignedParagraphs.length,
                    themes: themes.length
                }
            };
        }
        
        console.log("EchoNav: Theme grouping completed successfully");
        return themes;
        
    } catch (error) {
        console.error("EchoNav: Error in paragraph theme grouping:", error);
        throw error;
    }
}

    // Function to update existing logical hierarchy with new key points
    async function updateInsightHierarchy(existingHierarchy, newKeyPoints, currentUrl) {
        try {
            console.log("EchoNav: Starting logical hierarchy update...");
            
            // Check if Prompt API is available
            if (!('LanguageModel' in self)) {
                throw new Error("Prompt API is not available. Please use Chrome 138+ and ensure your system meets the requirements.");
            }
            
            // Check Prompt API availability
            const availability = await LanguageModel.availability();
            if (availability === 'unavailable') {
                throw new Error("Prompt API is unavailable. Please check your browser version and system requirements.");
            }
            
            if (newKeyPoints.length === 0) {
                throw new Error("No new key points available for hierarchy update.");
            }
            
            console.log(`EchoNav: Updating hierarchy with ${newKeyPoints.length} new key points`);
            
            // Create Prompt API session with optimized parameters for consistent output
            const session = await LanguageModel.create({
                temperature: 0,  // More deterministic output
                topK: 1         // Most likely response only
            });
            
            // Build the update prompt
            const newKeyPointsText = newKeyPoints.map(kp => `ID: ${kp.id}\nText: ${kp.text}`).join('\n\n');
            
            const updatePrompt = `You are an AI assistant tasked with intelligently updating an existing hierarchical outline with new information. Your goal is to integrate the new points seamlessly while preserving the existing structure as much as possible.

Here is the EXISTING HIERARCHY structure that you must NOT change:
${JSON.stringify(existingHierarchy, null, 2)}

Here are the NEW KEY POINTS to be added. Each is an ATOMIC unit and must be used EXACTLY ONCE:
${newKeyPointsText}

**YOUR TASK:**
Analyze each new key point and decide its correct place in the existing hierarchy.

**CRITICAL INSTRUCTIONS:**
1.  **Preserve Existing Structure:** Do NOT change the existing topics, their order, or their existing sub-points. You are only ADDING new information.
2.  **Categorize New Points:** For each new key point, determine if it logically belongs under one of the existing main topics.
3.  **Create New Topics if Necessary:** If a new key point (or a group of them) introduces a completely new theme that doesn't fit anywhere else, you are allowed to create a new main topic for it.
4.  **Use original AI wording when possible for consistency**
5.  **Return Only the Additions:** Your output should be a JSON object describing where to add the new points. It must follow this exact format, with "additions" for existing topics and "newTopics" for new ones:
    {
      "additions": [
        {
          "targetTopic": "Name of an existing main topic",
          "newSubpoints": [
            {
              "topic": "Rewritten new key point",
              "level": 1,
              "originalIds": ["..."]
              // Nesting of new points is allowed here
            }
          ]
        }
      ],
      "newTopics": [
        {
          "topic": "A new main topic generated by you",
          "level": 0,
          "originalIds": [],
          "subpoints": [ ... ]
        }
      ]
    }`;

            // Define JSON Schema for structured output
            const updateSchema = {
                "type": "object",
                "properties": {
                    "additions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "targetTopic": {"type": "string"},
                                "newSubpoints": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "topic": {"type": "string"},
                                            "level": {"type": "number"},
                                            "originalIds": {"type": "array", "items": {"type": "string"}},
                                            "subpoints": {"type": "array"}
                                        },
                                        "required": ["topic", "level", "originalIds"]
                                    }
                                }
                            },
                            "required": ["targetTopic", "newSubpoints"]
                        }
                    },
                    "newTopics": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "topic": {"type": "string"},
                                "level": {"type": "number"},
                                "originalIds": {"type": "array", "items": {"type": "string"}},
                                "subpoints": {"type": "array"}
                            },
                            "required": ["topic", "level", "originalIds"]
                        }
                    }
                },
                "required": ["additions", "newTopics"]
            };
            
            // Use Prompt API with JSON Schema constraint
            const result = await session.prompt(updatePrompt, {
                responseConstraint: updateSchema,
                omitResponseConstraintInput: true
            });
            
            const updateData = JSON.parse(result);
            console.log("EchoNav: Generated update structure:", updateData);
            
            // Log the raw response for debugging
            console.log("EchoNav: Raw Prompt API response for logical hierarchy update:", result);
            
            // Apply the updates to the existing hierarchy
            const updatedHierarchy = applyHierarchyUpdates(existingHierarchy, updateData, newKeyPoints);
            
            // Store the updated logical hierarchy (this will be handled by the caller)
            // The updated hierarchy is returned to be stored with the main data
            
            // Store the update in debug data
            if (debugDataStorage[currentUrl]) {
                debugDataStorage[currentUrl].logicalHierarchyUpdate = {
                    timestamp: new Date().toISOString(),
                    newKeyPoints: newKeyPoints,
                    updateData: updateData,
                    updatedHierarchy: updatedHierarchy,
                    rawResponse: result, // Store the raw JSON response
                    promptUsed: updatePrompt
                };
            }
            
            return updatedHierarchy;
            
        } catch (error) {
            console.error("EchoNav: Error updating logical hierarchy:", error);
            throw error;
        }
    }

    // Helper function to apply hierarchy updates
    function applyHierarchyUpdates(existingHierarchy, updateData, newKeyPoints) {
        const updatedHierarchy = JSON.parse(JSON.stringify(existingHierarchy)); // Deep copy
        
        // Apply additions to existing topics
        if (updateData.additions) {
            updateData.additions.forEach(addition => {
                const targetTopic = updatedHierarchy.find(topic => topic.topic === addition.targetTopic);
                if (targetTopic) {
                    if (!targetTopic.subpoints) {
                        targetTopic.subpoints = [];
                    }
                    targetTopic.subpoints.push(...addition.newSubpoints);
                }
            });
        }
        
        // Add new topics
        if (updateData.newTopics) {
            updatedHierarchy.push(...updateData.newTopics);
        }
        
        return updatedHierarchy;
    }

    // Function to generate logical hierarchy using Prompt API
    async function generateInsightHierarchy(outlineItems, currentUrl) {
    try {
        console.log("EchoNav: Starting logical hierarchy generation...");
        
        // Check if Prompt API is available
        if (!('LanguageModel' in self)) {
            throw new Error("Prompt API is not available. Please use Chrome 138+ and ensure your system meets the requirements.");
        }
        
        // Check Prompt API availability
        const availability = await LanguageModel.availability();
        if (availability === 'unavailable') {
            throw new Error("Prompt API is unavailable. Please check your browser version and system requirements.");
        }
        
        // Collect all key points with unique IDs
        const allKeyPoints = [];
        outlineItems.forEach((item, itemIndex) => {
            if (item.parsedKeyPoints && item.parsedKeyPoints.length > 0) {
                item.parsedKeyPoints.forEach((keyPoint, pointIndex) => {
                    const uniqueId = `item-${itemIndex}-point-${pointIndex}`;
                    allKeyPoints.push({
                        id: uniqueId,
                        text: keyPoint.point,
                        originalItem: itemIndex,
                        originalPoint: pointIndex,
                        traceability: {
                            title: item.title,
                            originalText: item.originalText,
                            assistantText: item.assistantText,
                            assistantUniqueId: item.assistantUniqueId,
                            match: keyPoint.match
                        }
                    });
                });
            }
        });
        
        if (allKeyPoints.length === 0) {
            throw new Error("No key points available for hierarchy generation.");
        }
        
        console.log(`EchoNav: Collected ${allKeyPoints.length} key points for hierarchy generation`);
        
        // Group key points by turn for better understanding
        const pointsByTurn = {};
        allKeyPoints.forEach(kp => {
            const turnIndex = kp.originalItem;
            if (!pointsByTurn[turnIndex]) {
                pointsByTurn[turnIndex] = [];
            }
            pointsByTurn[turnIndex].push(kp);
        });
        
        console.log("EchoNav: Key points organized by turn:");
        Object.keys(pointsByTurn).forEach(turnIndex => {
            console.log(`  Turn ${turnIndex}: ${pointsByTurn[turnIndex].length} bullet points`);
            pointsByTurn[turnIndex].forEach(kp => {
                console.log(`    - ${kp.id}: ${kp.text.substring(0, 80)}...`);
            });
        });
        
        // Create Prompt API session with optimized parameters for consistent output
        const session = await LanguageModel.create({
            temperature: 0,  // More deterministic output
            topK: 1         // Most likely response only
        });
        
        // Build the prompt
        const keyPointsText = allKeyPoints.map(kp => `ID: ${kp.id}\nText: ${kp.text}`).join('\n\n');
        
        const prompt = `You are an expert AI synthesizer. Your task is to transform a flat list of disparate key points into a single, cohesive, and deeply logical hierarchy. Your primary goal is to reveal the underlying thematic structure of the information, ignoring the original ordering of the points.

Here are the key points. Each one is an ATOMIC unit and must NOT be broken down further, must be used **EXACTLY ONCE** in the final hierarchy:
${keyPointsText}

**YOUR THINKING PROCESS:**
1.  **Global Scan:** Read all key points from all turns. Ignore the '0-x' and '1-x' groupings for now.
2.  **Identify Core Themes:** Ask yourself: "What are the 1-3 foundational concepts that connect these disparate points?" These will be your top-level topics.
3.  **Categorize Atomically:** For each individual key point, determine which single core theme it belongs to. This is its primary logical home.
4.  **Structure and Synthesize:** Now, build the hierarchy. Place the rewritten key points under their chosen themes. Look for opportunities to create parent-child relationships *within* your new thematic groups.
5.  **Final Validation (The Golden Rule):** Before outputting, verify that every single original key point ID has been used **EXACTLY ONCE** in your final structure. No points can be lost or duplicated.

**CRITICAL INSTRUCTIONS:**
-   **Cross-Turn Synthesis is Key:** The most important task is to find connections between points from different turns (e.g., '0-3' about instruments and '1-2' about instruments belong in the same theme). Do NOT simply create a separate topic for each original turn.
-   **Conciseness and Logic:** The final structure should be as simple and logical as possible. Avoid redundant "container" nodes.
-   **Atomic Principle:** A single key point cannot be broken apart. It must be represented as one node.
-   **Use original AI wording when possible for consistency**

Return a JSON structure with this exact format, allowing for nested subpoints:
{
  "hierarchy": [
    {
      "topic": "Main Theme (Generated by you)",
      "level": 0,
      "subpoints": [
        {
          "topic": "Rewritten Key Point or Nested Sub-Theme",
          "level": 1,
          "originalIds": [] // ID(s) of original key point(s)
        }
      ]
    }
  ]
}`;
        // Define JSON Schema for structured output
        const schema = {
            "type": "object",
            "properties": {
                "hierarchy": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "topic": {"type": "string"},
                            "level": {"type": "number"},
                            "originalIds": {"type": "array", "items": {"type": "string"}},
                            "subpoints": {"type": "array"}
                        },
                        "required": ["topic", "level", "originalIds"]
                    }
                }
            },
            "required": ["hierarchy"]
        };
        
        // Use Prompt API with JSON Schema constraint
        const result = await session.prompt(prompt, {
            responseConstraint: schema,
            omitResponseConstraintInput: true
        });
        
            const hierarchyData = JSON.parse(result);
            console.log("EchoNav: Generated hierarchy structure:", hierarchyData);
            console.log("EchoNav: Number of main topics created:", hierarchyData.hierarchy?.length || 0);
            
            // Log the raw response for debugging
            console.log("EchoNav: Raw Prompt API response for logical hierarchy:", result);
            
            // Validate that all original IDs are preserved
            const allOriginalIds = allKeyPoints.map(kp => kp.id);
            const preservedIds = [];
            function collectIds(hierarchy) {
                hierarchy.forEach(node => {
                    if (node.originalIds) {
                        preservedIds.push(...node.originalIds);
                    }
                    if (node.subpoints) {
                        collectIds(node.subpoints);
                    }
                });
            }
            collectIds(hierarchyData.hierarchy);
            
            const missingIds = allOriginalIds.filter(id => !preservedIds.includes(id));
            if (missingIds.length > 0) {
                console.warn("EchoNav: Some original IDs were not preserved:", missingIds);
            } else {
                console.log("EchoNav: All original IDs preserved successfully");
            }
        
        // Add traceability information back to the hierarchy
        const enrichedHierarchy = addTraceabilityToHierarchy(hierarchyData.hierarchy, allKeyPoints);
        
        // Store the logical hierarchy in debug data
        if (debugDataStorage[currentUrl]) {
            debugDataStorage[currentUrl].logicalHierarchy = {
                timestamp: new Date().toISOString(),
                originalKeyPoints: allKeyPoints,
                generatedHierarchy: enrichedHierarchy,
                rawResponse: result, // Store the raw JSON response
                promptUsed: prompt,
                validationResults: {
                    totalOriginalIds: allOriginalIds.length,
                    preservedIds: preservedIds.length,
                    missingIds: missingIds
                }
            };
        }
        
        return enrichedHierarchy;
        
    } catch (error) {
        console.error("EchoNav: Error generating logical hierarchy:", error);
        throw error;
    }
}

// Helper function to add traceability information back to hierarchy
function addTraceabilityToHierarchy(hierarchy, allKeyPoints) {
    return hierarchy.map(node => {
        const enrichedNode = { ...node };
        
        // Add traceability data for this node
        enrichedNode.traceability = node.originalIds.map(id => {
            const keyPoint = allKeyPoints.find(kp => kp.id === id);
            return keyPoint ? keyPoint.traceability : null;
        }).filter(t => t !== null);
        
        // Recursively process subpoints
        if (node.subpoints && node.subpoints.length > 0) {
            enrichedNode.subpoints = addTraceabilityToHierarchy(node.subpoints, allKeyPoints);
        }
        
        return enrichedNode;
    });
}

// Helper function to validate that conversation turns are complete and AI responses are fully generated
async function validateCompleteTurns(turns, tabId) {
    const completeTurns = [];
    
    for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        
        if (!turn.user || !turn.assistant) continue;
        
        const isResponseComplete = await validateAIResponseComplete(turn, tabId);
        
        if (isResponseComplete) {
            completeTurns.push(turn);
        } else {
            break; // Wait for incomplete turns
        }
    }
    
    return completeTurns;
}

// Helper function to check if AI response is fully generated
async function validateAIResponseComplete(turn, tabId) {
    try {
        if (turn.assistant.length < 50) return false;
        
        // Check for incomplete patterns
        const lastPart = turn.assistant.trim().slice(-100);
        const incompletePatterns = [/\.\.\.$/, /[a-zA-Z]$/, /\,\s*$/, /\:\s*$/, /\-\s*$/];
        
        for (const pattern of incompletePatterns) {
            if (pattern.test(lastPart)) return false;
        }
        
        // Wait and recheck for changes
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            const reCheckResponse = await chrome.tabs.sendMessage(tabId, { action: "extractText" });
            const reCheckTurns = reCheckResponse.data || [];
            
            if (reCheckTurns.length > 0) {
                const correspondingTurn = reCheckTurns[reCheckTurns.length - 1];
                if (correspondingTurn && correspondingTurn.assistant) {
                    const lengthDifference = Math.abs(correspondingTurn.assistant.length - turn.assistant.length);
                    if (lengthDifference > 50) return false;
                }
            }
        } catch (recheckError) {
            // If we can't recheck, assume complete
        }
        
        // Validate structure completeness
        if (turn.responseStructure?.type === 'structured' && turn.responseStructure.headings) {
            const incompleteHeadings = turn.responseStructure.headings.some(h => 
                !h.text || h.text.length < 3 || h.text.endsWith('...')
            );
            if (incompleteHeadings) return false;
        }
        
        return true;
        
    } catch (error) {
        console.error("EchoNav: Error validating AI response:", error);
        return true;
    }
}

// Listen for tab updates to reset cached outlines when URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && changeInfo.url.includes('chatgpt.com/c/')) {
        console.log("EchoNav: URL changed, notifying content script to reset UI if needed");
        chrome.tabs.sendMessage(tabId, { action: "urlChanged", url: changeInfo.url }).catch((e) => console.log("EchoNav: Side panel not open or content script not ready", e));
    }
});

chrome.action.onClicked.addListener(async (tab) => {
    console.log("EchoNav action clicked, toggling UI");
    try {
        await chrome.tabs.sendMessage(tab.id, { action: "toggleUI" });
    } catch (e) {
        console.log("EchoNav: Content script not ready, injecting now.", e);
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
        // Send a message again after injecting
        setTimeout(() => chrome.tabs.sendMessage(tab.id, { action: "toggleUI" }), 500);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "summarize") {
            (async () => {
                const startTime = Date.now();
                try {
                    console.log("EchoNav: Starting summarization process...");
                    
                    // Check if we can get the active tab first
                    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                    if (!tab) {
                        throw new Error("No active tab found");
                    }
                    
                    // Initialize debug data for this URL
                    const currentUrl = tab.url;
                    debugDataStorage[currentUrl] = {
                        timestamp: new Date().toISOString(),
                        url: currentUrl,
                        rawResponses: [],
                        processingTime: null,
                        errors: []
                    };
                    
                    // Check if Summarizer API is available
                    if (!('Summarizer' in self)) {
                        const error = "Summarizer API is not available. Please use Chrome 138+ and ensure your system meets the requirements.";
                        debugDataStorage[currentUrl].errors.push({ type: "API_UNAVAILABLE", message: error });
                        throw new Error(error);
                    }
                    console.log("EchoNav: Extracting text from tab:", tab.id);
                
                // First, ping the content script to make sure it's loaded
                try {
                    const pingResponse = await chrome.tabs.sendMessage(tab.id, { action: "ping" });
                    console.log("EchoNav: Content script is ready, ping response:", pingResponse);
                } catch (pingError) {
                    console.error("EchoNav: Content script not ready, ping failed:", pingError);
                    throw new Error("Content script is not loaded. Please refresh the page and try again.");
                }
                
                    // Try to extract text from the page
                    const response = await chrome.tabs.sendMessage(tab.id, { action: "extractText" });
                    if (!response || !response.data) {
                        const error = "Could not extract text from page";
                        debugDataStorage[currentUrl].errors.push({ type: "EXTRACTION_FAILED", message: error });
                        throw new Error(error);
                    }

                    const conversationTurns = response.data;
                    if (!conversationTurns || conversationTurns.length === 0) {
                        const error = "No conversation turns found";
                        debugDataStorage[currentUrl].errors.push({ type: "NO_CONVERSATION", message: error });
                        throw new Error(error);
                    }

                    console.log(`EchoNav: Successfully extracted ${conversationTurns.length} conversation turns`);

                    // Check Summarizer availability
                    const availability = await Summarizer.availability();
                    console.log("EchoNav: Summarizer availability:", availability);
                    
                    if (availability === 'unavailable') {
                        const error = "Summarizer is unavailable. Please check your browser version and system requirements.";
                        debugDataStorage[currentUrl].errors.push({ type: "SUMMARIZER_UNAVAILABLE", message: error });
                        throw new Error(error);
                    }

                // Use cached summarizer if available, otherwise create new one
                let summarizer = cachedSummarizer;
                
                if (!summarizer) {
                    // If model needs to be downloaded, show progress
                    if (availability === 'downloadable') {
                        console.log("EchoNav: Model needs to be downloaded, this may take a few minutes...");
                        // Send progress update to UI
                        chrome.runtime.sendMessage({ 
                            action: "downloadProgress", 
                            message: "Downloading AI model, please wait..." 
                        });
                    }

                    // Create summarizer with download progress monitoring
                    summarizer = await Summarizer.create({
                        type: 'headline',
                        format: 'plain-text',
                        length: 'short',
                        monitor(m) {
                            m.addEventListener('downloadprogress', (e) => {
                                const progress = Math.round(e.loaded * 100);
                                console.log(`EchoNav: Downloaded ${progress}% of the model`);
                                // Send progress update to UI
                                chrome.runtime.sendMessage({ 
                                    action: "downloadProgress", 
                                    message: `Downloading AI model... ${progress}%` 
                                });
                            });
                        }
                    });
                    
                    // Cache the summarizer for future use
                    cachedSummarizer = summarizer;
                    console.log("EchoNav: Summarizer cached for future use");
                } else {
                    console.log("EchoNav: Using cached summarizer");
                }

                    console.log("EchoNav: Summarizer ready, starting to process turns...");
                    
                    const outlineItems = [];
                    
                    // Send initial message to start streaming
                    chrome.runtime.sendMessage({ 
                        action: "streamingStarted", 
                        totalTurns: conversationTurns.length 
                    }).catch(() => {
                        // Ignore errors if sidepanel is not open
                    });
                    
                    // Maintain array of recent titles for context
                    const recentTitles = [];
                    const maxContextTitles = 3; // Show last 3 titles as context
                    
                    for (let i = 0; i < conversationTurns.length; i++) {
                        const turn = conversationTurns[i];
                        const turnText = `User: ${turn.user}\nAssistant: ${turn.assistant}`;
                        
                        try {
                            // Build context prompt with previous titles
                            let contextPrompt = turnText;
                            if (recentTitles.length > 0) {
                                const contextTitles = recentTitles.slice(-maxContextTitles);
                                contextPrompt += `\n\nPrevious titles: ${contextTitles.join(', ')}\nGenerate a different, unique title for this conversation turn.`;
                            }
                            
                            // Generate turn title (smart title selection based on structure type)
                            let cleanTitle;
                            
                            if (turn.responseStructure && turn.responseStructure.type === 'structured' && turn.responseStructure.headings.length > 0) {
                                // For structured responses, only use top-level heading if there's exactly one
                                const topLevelHeadings = turn.responseStructure.headings.filter(h => h.normalizedLevel === 1);
                                if (topLevelHeadings.length === 1) {
                                    cleanTitle = topLevelHeadings[0].text;
                                    console.log(`EchoNav: Using single top-level heading as title for turn ${i + 1}: "${cleanTitle}"`);
                                } else {
                                    // Multiple top-level headings or no level 1, generate title using Summarizer
                                    console.log(`EchoNav: Found ${topLevelHeadings.length} top-level headings, generating title with Summarizer for turn ${i + 1}`);
                                    
                                    // For Case A with >=3 headings, only send first paragraph + all headings
                                    let summarizerInput = contextPrompt;
                                    if (turn.responseStructure.headings.length >= 3) {
                                        // Extract first paragraph from assistant response
                                        const assistantText = turn.assistant;
                                        const firstParagraph = assistantText.split('\n\n')[0] || assistantText.substring(0, 300);
                                        
                                        // Extract all headings text
                                        const headingsList = turn.responseStructure.headings.map(h => h.text).join('\n');
                                        
                                        // Build optimized input for Summarizer
                                        summarizerInput = `User: ${turn.user}\nAssistant (first paragraph): ${firstParagraph}\n\nAll headings in response:\n${headingsList}`;
                                        
                                        console.log(`EchoNav: Case A optimization - sending reduced content to Summarizer for turn ${i + 1}:`);
                                        console.log(`EchoNav: Summarizer input:`, summarizerInput);
                                    }
                                    
                                    const titleSummarizer = await Summarizer.create({
                                        type: 'headline',
                                        format: 'plain-text',
                                        length: 'short'
                                    });
                                    
                                    const titleResult = await titleSummarizer.summarize(summarizerInput);
                                    cleanTitle = titleResult.trim();
                                    console.log(`EchoNav: Generated title for turn ${i + 1}: "${cleanTitle}"`);
                                }
                            } else {
                                // For non-structured responses, generate title using Summarizer
                                const titleSummarizer = await Summarizer.create({
                                    type: 'headline',
                                    format: 'plain-text',
                                    length: 'short'
                                });
                                
                                const titleResult = await titleSummarizer.summarize(contextPrompt);
                                cleanTitle = titleResult.trim();
                                console.log(`EchoNav: Generated title for turn ${i + 1}: "${cleanTitle}"`);
                            }
                            
                            recentTitles.push(cleanTitle);
                            
                            // Process response structure based on type
                            let responseOutline = null;
                            let structuredData = null;
                            
                            if (turn.responseStructure) {
                                console.log(`EchoNav: 🔄 PROCESSING TURN ${i + 1} - Response structure type:`, turn.responseStructure.type);
                                console.log(`EchoNav: Turn ${i + 1} response structure details:`, {
                                    hasHeadings: turn.responseStructure.hasHeadings,
                                    paragraphCount: turn.responseStructure.paragraphCount,
                                    totalWordCount: turn.responseStructure.totalWordCount
                                });
                                
                                if (turn.responseStructure.type === 'structured') {
                                    // Case A: Response has headings - use them as structure
                                    console.log(`EchoNav: 📋 EXECUTING CASE A - STRUCTURED HEADINGS for turn ${i + 1}`);
                                    console.log(`EchoNav: Processing ${turn.responseStructure.headings.length} headings:`);
                                    turn.responseStructure.headings.forEach((h, idx) => {
                                        console.log(`EchoNav: - Heading ${idx + 1}: ${h.tagName} (Level ${h.normalizedLevel}) - "${h.text}"`);
                                    });
                                    
                                    structuredData = {
                                        type: 'structured',
                                        outline: turn.responseStructure.headings.map(h => ({
                                            level: h.normalizedLevel,
                                            text: h.text,
                                            uniqueId: h.uniqueId,
                                            tagName: h.tagName
                                        }))
                                    };
                                    responseOutline = turn.responseStructure.headings;
                                    console.log(`EchoNav: ✅ CASE A COMPLETE - Created structured outline with ${structuredData.outline.length} headings`);
                                    
                                } else if (turn.responseStructure.type === 'plain_text') {
                                    // Case B: Plain text response - process paragraphs
                                    const paragraphs = turn.responseStructure.paragraphs;
                                    const paragraphCount = paragraphs.length;
                                    const totalWords = turn.responseStructure.totalWordCount;
                                    
                                    console.log(`EchoNav: 📝 EXECUTING CASE B - PLAIN TEXT for turn ${i + 1}`);
                                    console.log(`EchoNav: - Paragraphs: ${paragraphCount}`);
                                    console.log(`EchoNav: - Total words: ${totalWords}`);
                                    console.log(`EchoNav: - Checking theme grouping criteria: paragraphs > 3 (${paragraphCount > 3}) AND words > 200 (${totalWords > 200})`);
                                    
                                    // If there are many paragraphs, group them by themes using PromptAPI
                                    if (paragraphCount > 3 && totalWords > 200) {
                                        console.log(`EchoNav: 🎯 CASE B1 - THEME GROUPING: Calling PromptAPI to group ${paragraphCount} paragraphs into themes`);
                                        console.log(`EchoNav: Paragraph preview:`, paragraphs.map((p, idx) => 
                                            `P${idx + 1}: ${p.text.substring(0, 60)}... (${p.wordCount} words)`
                                        ));
                                        
                                        try {
                                            const groupedThemes = await groupParagraphsByThemes(paragraphs, currentUrl);
                                            structuredData = {
                                                type: 'themed_groups',
                                                themes: groupedThemes
                                            };
                                            responseOutline = groupedThemes;
                                            console.log(`EchoNav: ✅ CASE B1 COMPLETE - Created ${groupedThemes.length} themed groups`);
                                            groupedThemes.forEach((theme, idx) => {
                                                console.log(`EchoNav: - Theme ${idx + 1}: "${theme.themeName}" (${theme.paragraphs?.length || 0} paragraphs, ${theme.wordCount || 0} words)`);
                                            });
                                        } catch (themeError) {
                                            console.warn("EchoNav: ❌ CASE B1 FAILED - Theme grouping error, falling back to simple paragraphs:", themeError);
                                            // Fallback: use simple paragraph structure
                                            structuredData = {
                                                type: 'simple_paragraphs',
                                                paragraphs: paragraphs.map(p => ({
                                                    text: p.text.substring(0, 100) + (p.text.length > 100 ? '...' : ''),
                                                    uniqueId: p.uniqueId,
                                                    wordCount: p.wordCount
                                                }))
                                            };
                                            responseOutline = paragraphs;
                                            console.log(`EchoNav: ✅ FALLBACK B2 COMPLETE - Used simple paragraph structure with ${paragraphs.length} paragraphs`);
                                        }
                                    } else {
                                        // Few paragraphs, use them directly
                                        console.log(`EchoNav: 📝 CASE B2 - SIMPLE PARAGRAPHS: Using direct paragraph structure (criteria not met for theme grouping)`);
                                        structuredData = {
                                            type: 'simple_paragraphs',
                                            paragraphs: paragraphs.map(p => ({
                                                text: p.text.substring(0, 100) + (p.text.length > 100 ? '...' : ''),
                                                uniqueId: p.uniqueId,
                                                wordCount: p.wordCount
                                            }))
                                        };
                                        responseOutline = paragraphs;
                                        console.log(`EchoNav: ✅ CASE B2 COMPLETE - Created simple paragraph structure with ${paragraphs.length} paragraphs`);
                                        paragraphs.forEach((p, idx) => {
                                            console.log(`EchoNav: - Paragraph ${idx + 1}: "${p.text.substring(0, 50)}..." (${p.wordCount} words)`);
                                        });
                                    }
                                }
                            } else {
                                // Fallback: generate traditional key points if no structure analysis
                                console.log(`EchoNav: ⚠️ FALLBACK - NO STRUCTURE ANALYSIS for turn ${i + 1}, using traditional key points`);
                                const keyPointsSummarizer = await Summarizer.create({
                                    type: 'key-points',
                                    format: 'plain-text',
                                    length: 'short'
                                });
                                
                                const keyPointsResult = await keyPointsSummarizer.summarize(turnText);
                                const cleanKeyPoints = keyPointsResult.trim();
                                const parsedKeyPoints = parseKeyPoints(cleanKeyPoints);
                                const matchedKeyPoints = await matchKeyPointsWithText(parsedKeyPoints, turn.assistant, turn.assistantUniqueId);
                                
                                structuredData = {
                                    type: 'key_points',
                                    keyPoints: matchedKeyPoints
                                };
                                responseOutline = matchedKeyPoints;
                                console.log(`EchoNav: ✅ FALLBACK COMPLETE - Generated ${matchedKeyPoints.length} traditional key points`);
                            }
                            
                            // Store raw responses in debug data
                            debugDataStorage[currentUrl].rawResponses.push({
                                turnIndex: i,
                                titleResponse: cleanTitle, // Use the final title instead of raw API response
                                responseStructure: turn.responseStructure,
                                structuredData: structuredData,
                                contextUsed: recentTitles.slice(-maxContextTitles - 1, -1)
                            });
                            
                            // Create the item with structured data
                            const item = { 
                                title: cleanTitle, 
                                originalText: turn.user,
                                assistantText: turn.assistant,
                                assistantUniqueId: turn.assistantUniqueId,
                                responseStructure: turn.responseStructure,
                                structuredData: structuredData,
                                responseOutline: responseOutline,
                                // Keep legacy format for backward compatibility
                                keyPoints: structuredData.type === 'key_points' ? 
                                    structuredData.keyPoints.map(kp => kp.point).join('\n• ') : 
                                    'See structured outline',
                                parsedKeyPoints: structuredData.type === 'key_points' ? structuredData.keyPoints : []
                            };
                            outlineItems.push(item);
                            
                            // Send individual item to sidepanel for streaming display
                            chrome.runtime.sendMessage({ 
                                action: "addFlowItem", 
                                item: item,
                                index: i,
                                total: conversationTurns.length
                            }).catch(() => {
                                // Ignore errors if sidepanel is not open
                            });
                            
                        } catch (turnError) {
                            console.warn("EchoNav: Error summarizing a single turn, skipping.", turnError);
                            
                            // Store error in debug data
                            debugDataStorage[currentUrl].rawResponses.push({
                                turnIndex: i,
                                titleResponse: null,
                                error: turnError.message,
                                contextUsed: recentTitles.slice(-maxContextTitles)
                            });
                            
                            // Fallback: use first few words of user's question
                            const fallbackTitle = turn.user.split(' ').slice(0, 6).join(' ');
                            const fallbackKeyPoints = "• Key points unavailable";
                            recentTitles.push(fallbackTitle);
                            
                            const item = { 
                                title: fallbackTitle, 
                                keyPoints: fallbackKeyPoints,
                                parsedKeyPoints: [],
                                originalText: turn.user,
                                assistantText: turn.assistant,
                                assistantUniqueId: turn.assistantUniqueId,
                                responseStructure: turn.responseStructure || null,
                                structuredData: { type: 'error', message: turnError.message }
                            };
                            outlineItems.push(item);
                            
                            // Send fallback item to sidepanel
                            chrome.runtime.sendMessage({ 
                                action: "addFlowItem", 
                                item: item,
                                index: i,
                                total: conversationTurns.length
                            }).catch(() => {
                                // Ignore errors if sidepanel is not open
                            });
                        }
                    }

                    const finalOutline = outlineItems.map(item => `- ${item.title}`).join('\n');
                    console.log("EchoNav: Final outline generated successfully");
                    
                    // Complete debug data
                    debugDataStorage[currentUrl].processingTime = Date.now() - startTime;
                    
                    // Save the full outline object (with original text) to storage
                    if (tab && tab.url) {
                        await chrome.storage.local.set({ [tab.url]: { outline: finalOutline, items: outlineItems } });
                        console.log("EchoNav: Outline cached for URL:", tab.url);
                    }
                    
                    // Send completion message
                    chrome.runtime.sendMessage({ 
                        action: "streamingCompleted", 
                        data: { summary: finalOutline, items: outlineItems }
                    }).catch(() => {
                        // Ignore errors if sidepanel is not open
                    });
                    
                    sendResponse({ data: { summary: finalOutline, items: outlineItems } });
            } catch (e) {
                console.error("EchoNav Error:", e);
                if (debugDataStorage[currentUrl]) {
                    debugDataStorage[currentUrl].errors.push({ type: "GENERAL_ERROR", message: e.message });
                    debugDataStorage[currentUrl].processingTime = Date.now() - startTime;
                }
                sendResponse({ error: e.message });
            }
        })();
        return true; // Keep the message channel open for async response
    } else if (request.action === "getCachedOutline") {
        (async () => {
            try {
                const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (currentTab && currentTab.url) {
                    const result = await chrome.storage.local.get([currentTab.url]);
                    const cachedData = result[currentTab.url];
                    if (cachedData) {
                        console.log("EchoNav: Found cached outline for URL:", currentTab.url);
                        console.log("EchoNav: Cached data structure:", cachedData);
                        // Return the cached data in the expected format
                        sendResponse({ data: cachedData });
                    } else {
                        console.log("EchoNav: No cached outline found for URL:", currentTab.url);
                        sendResponse({ data: null });
                    }
                } else {
                    sendResponse({ data: null });
                }
            } catch (e) {
                console.error("EchoNav Error getting cached outline:", e);
                sendResponse({ error: e.message });
            }
        })();
        return true;
    } else if (request.action === "checkNewMessages") {
        (async () => {
            try {
                const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (currentTab && currentTab.url) {
                    // First, ping the content script to make sure it's ready
                    try {
                        const pingResponse = await chrome.tabs.sendMessage(currentTab.id, { action: "ping" });
                        console.log("EchoNav: Content script is ready for new message check");
                    } catch (pingError) {
                        console.log("EchoNav: Content script not ready for new message check, skipping");
                        sendResponse({ hasNewMessages: false });
                        return;
                    }
                    
                    // Get current conversation turns
                    const response = await chrome.tabs.sendMessage(currentTab.id, { action: "extractText" });
                    const currentTurns = response.data || [];
                    
                    // Get cached data
                    const result = await chrome.storage.local.get([currentTab.url]);
                    const cachedData = result[currentTab.url];
                    
                    if (cachedData && cachedData.items) {
                        const cachedTurnCount = cachedData.items.length;
                        const currentTurnCount = currentTurns.length;
                        
                        console.log(`EchoNav: Cached turns: ${cachedTurnCount}, Current turns: ${currentTurnCount}`);
                        
                        // Check if there are new turns
                        if (currentTurnCount > cachedTurnCount) {
                            const newTurns = currentTurns.slice(cachedTurnCount);
                            
                            // Validate that ALL new turns are complete (have both user and assistant content)
                            // and that the AI response appears to be fully generated
                            const completeTurns = await validateCompleteTurns(newTurns, currentTab.id);
                            
                            if (completeTurns.length === newTurns.length) {
                                console.log(`EchoNav: Found ${newTurns.length} complete new turns ready for processing`);
                                sendResponse({ hasNewMessages: true, completeTurns: completeTurns.length });
                            } else {
                                console.log(`EchoNav: Found ${newTurns.length} new turns, but only ${completeTurns.length} are complete. Waiting for AI to finish generating.`);
                                sendResponse({ hasNewMessages: false, pendingTurns: newTurns.length - completeTurns.length });
                            }
                        } else {
                            sendResponse({ hasNewMessages: false });
                        }
                    } else {
                        sendResponse({ hasNewMessages: false });
                    }
                } else {
                    sendResponse({ hasNewMessages: false });
                }
            } catch (e) {
                console.error("EchoNav Error checking new messages:", e);
                sendResponse({ hasNewMessages: false });
            }
        })();
        return true;
    } else if (request.action === "updateOutline") {
        (async () => {
            try {
                const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (!currentTab) {
                    throw new Error("No active tab found");
                }

                // First, ping the content script to make sure it's ready
                try {
                    const pingResponse = await chrome.tabs.sendMessage(currentTab.id, { action: "ping" });
                    console.log("EchoNav: Content script is ready for update");
                } catch (pingError) {
                    throw new Error("Content script is not ready. Please refresh the page and try again.");
                }

                // Get current conversation turns
                const response = await chrome.tabs.sendMessage(currentTab.id, { action: "extractText" });
                const currentTurns = response.data || [];
                
                // Get cached data
                const result = await chrome.storage.local.get([currentTab.url]);
                const cachedData = result[currentTab.url];
                
                if (!cachedData || !cachedData.items) {
                    throw new Error("No cached outline found to update");
                }
                
                const cachedTurnCount = cachedData.items.length;
                const newTurns = currentTurns.slice(cachedTurnCount);
                
                if (newTurns.length === 0) {
                    sendResponse({ error: null, data: null, pending: true, message: "No new turns found, retrying..." });
                    return;
                }
                
                // Validate turns and use lenient approach
                const completeTurns = await validateCompleteTurns(newTurns, currentTab.id);
                const turnsWithBasicContent = newTurns.filter(turn => turn.user && turn.assistant && turn.assistant.length > 50);
                
                const turnsToProcess = completeTurns.length > 0 ? completeTurns : 
                                     turnsWithBasicContent.length > 0 ? turnsWithBasicContent : null;
                
                if (!turnsToProcess) {
                    sendResponse({ error: null, data: null, pending: true, pendingTurns: newTurns.length });
                    return;
                }
                
                // Use cached summarizer or create new one if needed
                let summarizer = cachedSummarizer;
                if (!summarizer) {
                    console.log("EchoNav: Cached summarizer not available, creating new one...");
                    // Check Summarizer availability
                    const availability = await Summarizer.availability();
                    if (availability === 'unavailable') {
                        throw new Error("Summarizer is unavailable. Please check your browser version and system requirements.");
                    }
                    
                    // Create new summarizer instance
                    summarizer = await Summarizer.create({
                        type: 'headline',
                        format: 'plain-text',
                        length: 'short'
                    });
                    
                    // Cache it for future use
                    cachedSummarizer = summarizer;
                    console.log("EchoNav: New summarizer created and cached");
                }
                
                // Summarize only the complete new turns and generate key points for each
                const newOutlineItems = [];
                const newKeyPoints = [];
                
                for (let i = 0; i < turnsToProcess.length; i++) {
                    const turn = turnsToProcess[i];
                    const turnText = `User: ${turn.user}\nAssistant: ${turn.assistant}`;
                    
                    // Generate turn title (smart title selection based on structure type)
                    let cleanTitle;
                    
                    if (turn.responseStructure && turn.responseStructure.type === 'structured' && turn.responseStructure.headings.length > 0) {
                        const topLevelHeadings = turn.responseStructure.headings.filter(h => h.normalizedLevel === 1);
                        if (topLevelHeadings.length === 1) {
                            cleanTitle = topLevelHeadings[0].text;
                        } else {
                            const titleResult = await summarizer.summarize(turnText);
                            cleanTitle = titleResult.trim();
                        }
                    } else {
                        const titleResult = await summarizer.summarize(turnText);
                        cleanTitle = titleResult.trim();
                    }
                    
                    // Process response structure based on type (same logic as main generation)
                    let responseOutline = null;
                    let structuredData = null;
                    
                    if (turn.responseStructure) {
                        if (turn.responseStructure.type === 'structured') {
                            structuredData = {
                                type: 'structured',
                                outline: turn.responseStructure.headings.map(h => ({
                                    level: h.normalizedLevel,
                                    text: h.text,
                                    uniqueId: h.uniqueId,
                                    tagName: h.tagName
                                }))
                            };
                            responseOutline = turn.responseStructure.headings;
                            
                        } else if (turn.responseStructure.type === 'plain_text') {
                            const paragraphs = turn.responseStructure.paragraphs;
                            const paragraphCount = paragraphs.length;
                            const totalWords = turn.responseStructure.totalWordCount;
                            
                            if (paragraphCount > 3 && totalWords > 200) {
                                try {
                                    const groupedThemes = await groupParagraphsByThemes(paragraphs, currentTab.url);
                                    structuredData = {
                                        type: 'themed_groups',
                                        themes: groupedThemes
                                    };
                                    responseOutline = groupedThemes;
                                } catch (themeError) {
                                    structuredData = {
                                        type: 'simple_paragraphs',
                                        paragraphs: paragraphs.map(p => ({
                                            text: p.text.substring(0, 100) + (p.text.length > 100 ? '...' : ''),
                                            uniqueId: p.uniqueId,
                                            wordCount: p.wordCount
                                        }))
                                    };
                                    responseOutline = paragraphs;
                                }
                            } else {
                                structuredData = {
                                    type: 'simple_paragraphs',
                                    paragraphs: paragraphs.map(p => ({
                                        text: p.text.substring(0, 100) + (p.text.length > 100 ? '...' : ''),
                                        uniqueId: p.uniqueId,
                                        wordCount: p.wordCount
                                    }))
                                };
                                responseOutline = paragraphs;
                            }
                        }
                    } else {
                        const keyPointsResponse = await summarizer.summarize(turnText, {
                            type: 'key-points',
                            length: 'short'
                        });
                        
                        const parsedKeyPoints = parseKeyPoints(keyPointsResponse);
                        const matchedKeyPoints = await matchKeyPointsWithText(parsedKeyPoints, turn.assistant, turn.assistantUniqueId);
                        
                        structuredData = {
                            type: 'key_points',
                            keyPoints: matchedKeyPoints
                        };
                        responseOutline = matchedKeyPoints;
                    }
                    
                    // Create the outline item with structured data (matching main generation format)
                    const outlineItem = {
                        title: cleanTitle,
                        originalText: turn.user,
                        assistantText: turn.assistant,
                        assistantUniqueId: turn.assistantUniqueId,
                        responseStructure: turn.responseStructure,
                        structuredData: structuredData,
                        responseOutline: responseOutline,
                        // Keep legacy format for backward compatibility
                        keyPoints: structuredData.type === 'key_points' ? 
                            structuredData.keyPoints.map(kp => kp.point).join('\n• ') : 
                            'See structured outline',
                        parsedKeyPoints: structuredData.type === 'key_points' ? structuredData.keyPoints : []
                    };
                    newOutlineItems.push(outlineItem);
                    
                    // Add to new key points array for logical hierarchy (only for key_points type)
                    if (structuredData.type === 'key_points' && structuredData.keyPoints) {
                        structuredData.keyPoints.forEach((keyPoint, pointIndex) => {
                            const uniqueId = `item-${cachedTurnCount + i}-point-${pointIndex}`;
                            newKeyPoints.push({
                                id: uniqueId,
                                text: keyPoint.point,
                                originalItem: cachedTurnCount + i,
                                originalPoint: pointIndex,
                                traceability: {
                                    title: cleanTitle,
                                    originalText: turn.user,
                                    assistantText: turn.assistant,
                                    assistantUniqueId: turn.assistantUniqueId,
                                    match: keyPoint.match
                                }
                            });
                        });
                    }
                }
                
                // Combine with existing items
                const allItems = [...cachedData.items, ...newOutlineItems];
                const finalOutline = allItems.map(item => `- ${item.title}`).join('\n');
                
                // Save updated outline with complete data
                const updatedData = { outline: finalOutline, items: allItems };
                await chrome.storage.local.set({ [currentTab.url]: updatedData });
                
                // Check if we need to update logical hierarchy
                const logicalHierarchyResult = await chrome.storage.local.get([currentTab.url]);
                const existingInsightHierarchy = logicalHierarchyResult[currentTab.url]?.logicalHierarchy;
                
                if (existingInsightHierarchy && newKeyPoints.length > 0) {
                    // We have an existing logical hierarchy, so we should update it
                    console.log(`EchoNav: Updating existing logical hierarchy with ${newKeyPoints.length} new key points`);
                    
                    try {
                        const updatedHierarchy = await updateInsightHierarchy(existingInsightHierarchy, newKeyPoints, currentTab.url);
                        
                        // Update the stored data with the new logical hierarchy
                        const updatedDataWithHierarchy = { 
                            ...updatedData, 
                            logicalHierarchy: updatedHierarchy 
                        };
                        await chrome.storage.local.set({ [currentTab.url]: updatedDataWithHierarchy });
                        
                        console.log("EchoNav: Insight hierarchy updated successfully via incremental update");
                        
                        // Notify the sidepanel that the logical hierarchy has been updated
                        chrome.runtime.sendMessage({ 
                            action: "logicalHierarchyUpdated", 
                            data: updatedHierarchy 
                        });
                        
                    } catch (hierarchyError) {
                        console.warn("EchoNav: Failed to update logical hierarchy:", hierarchyError);
                        // Don't fail the entire update if hierarchy update fails
                    }
                } else if (newKeyPoints.length > 0) {
                    // No existing hierarchy, just save the data
                    console.log("EchoNav: No existing logical hierarchy to update");
                }
                
                console.log("EchoNav: Outline updated successfully");
                sendResponse({ data: { summary: finalOutline, items: allItems } });
                
            } catch (e) {
                console.error("EchoNav Error updating outline:", e);
                sendResponse({ error: e.message });
            }
            })();
            return true;
        } else if (request.action === "getDebugData") {
            (async () => {
                try {
                    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                    if (currentTab && currentTab.url) {
                        const debugData = debugDataStorage[currentTab.url] || null;
                        console.log("EchoNav: Sending debug data for URL:", currentTab.url);
                        sendResponse({ data: debugData });
                    } else {
                        sendResponse({ data: null });
                    }
                } catch (e) {
                    console.error("EchoNav Error getting debug data:", e);
                    sendResponse({ error: e.message });
                }
            })();
            return true;
        } else if (request.action === "clearDebugData") {
            (async () => {
                try {
                    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                    if (currentTab && currentTab.url) {
                        delete debugDataStorage[currentTab.url];
                        console.log("EchoNav: Debug data cleared for URL:", currentTab.url);
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: "No active tab found" });
                    }
                } catch (e) {
                    console.error("EchoNav Error clearing debug data:", e);
                    sendResponse({ error: e.message });
                }
            })();
            return true;
        } else if (request.action === "regenerateOutline") {
            (async () => {
                try {
                    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                    if (!currentTab) {
                        throw new Error("No active tab found");
                    }

                    // Clear existing debug data and cached outline for this URL
                    delete debugDataStorage[currentTab.url];
                    await chrome.storage.local.remove([currentTab.url]);
                    
                    console.log("EchoNav: Cleared existing data, starting regeneration for URL:", currentTab.url);
                    
                    // Trigger a new summarization
                    sendResponse({ success: true });
                } catch (e) {
                    console.error("EchoNav Error regenerating outline:", e);
                    sendResponse({ error: e.message });
                }
            })();
            return true;
        } else if (request.action === "generateInsightHierarchy") {
            (async () => {
                try {
                    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                    if (!currentTab) {
                        throw new Error("No active tab found");
                    }
                    
                    // Get cached outline items
                    const result = await chrome.storage.local.get([currentTab.url]);
                    const cachedData = result[currentTab.url];
                    
                    if (!cachedData || !cachedData.items) {
                        throw new Error("No outline data found. Please generate a timeline outline first.");
                    }
                    
                    console.log("EchoNav: Generating logical hierarchy for", cachedData.items.length, "items");
                    
                    // Generate logical hierarchy
                    const hierarchy = await generateInsightHierarchy(cachedData.items, currentTab.url);
                    
                    // Save hierarchy to storage
                    await chrome.storage.local.set({ 
                        [currentTab.url]: { 
                            ...cachedData, 
                            logicalHierarchy: hierarchy 
                        } 
                    });
                    
                    sendResponse({ data: hierarchy });
                    
                } catch (e) {
                    console.error("EchoNav Error generating logical hierarchy:", e);
                    sendResponse({ error: e.message });
                }
            })();
            return true;
        } else if (request.action === "getInsightHierarchy") {
            (async () => {
                try {
                    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                    if (currentTab && currentTab.url) {
                        const result = await chrome.storage.local.get([currentTab.url]);
                        const cachedData = result[currentTab.url];
                        if (cachedData && cachedData.logicalHierarchy) {
                            sendResponse({ data: cachedData.logicalHierarchy });
                        } else {
                            sendResponse({ data: null });
                        }
                    } else {
                        sendResponse({ data: null });
                    }
                } catch (e) {
                    console.error("EchoNav Error getting logical hierarchy:", e);
                    sendResponse({ error: e.message });
                }
            })();
            return true;
        } else if (request.action === "updateInsightHierarchy") {
            // Update existing logical hierarchy with new key points
            (async () => {
                try {
                    const currentUrl = request.url;
                    const { existingHierarchy, newKeyPoints } = request;
                    
                    const updatedHierarchy = await updateInsightHierarchy(existingHierarchy, newKeyPoints, currentUrl);
                    sendResponse({ data: updatedHierarchy });
                } catch (error) {
                    console.error("EchoNav: Error updating logical hierarchy:", error);
                    sendResponse({ error: error.message });
                }
            })();
            return true;
        } else if (request.action === "callSummarizerAPI") {
            // NEW: Handle SummarizerAPI calls for key points generation
            (async () => {
                try {
                    console.log("EchoNav: Received SummarizerAPI call request");
                    const text = request.text;
                    const requestType = request.requestType || "keypoints";
                    
                    // Call the SummarizerAPI to generate key points
                    const keyPoints = await callSummarizerAPIForKeyPoints(text);
                    
                    if (keyPoints && keyPoints.length > 0) {
                        console.log("EchoNav: Successfully generated key points:", keyPoints);
                        sendResponse({ 
                            success: true, 
                            keyPoints: keyPoints.slice(0, 3) // Ensure max 3 points
                        });
                    } else {
                        console.warn("EchoNav: No key points generated");
                        sendResponse({ 
                            success: false, 
                            error: "No key points generated" 
                        });
                    }
                    
                } catch (error) {
                    console.error("EchoNav: Error in SummarizerAPI call:", error);
                    sendResponse({ 
                        success: false, 
                        error: error.message 
                    });
                }
            })();
            return true;
        }
    });

// NEW: Function to call SummarizerAPI specifically for key points generation
async function callSummarizerAPIForKeyPoints(text) {
    try {
        console.log("EchoNav: Generating key points using SummarizerAPI");
        
        // Check if Summarizer API is available
        if (!('Summarizer' in self)) {
            throw new Error("Summarizer API is not available");
        }
        
        // Create summarizer with key points optimized settings
        const summarizer = await self.Summarizer.create({
            type: 'key-points',
            format: 'plain-text',
            length: 'short'
        });
        
        // Generate summary/key points
        const summary = await summarizer.summarize(text);
        
        console.log("EchoNav: Raw summarizer output:", summary);
        
        // Parse the key points from the summary
        const keyPoints = parseKeyPoints(summary);
        
        // Destroy the summarizer to free resources
        summarizer.destroy();
        
        console.log("EchoNav: Parsed key points:", keyPoints);
        return keyPoints.slice(0, 3); // Return max 3 points
        
    } catch (error) {
        console.error("EchoNav: SummarizerAPI error:", error);
        throw error;
    }
}

