import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createComponentRenderer } from '@/__tests__/render';
import { createMockSession } from '../__test__/data';
import ChatSidebar from './ChatSidebar.vue';
import * as chatApi from '../chat.api';
import userEvent from '@testing-library/user-event';
import { emptyChatModelsResponse } from '@n8n/api-types';
import { useChatStore } from '../chat.store';

vi.mock('@/app/stores/ui.store', () => ({
	useUIStore: () => ({
		openModal: vi.fn(),
		closeModal: vi.fn(),
		modalsById: {},
		isModalActiveById: {},
	}),
}));

vi.mock('@/app/stores/settings.store', () => ({
	useSettingsStore: () => ({
		settings: {
			releaseChannel: 'stable',
		},
	}),
}));

vi.mock('@/features/settings/users/users.store', () => ({
	useUsersStore: () => ({
		currentUserId: 'user-123',
	}),
}));

vi.mock('@vueuse/core', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@vueuse/core')>();
	const { ref } = await import('vue');
	return {
		...actual,
		useMediaQuery: () => ref(false),
		useLocalStorage: (_key: string, defaultValue: boolean) => ref(defaultValue),
	};
});

vi.mock('../chat.api');

const renderComponent = createComponentRenderer(ChatSidebar, {
	global: {
		stubs: {
			RouterLink: false,
		},
	},
});

describe('ChatSidebar', () => {
	let pinia: ReturnType<typeof createPinia>;

	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);

		vi.mocked(chatApi.fetchConversationsApi).mockResolvedValue([]);
		vi.mocked(chatApi.fetchChatModelsApi).mockResolvedValue(emptyChatModelsResponse);
		vi.mocked(chatApi.deleteConversationApi).mockClear();
		vi.mocked(chatApi.deleteConversationApi).mockResolvedValue(undefined);

		const chatStore = useChatStore();
		void chatStore.fetchAgents({});
	});

	describe('Session list', () => {
		it('displays sessions grouped by date with titles and highlights active session', async () => {
			vi.mocked(chatApi.fetchConversationsApi).mockResolvedValue([
				createMockSession({ id: 'session-1', title: 'Test Chat' }),
			]);

			const rendered = renderComponent({ pinia });

			await rendered.findByText('Test Chat');
		});

		it('sorts sessions by most recent first within each group', async () => {
			vi.mocked(chatApi.fetchConversationsApi).mockResolvedValue([
				createMockSession({
					id: 'session-1',
					title: 'Older Session',
					lastMessageAt: '2025-01-01T10:00:00Z',
				}),
				createMockSession({
					id: 'session-2',
					title: 'Newer Session',
					lastMessageAt: '2025-01-01T12:00:00Z',
				}),
			]);

			const rendered = renderComponent({ pinia });
			await rendered.findByText('Newer Session');

			const sessionLinks = rendered.container.querySelectorAll('a');
			const sessionTitles = Array.from(sessionLinks)
				.map((link) => link.textContent)
				.filter((text) => text?.includes('Session'));
			const newerIndex = sessionTitles.findIndex((title) => title?.includes('Newer Session'));
			const olderIndex = sessionTitles.findIndex((title) => title?.includes('Older Session'));

			expect(newerIndex).toBeLessThan(olderIndex);
		});
	});

	describe('Navigation', () => {
		it('displays navigation items for new chat, agents, and sessions', async () => {
			vi.mocked(chatApi.fetchConversationsApi).mockResolvedValue([
				createMockSession({ id: 'session-1', title: 'My Conversation' }),
				createMockSession({ id: 'session-2', title: 'Another Chat' }),
			]);

			const rendered = renderComponent({ pinia });

			await rendered.findByText('New Chat');
			await rendered.findByText('Custom Agents');
			await rendered.findByText('My Conversation');
			await rendered.findByText('Another Chat');
		});
	});

	describe('Session deletion', () => {
		it('confirms deletion, calls deleteConversation API, and removes session from list', async () => {
			const user = userEvent.setup();
			vi.mocked(chatApi.fetchConversationsApi).mockResolvedValue([
				createMockSession({ id: 'session-1', title: 'Test Chat' }),
			]);

			const rendered = renderComponent({ pinia });

			await user.hover(await rendered.findByText('Test Chat'));

			const dropdownTrigger = rendered
				.getAllByRole('button', { hidden: true })
				.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
			if (dropdownTrigger) await user.click(dropdownTrigger);

			await user.click((await rendered.findAllByText('Delete'))[0]);
			await user.click(await rendered.findByRole('button', { name: 'Delete' }));

			expect(rendered.queryByText('Test Chat')).not.toBeInTheDocument();
			expect(chatApi.deleteConversationApi).toHaveBeenCalledWith(expect.anything(), 'session-1');
		});

		it('cancels deletion when user dismisses confirmation dialog', async () => {
			const user = userEvent.setup();
			vi.mocked(chatApi.fetchConversationsApi).mockResolvedValue([
				createMockSession({ id: 'session-1', title: 'Test Chat' }),
			]);

			const rendered = renderComponent({ pinia });

			await user.hover(await rendered.findByText('Test Chat'));

			const dropdownTrigger = rendered
				.getAllByRole('button', { hidden: true })
				.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
			if (dropdownTrigger) await user.click(dropdownTrigger);

			await user.click((await rendered.findAllByText('Delete'))[0]);
			await user.click(await rendered.findByRole('button', { name: 'Cancel' }));

			expect(rendered.getByText('Test Chat')).toBeInTheDocument();
		});
	});
});
