import { PLAYER_NAME, type Dialogue } from './Interaction.js';

/** Мысли героя на старте у доски: запускаются, когда сошла жёлтая заливка. */
export const INTRO: Dialogue = {
	lines: [
		{ speaker: PLAYER_NAME, voice: 'player', text: 'Обосссал туалет...' },
		{ speaker: PLAYER_NAME, voice: 'player', text: 'Теперь ты доволен...' },
		{ speaker: PLAYER_NAME, voice: 'player', text: '...' },
		{ speaker: PLAYER_NAME, voice: 'player', text: 'Думаю еще нет' },
	],
};
