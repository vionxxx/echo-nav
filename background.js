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

    // Function to update existing logical hierarchy with new Timeline items
    async function updateInsightHierarchy(existingHierarchy, newTimelineItems, currentUrl) {
        try {
            console.log("EchoNav: Starting logical hierarchy update with new Timeline items...");
            
            // Check if Prompt API is available
            if (!('LanguageModel' in self)) {
                throw new Error("Prompt API is not available. Please use Chrome 138+ and ensure your system meets the requirements.");
            }
            
            // Check Prompt API availability
            const availability = await LanguageModel.availability();
            if (availability === 'unavailable') {
                throw new Error("Prompt API is unavailable. Please check your browser version and system requirements.");
            }
            
            if (newTimelineItems.length === 0) {
                throw new Error("No new Timeline items available for hierarchy update.");
            }
            
            console.log(`EchoNav: Updating hierarchy with ${newTimelineItems.length} new Timeline subdirectory items`);
            console.log(`EchoNav: New item type breakdown:`);
            const typeCounts = {};
            newTimelineItems.forEach(item => {
                typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
            });
            Object.keys(typeCounts).forEach(type => {
                console.log(`  - ${type}: ${typeCounts[type]} items`);
            });
            
            // Create Prompt API session with optimized parameters for consistent output
            const session = await LanguageModel.create({
                temperature: 0,  // More deterministic output
                topK: 1         // Most likely response only
            });
            
            // Build a concise update prompt
            const newItemsText = newTimelineItems.map((item, idx) => 
                `${idx + 1}. [${item.id}] ${item.text}`
            ).join('\n');
            
            const updatePrompt = `Add new Timeline items to existing hierarchy. Use EXACT text, each item EXACTLY ONCE.

EXISTING HIERARCHY (DO NOT CHANGE):
${JSON.stringify(existingHierarchy, null, 2)}

NEW ITEMS (${newTimelineItems.length} total):
${newItemsText}

Rules:
1. Preserve existing structure - only ADD new items
2. Categorize each new item to existing topics OR create new topics
3. Use exact text - NO rewriting
4. EVERY new item ID must appear in output

JSON format:
{
  "additions": [
    {
      "targetTopic": "Existing topic name",
      "newSubpoints": [
        {
          "topic": "Exact item text",
          "level": 1,
          "originalIds": ["item-X-type-Y"]
        }
      ]
    }
  ],
  "newTopics": [
    {
      "topic": "New main topic",
      "level": 0,
      "originalIds": [],
      "subpoints": [...]
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
            
            // Use Prompt API with JSON Schema constraint and timeout
            console.log("EchoNav: Sending update prompt to PromptAPI (with 30s timeout)...");
            const startTime = Date.now();
            
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('PromptAPI update request timed out after 30 seconds')), 30000);
            });
            
            const apiCall = session.prompt(updatePrompt, {
                responseConstraint: updateSchema,
                omitResponseConstraintInput: true
            });
            
            const result = await Promise.race([apiCall, timeoutPromise]);
            const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`EchoNav: ✅ PromptAPI update responded in ${elapsedTime}s`);
            
            const updateData = JSON.parse(result);
            console.log("EchoNav: Generated update structure:", updateData);
            
            // Log the raw response for debugging
            console.log("EchoNav: Raw Prompt API response for logical hierarchy update:", result);
            
            // Apply the updates to the existing hierarchy
            const updatedHierarchy = applyHierarchyUpdates(existingHierarchy, updateData, newTimelineItems);
            
            // Store the updated logical hierarchy (this will be handled by the caller)
            // The updated hierarchy is returned to be stored with the main data
            
            // Store the update in debug data
            if (debugDataStorage[currentUrl]) {
                debugDataStorage[currentUrl].logicalHierarchyUpdate = {
                    timestamp: new Date().toISOString(),
                    newTimelineItems: newTimelineItems,
                    updateData: updateData,
                    updatedHierarchy: updatedHierarchy,
                    rawResponse: result, // Store the raw JSON response
                    promptUsed: updatePrompt,
                    itemTypeBreakdown: typeCounts
                };
            }
            
            return updatedHierarchy;
            
        } catch (error) {
            console.error("EchoNav: Error updating logical hierarchy:", error);
            throw error;
        }
    }

    // Helper function to apply hierarchy updates
    function applyHierarchyUpdates(existingHierarchy, updateData, newTimelineItems) {
        const updatedHierarchy = JSON.parse(JSON.stringify(existingHierarchy)); // Deep copy
        
        console.log("EchoNav: Applying hierarchy updates...");
        console.log(`EchoNav: - Additions to existing topics: ${updateData.additions?.length || 0}`);
        console.log(`EchoNav: - New topics: ${updateData.newTopics?.length || 0}`);
        
        // Apply additions to existing topics
        if (updateData.additions) {
            updateData.additions.forEach(addition => {
                const targetTopic = updatedHierarchy.find(topic => topic.topic === addition.targetTopic);
                if (targetTopic) {
                    if (!targetTopic.subpoints) {
                        targetTopic.subpoints = [];
                    }
                    targetTopic.subpoints.push(...addition.newSubpoints);
                    console.log(`EchoNav: Added ${addition.newSubpoints.length} items to topic "${addition.targetTopic}"`);
                } else {
                    console.warn(`EchoNav: Target topic "${addition.targetTopic}" not found in existing hierarchy`);
                }
            });
        }
        
        // Add new topics
        if (updateData.newTopics) {
            updatedHierarchy.push(...updateData.newTopics);
            console.log(`EchoNav: Added ${updateData.newTopics.length} new main topics`);
        }
        
        return updatedHierarchy;
    }

    // Function to generate logical hierarchy using Prompt API
    // Now extracts ALL subdirectory items from Timeline View (headings, themes, etc.)
    async function generateInsightHierarchy(outlineItems, currentUrl) {
    try {
        console.log("EchoNav: Starting logical hierarchy generation from Timeline subdirectories...");
        
        // Check if Prompt API is available
        if (!('LanguageModel' in self)) {
            throw new Error("Prompt API is not available. Please use Chrome 138+ and ensure your system meets the requirements.");
        }
        
        // Check Prompt API availability
        const availability = await LanguageModel.availability();
        if (availability === 'unavailable') {
            throw new Error("Prompt API is unavailable. Please check your browser version and system requirements.");
        }
        
        // Collect ALL subdirectory items from Timeline View
        const allTimelineItems = [];
        outlineItems.forEach((item, itemIndex) => {
            console.log(`EchoNav: Processing Timeline item ${itemIndex + 1}: "${item.title}"`);
            console.log(`EchoNav: - Type: ${item.structuredData?.type || 'unknown'}`);
            
            // Extract subdirectory items based on structure type
            if (item.structuredData) {
                if (item.structuredData.type === 'structured') {
                    // Case A: Headings structure
                    console.log(`EchoNav: - Found ${item.structuredData.outline?.length || 0} headings`);
                    item.structuredData.outline?.forEach((heading, headingIndex) => {
                        const uniqueId = `item-${itemIndex}-heading-${headingIndex}`;
                        allTimelineItems.push({
                            id: uniqueId,
                            text: heading.text,
                            originalItem: itemIndex,
                            originalIndex: headingIndex,
                            type: 'heading',
                            level: heading.level,
                            traceability: {
                                title: item.title,
                                originalText: item.originalText,
                                assistantText: item.assistantText,
                                assistantUniqueId: item.assistantUniqueId,
                                headingId: heading.uniqueId,
                                headingTagName: heading.tagName
                            }
                        });
                    });
                } else if (item.structuredData.type === 'themed_groups') {
                    // Case B1: Themed groups
                    console.log(`EchoNav: - Found ${item.structuredData.themes?.length || 0} themes`);
                    item.structuredData.themes?.forEach((theme, themeIndex) => {
                        const uniqueId = `item-${itemIndex}-theme-${themeIndex}`;
                        allTimelineItems.push({
                            id: uniqueId,
                            text: theme.themeName,
                            originalItem: itemIndex,
                            originalIndex: themeIndex,
                            type: 'theme',
                            level: 1,
                            traceability: {
                                title: item.title,
                                originalText: item.originalText,
                                assistantText: item.assistantText,
                                assistantUniqueId: item.assistantUniqueId,
                                themeName: theme.themeName,
                                paragraphIds: theme.paragraphIds
                            }
                        });
                    });
                } else if (item.structuredData.type === 'key_points') {
                    // Fallback: Key points
                    console.log(`EchoNav: - Found ${item.structuredData.keyPoints?.length || 0} key points`);
                    item.structuredData.keyPoints?.forEach((keyPoint, pointIndex) => {
                        const uniqueId = `item-${itemIndex}-keypoint-${pointIndex}`;
                        allTimelineItems.push({
                            id: uniqueId,
                            text: keyPoint.point,
                            originalItem: itemIndex,
                            originalIndex: pointIndex,
                            type: 'keypoint',
                            level: 1,
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
                // Note: simple_paragraphs are intentionally not included as they're too granular
            } else if (item.parsedKeyPoints && item.parsedKeyPoints.length > 0) {
                // Legacy fallback: use parsed key points
                console.log(`EchoNav: - Using legacy parsedKeyPoints (${item.parsedKeyPoints.length} points)`);
                item.parsedKeyPoints.forEach((keyPoint, pointIndex) => {
                    const uniqueId = `item-${itemIndex}-keypoint-${pointIndex}`;
                    allTimelineItems.push({
                        id: uniqueId,
                        text: keyPoint.point,
                        originalItem: itemIndex,
                        originalIndex: pointIndex,
                        type: 'keypoint',
                        level: 1,
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
        
        if (allTimelineItems.length === 0) {
            throw new Error("No timeline subdirectory items available for hierarchy generation.");
        }
        
        console.log(`EchoNav: Collected ${allTimelineItems.length} timeline subdirectory items for hierarchy generation`);
        console.log(`EchoNav: Item type breakdown:`);
        const typeCounts = {};
        allTimelineItems.forEach(item => {
            typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
        });
        Object.keys(typeCounts).forEach(type => {
            console.log(`  - ${type}: ${typeCounts[type]} items`);
        });
        
        // Group items by turn for debugging
        const itemsByTurn = {};
        allTimelineItems.forEach(item => {
            const turnIndex = item.originalItem;
            if (!itemsByTurn[turnIndex]) {
                itemsByTurn[turnIndex] = [];
            }
            itemsByTurn[turnIndex].push(item);
        });
        
        console.log("EchoNav: Timeline items organized by turn:");
        Object.keys(itemsByTurn).forEach(turnIndex => {
            const turnItems = itemsByTurn[turnIndex];
            console.log(`  Turn ${turnIndex} (${outlineItems[turnIndex].title}): ${turnItems.length} subdirectory items`);
            turnItems.forEach(item => {
                console.log(`    - [${item.type}] ${item.id}: ${item.text.substring(0, 80)}...`);
            });
        });
        
        // Create Prompt API session with optimized parameters for consistent output
        const session = await LanguageModel.create({
            temperature: 0,  // More deterministic output
            topK: 1         // Most likely response only
        });
        
        // Build a more concise prompt - only essential information
        const timelineItemsText = allTimelineItems.map((item, idx) => 
            `${idx + 1}. [${item.id}] ${item.text}`
        ).join('\n');
        
        const prompt = `Create a refined logical hierarchy from Timeline items. You can MERGE similar items and FILTER meaningless ones to create a clean, insightful structure.

Items (${allTimelineItems.length} total):
${timelineItemsText}

INTELLIGENT PROCESSING RULES:
1. **MERGE similar/redundant items**: 
   - "The origin of rock" + "The beginning of rock" → "The origin of rock" (use both IDs)
   - "Python basics" + "Python fundamentals" → "Python fundamentals" (use both IDs)

2. **FILTER meaningless items**:
   - Remove: "In summary", "In conclusion", "To wrap up", "Finally", "Let me summarize"
   - Remove: Generic transitions like "Next", "Moving on", "Additionally"
   - Keep meaningful content items only

3. **PRESERVE traceability**: 
   - Merged items: include ALL original IDs
   - Filtered items: mark as filtered but keep IDs for reference

4. **Create 2-5 logical themes** based on actual content significance
5. **Use the BEST representative text** from merged items (usually the clearest/most specific one)

JSON format:
{
  "hierarchy": [
    {
      "topic": "Main Topic Name",
      "level": 0,
      "originalIds": [],
      "subpoints": [
        {
          "topic": "Best representative text from merged items",
          "level": 1,
          "originalIds": ["item-X-type-Y", "item-Z-type-W"],
          "mergedFrom": ["Original text 1", "Original text 2"]
        }
      ]
    }
  ],
  "filtered": [
    {
      "reason": "Meaningless transition",
      "originalIds": ["item-A-type-B"],
      "originalText": "In summary"
    }
  ]
}`;
        // Define JSON Schema for structured output with merge/filter support
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
                            "mergedFrom": {"type": "array", "items": {"type": "string"}},
                            "subpoints": {"type": "array"}
                        },
                        "required": ["topic", "level", "originalIds"]
                    }
                },
                "filtered": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "reason": {"type": "string"},
                            "originalIds": {"type": "array", "items": {"type": "string"}},
                            "originalText": {"type": "string"}
                        },
                        "required": ["reason", "originalIds", "originalText"]
                    }
                }
            },
            "required": ["hierarchy"]
        };
        
        // Use Prompt API with JSON Schema constraint (no timeout)
        console.log("EchoNav: Sending prompt to PromptAPI (no timeout limit)...");
        const startTime = Date.now();
        
        const result = await session.prompt(prompt, {
            responseConstraint: schema,
            omitResponseConstraintInput: true
        });
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`EchoNav: ✅ PromptAPI responded in ${elapsedTime}s`);
        
            const hierarchyData = JSON.parse(result);
            console.log("EchoNav: Generated hierarchy structure:", hierarchyData);
            console.log("EchoNav: Number of main topics created:", hierarchyData.hierarchy?.length || 0);
            
            // Log the raw response for debugging
            console.log("EchoNav: Raw Prompt API response for logical hierarchy:", result);
            
            // Validate that all original IDs are accounted for (used or filtered)
            const allOriginalIds = allTimelineItems.map(item => item.id);
            
            // Collect IDs from hierarchy (including merged items)
            const usedIds = [];
            function collectIds(hierarchy) {
                hierarchy.forEach(node => {
                    if (node.originalIds) {
                        usedIds.push(...node.originalIds);
                    }
                    if (node.subpoints) {
                        collectIds(node.subpoints);
                    }
                });
            }
            collectIds(hierarchyData.hierarchy);
            
            // Collect IDs from filtered items
            const filteredIds = [];
            if (hierarchyData.filtered && Array.isArray(hierarchyData.filtered)) {
                hierarchyData.filtered.forEach(filtered => {
                    if (filtered.originalIds) {
                        filteredIds.push(...filtered.originalIds);
                    }
                });
            }
            
            // Check for any unaccounted items
            const accountedIds = [...usedIds, ...filteredIds];
            const missingIds = allOriginalIds.filter(id => !accountedIds.includes(id));
            
            // Log processing results
            console.log(`EchoNav: 📊 Processing summary:`);
            console.log(`  - Total items: ${allOriginalIds.length}`);
            console.log(`  - Used in hierarchy: ${usedIds.length}`);
            console.log(`  - Filtered out: ${filteredIds.length}`);
            console.log(`  - Missing: ${missingIds.length}`);
            
            if (hierarchyData.filtered && hierarchyData.filtered.length > 0) {
                console.log(`EchoNav: 🗑️ Filtered items:`, hierarchyData.filtered.map(f => 
                    `"${f.originalText}" (${f.reason})`
                ));
            }
            
            if (missingIds.length > 0) {
                console.warn("EchoNav: ⚠️ Some original Timeline item IDs were not accounted for:", missingIds);
                console.warn("EchoNav: Missing items:", missingIds.map(id => {
                    const item = allTimelineItems.find(i => i.id === id);
                    return item ? `${id} (${item.type}): ${item.text.substring(0, 50)}...` : id;
                }));
                
                // Auto-remedy: Add missing items to "Additional Topics"
                const missingItems = missingIds.map(id => allTimelineItems.find(i => i.id === id)).filter(i => i);
                if (missingItems.length > 0) {
                    console.log(`EchoNav: 🔧 Auto-remedy: Creating "Additional Topics" for ${missingItems.length} missing items`);
                    hierarchyData.hierarchy.push({
                        topic: "Additional Topics",
                        level: 0,
                        originalIds: [],
                        subpoints: missingItems.map(item => ({
                            topic: item.text,
                            level: 1,
                            originalIds: [item.id]
                        }))
                    });
                    console.log("EchoNav: ✅ All items now accounted for");
                }
            } else {
                console.log("EchoNav: ✅ All original Timeline item IDs properly accounted for");
            }
        
        // Add traceability information back to the hierarchy
        const enrichedHierarchy = addTraceabilityToHierarchy(hierarchyData.hierarchy, allTimelineItems);
        
        // Store the logical hierarchy in debug data
        if (debugDataStorage[currentUrl]) {
            debugDataStorage[currentUrl].logicalHierarchy = {
                timestamp: new Date().toISOString(),
                originalTimelineItems: allTimelineItems,
                generatedHierarchy: enrichedHierarchy,
                rawResponse: result, // Store the raw JSON response
                promptUsed: prompt,
                validationResults: {
                    totalOriginalIds: allOriginalIds.length,
                    preservedIds: usedIds.length,
                    missingIds: missingIds
                },
                itemTypeBreakdown: typeCounts
            };
        }
        
        return enrichedHierarchy;
        
    } catch (error) {
        console.error("EchoNav: Error generating logical hierarchy:", error);
        throw error;
    }
}

// Helper function to add traceability information back to hierarchy
// Updated to work with Timeline items (headings, themes, keypoints) and handle merged items
function addTraceabilityToHierarchy(hierarchy, allTimelineItems) {
    return hierarchy.map(node => {
        const enrichedNode = { ...node };
        
        // Add traceability data for this node (supports multiple IDs for merged items)
        enrichedNode.traceability = node.originalIds.map(id => {
            const timelineItem = allTimelineItems.find(item => item.id === id);
            if (!timelineItem) return null;
            
            // Return enhanced traceability with item type information
            return {
                ...timelineItem.traceability,
                itemType: timelineItem.type,
                originalId: timelineItem.id,
                originalText: timelineItem.text // Include original text for merged items
            };
        }).filter(t => t !== null);
        
        // For merged items, mark which one is the primary (first one) for navigation
        if (enrichedNode.traceability.length > 1) {
            enrichedNode.traceability[0].isPrimary = true;
            enrichedNode.isMerged = true;
            console.log(`EchoNav: Node "${node.topic}" merges ${enrichedNode.traceability.length} items:`, 
                enrichedNode.traceability.map(t => t.originalText));
        }
        
        // Add merged information if available
        if (node.mergedFrom && node.mergedFrom.length > 0) {
            enrichedNode.mergedFrom = node.mergedFrom;
        }
        
        // Recursively process subpoints
        if (node.subpoints && node.subpoints.length > 0) {
            enrichedNode.subpoints = addTraceabilityToHierarchy(node.subpoints, allTimelineItems);
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
    // Handle URL changes for ChatGPT pages
    if (changeInfo.url && changeInfo.url.includes('chatgpt.com')) {
        console.log("EchoNav: ChatGPT URL changed:", changeInfo.url);
        
        // Notify both content script and sidepanel about URL change
        chrome.tabs.sendMessage(tabId, { action: "urlChanged", url: changeInfo.url }).catch((e) => 
            console.log("EchoNav: Content script not ready", e));
        
        // Also send to sidepanel via runtime message
        chrome.runtime.sendMessage({ action: "urlChanged", url: changeInfo.url }).catch((e) => 
            console.log("EchoNav: Sidepanel not open", e));
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
                                // For structured responses, always generate title using Summarizer with first paragraph + all headings
                                const topLevelHeadings = turn.responseStructure.headings.filter(h => h.normalizedLevel === 1);
                                console.log(`EchoNav: Found ${topLevelHeadings.length} top-level heading(s), generating title with Summarizer for turn ${i + 1}`);
                                
                                // Always send first paragraph + all headings (including top-level) to Summarizer
                                let summarizerInput = contextPrompt;
                                
                                // Extract first paragraph from assistant response
                                const assistantText = turn.assistant;
                                const firstParagraph = assistantText.split('\n\n')[0] || assistantText.substring(0, 300);
                                
                                // Extract all headings text (including top-level)
                                const headingsList = turn.responseStructure.headings.map(h => h.text).join('\n');
                                
                                // Build optimized input for Summarizer
                                summarizerInput = `User: ${turn.user}\nAssistant (first paragraph): ${firstParagraph}\n\nAll headings in response:\n${headingsList}`;
                                
                                console.log(`EchoNav: Sending first paragraph + all headings to Summarizer for turn ${i + 1}:`);
                                console.log(`EchoNav: Summarizer input:`, summarizerInput);
                                
                                const titleSummarizer = await Summarizer.create({
                                    type: 'headline',
                                    format: 'plain-text',
                                    length: 'short'
                                });
                                
                                const titleResult = await titleSummarizer.summarize(summarizerInput);
                                cleanTitle = titleResult.trim();
                                console.log(`EchoNav: Generated title for turn ${i + 1}: "${cleanTitle}"`)
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
                                action: "addTimelineItem", 
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
                                action: "addTimelineItem", 
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
                        // No cached data - this might be a new conversation
                        // Check if there are any complete turns
                        if (currentTurns.length > 0) {
                            console.log(`EchoNav: No cache found, checking ${currentTurns.length} turns for completeness`);
                            const completeTurns = await validateCompleteTurns(currentTurns, currentTab.id);
                            
                            if (completeTurns.length === currentTurns.length && completeTurns.length > 0) {
                                console.log(`EchoNav: Found ${completeTurns.length} complete turns in new conversation`);
                                sendResponse({ hasNewMessages: false, completeTurns: completeTurns.length });
                            } else if (completeTurns.length < currentTurns.length) {
                                console.log(`EchoNav: Found ${currentTurns.length} turns, but only ${completeTurns.length} are complete`);
                                sendResponse({ hasNewMessages: false, pendingTurns: currentTurns.length - completeTurns.length });
                            } else {
                                sendResponse({ hasNewMessages: false });
                            }
                        } else {
                            sendResponse({ hasNewMessages: false });
                        }
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
                
                // Extract Timeline subdirectory items from new outline items
                const newTimelineItems = [];
                newOutlineItems.forEach((item, itemIndex) => {
                    const globalItemIndex = cachedTurnCount + itemIndex;
                    
                    if (item.structuredData) {
                        if (item.structuredData.type === 'structured') {
                            item.structuredData.outline?.forEach((heading, headingIndex) => {
                                const uniqueId = `item-${globalItemIndex}-heading-${headingIndex}`;
                                newTimelineItems.push({
                                    id: uniqueId,
                                    text: heading.text,
                                    originalItem: globalItemIndex,
                                    originalIndex: headingIndex,
                                    type: 'heading',
                                    level: heading.level,
                                    traceability: {
                                        title: item.title,
                                        originalText: item.originalText,
                                        assistantText: item.assistantText,
                                        assistantUniqueId: item.assistantUniqueId,
                                        headingId: heading.uniqueId,
                                        headingTagName: heading.tagName
                                    }
                                });
                            });
                        } else if (item.structuredData.type === 'themed_groups') {
                            item.structuredData.themes?.forEach((theme, themeIndex) => {
                                const uniqueId = `item-${globalItemIndex}-theme-${themeIndex}`;
                                newTimelineItems.push({
                                    id: uniqueId,
                                    text: theme.themeName,
                                    originalItem: globalItemIndex,
                                    originalIndex: themeIndex,
                                    type: 'theme',
                                    level: 1,
                                    traceability: {
                                        title: item.title,
                                        originalText: item.originalText,
                                        assistantText: item.assistantText,
                                        assistantUniqueId: item.assistantUniqueId,
                                        themeName: theme.themeName,
                                        paragraphIds: theme.paragraphIds
                                    }
                                });
                            });
                        } else if (item.structuredData.type === 'key_points') {
                            item.structuredData.keyPoints?.forEach((keyPoint, pointIndex) => {
                                const uniqueId = `item-${globalItemIndex}-keypoint-${pointIndex}`;
                                newTimelineItems.push({
                                    id: uniqueId,
                                    text: keyPoint.point,
                                    originalItem: globalItemIndex,
                                    originalIndex: pointIndex,
                                    type: 'keypoint',
                                    level: 1,
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
                    }
                });
                
                if (existingInsightHierarchy && newTimelineItems.length > 0) {
                    // We have an existing logical hierarchy, so we should update it
                    console.log(`EchoNav: Updating existing logical hierarchy with ${newTimelineItems.length} new Timeline items`);
                    
                    try {
                        const updatedHierarchy = await updateInsightHierarchy(existingInsightHierarchy, newTimelineItems, currentTab.url);
                        
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
                } else if (newTimelineItems.length > 0) {
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

                    console.log("EchoNav: Starting regeneration process for URL:", currentTab.url);
                    
                    // Step 1: Clear all DOM markers from previous extraction for fresh Case A/B analysis
                    try {
                        console.log("EchoNav: Clearing DOM markers for fresh Case A/B classification");
                        await chrome.tabs.sendMessage(currentTab.id, { action: "clearDOMMarkers" });
                        console.log("EchoNav: ✅ DOM markers cleared successfully");
                    } catch (domError) {
                        console.warn("EchoNav: Warning - could not clear DOM markers (content script may not be ready):", domError);
                        // Continue anyway - the extraction will still work, just might reuse some IDs
                    }
                    
                    // Step 2: Clear existing debug data and cached outline for this URL
                    delete debugDataStorage[currentTab.url];
                    await chrome.storage.local.remove([currentTab.url]);
                    console.log("EchoNav: ✅ Cleared cached data from storage");
                    
                    console.log("EchoNav: ✅ Regeneration preparation complete - ready for fresh extraction and Case A/B classification");
                    
                    // Trigger a new summarization with fresh extraction
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

