# EchoNav - Making AI Conversations Accessible

EchoNav is a Chrome extension that transforms AI chat conversations into structured, navigable experiences. Designed with accessibility in mind, it helps users - incuding those with visual impairments - navigate long AI conversations effortlessly through intelligent organization and voice-first design.

## 🌟 Key Features

- **📋 Intelligent Timeline Generation**: Automatically creates structured outlines with AI-generated titles and keypoints
- **🧠 Dual Navigation Views**: Timeline for chronological flow, Insight for thematic organization  
- **🎯 In-Page Keypoint Display**: Show summary cards directly in ChatGPT conversation
- **♿ Screen Reader Optimized**: Full VoiceOver compatibility with ARIA standards and WCAG 2.2 AA compliance
- **⌨️ Keyboard-First Design**: Comprehensive keyboard shortcuts for hands-free navigation
- **🔄 Smart Auto-Update**: Intelligent detection of new messages with flexible update modes
- **🌐 Fullscreen Mode**: Immersive timeline overlay on conversation page

## 🎯 Why EchoNav?

Visually impaired users face significant barriers when using AI chat tools - they must listen to every word sequentially without the ability to quickly scan or jump between topics. EchoNav bridges this gap by turning scattered conversations into organized, accessible pathways that work seamlessly with assistive technologies.

## ⚡ Prerequisites

Before installing EchoNav, ensure your system meets these requirements:

- **Chrome Version**: Chrome Dev/Canary channel ≥ 128.0.6545.0
- **Storage**: Minimum 22 GB free space (for Gemini Nano model)
- **Policy**: Acknowledge Google's Generative AI Prohibited Uses Policy

## 🚀 Installation

### Step 1: Enable Chrome Built-in AI
1. Navigate to `chrome://flags/#optimization-guide-on-device-model`
2. Select "Enabled BypassPerfRequirement"
3. Go to `chrome://flags/#prompt-api-for-gemini-nano`
4. Select "Enabled"
5. Relaunch Chrome

### Step 2: Download the Extension
```bash
git clone https://github.com/your-username/echonav.git
```

### Step 3: Install in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the EchoNav directory
5. The EchoNav icon will appear in your Chrome toolbar

## ⚡ Usage

### Getting Started
1. Visit ChatGPT (https://chatgpt.com)
2. Open an existing conversation or start a new one
3. Click the **EchoNav icon** in your Chrome toolbar to open the side panel
4. Click **"Generate Timeline"** to create the structured outline
5. Click any timeline item to jump to that conversation section

### Using the Side Panel
The EchoNav side panel has three main tabs accessible at the bottom:

**📋 Timeline Tab**
- View chronological conversation structure
- Click any turn to navigate to that section
- Use the **⋯ (More Options)** button to:
  - **Regenerate**: Refresh the timeline with latest conversation
  - **Enter Fullscreen**: View timeline overlay on the conversation page

**🧠 Insight Tab**
- Generate AI-powered thematic organization
- View topics grouped by theme rather than chronology
- Useful for understanding complex multi-topic discussions

### VoiceOver Support (macOS)
1. Enable VoiceOver: Press `Cmd+F5`
2. Navigate to EchoNav side panel
3. Use `VO + Arrow Keys` to navigate the timeline tree structure
4. Press `VO + Space` to activate items and jump to conversation sections
5. Press `VO + U` to activate rotor and navigate through the page

## ⚙️ Features in Detail

### Timeline View
- Chronological organization of conversation turns
- Automatic keypoint extraction for each response
- Visual indicators for user vs AI messages
- Expandable/collapsible structure

### Insight View  
- Thematic grouping of conversation content
- AI-powered topic clustering
- Hierarchical organization for complex discussions
- Quick access to related conversation segments

### Accessibility Controls
- ARIA tree view implementation
- Screen reader announcements for navigation actions
- Customizable TTS reading speed and voice
- High contrast mode and visual indicators

## 💡 How It Works

EchoNav uses Chrome's built-in AI APIs to analyze conversation content:

1. **Content Detection**: Monitors ChatGPT pages for new messages
2. **Structure Analysis**: Identifies conversation turns and response patterns  
3. **Intelligent Summarization**: Extracts key points using on-device AI processing
4. **Hierarchical Organization**: Creates navigable outline structures
5. **Accessibility Enhancement**: Applies ARIA labels and screen reader optimizations

## 🔒 Privacy & Security

- **100% Local Processing**: Uses Chrome's built-in AI APIs - no data sent to external servers
- **No Data Collection**: EchoNav doesn't track, store, or transmit user conversations
- **Minimal Permissions**: Only requests necessary permissions for ChatGPT integration
- **Open Source**: Full transparency with publicly available code

## 🛠️ Settings

Access settings through the **⚙️ Settings tab** at the bottom of the side panel.

### Available Settings

**Auto-update**  
Automatically refresh timeline when new messages are detected. When disabled, you'll see a notification badge with an "Update" button to manually refresh.

**Show Keypoints**  
Display keypoint summary cards directly in the ChatGPT conversation page above each AI response. Toggle this on/off anytime without regenerating the timeline.

**Summary Detail Level**  
Choose the number of keypoints extracted per conversation turn:
- **3 keypoints** - Concise, essential points only
- **5 keypoints** - Balanced detail (default)
- **7 keypoints** - Comprehensive, detailed summary

*Note: Summary level changes only apply to newly generated timelines*

## 📋 Current Supported Platforms

- **ChatGPT**: https://chatgpt.com/*

## ⚠️ Troubleshooting

**Extension not loading:**
- Ensure Chrome Dev/Canary version ≥ 128.0.6545.0
- Verify Chrome built-in AI is enabled (see Installation step 1)
- Check that developer mode is enabled in `chrome://extensions/`
- Look for error messages in the browser console (F12)

**Side panel not opening:**
- Click the EchoNav icon in the Chrome toolbar
- Try closing and reopening the panel
- Refresh the ChatGPT page and try again

**Timeline not generating:**
- Confirm you're on a supported site (ChatGPT)
- Ensure the conversation has multiple turns
- Try refreshing the page and regenerating

**VoiceOver not working:**
- Enable VoiceOver in macOS System Preferences
- Ensure focus is on the EchoNav interface
- Check ARIA announcements are not muted

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and enhancement requests.

---

**Making AI conversations accessible for everyone** 🌟
