# EchoNav - Making AI Conversations Accessible

EchoNav is a Chrome extension that transforms AI chat conversations into structured, navigable experiences. Designed with accessibility in mind, it helps users - incuding those with visual impairments - navigate long AI conversations effortlessly through intelligent organization and voice-first design.

## 🌟 Key Features

- **Intelligent Timeline Generation**: Automatically creates structured outlines from AI conversations
- **Dual Navigation Views**: Timeline view for chronological flow, Insight view for thematic organization  
- **Screen Reader Optimized**: Full VoiceOver compatibility with ARIA standards and WCAG 2.2 compliance
- **Voice-First Design**: Keyboard shortcuts, audio cues, and TTS support for hands-free navigation
- **Real-Time Updates**: Auto-generates outlines as conversations progress
- **Jump Navigation**: Click any outline item to instantly scroll to the corresponding chat section

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

### Basic Navigation
1. Visit ChatGPT (https://chatgpt.com)
2. Open or start a conversation
3. Click the EchoNav icon in your toolbar
4. Click "Generate Timeline" to create the structured outline
5. Click any timeline item to jump to that conversation section

### Accessibility Features
- **VoiceOver Navigation**: Use `Cmd+F5` to enable VoiceOver on macOS
- **Keyboard Shortcuts**: 
  - Arrow keys: Navigate between sibling items
  - `VO+Shift+Up/Down`: Move between hierarchy levels
  - `Space`: Select and jump to conversation section
- **Voice Mode**: Toggle automatic TTS announcements

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

Access settings through the EchoNav interface:
- **Auto-update**: Automatically refresh outline when new messages appear
- **Show Keypoints**: Toggle keypoint display in conversation view
- **Voice Mode**: Enable/disable automatic TTS announcements

## 📋 Current Supported Platforms

- **ChatGPT**: https://chatgpt.com/*

## ⚠️ Troubleshooting

**Extension not loading:**
- Ensure Chrome is up to date
- Verify developer mode is enabled
- Check browser console for error messages

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
