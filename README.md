# dsh-web-whale-maid (DeepSeek Harness Desktop Pet · Anime Maid Whale)

[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

**English** | [简体中文](README.zh.md)

An interactive, anime maid whale desktop pet plugin customized for the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Web UI.

Features LLM thinking and mood linkage, 30,000 Token satiety pool, persistent speech bubbles, mobile-responsive cupboard modal, 5-hour task awareness ledger, and dual-layer persistence.

---

## ✨ Features

- **8 Mood Frame Animations**:
  - `idle`, `hungry`, `happy`, `angry`, `eating`, `scared`, `sad`, and `thinking`.
  - Built from a 1024x2048 HD sprite sheet processed with chroma keying and custom despill algorithms for clean, crisp edges on Retina screens.
- **Strict Mood & LLM Linkage**:
  - The pet's mood and animation only change when an LLM invocation occurs; otherwise, it remains in its current state.
  - **Thinking Animation**: Whenever an LLM call starts (upon feeding or work session completion), the pet immediately transitions into the `thinking` animation. When the LLM outputs its response, the pet switches to the result mood and renders its speech bubble.
- **Dual-Zone Touch & Persistent Speech Bubble**:
  - **Permanent Bubble**: Speech bubbles and moods remain permanently on screen until the next LLM response arrives.
  - **Clicking Pet Body**: Opens the antique wooden maid cupboard modal.
  - **Clicking Speech Bubble**: Immediately dismisses the speech bubble and resets the pet back to standard standby (`idle`) mode.
- **Satiety Reserve Pool (Tokens as Food)**:
  - 30,000 Token maximum capacity.
  - Four tiers of rice food items on the shelf:
    - `Grain of Rice` (+1 Token)
    - `Spoon of Rice` (+1,000 Tokens)
    - `Bowl of Rice` (+3,000 Tokens)
    - `Pot of Rice` (+10,000 Tokens)
  - 5 perception tiers: `Starving!` (<2,000), `Very Hungry!` (2,000-5,000), `Not hungry, but wouldn't mind a snack!` (5,000-10,000), `Satiated & Content` (10,000-20,000), and `Stuffed!` (>20,000).
- **Body & Bubble Size Scaling Slider**:
  - Continuous size scale slider located inside the cupboard drawer (50% to 180% range, 5% step).
  - Scales both the whale maid pet and its speech bubble simultaneously in perfect proportion.
  - Features real-time percentage display and a quick "Reset" button to 100%, with preferences persisted to disk and localStorage.
- **Universal DSH Model Auto-Discovery**:
  - Automatically parses and synchronizes all providers and models configured in `~/.dsh/settings.yaml` (including custom OpenAI-compatible proxies, Ollama, Claude, etc.) alongside DeepSeek official models.
  - Automatically identifies the active `agent-default-model` as the initial preference, and refreshes models dynamically whenever the cupboard modal opens. Zero machine-specific hardcoding.
- **Mobile-Responsive Antique Cupboard Modal**:
  - Automatically scales down proportionally based on viewport size (`min(92vw/640, 88vh/580)`) and centers smoothly on narrow mobile screens, eliminating clipping.
  - **Instant Close on Feed**: Tapping any rice item automatically closes the cupboard modal, allowing the user to watch the pet's thinking animation and response on the main screen right away.
  - Smooth mobile momentum scrolling on the speech ledger.
- **Speech Ledger & Dual-Layer Persistence**:
  - Records up to 20 past LLM dialogue entries including moods, timestamps, food/session titles, and tokens used.
  - Stored concurrently to disk (`pet_durable_memory.json`) and browser `localStorage`.
- **Context Awareness & Strict Prompt Constraints**:
  - Aggregates tasks completed in DSH within the past 5 hours to generate tailored commentary and avoid repetitive responses.
  - **Zero Emojis**: Strictly forbids all emojis across all prompts, UI elements, and dialogues. Single-line JSON format bounded within 25 Chinese characters.

---

## 📦 Installation

### Method 1: Ask your DSH Agent (Easiest 🤖)

Send this repository URL directly to your DSH web agent in chat:
> "Install this plugin for me: https://github.com/AcidGr/dsh-web-whale-maid"

Your DSH coding agent will automatically configure and mount the plugin.

### Method 2: DSH CLI Install (Recommended)

Run the following command in your terminal:

```sh
dsh plugin --profile web add dsh-web-whale-maid
```

(Or install directly from GitHub):

```sh
dsh plugin --profile web add github:AcidGr/dsh-web-whale-maid
```

After installation, refresh your browser.

### Method 3: Manual / Offline Install

```sh
PROFILE="${DSH_HOME:-$HOME/.dsh}/profiles/web"
mkdir -p "$PROFILE/plugins" "$PROFILE/node_modules/@dsh-profile"
cp -r dsh-web-whale-maid "$PROFILE/plugins/whale-maid"
ln -sfn ../../plugins/whale-maid "$PROFILE/node_modules/@dsh-profile/whale-maid"

# Append to $PROFILE/cordis.patch.yml:
# - insert:
#     - id: whale-maid
#       name: '@dsh-profile/whale-maid'
```

---

## 🎮 Controls & Interactions

1. **Drag & Move**: Click and drag (or touch and drag on mobile) to position the pet anywhere on the screen. The position persists across reloads.
2. **Open Cupboard**: Click or tap the whale maid's body to open the Maid Cupboard.
   - Top shelf: View real-time satiety tokens and percentage.
   - Middle shelf: Click food items to feed. The cupboard modal closes automatically.
   - Bottom shelf: Configure the active feeding model and browse/clear the speech ledger.
3. **Task Accompaniment**: Whenever a coding session completes, the pet observes the task and comments with appropriate moods and token deductions.
4. **Dismiss Bubble**: Click the speech bubble to close it and immediately return the pet to `idle` standby.

---

## 📂 Project Structure

```
dsh-web-whale-maid/
├── assets/
│   ├── pet_assets.json      # Base64 assets package (sprites & cupboard background)
│   ├── pet_sprite.png       # 8-mood HD sprite sheet (1024x2048)
│   ├── cupboard_bg.png      # Antique cupboard background (640x580)
│   └── rice_*.png           # Rice food icon assets
├── cordis.patch.yml         # DSH Cordis bundle mount specification
├── lib/
│   ├── index.js             # Host half: LLM orchestration, mutex queue, disk storage
│   └── client.js            # Client half: animations, responsive layout, touch events
├── package.json             # npm package metadata and DSH profile configuration
├── LICENSE                  # MIT License
├── README.md                # English documentation
└── README.zh.md             # Simplified Chinese documentation
```

---

## 📄 License

This project is open-sourced under the [MIT License](LICENSE).
