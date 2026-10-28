/** Lo-fi на 120 уд/мин: мягкие септаккорды, бас, приглушённые барабаны вполсилы и треск пластинки — без файлов.
 * В громком режиме (setIntense) — тот же трек плотнее: полный ход барабанов, ходячий бас, арпеджио. */

/** Темп и сетка. Ход «вполсилы»: малый — на третью долю, а не на каждую вторую — спокойнее, чем обычные 120. */
const BPM = 120;
const BEAT = 60 / BPM;
const BEATS_PER_BAR = 4;
/** Свинг восьмых: вторая восьмая в доле чуть запаздывает, с. */
const SWING = 0.06;
/** Планировщик: как часто заглядывать вперёд и на сколько секунд расписывать ноты заранее. */
const TICK_MS = 25;
const LOOKAHEAD = 0.15;
const MASTER_VOLUME = 0.22;
/** Общий «тёплый» срез верхов — главное, что делает звук «lo-fi». */
const MASTER_CUTOFF = 2600;

/** Громкий режим: во сколько раз громче и насколько открыт верх, Гц. */
const INTENSE_GAIN = 1.7;
const INTENSE_CUTOFF = 5500;
/** Рисунки бочки по тактам (номера восьмых в такте). */
const KICKS = [
	[0, 3, 4],
	[0, 3, 5],
	[0, 3, 4, 7],
	[0, 2, 3, 4],
];
/** Ход баса восьмыми: множитель к басу аккорда (1 — основной тон, 1.5 — квинта, 2 — октава); 0 — пауза. */
const BASS_WALK = [
	[1, 0, 1, 1.5, 2, 0, 1.5, 1],
	[1, 1, 0, 1.5, 1, 2, 1.5, 1.335],
	[1, 0, 2, 1, 1.5, 0, 1, 1.5],
	[1, 1.5, 2, 1.5, 1, 0, 1.335, 1.5],
];

interface Chord {
	/** Ноты аккорда, Гц. */
	notes: number[];
	/** Бас, Гц. */
	bass: number;
}

/** Fmaj9 — Em7 — Dm9 — Cmaj7: по такту на аккорд, по кругу. */
const CHORDS: Chord[] = [
	{ notes: [174.61, 220.0, 261.63, 329.63, 392.0], bass: 87.31 },
	{ notes: [164.81, 196.0, 246.94, 293.66], bass: 82.41 },
	{ notes: [146.83, 174.61, 220.0, 261.63, 329.63], bass: 73.42 },
	{ notes: [130.81, 164.81, 196.0, 246.94], bass: 65.41 },
];

export class LofiMusic {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private lowpass: BiquadFilterNode | null = null;
	/** Отдельное звено громкости поверх master — его двигает setFade, не трогая нарастание и громкий режим. */
	private fade: GainNode | null = null;
	/** Громкий режим — см. setIntense. */
	private intense = false;
	private noise: AudioBuffer | null = null;
	private timer: number | null = null;
	/** Время (по часам AudioContext) следующей восьмой и её номер с начала. */
	private nextTime = 0;
	private step = 0;

	private _context(): AudioContext {
		if (!this.ctx) {
			const ctx = new AudioContext();
			this.ctx = ctx;
			const lowpass = ctx.createBiquadFilter();
			lowpass.type = 'lowpass';
			lowpass.frequency.value = MASTER_CUTOFF;
			lowpass.Q.value = 0.5;
			this.lowpass = lowpass;
			this.master = ctx.createGain();
			this.master.gain.value = 0;
			this.master.connect(lowpass);
			this.fade = ctx.createGain();
			lowpass.connect(this.fade);
			this.fade.connect(ctx.destination);
			const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
			const data = buffer.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
			this.noise = buffer;
		}
		return this.ctx;
	}

	/** Запустить (только из жеста пользователя — иначе браузер не даст звук). Громкость нарастает плавно. */
	start(): void {
		if (this.timer !== null) return;
		const ctx = this._context();
		if (ctx.state === 'suspended') void ctx.resume();
		const gain = this.master!.gain;
		gain.cancelScheduledValues(ctx.currentTime);
		gain.setValueAtTime(gain.value, ctx.currentTime);
		gain.linearRampToValueAtTime(MASTER_VOLUME, ctx.currentTime + 2);
		this.nextTime = ctx.currentTime + 0.1;
		this.step = 0;
		this._crackle();
		this.timer = window.setInterval(() => this._schedule(), TICK_MS);
	}

	/** Расписать все восьмые, что попадают в ближайшие LOOKAHEAD секунд. */
	private _schedule(): void {
		const ctx = this.ctx!;
		while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
			this._playStep(this.step, this.nextTime + (this.step % 2 === 1 ? SWING : 0));
			this.nextTime += BEAT / 2;
			this.step++;
		}
	}

	/**
	 * Громче и плотнее (там, куда утащили): тот же темп и аккорды, но открыт верх, бочка и малый — в полный ход
	 * со сбивками, хэты шестнадцатыми, бас ходит восьмыми, сверху — арпеджио; каждые 4 такта — брейк малым.
	 */
	setIntense(on: boolean): void {
		if (on === this.intense) return;
		this.intense = on;
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const gain = this.master!.gain;
		gain.cancelScheduledValues(t);
		gain.setValueAtTime(gain.value, t);
		gain.linearRampToValueAtTime(on ? MASTER_VOLUME * INTENSE_GAIN : MASTER_VOLUME, t + 1.5);
		this.lowpass!.frequency.setTargetAtTime(on ? INTENSE_CUTOFF : MASTER_CUTOFF, t, 0.5);
	}

	/** Оборвать музыку разом — без затухания: тишина и больше ни одной ноты (start запустит заново). */
	cut(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		if (!this.ctx) return;
		const gain = this.master!.gain;
		gain.cancelScheduledValues(this.ctx.currentTime);
		gain.setValueAtTime(0, this.ctx.currentTime);
	}

	/** Приглушить: 1 — как есть, 0 — тишина (например, в глубине расщелины). Меняется плавно, можно звать каждый кадр. */
	setFade(volume: number): void {
		if (!this.ctx) return;
		this.fade!.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.2);
	}

	/** Одна восьмая: step — номер с начала, t — когда играть. */
	private _playStep(step: number, t: number): void {
		const eighth = step % (BEATS_PER_BAR * 2);
		const bar = Math.floor(step / (BEATS_PER_BAR * 2));
		const chord = CHORDS[bar % CHORDS.length];
		if (this.intense) {
			this._playIntenseStep(eighth, bar, chord, t);
			return;
		}
		// Барабаны: бочка — на 1 и на «и» второй доли, малый — на 3, тихие хэты — на каждую восьмую.
		if (eighth === 0 || eighth === 3) this._kick(t);
		if (eighth === 4) this._snare(t);
		this._hat(t, eighth % 2 === 0 ? 1 : 0.6);
		// Аккорд — на первую долю, лёгкий повтор — на «и» третьей; бас — на 1 и на «и» второй.
		if (eighth === 0) this._chord(chord, t, BEAT * 3, 1);
		if (eighth === 5) this._chord(chord, t, BEAT * 1.4, 0.55);
		if (eighth === 0 || eighth === 3) this._bass(chord.bass, t, eighth === 0 ? BEAT * 1.4 : BEAT * 2.4);
	}

	/** Восьмая в громком режиме: eighth — номер в такте, bar — номер такта (по нему — сбивки и брейки). */
	private _playIntenseStep(eighth: number, bar: number, chord: Chord, t: number): void {
		const fill = bar % 4 === 3 && eighth >= 6;
		const sixteenth = BEAT / 4;
		// Бочка: рисунок меняется от такта к такту.
		if (KICKS[bar % KICKS.length].includes(eighth) && !fill) this._kick(t);
		// Малый — на 2 и 4, иногда тихий «призрак» перед четвёртой; в конце каждых 4 тактов — дробь шестнадцатыми.
		if (fill) {
			this._snare(t, 0.7);
			this._snare(t + sixteenth, 0.85);
		} else {
			if (eighth === 2 || eighth === 6) this._snare(t, 1);
			if (eighth === 5 && Math.random() < 0.5) this._snare(t + sixteenth, 0.3);
		}
		// Хэты шестнадцатыми: на долю громче; на «и» последней доли — открытый.
		if (eighth === 7) this._openHat(t);
		else {
			this._hat(t, eighth % 2 === 0 ? 1.4 : 1);
			this._hat(t + sixteenth, 0.6);
		}
		// Аккорды: на 1 и короткие удары на «и» второй и на четвёртую.
		if (eighth === 0) this._chord(chord, t, BEAT * 1.5, 1);
		if (eighth === 3 || eighth === 6) this._chord(chord, t, BEAT * 0.6, 0.6);
		// Бас ходит восьмыми по ступеням аккорда; рисунок — свой у каждого такта из четырёх.
		const ratio = BASS_WALK[bar % BASS_WALK.length][eighth];
		if (ratio > 0) this._bass(chord.bass * ratio, t, BEAT * 0.45, true);
		// Арпеджио на октаву выше: вверх, вниз или вразброс — по такту.
		const notes = chord.notes;
		const arp = bar % 3;
		const i = arp === 0 ? eighth % notes.length : arp === 1 ? notes.length - 1 - (eighth % notes.length) : Math.floor(Math.random() * notes.length);
		if (bar % 8 >= 2) this._pluck(notes[i] * 2, t);
	}

	/** Короткий щипок для арпеджио: треугольник с быстрым затуханием. */
	private _pluck(freq: number, t: number): void {
		const ctx = this.ctx!;
		const osc = ctx.createOscillator();
		osc.type = 'triangle';
		osc.frequency.value = freq;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.045, t + 0.005);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
		osc.connect(gain);
		gain.connect(this.master!);
		osc.start(t);
		osc.stop(t + 0.25);
	}

	private _openHat(t: number): void {
		this._noiseHit(t, 'highpass', 6000, 0.7, 0.22, 0.05);
	}

	/** Мягкое электропиано: синус с треугольником чуть вразнобой по высоте, быстрый удар и долгое затухание. */
	private _chord(chord: Chord, t: number, length: number, level: number): void {
		const ctx = this.ctx!;
		chord.notes.forEach((freq, i) => {
			// Ноты чуть «раскатаны» — как пальцы по клавишам.
			const start = t + i * 0.012;
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.linearRampToValueAtTime(0.055 * level, start + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
			gain.connect(this.master!);
			for (const [type, detune, mix] of [
				['sine', -6, 1],
				['triangle', 7, 0.35],
			] as const) {
				const osc = ctx.createOscillator();
				osc.type = type;
				osc.frequency.value = freq;
				osc.detune.value = detune;
				const part = ctx.createGain();
				part.gain.value = mix;
				osc.connect(part);
				part.connect(gain);
				osc.start(start);
				osc.stop(start + length + 0.05);
			}
		});
	}

	/** Бас: синус; punchy — плюс пила через фильтр, который быстро закрывается, — упругий «щелчок» в начале ноты. */
	private _bass(freq: number, t: number, length: number, punchy = false): void {
		const ctx = this.ctx!;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.22, t + 0.015);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
		gain.connect(this.master!);
		const sub = ctx.createOscillator();
		sub.type = 'sine';
		sub.frequency.value = freq;
		sub.connect(gain);
		sub.start(t);
		sub.stop(t + length + 0.05);
		if (!punchy) return;
		const saw = ctx.createOscillator();
		saw.type = 'sawtooth';
		saw.frequency.value = freq;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.Q.value = 4;
		filter.frequency.setValueAtTime(900, t);
		filter.frequency.exponentialRampToValueAtTime(140, t + length);
		const mix = ctx.createGain();
		mix.gain.value = 0.35;
		saw.connect(filter);
		filter.connect(mix);
		mix.connect(gain);
		saw.start(t);
		saw.stop(t + length + 0.05);
	}

	/** Бочка: синус, быстро падающий по высоте. */
	private _kick(t: number): void {
		const ctx = this.ctx!;
		const osc = ctx.createOscillator();
		osc.frequency.setValueAtTime(110, t);
		osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.5, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
		osc.connect(gain);
		gain.connect(this.master!);
		osc.start(t);
		osc.stop(t + 0.4);
	}

	/** Малый: глухой шум через полосовой фильтр — как щётка, без резкого щелчка. */
	private _snare(t: number, level = 1): void {
		this._noiseHit(t, 'bandpass', 1500, 0.8, 0.16, 0.18 * level);
	}

	private _hat(t: number, level: number): void {
		this._noiseHit(t, 'highpass', 6500, 0.7, 0.04, 0.035 * level * (0.8 + Math.random() * 0.4));
	}

	private _noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, length: number, volume: number): void {
		const ctx = this.ctx!;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		const filter = ctx.createBiquadFilter();
		filter.type = type;
		filter.frequency.value = freq;
		filter.Q.value = q;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(this.master!);
		// Каждый удар — с разного места буфера, чтобы шум не повторялся.
		src.start(t, Math.random() * 0.8, length + 0.02);
	}

	/** Треск пластинки: закольцованный тихий шорох с редкими щелчками. */
	private _crackle(): void {
		const ctx = this.ctx!;
		const length = ctx.sampleRate * 3;
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) {
			data[i] = (Math.random() * 2 - 1) * 0.015;
			if (Math.random() < 0.0004) data[i] = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.4);
		}
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		src.loop = true;
		const filter = ctx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = 2200;
		filter.Q.value = 0.4;
		const gain = ctx.createGain();
		gain.gain.value = 0.35;
		src.connect(filter);
		filter.connect(gain);
		gain.connect(this.master!);
		src.start();
	}
}
