/** Звуки действий: их играет Game (через Sfx), сами места о звуке не знают. */
export type InteractionSound = 'tray' | 'bread' | 'dish' | 'card';

/** Имя героя в окне диалога: его имени игра не называет. */
export const PLAYER_NAME = '???';

/** Чьим голосом «говорит» реплика — от этого зависит писк при печати текста. */
export type Voice = 'dinnerLady' | 'cashier' | 'player' | 'toiletMan';

export interface DialogueLine {
	speaker: string;
	text: string;
	voice: Voice;
	/** Хвост реплики, который после напечатанного text появляется разом — со сбоем картинки и звука. */
	glitch?: string;
	/** Не допечатывать по ЛКМ: реплику можно только дождаться. */
	noSkip?: boolean;
	/** Закрывается сама: через столько секунд после того, как допечатана (ЛКМ не нужна; для катсцен). */
	autoClose?: number;
}

/** Разговор: реплики по очереди, onEnd — когда игрок закрыл последнюю. */
export interface Dialogue {
	lines: DialogueLine[];
	onEnd?: () => void;
	/** Звук после разговора (например, оплата картой). */
	endSound?: InteractionSound;
}

/** Поза камеры в катсцене: где глаза и куда смотрим. */
export interface CameraPose {
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
}

/** Куда сесть: точка на полу (над табуреткой), куда смотреть и высота глаз сидя. */
export interface Seat {
	x: number;
	z: number;
	yaw: number;
	eyeY: number;
}

/** Что можно сделать рядом с игроком: подсказка на экране и действие по E. */
export interface Interaction {
	/** С run или dialogue показывается как «E — text», без них — просто подсказка (действие пока недоступно). */
	text: string;
	run?: () => void;
	/** По E начинается разговор (вместо run). */
	dialogue?: Dialogue;
	sound?: InteractionSound;
}
