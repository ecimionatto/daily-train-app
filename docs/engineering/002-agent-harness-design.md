---
layout: default
title: "Building an AI Agent Harness for a 1.5B Model"
---

# Building an AI Agent Harness for a 1.5B Model

*Why we pre-compute everything deterministically and let the small model handle only what it is good at: tool selection and natural language.*

## The Problem with Small Model Agents

When people talk about AI agents, they usually mean systems built on GPT-4 or Claude — models with hundreds of billions of parameters that can reason through multi-step plans, recover from mistakes, and handle ambiguous instructions. These models have enough capacity to be the brain of the operation.

A 1.5-billion-parameter model is not that. Hammer 2.1 1.5B is excellent at two specific things: picking the right tool from a set of five, and extracting structured parameters from natural language. It is not good at multi-step reasoning, maintaining long chains of thought, error recovery, or generating complex plans from first principles. If you ask it to "analyze my training for the last two weeks and suggest adjustments based on my HRV trend," it will either hallucinate data it does not have or produce a vague response that could apply to any athlete.

The mistake would be to try to make the model smarter. The right move is to make the harness smarter and give the model a smaller, well-defined job.

## The Architecture: Deterministic Code + Model Narration

DTrain's agent architecture splits responsibilities cleanly:

**Deterministic code** handles all analysis, validation, data access, scoring, and plan mutations. This includes readiness calculations, trend analysis, workout generation, schedule validation, and training phase logic. These are pure functions that take data in and produce results out, with no randomness and no ambiguity.

**The model** handles two things: selecting which tool to invoke based on the athlete's natural language message, and generating natural language responses that narrate the results of deterministic operations.

This is not a traditional agent loop where the model reasons, acts, observes, and reasons again. It is a single-turn tool call: the athlete says something, the model picks a tool (or doesn't), deterministic code executes, and the model gets a chance to describe what happened. There is no multi-step planning because the model is not capable of reliable multi-step planning at this size.

## Tool-Calling as Structured Output

The core of the harness is `agentOrchestrator.js`. When an athlete message comes in, the orchestrator:

1. Checks for a pending confirmation (yes/no to a previous preview)
2. Builds a slim system prompt with coach identity and athlete context
3. Calls `runToolInference()` with the message and five tool schemas
4. If the model returns a `tool_calls` array, executes the selected tool
5. If no tool was called, returns the text response (general conversation)

The tool schemas are defined in `toolSchemas.js` using the OpenAI-compatible function calling format. Each tool has a name, description, and typed parameters with enums and constraints. The model's job is to produce a JSON object like `{ "name": "adjust_load", "arguments": { "direction": "reduce", "durationDays": 3 } }` — nothing more.

The descriptions are written defensively. Each tool includes explicit "NOT for..." clauses to prevent the model from confusing similar tools. For example, `swap_workout` says "ONLY for today, not for rearranging the weekly schedule" because the model frequently confused it with `set_schedule` before we added that clause.

## The Preview/Confirm Pattern

Destructive actions — anything that changes the athlete's training plan — use a preview/confirm flow:

1. The model selects a tool and extracts parameters
2. The skill executor runs a **preview**: computes what would change without applying it
3. The orchestrator formats a diff table showing the before/after state
4. The athlete sees the preview and responds yes or no
5. On "yes", `commitSkill()` applies the change to AsyncStorage and triggers a React state update

This pattern exists because the model gets it wrong sometimes. A 1.5B model will occasionally extract the wrong parameters (e.g., reducing load for 14 days when the athlete said "take it easy tomorrow"). The preview step lets the athlete catch mistakes before they affect the training plan.

The confirmation classifier is intentionally simple — it looks for "yes", "no", "sure", "nah", and similar tokens. We do not run the model again to classify yes/no because that would add latency for a trivially deterministic task.

## Token Budget Management

Hammer 2.1 has a 4096-token context window. That is not a lot. The system prompt must fit within roughly 2048 tokens to leave room for the athlete's message, conversation history, and the model's response.

The token budget breaks down like this:

- **Coach identity** (~200 tokens): persona rules, role lock, forbidden patterns
- **Constraints** (~150 tokens): response length limits, topic boundaries
- **Training knowledge** (~300 tokens): HR zones, phase rules, 80/20 principle
- **Athlete context** (~150 tokens): race type, phase, days to race, readiness, today's workout, week plan
- **Tool schemas** (passed structurally, not in text): ~400 tokens handled by llama.rn's ChatML formatting

Total: ~800 tokens for the system prompt, plus ~400 for tools, leaving ~2800 for conversation and response.

The athlete context section is built dynamically — `buildCompactAthleteContext()` only includes non-null fields. If the athlete has not set a race date, there is no "Days to race" line. If there is no readiness score yet, that line is omitted. Every token matters at this scale.

For the chat history, we keep only the last six messages (three athlete turns, three coach turns). Older messages are compressed into a `conversationSummary` — a single string of 50 words or fewer that captures the gist of the prior conversation. This summary is regenerated every six turns by a lightweight prompt that asks the model to compress the exchange.

## Structured Prompt Templates

Open-ended prompts are the enemy of small models. "Help the athlete with their training" produces wildly inconsistent output. Structured templates that constrain the model's job produce reliable results.

Every skill executor builds a focused prompt for its specific task. The adjust_load skill, for example, does not ask the model to "figure out how to adjust the athlete's training." Instead, the deterministic code computes the load adjustment based on the athlete's current phase, readiness score, and recent compliance. The model's only job is to narrate that adjustment in natural language: "Reducing your training load by 20% for the next 3 days to help you recover."

The general pattern is:

```
[Deterministic code computes the answer]
       ↓
[Structured prompt: "Explain this result to the athlete: {data}"]
       ↓
[Model generates 1-3 sentences of natural language]
```

This keeps the model in its comfort zone — short, constrained text generation — while the hard decisions are made by code that is testable, debuggable, and deterministic.

## The Fallback Chain

Not every message maps to a tool call. When the athlete asks "how's the weather?" the model should not call any tool — it should respond conversationally (or decline, since DTrain is a training-only coach).

The fallback chain handles the full spectrum:

1. **Agent orchestrator**: model picks a tool → skill executes → preview/confirm
2. **Text response**: model produces natural language without a tool call → sanitize → return
3. **Null response**: model output is garbage (fails sanitization) → fall back to keyword handlers
4. **Rule-based fallback**: keyword handlers catch common patterns ("readiness", "swap", "tired") → deterministic response

The chain degrades gracefully. If the model is not loaded yet (still downloading the 940MB file), the entire agent path is skipped and keyword handlers take over. If the model is loaded but produces garbage, the sanitizer catches it and the keyword handler responds. The athlete always gets a response.

We are progressively eliminating the keyword handlers as the agent improves. The goal is an AI-only path where the model handles 100% of messages, with the sanitizer as the safety net. But the keyword handlers remain as the last line of defense because we ship to real athletes who need their training plan to work reliably every day.

## What We Learned

The biggest lesson is that a small model agent is mostly not about the model. The model is maybe 20% of the system — it handles tool selection and text generation. The other 80% is deterministic code: data analysis, validation, scoring, state management, prompt construction, output sanitization, and fallback handling.

If you are building an on-device agent with a small model, resist the urge to make the model do more. Make the code do more. Compute everything you can deterministically, constrain the model's job to the narrowest possible scope, and build a robust sanitization and fallback layer for when it gets things wrong. The result is an agent that feels intelligent to the user while being reliable enough to ship.
