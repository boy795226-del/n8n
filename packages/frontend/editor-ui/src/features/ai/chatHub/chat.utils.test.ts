import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatModelsResponse } from '@n8n/api-types';
import { emptyChatModelsResponse } from '@n8n/api-types';
import {
	findOneFromModelsResponse,
	getRelativeDate,
	groupConversationsByDate,
	getAgentRoute,
	flattenModel,
	unflattenModel,
	filterAndSortAgents,
	stringifyModel,
	fromStringToModel,
	isMatchedAgent,
	createAiMessageFromStreamingState,
} from './chat.utils';
import { createMockAgent, createMockSession } from './__test__/data';
import type { ChatAgentFilter } from './chat.types';
import { CHAT_VIEW } from './constants';

describe(findOneFromModelsResponse, () => {
	it('returns first available model or undefined when none available', () => {
		const responseWithModels: ChatModelsResponse = {
			...emptyChatModelsResponse,
			openai: {
				models: [
					createMockAgent({
						name: 'GPT-4',
						model: { provider: 'openai', model: 'gpt-4' },
					}),
				],
			},
		};

		const result = findOneFromModelsResponse(responseWithModels);
		expect(result).toMatchObject({ name: 'GPT-4', model: { provider: 'openai', model: 'gpt-4' } });

		expect(findOneFromModelsResponse(emptyChatModelsResponse)).toBeUndefined();
	});
});

describe(getRelativeDate, () => {
	const now = new Date('2024-01-15T12:00:00Z');

	it('returns Today for current day', () => {
		expect(getRelativeDate(now, '2024-01-15T10:00:00Z')).toBe('Today');
	});

	it('returns Yesterday for previous day', () => {
		expect(getRelativeDate(now, '2024-01-14T10:00:00Z')).toBe('Yesterday');
	});

	it('returns This week for dates within 7 days', () => {
		expect(getRelativeDate(now, '2024-01-10T10:00:00Z')).toBe('This week');
		expect(getRelativeDate(now, '2024-01-09T10:00:00Z')).toBe('This week');
	});

	it('returns Older for dates more than 7 days ago', () => {
		expect(getRelativeDate(now, '2024-01-07T10:00:00Z')).toBe('Older');
		expect(getRelativeDate(now, '2024-01-01T10:00:00Z')).toBe('Older');
	});
});

describe(groupConversationsByDate, () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('groups sessions by relative date, orders by Today/Yesterday/This week/Older, and sorts within groups by most recent', () => {
		const sessions = [
			createMockSession({
				id: '1',
				updatedAt: '2024-01-15T10:00:00Z',
				title: 'Today 1',
			}),
			createMockSession({
				id: '2',
				updatedAt: '2024-01-14T10:00:00Z',
				title: 'Yesterday 1',
			}),
			createMockSession({
				id: '3',
				updatedAt: '2024-01-12T10:00:00Z',
				title: 'This week 1',
			}),
			createMockSession({
				id: '4',
				updatedAt: '2024-01-05T10:00:00Z',
				title: 'Older 1',
			}),
		];

		const grouped = groupConversationsByDate(sessions);

		expect(grouped).toHaveLength(4);
		expect(grouped[0].group).toBe('Today');
		expect(grouped[1].group).toBe('Yesterday');
		expect(grouped[2].group).toBe('This week');
		expect(grouped[3].group).toBe('Older');

		// Verify each group has sessions
		for (const group of grouped) {
			expect(group.sessions.length).toBeGreaterThan(0);
		}
	});
});

describe(getAgentRoute, () => {
	it('returns route with workflowId query for n8n provider', () => {
		const route = getAgentRoute({ provider: 'n8n', workflowId: 'workflow-123' });

		expect(route).toEqual({
			name: CHAT_VIEW,
			query: { workflowId: 'workflow-123' },
		});
	});

	it('returns route with agentId query for custom-agent provider', () => {
		const route = getAgentRoute({
			provider: 'custom-agent',
			agentId: 'agent-456',
		});

		expect(route).toEqual({
			name: CHAT_VIEW,
			query: { agentId: 'agent-456' },
		});
	});

	it('returns base route for LLM providers', () => {
		const route = getAgentRoute({ provider: 'openai', model: 'gpt-4' });

		expect(route).toEqual({
			name: CHAT_VIEW,
		});
	});
});

describe(flattenModel, () => {
	it('flattens n8n model with workflowId', () => {
		const result = flattenModel({ provider: 'n8n', workflowId: 'wf-123' });

		expect(result).toEqual({
			provider: 'n8n',
			model: null,
			workflowId: 'wf-123',
			agentId: null,
		});
	});

	it('flattens custom-agent model with agentId', () => {
		const result = flattenModel({ provider: 'custom-agent', agentId: 'agent-123' });

		expect(result).toEqual({
			provider: 'custom-agent',
			model: null,
			workflowId: null,
			agentId: 'agent-123',
		});
	});

	it('flattens LLM provider model', () => {
		const result = flattenModel({ provider: 'openai', model: 'gpt-4' });

		expect(result).toEqual({
			provider: 'openai',
			model: 'gpt-4',
			workflowId: null,
			agentId: null,
		});
	});
});

describe(unflattenModel, () => {
	it('unflattens n8n model with workflowId', () => {
		const result = unflattenModel({
			provider: 'n8n',
			model: null,
			workflowId: 'wf-123',
			agentId: null,
		});

		expect(result).toEqual({ provider: 'n8n', workflowId: 'wf-123' });
	});

	it('unflattens custom-agent model with agentId', () => {
		const result = unflattenModel({
			provider: 'custom-agent',
			model: null,
			workflowId: null,
			agentId: 'agent-123',
		});

		expect(result).toEqual({ provider: 'custom-agent', agentId: 'agent-123' });
	});

	it('unflattens LLM provider model', () => {
		const result = unflattenModel({
			provider: 'openai',
			model: 'gpt-4',
			workflowId: null,
			agentId: null,
		});

		expect(result).toEqual({ provider: 'openai', model: 'gpt-4' });
	});

	it('returns null when provider is null', () => {
		const result = unflattenModel({
			provider: null,
			model: null,
			workflowId: null,
			agentId: null,
		});

		expect(result).toBeNull();
	});

	it('returns null when n8n provider has no workflowId', () => {
		const result = unflattenModel({
			provider: 'n8n',
			model: null,
			workflowId: null,
			agentId: null,
		});

		expect(result).toBeNull();
	});

	it('returns null when custom-agent provider has no agentId', () => {
		const result = unflattenModel({
			provider: 'custom-agent',
			model: null,
			workflowId: null,
			agentId: null,
		});

		expect(result).toBeNull();
	});
});

describe(filterAndSortAgents, () => {
	const agents = [
		createMockAgent({
			name: 'GPT-4 Agent',
			model: { provider: 'openai', model: 'gpt-4' },
			updatedAt: '2024-01-15T12:00:00Z',
		}),
		createMockAgent({
			name: 'Claude Agent',
			model: { provider: 'anthropic', model: 'claude' },
			updatedAt: '2024-01-14T12:00:00Z',
		}),
		createMockAgent({
			name: 'Custom Bot',
			model: { provider: 'custom-agent', agentId: 'agent-1' },
			updatedAt: '2024-01-13T12:00:00Z',
		}),
	];

	it('filters agents by search text case insensitively', () => {
		const filter: ChatAgentFilter = {
			search: 'agent',
			provider: '',
			sortBy: 'updatedAt',
		};

		const filtered = filterAndSortAgents(agents, filter);

		expect(filtered).toHaveLength(2);
		expect(filtered.map((a) => a.name)).toEqual(['GPT-4 Agent', 'Claude Agent']);
	});

	it('filters agents by provider', () => {
		const filter: ChatAgentFilter = {
			search: '',
			provider: 'custom-agent',
			sortBy: 'updatedAt',
		};

		const filtered = filterAndSortAgents(agents, filter);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].name).toBe('Custom Bot');
	});

	it('sorts agents by updatedAt with newest first', () => {
		const agentsWithDates = [
			createMockAgent({
				name: 'Agent 1',
				model: { provider: 'openai', model: 'gpt-4' },
				updatedAt: '2024-01-10T12:00:00Z',
			}),
			createMockAgent({
				name: 'Agent 2',
				model: { provider: 'openai', model: 'gpt-4' },
				updatedAt: '2024-01-15T12:00:00Z',
			}),
			createMockAgent({
				name: 'Agent 3',
				model: { provider: 'openai', model: 'gpt-4' },
				updatedAt: '2024-01-12T12:00:00Z',
			}),
		];

		const filter: ChatAgentFilter = {
			search: '',
			provider: '',
			sortBy: 'updatedAt',
		};

		const sorted = filterAndSortAgents(agentsWithDates, filter);

		expect(sorted[0].name).toBe('Agent 2');
		expect(sorted[1].name).toBe('Agent 3');
		expect(sorted[2].name).toBe('Agent 1');
	});
});

describe(stringifyModel, () => {
	it('stringifies n8n model with workflowId', () => {
		expect(stringifyModel({ provider: 'n8n', workflowId: 'wf-123' })).toBe('n8n::wf-123');
	});

	it('stringifies custom-agent model with agentId', () => {
		expect(stringifyModel({ provider: 'custom-agent', agentId: 'agent-123' })).toBe(
			'custom-agent::agent-123',
		);
	});

	it('stringifies LLM provider model', () => {
		expect(stringifyModel({ provider: 'openai', model: 'gpt-4' })).toBe('openai::gpt-4');
	});
});

describe(fromStringToModel, () => {
	it('parses n8n model string', () => {
		expect(fromStringToModel('n8n::wf-123')).toEqual({ provider: 'n8n', workflowId: 'wf-123' });
	});

	it('parses custom-agent model string', () => {
		expect(fromStringToModel('custom-agent::agent-123')).toEqual({
			provider: 'custom-agent',
			agentId: 'agent-123',
		});
	});

	it('parses LLM provider model string', () => {
		expect(fromStringToModel('openai::gpt-4')).toEqual({ provider: 'openai', model: 'gpt-4' });
	});

	it('returns undefined for invalid provider', () => {
		expect(fromStringToModel('invalid-provider::model')).toBeUndefined();
	});
});

describe(isMatchedAgent, () => {
	it('returns true when n8n agent matches by workflowId', () => {
		const agent = createMockAgent({
			name: 'n8n Agent',
			model: { provider: 'n8n', workflowId: 'wf-123' },
		});

		expect(isMatchedAgent(agent, { provider: 'n8n', workflowId: 'wf-123' })).toBe(true);
	});

	it('returns false when n8n agent workflowId does not match', () => {
		const agent = createMockAgent({
			name: 'n8n Agent',
			model: { provider: 'n8n', workflowId: 'wf-123' },
		});

		expect(isMatchedAgent(agent, { provider: 'n8n', workflowId: 'wf-456' })).toBe(false);
	});

	it('returns true when custom-agent matches by agentId', () => {
		const agent = createMockAgent({
			name: 'Custom Agent',
			model: { provider: 'custom-agent', agentId: 'agent-123' },
		});

		expect(isMatchedAgent(agent, { provider: 'custom-agent', agentId: 'agent-123' })).toBe(true);
	});

	it('returns false when custom-agent agentId does not match', () => {
		const agent = createMockAgent({
			name: 'Custom Agent',
			model: { provider: 'custom-agent', agentId: 'agent-123' },
		});

		expect(isMatchedAgent(agent, { provider: 'custom-agent', agentId: 'agent-456' })).toBe(false);
	});

	it('returns true when LLM agent matches by provider and model', () => {
		const agent = createMockAgent({
			name: 'GPT-4',
			model: { provider: 'openai', model: 'gpt-4' },
		});

		expect(isMatchedAgent(agent, { provider: 'openai', model: 'gpt-4' })).toBe(true);
	});

	it('returns false when LLM agent model does not match', () => {
		const agent = createMockAgent({
			name: 'GPT-4',
			model: { provider: 'openai', model: 'gpt-4' },
		});

		expect(isMatchedAgent(agent, { provider: 'openai', model: 'gpt-3.5' })).toBe(false);
	});
});

describe(createAiMessageFromStreamingState, () => {
	it('creates AI message with basic required fields', () => {
		const sessionId = 'session-123';
		const messageId = 'message-456';

		const message = createAiMessageFromStreamingState(sessionId, messageId);

		expect(message.id).toBe(messageId);
		expect(message.sessionId).toBe(sessionId);
		expect(message.type).toBe('ai');
		expect(message.name).toBe('AI');
	});

	it('creates message with running status and empty content by default', () => {
		const message = createAiMessageFromStreamingState('session-123', 'message-456');

		expect(message.status).toBe('running');
		expect(message.content).toBe('');
	});

	it('creates message with null metadata fields by default', () => {
		const message = createAiMessageFromStreamingState('session-123', 'message-456');

		expect(message.executionId).toBeNull();
		expect(message.previousMessageId).toBeNull();
		expect(message.retryOfMessageId).toBeNull();
		expect(message.provider).toBeNull();
		expect(message.model).toBeNull();
	});

	it('includes executionId from streaming state', () => {
		const message = createAiMessageFromStreamingState('session-123', 'message-456', {
			executionId: 789,
		});

		expect(message.executionId).toBe(789);
	});

	it('includes previousMessageId from streaming state', () => {
		const message = createAiMessageFromStreamingState('session-123', 'message-456', {
			previousMessageId: 'msg-000',
		});

		expect(message.previousMessageId).toBe('msg-000');
	});

	it('extracts provider and model from streaming state model object', () => {
		const message = createAiMessageFromStreamingState('session-123', 'message-456', {
			model: { provider: 'openai', model: 'gpt-4' },
		});

		expect(message.provider).toBe('openai');
		expect(message.model).toBe('gpt-4');
	});

	it('includes all streaming state fields when provided', () => {
		const message = createAiMessageFromStreamingState('session-123', 'message-456', {
			executionId: 789,
			previousMessageId: 'msg-000',
			model: { provider: 'anthropic', model: 'claude-3' },
		});

		expect(message.executionId).toBe(789);
		expect(message.previousMessageId).toBe('msg-000');
		expect(message.provider).toBe('anthropic');
		expect(message.model).toBe('claude-3');
	});
});
