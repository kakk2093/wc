/**
 * Лёгкий жуткий фон финала (комната с телевизором), процедурно — без файлов. Постоянно: низкий гул из двух почти одинаковых нот
 * (медленно «бьются» друг о друга), тёмный пилообразный бас с плывущим фильтром, глухой шум-ветер и тонкий
 * высокий диссонанс. Поверх, через случайные промежутки, — редкие события с эхом: протяжный «стон», далёкий
 * металлический лязг, пара глухих ударов, как сердце.
 */

const MASTER_VOLUME = 0.22;
const FADE_IN = 3;
/** Между событиями, с. */
const EVENT_MIN = 3;
const EVENT_MAX = 7;
/** Ноты стона — полутона рядом, чтобы резало. */
const MOAN_NOTES = [185.0, 196.0, 207.65, 277.18];

export class DreadAmbient {
	private ctx: AudioContext | null = null;
	/** Сюда подключаются события: сухой сигнал плюс эхо. */
	private events: GainNode | null = null;
	private playing = false;

	/** Заглушить насовсем (ушли в другое место): звук просто останавливается. */
	stop(): void {
		void this.ctx?.suspend();
	}

	start(): void {
		if (this.playing) return;
		this.playing = true;
		const ctx = (this.ctx = new AudioContext());
		if (ctx.state === 'suspended') void ctx.resume();
		const t = ctx.currentTime;

		const master = ctx.createGain();
		master.gain.setValueAtTime(0.0001, t);
		master.gain.linearRampToValueAtTime(MASTER_VOLUME, t + FADE_IN);
		master.connect(ctx.destination);

		// Эхо для событий: задержка с обратной связью, каждое повторение глуше.
		this.events = ctx.createGain();
		this.events.connect(master);
		const delay = ctx.createDelay(1);
		delay.delayTime.value = 0.47;
		const feedback = ctx.createGain();
		feedback.gain.value = 0.5;
		const damp = ctx.createBiquadFilter();
		damp.type = 'lowpass';
		damp.frequency.value = 1400;
		this.events.connect(delay);
		delay.connect(damp);
		damp.connect(feedback);
		feedback.connect(delay);
		damp.connect(master);

		this._drone(master);
		this._wind(master);
		this._shimmer(master);
		this._scheduleEvent();
	}

	/** Гул: две низкие синусоиды в полутоне друг от друга «бьются», под ними — пила через тёмный фильтр, который медленно дышит. */
	private _drone(out: AudioNode): void {
		const ctx = this.ctx!;
		for (const [freq, level] of [
			[43.65, 0.5],
			[46.25, 0.4],
		] as const) {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq;
			const gain = ctx.createGain();
			gain.gain.value = level;
			osc.connect(gain);
			gain.connect(out);
			osc.start();
		}
		const saw = ctx.createOscillator();
		saw.type = 'sawtooth';
		saw.frequency.value = 87.3;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 160;
		filter.Q.value = 6;
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 0.05;
		const lfoDepth = ctx.createGain();
		lfoDepth.gain.value = 90;
		lfo.connect(lfoDepth);
		lfoDepth.connect(filter.frequency);
		const gain = ctx.createGain();
		gain.gain.value = 0.18;
		saw.connect(filter);
		filter.connect(gain);
		gain.connect(out);
		saw.start();
		lfo.start();
	}

	/** Глухой ветер: зацикленный шум в широкой низкой полосе, громкость медленно накатывает и отступает. */
	private _wind(out: AudioNode): void {
		const ctx = this.ctx!;
		const length = ctx.sampleRate * 3;
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		noise.loop = true;
		const band = ctx.createBiquadFilter();
		band.type = 'bandpass';
		band.frequency.value = 320;
		band.Q.value = 0.8;
		const gain = ctx.createGain();
		gain.gain.value = 0.12;
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 0.07;
		const lfoDepth = ctx.createGain();
		lfoDepth.gain.value = 0.09;
		lfo.connect(lfoDepth);
		lfoDepth.connect(gain.gain);
		noise.connect(band);
		band.connect(gain);
		gain.connect(out);
		noise.start();
		lfo.start();
	}

	/** Тонкий высокий диссонанс на грани слышимости, с медленным дрожанием громкости. */
	private _shimmer(out: AudioNode): void {
		const ctx = this.ctx!;
		const gain = ctx.createGain();
		gain.gain.value = 0.012;
		const tremolo = ctx.createOscillator();
		tremolo.frequency.value = 0.3;
		const depth = ctx.createGain();
		depth.gain.value = 0.01;
		tremolo.connect(depth);
		depth.connect(gain.gain);
		for (const freq of [1864.7, 1975.5]) {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq;
			osc.connect(gain);
			osc.start();
		}
		gain.connect(out);
		tremolo.start();
	}

	private _scheduleEvent(): void {
		if (!this.playing) return;
		const wait = EVENT_MIN + Math.random() * (EVENT_MAX - EVENT_MIN);
		window.setTimeout(() => {
			const roll = Math.random();
			if (roll < 0.45) this._moan();
			else if (roll < 0.8) this._clank();
			else this._heartbeat();
			this._scheduleEvent();
		}, wait * 1000);
	}

	/** Протяжный стон: треугольная волна медленно нарастает и сползает вниз, через «гласную» полосу. */
	private _moan(): void {
		const ctx = this.ctx!;
		const t = ctx.currentTime + 0.05;
		const duration = 5 + Math.random() * 3;
		const freq = MOAN_NOTES[Math.floor(Math.random() * MOAN_NOTES.length)];
		const osc = ctx.createOscillator();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(freq, t);
		osc.frequency.exponentialRampToValueAtTime(freq * 0.93, t + duration);
		const vibrato = ctx.createOscillator();
		vibrato.frequency.value = 4.5;
		const vibratoDepth = ctx.createGain();
		vibratoDepth.gain.value = freq * 0.006;
		vibrato.connect(vibratoDepth);
		vibratoDepth.connect(osc.frequency);
		const vowel = ctx.createBiquadFilter();
		vowel.type = 'bandpass';
		vowel.frequency.value = 600;
		vowel.Q.value = 3;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.35, t + duration * 0.45);
		gain.gain.linearRampToValueAtTime(0.0001, t + duration);
		osc.connect(vowel);
		vowel.connect(gain);
		gain.connect(this.events!);
		osc.start(t);
		vibrato.start(t);
		osc.stop(t + duration + 0.1);
		vibrato.stop(t + duration + 0.1);
	}

	/** Далёкий лязг металла: щелчок через пару низких узких резонансов, долгий хвост — в эхе. */
	private _clank(): void {
		const ctx = this.ctx!;
		const t = ctx.currentTime + 0.05;
		const hit = this._noise(0.03);
		for (const [freq, level, decay] of [
			[180 + Math.random() * 120, 0.9, 1.2],
			[410 + Math.random() * 200, 0.5, 0.8],
		] as const) {
			const ring = ctx.createBiquadFilter();
			ring.type = 'bandpass';
			ring.frequency.value = freq;
			ring.Q.value = 30;
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(level * 4, t);
			gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
			hit.connect(ring);
			ring.connect(gain);
			gain.connect(this.events!);
		}
		hit.start(t);
	}

	/** Два глухих удара, как сердце. */
	private _heartbeat(): void {
		const ctx = this.ctx!;
		const t = ctx.currentTime + 0.05;
		for (const [delay, level] of [
			[0, 0.6],
			[0.28, 0.4],
		] as const) {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.setValueAtTime(70, t + delay);
			osc.frequency.exponentialRampToValueAtTime(38, t + delay + 0.18);
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(0.0001, t + delay);
			gain.gain.linearRampToValueAtTime(level, t + delay + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.3);
			osc.connect(gain);
			gain.connect(this.events!);
			osc.start(t + delay);
			osc.stop(t + delay + 0.35);
		}
	}

	private _noise(duration: number): AudioBufferSourceNode {
		const ctx = this.ctx!;
		const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		return source;
	}
}
