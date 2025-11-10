import { describe, it, beforeEach, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createComponentRenderer } from '@/__tests__/render';
import {
	createMockModelsResponse,
	createMockAgent,
	createMockConversationResponse,
	createMockSession,
	createMockMessageDto,
	createMockStreamChunk,
} from './__test__/data';
import ChatView from './ChatView.vue';
import * as chatApi from './chat.api';
import userEvent from '@testing-library/user-event';
import { waitFor, within } from '@testing-library/vue';

/**
 * ChatView.vue Tests
 *
 * Main chat interface where users interact with AI agents
 * Key features:
 * - Display chat messages
 * - Send new messages
 * - Handle streaming responses
 * - Model selection
 * - Session management
 */

// Mock external stores and modules
vi.mock('@/features/settings/users/users.store', () => ({
	useUsersStore: () => ({
		currentUserId: 'user-123',
		currentUser: {
			id: 'user-123',
			firstName: 'Test',
			fullName: 'Test User',
		},
	}),
}));

vi.mock('@/app/stores/ui.store', () => ({
	useUIStore: () => ({
		openModal: vi.fn(),
		modalsById: {},
	}),
}));

vi.mock('@/features/credentials/credentials.store', () => ({
	useCredentialsStore: () => ({
		fetchCredentialTypes: vi.fn().mockResolvedValue(undefined),
		fetchAllCredentials: vi.fn().mockResolvedValue(undefined),
		getCredentialById: vi.fn().mockReturnValue(undefined),
		getCredentialsByType: vi.fn().mockReturnValue([]),
		getCredentialTypeByName: vi.fn().mockReturnValue(undefined),
	}),
}));

vi.mock('./chat.api');

// Create a reactive route object that can be shared
import { reactive } from 'vue';
const mockRoute = reactive<{ params: Record<string, any>; query: Record<string, any> }>({
	params: {},
	query: {},
});

const mockRouterPush = vi.fn((route) => {
	// Simulate route navigation by updating mockRoute
	if (typeof route === 'object' && route.params) {
		Object.assign(mockRoute.params, route.params);
	}
});

vi.mock('vue-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('vue-router')>();

	return {
		...actual,
		useRoute: () => mockRoute,
		useRouter: () => ({
			push: mockRouterPush,
			resolve: vi.fn(),
		}),
	};
});

const renderComponent = createComponentRenderer(ChatView);

describe('ChatView', () => {
	let pinia: ReturnType<typeof createPinia>;

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);

		mockRoute.params = {};
		mockRoute.query = {};
		mockRouterPush.mockClear();

		vi.mocked(chatApi.sendMessageApi).mockClear();
		vi.mocked(chatApi.editMessageApi).mockClear();
		vi.mocked(chatApi.regenerateMessageApi).mockClear();
		vi.mocked(chatApi.stopGenerationApi).mockClear();

		vi.mocked(chatApi.fetchChatModelsApi).mockResolvedValue(
			createMockModelsResponse({
				'custom-agent': {
					models: [
						createMockAgent({
							name: 'Test Custom Agent',
							description: 'A test custom agent',
							model: { provider: 'custom-agent', agentId: 'agent-123' },
						}),
					],
				},
			}),
		);
		vi.mocked(chatApi.fetchSingleConversationApi).mockResolvedValue(
			createMockConversationResponse({
				session: createMockSession({
					id: 'session-id',
					provider: null,
					model: null,
				}),
			}),
		);
		vi.mocked(chatApi.fetchConversationsApi).mockResolvedValue([]);
	});

	describe('Initial rendering', () => {
		it('displays chat starter for new session, conversation header, and prompt input', async () => {
			const rendered = renderComponent({ pinia });

			expect(rendered.queryByRole('log')).not.toBeInTheDocument();
			expect(await rendered.findByText('Hello, Test!')).toBeInTheDocument();
			expect(await rendered.findByRole('textbox')).toBeInTheDocument();
		});

		it('displays existing conversation with messages loaded from API', async () => {
			mockRoute.params = { id: 'existing-session-123' };

			vi.mocked(chatApi.fetchSingleConversationApi).mockResolvedValue(
				createMockConversationResponse({
					session: createMockSession({
						id: 'existing-session-123',
						title: 'Test Conversation',
						lastMessageAt: new Date().toISOString(),
						provider: 'custom-agent',
						agentId: 'agent-123',
						agentName: 'Test Custom Agent',
					}),
					conversation: {
						messages: {
							'msg-1': createMockMessageDto({
								id: 'msg-1',
								sessionId: 'existing-session-123',
								content: 'What is the weather today?',
							}),
							'msg-2': createMockMessageDto({
								id: 'msg-2',
								sessionId: 'existing-session-123',
								type: 'ai',
								name: 'Assistant',
								content: 'The weather is sunny today.',
								provider: 'custom-agent',
								agentId: 'agent-123',
								previousMessageId: 'msg-1',
							}),
						},
					},
				}),
			);

			const rendered = renderComponent({ pinia });

			expect(await rendered.findByText('The weather is sunny today.')).toBeInTheDocument();

			const messages = rendered.queryAllByTestId('chat-message');
			expect(messages).toHaveLength(2);
			expect(messages[0]).toHaveTextContent('What is the weather today?');
			expect(messages[1]).toHaveTextContent('The weather is sunny today.');
		});

		it('handles when the agent selected for the conversation is not available anymore', async () => {
			mockRoute.params = { id: 'existing-session-123' };

			vi.mocked(chatApi.fetchChatModelsApi).mockResolvedValue(
				createMockModelsResponse({
					openai: {
						models: [
							createMockAgent({
								name: 'GPT-4',
								model: { provider: 'openai', model: 'gpt-4' },
							}),
						],
					},
				}),
			);

			vi.mocked(chatApi.fetchSingleConversationApi).mockResolvedValue(
				createMockConversationResponse({
					session: createMockSession({
						id: 'existing-session-123',
						title: 'Existing Conversation',
						lastMessageAt: new Date().toISOString(),
						provider: 'anthropic',
						model: 'claude-3-sonnet',
						agentId: null,
						agentName: null,
					}),
				}),
			);

			const rendered = renderComponent({ pinia });

			expect(await rendered.findByText(/reselect a model/i)).toBeInTheDocument();
			expect(await rendered.findByRole('textbox')).toBeDisabled();
		});
	});

	describe('Sending messages', () => {
		it('sends message in new session, calls API, navigates to conversation view, and displays user message', async () => {
			const user = userEvent.setup();

			mockRoute.query = { agentId: 'agent-123' };

			vi.mocked(chatApi.sendMessageApi).mockImplementation(
				(_ctx, payload, onMessageUpdated, onDone) => {
					void Promise.resolve().then(async () => {
						onMessageUpdated(
							createMockStreamChunk({
								type: 'begin',
								content: '',
								metadata: {
									messageId: 'ai-message-123',
									previousMessageId: payload.messageId,
								},
							}),
						);

						onMessageUpdated(
							createMockStreamChunk({
								type: 'item',
								content: 'Hello! How can I help?',
								metadata: {
									messageId: 'ai-message-123',
									previousMessageId: payload.messageId,
								},
							}),
						);

						onMessageUpdated(
							createMockStreamChunk({
								type: 'end',
								content: '',
								metadata: {
									messageId: 'ai-message-123',
									previousMessageId: payload.messageId,
								},
							}),
						);

						onDone();
					});
				},
			);

			const rendered = renderComponent({ pinia });

			const textarea = (await rendered.findByRole('textbox')) as HTMLTextAreaElement;
			await user.click(textarea);
			await user.type(textarea, 'Hello, AI!{Enter}');

			expect(textarea.value).toBe('');

			expect(chatApi.sendMessageApi).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					message: 'Hello, AI!',
					model: { provider: 'custom-agent', agentId: 'agent-123' },
					sessionId: expect.any(String),
					credentials: {},
				}),
				expect.any(Function),
				expect.any(Function),
				expect.any(Function),
			);

			const apiCallArgs = vi.mocked(chatApi.sendMessageApi).mock.calls[0];
			const sessionIdFromApi = apiCallArgs[1].sessionId;

			expect(mockRouterPush).toHaveBeenCalledWith({
				name: 'chat-conversation',
				params: { id: sessionIdFromApi },
			});

			expect(await rendered.findByText('Hello! How can I help?')).toBeInTheDocument();

			const messages = rendered.queryAllByTestId('chat-message');
			expect(messages).toHaveLength(2);
			expect(messages[0]).toHaveTextContent('Hello, AI!');
			expect(messages[1]).toHaveTextContent('Hello! How can I help?');
		});

		it('sends message in existing session and displays both user and AI messages', async () => {
			const user = userEvent.setup();

			mockRoute.params = { id: 'existing-session-123' };

			vi.mocked(chatApi.fetchSingleConversationApi).mockResolvedValue(
				createMockConversationResponse({
					session: createMockSession({
						id: 'existing-session-123',
						title: 'Existing Conversation',
						lastMessageAt: new Date().toISOString(),
						provider: 'custom-agent',
						agentId: 'agent-123',
						agentName: 'Test Custom Agent',
					}),
					conversation: {
						messages: {
							'msg-1': createMockMessageDto({
								id: 'msg-1',
								sessionId: 'existing-session-123',
								content: 'Previous question',
							}),
							'msg-2': createMockMessageDto({
								id: 'msg-2',
								sessionId: 'existing-session-123',
								type: 'ai',
								name: 'Assistant',
								content: 'Previous answer',
								provider: 'openai',
								model: 'gpt-4',
								previousMessageId: 'msg-1',
							}),
						},
					},
				}),
			);

			vi.mocked(chatApi.sendMessageApi).mockImplementation(
				(_ctx, payload, onMessageUpdated, onDone) => {
					void Promise.resolve().then(async () => {
						onMessageUpdated(
							createMockStreamChunk({
								type: 'begin',
								content: '',
								metadata: {
									messageId: 'ai-message-456',
									previousMessageId: payload.messageId,
								},
							}),
						);

						onMessageUpdated(
							createMockStreamChunk({
								type: 'item',
								content: 'AI response here',
								metadata: {
									messageId: 'ai-message-456',
									previousMessageId: payload.messageId,
								},
							}),
						);

						onMessageUpdated(
							createMockStreamChunk({
								type: 'end',
								content: '',
								metadata: {
									messageId: 'ai-message-456',
									previousMessageId: payload.messageId,
								},
							}),
						);

						onDone();
					});
				},
			);

			const rendered = renderComponent({ pinia });

			const textarea = (await rendered.findByRole('textbox')) as HTMLTextAreaElement;
			await user.click(textarea);
			await user.type(textarea, 'New question{Enter}');

			expect(textarea.value).toBe('');

			expect(chatApi.sendMessageApi).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					message: 'New question',
					model: { provider: 'custom-agent', agentId: 'agent-123' },
					sessionId: 'existing-session-123',
					credentials: {},
					previousMessageId: 'msg-2',
				}),
				expect.any(Function),
				expect.any(Function),
				expect.any(Function),
			);

			expect(await rendered.findByText('AI response here')).toBeInTheDocument();

			const messages = rendered.queryAllByTestId('chat-message');
			expect(messages).toHaveLength(4);
			expect(messages[0]).toHaveTextContent('Previous question');
			expect(messages[1]).toHaveTextContent('Previous answer');
			expect(messages[2]).toHaveTextContent('New question');
			expect(messages[3]).toHaveTextContent('AI response here');

			expect(mockRouterPush).not.toHaveBeenCalled();
		});

		it('stops streaming when user clicks stop button and calls stopGeneration API', async () => {
			const user = userEvent.setup();

			mockRoute.query = { agentId: 'agent-123' };

			vi.mocked(chatApi.sendMessageApi).mockImplementation(
				(_ctx, payload, onMessageUpdated, _onDone) => {
					void Promise.resolve().then(async () => {
						onMessageUpdated(
							createMockStreamChunk({
								type: 'begin',
								content: '',
								metadata: {
									messageId: 'ai-message-123',
									previousMessageId: payload.messageId,
								},
							}),
						);

						onMessageUpdated(
							createMockStreamChunk({
								type: 'item',
								content: 'Starting response...',
								metadata: {
									messageId: 'ai-message-123',
									previousMessageId: payload.messageId,
								},
							}),
						);
					});
				},
			);

			vi.mocked(chatApi.stopGenerationApi).mockResolvedValue(undefined);

			const rendered = renderComponent({ pinia });

			const textarea = (await rendered.findByRole('textbox')) as HTMLTextAreaElement;
			await user.click(textarea);
			await user.type(textarea, 'Hello, AI!{Enter}');

			await user.click(await rendered.findByRole('button', { name: /stop generating/i }));

			const sendApiCall = vi.mocked(chatApi.sendMessageApi).mock.calls[0];
			const sessionId = sendApiCall[1].sessionId;

			expect(chatApi.stopGenerationApi).toHaveBeenCalledWith(
				expect.anything(),
				sessionId,
				'ai-message-123',
			);
		});
	});

	describe('Model selection', () => {
		it.todo('updates session model when user selects different model in existing conversation');
		it.todo('saves to localStorage when user selects model in new session');
	});

	describe('Message actions', () => {
		it('regenerates AI response when user clicks regenerate button', async () => {
			const user = userEvent.setup();

			mockRoute.params = { id: 'existing-session-123' };

			vi.mocked(chatApi.fetchSingleConversationApi).mockResolvedValue(
				createMockConversationResponse({
					session: createMockSession({
						id: 'existing-session-123',
						provider: 'custom-agent',
						agentId: 'agent-123',
						agentName: 'Test Custom Agent',
					}),
					conversation: {
						messages: {
							'msg-1': createMockMessageDto({
								id: 'msg-1',
								sessionId: 'existing-session-123',
								content: 'What is 2+2?',
							}),
							'msg-2': createMockMessageDto({
								id: 'msg-2',
								sessionId: 'existing-session-123',
								type: 'ai',
								name: 'Assistant',
								content: 'Original response: 4',
								provider: 'custom-agent',
								agentId: 'agent-123',
								previousMessageId: 'msg-1',
							}),
						},
					},
				}),
			);

			vi.mocked(chatApi.regenerateMessageApi).mockImplementation(
				(_ctx, _sessionId, _retryId, _payload, onMessageUpdated, onDone) => {
					void Promise.resolve().then(async () => {
						onMessageUpdated(
							createMockStreamChunk({
								type: 'begin',
								content: '',
								metadata: {
									messageId: 'ai-message-retry-123',
									retryOfMessageId: 'msg-2',
									previousMessageId: 'msg-1',
								},
							}),
						);

						onMessageUpdated(
							createMockStreamChunk({
								type: 'item',
								content: 'Regenerated: 2+2=4',
								metadata: {
									messageId: 'ai-message-retry-123',
									retryOfMessageId: 'msg-2',
									previousMessageId: 'msg-1',
								},
							}),
						);

						onMessageUpdated(
							createMockStreamChunk({
								type: 'end',
								content: '',
								metadata: {
									messageId: 'ai-message-retry-123',
									retryOfMessageId: 'msg-2',
									previousMessageId: 'msg-1',
								},
							}),
						);

						onDone();
					});
				},
			);

			const rendered = renderComponent({ pinia });

			expect(await rendered.findByText('Original response: 4')).toBeInTheDocument();

			await user.click(await rendered.findByRole('button', { name: 'Regenerate' }));

			expect(await rendered.findByText('Regenerated: 2+2=4')).toBeInTheDocument();

			expect(chatApi.regenerateMessageApi).toHaveBeenCalledWith(
				expect.anything(),
				'existing-session-123',
				'msg-2',
				expect.objectContaining({
					model: { provider: 'custom-agent', agentId: 'agent-123' },
					credentials: {},
				}),
				expect.any(Function),
				expect.any(Function),
				expect.any(Function),
			);
		});

		it('edits message and regenerates response when user edits their message', async () => {
			const user = userEvent.setup();

			mockRoute.params = { id: 'existing-session-123' };

			vi.mocked(chatApi.fetchSingleConversationApi).mockResolvedValue(
				createMockConversationResponse({
					session: createMockSession({
						id: 'existing-session-123',
						provider: 'custom-agent',
						agentId: 'agent-123',
						agentName: 'Test Custom Agent',
					}),
					conversation: {
						messages: {
							'msg-1': createMockMessageDto({
								id: 'msg-1',
								sessionId: 'existing-session-123',
								content: 'Original question',
							}),
							'msg-2': createMockMessageDto({
								id: 'msg-2',
								sessionId: 'existing-session-123',
								type: 'ai',
								name: 'Assistant',
								content: 'Original answer',
								provider: 'custom-agent',
								agentId: 'agent-123',
								previousMessageId: 'msg-1',
							}),
						},
					},
				}),
			);

			vi.mocked(chatApi.editMessageApi).mockImplementation(
				(_ctx, _sessionId, _editId, _payload, onMessageUpdated, onDone) => {
					void Promise.resolve().then(async () => {
						onMessageUpdated(
							createMockStreamChunk({
								type: 'begin',
								content: '',
								metadata: {
									messageId: 'ai-message-edit-123',
									previousMessageId: 'msg-1',
								},
							}),
						);

						onMessageUpdated(
							createMockStreamChunk({
								type: 'item',
								content: 'Updated answer',
								metadata: {
									messageId: 'ai-message-edit-123',
									previousMessageId: 'msg-1',
								},
							}),
						);

						onMessageUpdated(
							createMockStreamChunk({
								type: 'end',
								content: '',
								metadata: {
									messageId: 'ai-message-edit-123',
									previousMessageId: 'msg-1',
								},
							}),
						);

						onDone();
					});
				},
			);

			const rendered = renderComponent({ pinia });

			expect(await rendered.findByText('Original answer')).toBeInTheDocument();

			const messages = rendered.queryAllByTestId('chat-message');
			const userMessage = messages[0];

			await user.click(await within(userMessage).findByRole('button', { name: 'Edit' }));

			const textarea = (await within(userMessage).findByRole('textbox')) as HTMLTextAreaElement;
			await user.clear(textarea);
			await user.type(textarea, 'Edited question');

			await user.click(await within(userMessage).findByRole('button', { name: 'Send' }));

			expect(await rendered.findByText('Updated answer')).toBeInTheDocument();

			expect(chatApi.editMessageApi).toHaveBeenCalledWith(
				expect.anything(),
				'existing-session-123',
				'msg-1',
				expect.objectContaining({
					messageId: expect.any(String),
					message: 'Edited question',
					model: { provider: 'custom-agent', agentId: 'agent-123' },
					credentials: {},
				}),
				expect.any(Function),
				expect.any(Function),
				expect.any(Function),
			);
		});

		it('switches to alternative response when user selects alternative', async () => {
			const user = userEvent.setup();

			mockRoute.params = { id: 'existing-session-123' };

			vi.mocked(chatApi.fetchSingleConversationApi).mockResolvedValue(
				createMockConversationResponse({
					session: createMockSession({
						id: 'existing-session-123',
						provider: 'custom-agent',
						agentId: 'agent-123',
						agentName: 'Test Custom Agent',
					}),
					conversation: {
						messages: {
							'msg-1': createMockMessageDto({
								id: 'msg-1',
								sessionId: 'existing-session-123',
								content: 'What is AI?',
							}),
							'msg-2': createMockMessageDto({
								id: 'msg-2',
								sessionId: 'existing-session-123',
								type: 'ai',
								name: 'Assistant',
								content: 'First AI response',
								provider: 'custom-agent',
								agentId: 'agent-123',
								previousMessageId: 'msg-1',
							}),
							'msg-2-retry': createMockMessageDto({
								id: 'msg-2-retry',
								sessionId: 'existing-session-123',
								type: 'ai',
								name: 'Assistant',
								content: 'Second AI response',
								provider: 'custom-agent',
								agentId: 'agent-123',
								previousMessageId: 'msg-1',
								retryOfMessageId: 'msg-2',
							}),
						},
					},
				}),
			);

			const rendered = renderComponent({ pinia });

			expect(await rendered.findByText('Second AI response')).toBeInTheDocument();
			expect(await rendered.findByText('2/2')).toBeInTheDocument();

			await user.click(await rendered.findByRole('button', { name: 'Previous alternative' }));

			expect(await rendered.findByText('First AI response')).toBeInTheDocument();
			expect(await rendered.findByText('1/2')).toBeInTheDocument();
			expect(rendered.queryByText('Second AI response')).not.toBeInTheDocument();
		});
	});
});
