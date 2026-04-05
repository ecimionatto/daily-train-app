---
layout: default
title: "Running an AI Agent Entirely On-Device with React Native"
---

# Running an AI Agent Entirely On-Device with React Native

*The technical details of running a 1.5B-parameter language model on an iPhone with React Native, llama.rn, and zero cloud dependencies.*

## The Stack

DTrain is a React Native app built with Expo 50. The on-device AI runs through llama.rn 0.11.4, which provides React Native bindings for llama.cpp — the C++ inference engine that has become the standard for running quantized language models on consumer hardware. The model is Hammer 2.1 1.5B, quantized to Q4_K_M format as a single GGUF file weighing approximately 940MB.

The entire AI pipeline runs on the device. There are no API calls, no cloud inference endpoints, no telemetry pings. The model file lives in the app's document directory. Athlete data lives in AsyncStorage. Apple Health data is read through HealthKit. Nothing leaves the phone.

## Model Lifecycle

The model goes through four stages on each app launch:

**Download.** On first launch, the app downloads the GGUF file from HuggingFace (~940MB). This uses `react-native-fs` with background download support and progress reporting. The download is resumable — if the user closes the app mid-download, it picks up where it left off. A progress callback updates the UI with percentage complete. If the download fails or produces a corrupt file, the app deletes the partial file and retries on next launch.

**Cache.** Once downloaded, the model file persists in the app's document directory (`RNFS.DocumentDirectoryPath`). It survives app updates and restarts. The app checks for the file on every launch with a size validation — if the file exists but has zero bytes (corrupt download), it re-downloads.

**Initialize.** `initLlama()` loads the model into memory with these parameters:

```
n_ctx: 4096      // context window (tokens)
n_gpu_layers: 99  // offload all layers to GPU (Metal on iOS)
n_threads: 4      // CPU threads for non-GPU operations
use_mlock: true   // pin model memory to prevent paging
```

The `n_gpu_layers: 99` setting tells llama.cpp to offload as many layers as possible to the Apple Neural Engine / GPU via Metal. On modern iPhones (A14 and later), this keeps inference fast. The `use_mlock: true` prevents the OS from paging the model out of memory, which would cause massive latency spikes during inference.

**Ready.** Once `initLlama` resolves, the model is ready for inference. The `isModelReady()` function returns true, and the chat interface enables AI responses. If initialization fails (out of memory, corrupt file), the app falls back to rule-based responses — the athlete always gets a functional coach, just without the AI personality.

## Three Inference Modes

DTrain uses the llama.rn completion API in three distinct configurations:

### 1. Text Inference (`runInference`)

Standard conversational generation. The model receives a system prompt and user message, and produces natural language output.

```
Temperature: 0.7 (moderate creativity)
Top-p: 0.9
Top-k: 40
Max tokens: 512
Stop words: <|im_end|>, <|endoftext|>, <|end|>
```

This mode powers general coaching conversation — when the athlete asks a question that does not map to a tool call (training advice, motivation, explanation of a workout).

### 2. Tool-Calling Inference (`runToolInference`)

The model receives tool schemas alongside the system prompt and decides whether to call a function or respond with text.

```
Temperature: 0.1 (near-deterministic)
Top-p: 0.9
Top-k: 40
Max tokens: 256
Tools: COACH_TOOLS array (5 function schemas)
Jinja: true (ChatML template rendering)
```

The low temperature (0.1 vs 0.7 for text) is critical. Tool selection needs to be deterministic — the same input should produce the same tool call every time. Creative sampling in tool selection causes the model to pick different tools for the same message on different runs, which is unacceptable when those tools modify the athlete's training plan.

The `jinja: true` flag tells llama.rn to use Hammer 2.1's ChatML template for formatting tool schemas into the prompt, rather than doing it manually.

### 3. Structured Extraction (`runStructuredExtraction`)

Minimal-output inference for parsing structured data from natural language. Used by skill executors when they need to extract specific values that the tool-calling parameters did not capture.

```
Temperature: 0.1 (deterministic)
Max tokens: 128
```

This mode is the most constrained — short output, low temperature, specific extraction task. It exists because sometimes the model's tool call parameters are incomplete and the skill needs to ask a follow-up extraction from the original message.

## Performance on iPhone

Real-world performance numbers on an iPhone 13:

- **Model load time**: 2-3 seconds (from cached GGUF file to ready state)
- **Text inference**: 1-2 seconds for a typical coaching response
- **Tool-calling inference**: 0.5-1.5 seconds (shorter output, lower temperature)
- **Memory footprint**: ~1.2GB during inference (model weights + KV cache)
- **First-launch download**: 3-8 minutes on WiFi (940MB)

The memory footprint is the tightest constraint. On an iPhone 12 with 4GB RAM, the model plus the React Native runtime plus HealthKit queries can push close to the memory limit. The `use_mlock` flag helps prevent the model from being paged out, but if the system is under memory pressure, iOS can still terminate the app. We have not seen this in practice on iPhone 13 and later (6GB RAM), but it is a real concern on older devices.

## Apple Health Integration

DTrain reads completed workouts from Apple HealthKit to compare prescribed training against actual performance. The `fetchCompletedWorkouts()` function in `healthKit.js` queries HealthKit for swim, bike, and run workouts over a configurable time window (default: 30 days).

Each completed workout includes:

- **Discipline**: swim, bike, or run (mapped from HealthKit workout types)
- **Duration**: total active time in minutes
- **Distance**: meters covered
- **Heart rate data**: average and max HR from associated heart rate samples
- **Date**: when the workout was performed

This data feeds into the agent's context. When the athlete asks "how am I doing this week?", the `analyze_trends` tool pulls completed workouts, compares them against the prescribed weekly targets, computes compliance percentages per discipline, and generates a trend report. The model then narrates those computed findings in natural language.

On the iOS Simulator (where HealthKit is unavailable), the service returns mock data so development and testing can proceed without a physical device.

## The Privacy Architecture

Privacy is not a feature of DTrain — it is the architecture. There is no networking layer to accidentally leak data through. There is no analytics SDK to misconfigure. There is no server to be breached.

- **AsyncStorage**: All athlete data (profile, workout history, chat conversations) persists in AsyncStorage, which stores data in the app's sandboxed file system. It never leaves the device.
- **HealthKit**: Read-only access. DTrain reads workout data from Apple Health but never writes back (except for future workout logging). HealthKit data stays in the HealthKit database — DTrain reads it, uses it for analysis, and never copies it to external storage.
- **Model inference**: All inference runs in-process via llama.cpp. The model file is a static artifact — it does not phone home, check licenses, or send telemetry.
- **No backup service**: `backupService.js` exists as a stub interface for a future Phase 2 cloud backup feature. Every function currently returns `{ success: false }`. The stub is gated behind `isBackupEnabled()`, which always returns `false`.

The result is an app where a network packet capture shows zero outbound traffic after the initial model download. That is a property you can verify, not a promise you have to trust.

## CI Testing with node-llama-cpp

Testing an on-device model in CI is a challenge — there is no iPhone in the CI runner. We solve this with node-llama-cpp, which provides the same llama.cpp inference engine in a Node.js runtime. The same GGUF model file runs identically in both environments.

Our CI quality gates use node-llama-cpp to run the model against a set of test prompts and verify:

- Tool selection accuracy: given "swap today's run for a bike ride", does the model call `swap_workout` with `targetDiscipline: "bike"`?
- Sanitization coverage: does `modelSanitizer.js` catch all known garbage output patterns?
- Response quality: do coaching responses pass minimum word count and natural language checks?

This gives us confidence that model behavior in CI matches model behavior on the device, because it is literally the same inference engine running the same model weights.

## The Sanitization Problem

Small models leak. Hammer 2.1 is fine-tuned for tool calling, not for pristine natural language output. When it generates text (as opposed to tool calls), it regularly produces artifacts:

- **ChatML tokens**: `<|im_start|>assistant`, `<|im_end|>` appearing in the middle of responses
- **Raw JSON**: tool call payloads embedded in text instead of in the structured `tool_calls` field
- **Code fragments**: JavaScript-like output (`const schedule = {...}`) when the prompt touches technical topics
- **Schema echoes**: the model repeats parts of the tool schema definitions back as its response

`modelSanitizer.js` is the boundary between the model's probabilistic output and the user interface. It runs on every text response — from the agent orchestrator, from the chat service, from workout descriptions. It strips known artifacts, rejects non-natural-language output, and returns `null` when the output is unsalvageable.

The sanitizer is tested extensively. Every garbage pattern we have observed in production gets added as a test case. It is the single most important reliability component in the AI pipeline — more important than the model selection, more important than the prompt engineering. A good sanitizer makes an unreliable model usable. A missing sanitizer makes even a good model embarrassing.

Running a language model entirely on a phone is possible today. The tooling (llama.cpp, llama.rn, GGUF quantization) is mature enough for production use. The hard part is not the inference — it is everything around it: lifecycle management, memory pressure, output quality, and graceful degradation. Build those systems well, and the model becomes the easy part.
