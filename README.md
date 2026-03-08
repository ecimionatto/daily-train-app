# DailyTrain

AI-powered Ironman triathlon training app for iPhone. Generates personalized daily workouts using on-device AI based on your Apple Health data, training phase, and readiness score.

## Features

- **Smart Daily Workouts** — AI generates periodized swim/bike/run sessions based on your readiness, training phase, and race countdown
- **Apple Health Integration** — Reads resting HR, HRV, sleep, and VO2Max to calculate a daily readiness score (0-100)
- **AI Coach Chat** — Ask your on-device coach about training, recovery, nutrition, and race strategy
- **Recovery Dashboard** — 14-day sparkline trends for HRV, resting HR, and sleep
- **Weekly Summary** — Training grid with discipline breakdown and AI weekly debrief
- **Periodized Training** — Auto-calculated phases: Base → Build → Peak → Taper → Race Week
- **SSO Authentication** — Google and Apple Sign-In

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.73 + Expo 50 |
| Navigation | React Navigation (stack + bottom tabs) |
| AI (on-device) | Qwen 3.5 0.6B via llama.cpp native bridge |
| AI (cloud) | Claude API (optional) |
| Health | Apple HealthKit via react-native-health |
| Auth | expo-auth-session (Google), expo-apple-authentication |
| Storage | AsyncStorage (on-device, no backend) |
| Testing | Jest + React Native Testing Library |

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev/) (runtime version manager)
- Xcode (for iOS simulator or device builds)
- [Expo Go](https://expo.dev/go) on your iPhone (for quick testing)

### Setup

```bash
# Clone the repo
git clone https://github.com/ecimionatto/daily-train-app.git
cd daily-train-app

# Install Node 20 via mise
mise trust && mise install

# Install dependencies
npm install

# Start the Expo dev server
npm start
```

Scan the QR code with Expo Go on your iPhone, or press `i` to open in iOS Simulator.

### Apple Health (Real Device Only)

HealthKit requires a physical iPhone + Apple Developer account ($99/year):

```bash
npx expo prebuild --platform ios
cd ios && pod install && cd ..
open ios/DailyTrain.xcworkspace
# Sign with your team → Build to device
```

On simulator, the app automatically falls back to realistic mock health data.

### Environment Variables

Create a `.env` file (optional, for cloud AI features):

```
ANTHROPIC_API_KEY=your_key_here
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_IOS_CLIENT_ID=your_ios_client_id
```

## Project Structure

```
├── App.js                    # Root: AuthProvider → AppProvider → ChatProvider → Navigation
├── screens/
│   ├── LoginScreen.js        # Google/Apple SSO
│   ├── OnboardingScreen.js   # Race date + 7 profile questions
│   ├── DashboardScreen.js    # Countdown, readiness score, workout preview
│   ├── WorkoutScreen.js      # Full session with set-by-set completion tracking
│   ├── RecoveryScreen.js     # HRV/RHR/sleep 14-day trends
│   ├── WeeklyScreen.js       # Training grid + AI weekly debrief
│   └── ChatScreen.js         # AI coach chat interface
├── context/
│   ├── AuthContext.js        # User authentication state
│   ├── AppContext.js         # Athlete profile, health data, workouts
│   └── ChatContext.js        # Chat messages, send/respond flow
├── services/
│   ├── auth.js               # Google/Apple SSO implementation
│   ├── healthKit.js          # HealthKit queries + readiness algorithm
│   ├── localModel.js         # On-device Qwen 3.5 + rule-based fallback
│   ├── claudeAI.js           # Claude API integration (optional)
│   └── chatService.js        # Chat classification + coaching responses
├── components/
│   └── TabBar.js             # Custom bottom tab bar
└── __tests__/
    ├── healthKit.test.js     # Readiness score algorithm tests
    └── chatService.test.js   # Chat classification + response tests
```

## Architecture Decisions

**On-device AI first** — Workouts and coaching run locally via Qwen 3.5 (0.6B quantized). No internet required. Claude API is an optional upgrade path.

**Rule-based fallback** — Every AI feature has a deterministic fallback that works without any model loaded. The app is fully functional offline.

**Readiness-driven training** — The readiness score (0-100) from HRV + resting HR + sleep drives workout intensity:
- < 55: Recovery day
- 55-75: Moderate effort (Zone 2 with light Zone 3)
- \> 75: Quality session (Zone 3-4 intervals)

**Privacy-first** — All health data stays on device. AsyncStorage for persistence, no backend, no telemetry.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run ios` | Open in iOS simulator |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |

With mise: `mise run start`, `mise run lint`, `mise run test`, etc.

## Contributing

### Development Setup

1. Fork and clone the repo
2. Run `mise trust && mise install` to get Node 20
3. Run `npm install` to install dependencies
4. Create a branch: `git checkout -b feature/your-feature`

### Code Style

- **ESLint** with React, React Native, and React Hooks plugins
- **Prettier** with single quotes, semicolons, 2-space indent, 100-char line width
- **Pre-commit hook** runs ESLint (`--max-warnings=0`) + Prettier on staged files automatically
- **Secret detection** blocks commits containing hardcoded API keys or tokens

### Conventions

- Use **functional components** with hooks (no class components)
- Use **React Context** for state management (AuthContext, AppContext, ChatContext)
- Follow the existing **file naming**: `PascalCase` for screens/components, `camelCase` for services
- Keep services as **pure functions** where possible (see `calculateReadiness`, `classifyMessage`)
- Every AI feature must have a **rule-based fallback** that works without a model
- **AsyncStorage keys**: `authUser`, `athleteProfile`, `todayWorkout`, `workoutHistory`, `chatConversation`

### Design System

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0a0a0f` | All screens |
| Card | `#1a1a2e` | Cards, input fields, coach bubbles |
| Accent | `#e8ff47` | CTAs, active tabs, countdown, athlete bubbles |
| Mint | `#47ffb2` | Good readiness, positive trends |
| Blue | `#47b2ff` | Discipline labels, swim color |
| Red | `#ff6b6b` | Alerts, RHR trend, strength |
| Text primary | `#ffffff` | Headings, body text |
| Text secondary | `#888888` | Labels, hints, timestamps |
| Font weight | 600-900 | Headings use 800-900, body uses 600 |

### Testing

- Write tests for pure functions in `__tests__/`
- Use `jest-expo` preset with the existing `transformIgnorePatterns`
- Run `npm test` before submitting a PR

### Pull Request Process

1. Ensure `npm run lint` passes with 0 errors and 0 warnings
2. Ensure `npm run format:check` passes
3. Ensure `npm test` passes
4. The pre-commit hook enforces all of the above automatically
5. Write a clear PR description explaining what changed and why

### Multi-Account GitHub (Devcontainer)

The devcontainer supports switching between GitHub accounts:

```jsonc
// .devcontainer/devcontainer.json
"containerEnv": {
  "GITHUB_ACCOUNT": "personal"  // or "company"
}
```

Account configs are in `.devcontainer/github-accounts.json`. The `setup-git.sh` script auto-configures git identity, remote URLs, and credentials based on the selected account.

## License

MIT
