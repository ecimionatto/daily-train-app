---
layout: default
title: "From Qwen 2.5 to Hammer 2.1: Choosing an On-Device Tool-Calling Model"
---

# From Qwen 2.5 to Hammer 2.1: Choosing an On-Device Tool-Calling Model

*How we picked the right small language model for on-device function calling in a triathlon coaching app.*

## The Starting Point: Qwen 2.5 1.5B

DTrain started with Qwen 2.5 1.5B as its on-device brain. The model was good at what we initially needed: generating natural language coaching responses, interpreting athlete questions about training, and producing workout descriptions that sounded like a real coach wrote them. For a 1.5-billion-parameter model running on an iPhone, the quality of conversational output was genuinely impressive.

But conversation alone was not enough. We needed the AI coach to *do things* — swap today's workout for a bike ride because the athlete's knee hurts, adjust training load for the next week because HRV is trending down, reschedule swim days from Monday/Wednesday/Friday to Tuesday/Thursday/Saturday. These are not text generation tasks. They are structured operations on the athlete's training plan, and they require the model to select the right function and extract the right parameters from natural language.

Qwen 2.5 at the 1.5B size does not support native tool calling. You can prompt-engineer it to output JSON, but the results are unreliable. The model confuses parameter names, invents fields that do not exist in the schema, and frequently wraps its output in markdown code fences or ChatML tokens that break JSON parsing. We tried few-shot prompting, system prompt constraints, and regex-based extraction. None of it was reliable enough for a production app where a misinterpreted tool call could wreck someone's race preparation.

## What We Needed

The requirements were specific:

1. **Native tool-calling support** — the model must understand function schemas passed as structured input and respond with a `tool_calls` array, not freeform JSON embedded in prose.
2. **1.5B parameter ceiling** — the model must run on consumer iPhones (iPhone 12 and up) with acceptable latency. Anything above 2B parameters makes inference too slow and memory too tight.
3. **ChatML template compatibility** — our inference runtime is llama.rn (React Native bindings for llama.cpp), which supports ChatML-formatted models natively.
4. **Quantized to Q4_K_M or smaller** — the model file must fit comfortably in app storage. Ideally under 1GB.

## Evaluating Options

We looked at three candidates:

**Qwen 2.5 1.5B (base)** — Already in use. Good text, no tool calling. Q4_K_M quantization at ~1.3GB. We would have to build our own tool-calling layer on top of prompt engineering, which we had already tried and found brittle.

**Phi-3 Mini 3.8B** — Microsoft's small model with good benchmarks. But 3.8B parameters is too large for our latency budget on older iPhones, and the GGUF quantizations we tested were 2.2GB+. The model also uses a different chat template that would require changes to our inference pipeline.

**Hammer 2.1 1.5B (MadeAgents)** — A model specifically fine-tuned for function calling, built on top of Qwen 2.5 Coder 1.5B. MadeAgents trained it using "function masking" — a technique where the model learns to select from a provided set of functions and extract typed parameters. It uses the same ChatML template as Qwen 2.5, so it drops into our existing llama.rn pipeline with zero changes to the inference code.

## Why Hammer Won

Hammer 2.1 1.5B checked every box:

- **Size**: 940MB at Q4_K_M quantization, down from Qwen 2.5's 1.3GB. Smaller model, more capable at the specific task we need.
- **Native tool calling**: When you pass `tools` in the completion parameters, llama.rn formats them into the ChatML template that Hammer expects, and the model responds with structured `tool_calls` in the result object. No regex parsing. No JSON extraction hacks.
- **Parameter extraction**: Given a message like "move my swims to Tuesday Thursday Saturday," Hammer reliably outputs `{ "name": "set_schedule", "arguments": { "swimDays": "tts" } }`. It understands enum constraints and maps natural language to the correct enum values.
- **ChatML compatibility**: Same template as Qwen 2.5, same stop words (`<|im_end|>`, `<|endoftext|>`), same llama.rn configuration. The migration was a model file swap.

The key architectural advantage is that tool calling is not prompt-engineered — it is a trained behavior. The model was fine-tuned on thousands of function-calling examples, so it understands the *structure* of tool selection in a way that a general-purpose model prompted to output JSON does not.

## The Challenges

Hammer 2.1 is not perfect. Three problems surfaced immediately in testing:

**ChatML token leakage.** The model sometimes emits raw ChatML tokens in its text output — `<|im_start|>assistant`, `<|im_end|>`, and occasionally `<|endoftext|>`. These are control tokens that should be consumed by the inference engine, not displayed to the user. This happens most often when the model is uncertain about whether to call a tool or respond with text.

**Code and JSON in text responses.** When the model decides not to call a tool but the message is tool-adjacent (e.g., "what's my schedule look like?"), it sometimes outputs raw JSON objects or JavaScript-like code instead of natural language. The athlete sees `{"name": "set_schedule", "arguments": {}}` instead of a coaching response.

**Tool confusion between similar schemas.** With five tools defined (`set_schedule`, `swap_workout`, `adjust_load`, `update_plan`, `analyze_trends`), the model occasionally picks the wrong one. The most common confusion is between `set_schedule` (rearrange the weekly plan) and `swap_workout` (replace today's single session). The tool descriptions must be carefully written to distinguish them — we found that adding explicit "NOT for..." clauses in descriptions reduced misclassification significantly.

## The Sanitization Layer

We solved the output quality problems by building `modelSanitizer.js` — a post-processing layer that sits between every model output and the user interface. It strips ChatML tokens with regex, removes code blocks, rejects responses that start with `{` or `[`, and checks that the remaining text contains at least three real English words. If the output fails any check, the sanitizer returns `null`, which signals the caller to fall back to a different response strategy.

This is the key lesson from shipping a small on-device model: **the sanitization layer is not optional**. It is as important as the model itself. A 1.5B model will produce garbage output some percentage of the time, and your application must handle that gracefully. The sanitizer is the contract between the model's probabilistic output and the deterministic expectations of your UI.

## Results

After switching to Hammer 2.1 with the sanitization layer:

- Tool selection accuracy went from ~60% (prompt-engineered Qwen) to ~90% (Hammer native)
- Model file size dropped from 1.3GB to 940MB
- Inference latency stayed the same (the models share the same base architecture)
- User-visible garbage output dropped to near zero (sanitizer catches the rest)

The model is not as good at open-ended conversation as base Qwen 2.5 — it was fine-tuned for function calling, not chat. But that tradeoff is acceptable because DTrain's coach is primarily a tool-calling agent that occasionally generates text, not a chatbot that occasionally calls tools. The architecture plays to the model's strength.

If you are building an on-device agent and need reliable function calling at the 1.5B scale, Hammer 2.1 is the best option we have found. Just make sure you budget engineering time for the sanitization layer. The model will surprise you with what it produces, and your users should never see it.
