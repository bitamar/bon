# TWA-05: LLM Integration Core

## Status: ⬜ Not started

## Summary

Claude API client, tool loop engine, system prompt builder, and tool registry. Replaces the stub handler from TWA-03 with real LLM processing. No business tools yet — those come in TWA-06. This ticket delivers the generic engine that executes any registered tool.

## Why

This is the core of the WhatsApp experience. The tool loop is the most complex piece — it must handle multi-turn tool calling, context reconstruction, rate limits, and failures. Getting it right and tested independently of specific tools is essential.

## Scope

### Dependencies (npm)

1. **`@anthropic-ai/sdk`** — Anthropic SDK. Install in `api/` workspace.

### Environment Variables

2. **`api/src/env.ts`** — Add:
   - `ANTHROPIC_API_KEY` — required (no mock mode — the SDK is mocked in tests)
   - `LLM_MODEL` — default `'claude-sonnet-4-6'`
   - `LLM_MAX_TOKENS` — default `1024` (WhatsApp messages should be concise)

### Claude API Client

3. **`api/src/services/llm/claude-client.ts`**:
   - Thin wrapper around `Anthropic.messages.create()`
   - Accepts: system prompt, messages array, tool definitions, max_tokens
   - Returns the raw `Message` response (the tool loop handles interpretation)
   - Handles `APIError` from SDK: re-throws with structured logging
   - No retry logic here — retries are at the pg-boss level

### Tool Registry

4. **`api/src/services/whatsapp/tool-registry.ts`**:
   ```typescript
   interface ToolDefinition {
     name: string;
     description: string;       // Hebrew
     input_schema: object;      // JSON Schema
   }

   interface ToolHandler {
     (input: unknown, context: ToolContext): Promise<string>;
   }

   interface ToolContext {
     userId: string;
     businessId: string;    // from conversation.activeBusinessId
     userRole: BusinessRole; // from user_businesses — for permission checks
     conversationId: string;
     logger: FastifyBaseLogger;
     boss?: PgBoss;  // Needed by tools that enqueue jobs (e.g., finalize_invoice → SHAAM allocation)
   }

   class ToolRegistry {
     register(name: string, definition: ToolDefinition, handler: ToolHandler): void;
     getDefinitions(): ToolDefinition[];
     execute(name: string, input: unknown, context: ToolContext): Promise<string>;
   }
   ```
   - `execute()` validates that the tool exists, catches handler errors, and returns error strings (never throws — Claude must see the error)
   - Registered as `app.toolRegistry` via Fastify plugin decorator

### System Prompt Builder

5. **`api/src/services/whatsapp/system-prompt.ts`**:
   - `buildSystemPrompt(params: { userName: string; businessName: string; userRole: string; date: string }): string`
   - Returns the Hebrew system prompt from TWA-00 with all fields interpolated
   - When `businessName` is null (no active business selected), omit business line and add: `"עדיין לא נבחר עסק. השתמש בכלי select_business כדי לבחור."`
   - Pure function, no side effects

### Tool Loop

6. **`api/src/services/whatsapp/tool-loop.ts`** — The core engine:

   ```typescript
   async function runToolLoop(params: {
     claudeClient: ClaudeClient;
     toolRegistry: ToolRegistry;
     systemPrompt: string;
     messages: ClaudeMessage[];
     context: ToolContext;
     storeMessage: (role: string, toolName: string | null, toolCallId: string | null, body: string) => Promise<void>;
   }): Promise<string>
   ```

   Algorithm:
   1. Call Claude with system prompt + messages + tool definitions
   2. If response contains only text → store assistant message, return the text
   3. If response contains `tool_use` blocks:
      a. Store a `tool_call` message for each block (body = JSON.stringify(input))
      b. Execute each tool via `toolRegistry.execute()`
      c. Store a `tool_result` message for each result
      d. Append tool_call and tool_result to messages array
      e. Go to step 1
   4. If loop exceeds 10 iterations → store and return a Hebrew error message: "מצטער, לא הצלחתי לעבד את הבקשה. נסו שוב בפשטות."

   The `storeMessage` callback persists each turn to `whatsapp_messages` as it happens. This means if the job crashes mid-loop, the conversation history is preserved up to the crash point — the retry picks up from where it left off.

### Updated Process Handler

7. **`api/src/jobs/handlers/process-whatsapp-message.ts`** — Replace TWA-03 stub:
   - Load conversation from DB (get `userId`, `activeBusinessId`)
   - Load user from `findUserById(userId)` (for user name)
   - **Business resolution**:
     - If `activeBusinessId` is set → load business name, look up user's role via `user_businesses`
     - If `activeBusinessId` is null → load user's businesses from `user_businesses`:
       - If exactly 1 → auto-set `activeBusinessId` on conversation, proceed
       - If 0 → reply with "אין עסקים מחוברים לחשבון שלך. צרו עסק באפליקציה." (no LLM call)
       - If > 1 → system prompt tells LLM to ask user to pick (via `select_business` tool, defined in TWA-06)
   - Load recent messages via `findRecentMessages(conversationId, 40)`
   - Build Claude message array via `buildClaudeMessages()`
   - Trim to token budget via `trimToTokenBudget(messages, 100_000)`
   - Build system prompt via `buildSystemPrompt({ userName, businessName, userRole, isoDate })`
   - Build `ToolContext` with `userId`, `businessId`, `userRole`, `conversationId`, `boss`
   - Run tool loop
   - Update `lastActivityAt` on conversation
   - Enqueue `send-whatsapp-reply` with the final text response

   **Error handling**:
   - Anthropic `APIError` with status 429 → re-throw (pg-boss retries with backoff)
   - Anthropic `APIError` with status 500/529 → re-throw (transient, retry)
   - Anthropic `APIError` with status 400/401 → log error, send Hebrew apology, do NOT retry (configuration error)
   - Any other error → log, send Hebrew apology, re-throw for retry

### Tests

8. **`api/tests/services/whatsapp/tool-loop.test.ts`**:
   - Text-only response → returns text, stores assistant message
   - Single tool call → executes tool, continues, returns final text
   - Multi-tool call (2 tools in one response) → executes both, continues
   - Multi-turn (tool → text → tool → text) → full loop
   - Tool execution error → Claude receives error string, responds gracefully
   - Max iterations exceeded → returns error message
   - All tests mock `ClaudeClient` (no real API calls)

9. **`api/tests/services/whatsapp/system-prompt.test.ts`**:
   - Interpolates user name, business name, role, and date
   - Null business name → prompt includes "עדיין לא נבחר עסק"
   - Output is valid string (no template variables remaining)

10. **`api/tests/services/whatsapp/tool-registry.test.ts`**:
    - Register and execute a tool
    - Execute unknown tool → returns error string
    - Handler throws → returns error string (does not propagate)

11. **`api/tests/jobs/handlers/process-whatsapp-message.test.ts`**:
    - Happy path: user with 1 business → auto-select → LLM called → reply enqueued
    - User with 0 businesses → error reply, no LLM call
    - User with 2+ businesses and no `activeBusinessId` → LLM called with select_business prompt
    - LLM 429 → throws (for pg-boss retry)
    - LLM 400 → sends apology, does not throw

## Acceptance Criteria

- [ ] Tool loop handles multi-turn tool calling (call → result → call → result → text)
- [ ] Each turn persisted to DB as it happens (crash-safe)
- [ ] Max 10 iterations prevents infinite loops
- [ ] Tool errors returned as strings to Claude (never crash the loop)
- [ ] 429/5xx from Anthropic → retry via pg-boss
- [ ] 400/401 from Anthropic → apology message, no retry
- [ ] System prompt includes user name, business name, role, and current date
- [ ] System prompt handles null business (no active selection)
- [ ] Single-business users auto-resolve `activeBusinessId` without LLM prompt
- [ ] Multi-business users are prompted to select a business
- [ ] `ToolContext` includes `userId` and `userRole` for permission enforcement
- [ ] Tool registry is extensible — new tools registered without modifying the loop
- [ ] All tests use mocked Claude client (no real API calls in CI)
- [ ] `npm run check` passes

## Size

~400 lines production code + ~300 lines tests. Large ticket.

## Dependencies

- TWA-03 (job handlers and pg-boss wiring)
- TWA-04 (conversation state, context builder, message storage)
