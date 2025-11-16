# UI testing

## Overview

Your mission is to bring code coverage under the chatHub folder to above 95%.

## Way of working

1. Understand features
2. Identify test cases (create as `it.todo()`) and get reviewed
	- If a module's behavior is covered by tests for other modules, you don't need to have tests for that module.
	- Focus on use cases, DO NOT try to test contract between modules.
	- Focus on happy path.
3. Once approved, implement tests

## Coding guide

### File organization
- Test files are collocated with source files (not in `__test__/` directory)
- Define common helpers and test data in `__test__/data.ts`
- For utility function tests, use function references in describe() calls: `describe(functionName, () => {})`

### Mocking
- DO NOT mock modules such as Vue components and stores. Exception: `chat.api.ts`
- For each module you want to mock, ask for permission first
- If browser API is missing, add to `packages/frontend/editor-ui/src/__tests__/setup.ts` (not in individual test files)

### Selectors and assertions
- Selector priority:
	1. Based on accessibility features, e.g. `getByRole`, `getByText`
	2. Based on test ID `getByTestId`
	3. `querySelector`
- **Use `within()` for scoped queries**: When you need to query elements within a specific container (e.g., finding a button within a specific message), use `within()` to scope your queries. This makes tests more precise and less brittle.
	```typescript
	// Good - scoped query
	const userMessage = messages[0];
	const editButton = await within(userMessage).findByRole('button', { name: 'Edit' });

	// Avoid - relying on element order across entire document
	const editButtons = await rendered.findAllByRole('button', { name: 'Edit' });
	await user.click(editButtons[0]); // Which edit button? Not clear
	```
- **Improving product code for testability**: If tests require `querySelector` or are difficult to write due to missing accessible selectors, consider modifying the product code to add better accessibility features (e.g., ARIA labels, roles, or test IDs). This improves both testability and accessibility.
- **Don't assert `.toBeInTheDocument()` for `findBy*` queries** - `findBy*` already waits for elements and throws if not found, making the assertion redundant
- Do assert:
	- What is displayed in UI
	- API requests for mutations (create, update, etc.)
- Do NOT assert:
	- Store state directly (e.g., `chatStore.getActiveMessages()`, `chatStore.sessionsReady`)
	- Function calls using `toHaveBeenCalled`
	- Store state inside `waitFor` to wait for readiness
- Always verify through the UI, not internal state
- Wait for UI changes, not store state changes:
	```typescript
	// Bad - waiting for store state
	await vi.waitFor(() => {
		expect(chatStore.sessionsReady).toBe(true);
	});

	// Good - wait for UI element that indicates readiness
	await rendered.findByText('Session Title');
	```

### Waiting and timing
- Always wait for UI cues (e.g., `await findByRole()`, `await findByText()`)
- Never use arbitrary timeouts like `setTimeout()` or `new Promise(resolve => setTimeout(resolve, 200))`
- Wait for the last message text with `await findByText(...)`, then query all messages with `queryAllByTestId(...)`
- **Assert UI changes before API arguments** - wait for UI result first, then verify API was called correctly (no `waitFor` needed for synchronous mocks)

### Variables and code style
- Inline queried elements unless used multiple times (e.g., `expect(await findByRole('log')).toBeInTheDocument()`)
- Only assign to variable if used for both interaction AND assertion/verification, or multiple assertions
- Inline user interactions with queries when possible:
	```typescript
	// Good - inline query with interaction
	await user.click(await rendered.findByText('Submit'));
	await user.hover(await rendered.findByText('Menu Item'));

	// Avoid - unnecessary variable assignment
	const submitButton = await rendered.findByText('Submit');
	await user.click(submitButton);
	```
- Hard-code test data - use literal values directly for explicitness
- Don't destructure render return values - use `const rendered = renderComponent({ pinia })`
- One blank line between test cases
- Avoid self-evident comments - code should be readable without them (e.g., don't write `// Click button` before `await user.click(button)`)
- Each assertion/action should fit in one line (after formatting) - adjust test data length to achieve this

## Measuring Coverage

### Run tests with coverage

From the `packages/frontend/editor-ui` directory:

```bash
# Run all chatHub tests with coverage
pnpm test --coverage --run src/features/ai/chatHub

# Run specific test file
pnpm test --coverage --run src/features/ai/chatHub/__test__/chat.utils.test.ts
```

### View coverage report

After running tests with coverage, a coverage report will be generated. To view it:

```bash
# Open coverage report in browser (if generated)
open coverage/index.html
```

### Check coverage for specific files

To see coverage for the chatHub folder specifically, look for the coverage output in the terminal after running tests. The output will show:

- **Statements**: Percentage of executable statements covered
- **Branches**: Percentage of conditional branches covered
- **Functions**: Percentage of functions covered
- **Lines**: Percentage of lines covered

**Target**: All metrics should be above **95%** for the chatHub folder.

### Current Status

**Overall Project Coverage:**
- Statements: 35.16% (6065/17247)
- Branches: 72.2% (374/518)
- Functions: 10.25% (95/926)
- Lines: 35.16% (6065/17247)

**chatHub Folder Coverage:**
- Statements/Lines: 66.33% (1889/2848)
- Branches: 78.18% (283/362)
- Functions: 49.53% (53/107)

**⚠️ Coverage Caveat:**
Coverage tools mark lines as "covered" when they're compiled/referenced, not when they're actually executed. For example, `ChatView.vue` shows 98.20% line coverage, but functions like `handleRegenerateMessage` are not actually tested (they're in `.todo()` tests). The **test completion ratio (23/76 = 30%)** is a more honest measure of real coverage.

Historical context (issues now resolved):
- [Vue Issue #13261](https://github.com/vuejs/core/issues/13261) - Vue compiler source map generation ✅ **Fixed in Vue 3.5.6** (we have 3.5.13)
- [Vitest Issue #4993](https://github.com/vitest-dev/vitest/issues/4993) - Downstream issue tracking Vue fix
- [Vitest Issue #8351](https://github.com/vitest-dev/vitest/issues/8351) - V8 coverage for Vue SFC with TSX ✅ **Fixed in Vitest 4.0**

**Current project versions:**
- Vue: 3.5.13 ✅ (includes coverage fix from 3.5.6)
- Vitest: 3.1.3 (latest: 4.0.7)

While major Vue coverage issues are fixed, some inflation may still occur due to how Vue compiles templates and event handler references.

**Test Files Status:**

Test files are collocated with their source modules in the `chatHub/` directory.

| Module | Tests Passing | Tests Todo | Coverage | Status |
|--------|--------------|------------|----------|--------|
| `chat.utils.test.ts` | 12 | 0 | High | ✅ Complete |
| `chat.store.test.ts` | 2 | 13 | Medium | 🟡 In Progress |
| `ChatView.test.ts` | 3 | 11 | 98.20% lines | 🟡 In Progress |
| `ChatAgentsView.test.ts` | 1 | 10 | Low | 🟡 Started |
| `ChatMessage.test.ts` | 1 | 4 | Medium | 🟡 Started |
| `ChatPrompt.test.ts` | 1 | 7 | Low | 🟡 Started |
| `ChatSidebar.test.ts` | 1 | 3 | Low | 🟡 Started |
| `ModelSelector.test.ts` | 1 | 3 | Medium | 🟡 Started |
| `CredentialSelectorModal.test.ts` | 1 | 2 | Low | 🟡 Started |

**Total:** 23 tests passing | 53 tests todo

## Progress Notes

### 2025-11-06
- **Coverage Progress**: 34.53% → 35.16% overall statements (+0.63%)
- **chatHub Folder**: 66.33% line coverage, 78.18% branch coverage
- **Tests Enhanced**: Improved `ChatView.test.ts` with two comprehensive message sending tests
  - New session: Sends message, navigates to conversation, displays messages (98.20% line coverage)
  - Existing session: Loads existing messages, sends new message, displays all in order
  - Verifies API calls with complete parameters (message, model, sessionId, credentials, previousMessageId)
  - Verifies navigation behavior (navigates vs doesn't navigate)
  - Verifies session ID consistency between API call and navigation
  - Verifies message ordering in UI
- **Code Quality**: Eliminated all `any` types from ChatView.test.ts using proper `EnrichedStructuredChunk` types
- **Bug Fixed**: Store wasn't populating sessions from `fetchMessages` API response
- **Next Steps**: Continue implementing remaining todo tests to reach 95% coverage target

### 2025-11-04
- **Coverage Progress**: 33.33% → 34.53% statements (+1.2%)
- **Tests Added**: Initial message sending test in `ChatView.test.ts`
  - Verifies user can send a message
  - Verifies input clears after submission
  - Verifies message is added to store
  - Verifies API is called with correct parameters
- **Key Testing Pattern**: Use custom-agent or n8n workflow agents to bypass credential requirements
- **Next Steps**: Continue implementing component tests focusing on user interactions