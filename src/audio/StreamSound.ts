/** Сколько секунд нарастает/стихает звук, когда струя начинается/кончается. */
const FADE = 0.06;
/** Когда меняется, куда бьёт струя, тембр перетекает за это время, с. */
const TONE_FADE = 0.05;

/** Тембр звука по тому, куда бьёт струя: частота полосы, её ширина (Q) и громкость. */
const TONES = {
	/** Ещё летит — тихое шипение. */
	none: { freq: 2400, q: 0.6, volume: 0.015 },
	/** В воду — глухое бульканье. */
	water: { freq: 700, q: 1.6, volume: 0.08 },
	/** В стену, пол, сиденье — шлепки с шипением, звонче. */
	hard: { freq: 3200, q: 0.8, volume: 0.05 },
} as const;

/** Звук струи: закольцованный шум через полосовой фильтр; «бульканье» — дрожание полосы. Без файлов. */
export class StreamSound {
	private ctx: AudioContext | null = null;
	private gain: GainNode | null = null;
	private filter: BiquadFilterNode | null = null;
	private flowing = false;

	private _context(): AudioContext {
		if (!this.ctx) {
			const ctx = new AudioContext();
			this.ctx = ctx;
			const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
			const data = buffer.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
			const noise = ctx.createBufferSource();
			noise.buffer = buffer;
			noise.loop = true;
			this.filter = ctx.createBiquadFilter();
			this.filter.type = 'bandpass';
			// Бульканье: полоса быстро и неровно гуляет по высоте.
			for (const [rate, depth] of [
				[7, 160],
				[13.3, 90],
			]) {
				const lfo = ctx.createOscillator();
				lfo.frequency.value = rate;
				const lfoGain = ctx.createGain();
				lfoGain.gain.value = depth;
				lfo.connect(lfoGain);
				lfoGain.connect(this.filter.frequency);
				lfo.start();
			}
			this.gain = ctx.createGain();
			this.gain.gain.value = 0;
			noise.connect(this.filter);
			this.filter.connect(this.gain);
			this.gain.connect(ctx.destination);
			noise.start();
		}
		return this.ctx;
	}

	/** Каждый кадр: active — льётся ли, hitting — куда бьёт (см. PeeStream.hitting). */
	update(active: boolean, hitting: keyof typeof TONES): void {
		if (!active && !this.flowing) return;
		const ctx = this._context();
		if (ctx.state === 'suspended') void ctx.resume();
		const t = ctx.currentTime;
		const tone = TONES[hitting];
		this.filter!.frequency.setTargetAtTime(tone.freq, t, TONE_FADE);
		this.filter!.Q.setTargetAtTime(tone.q, t, TONE_FADE);
		this.gain!.gain.setTargetAtTime(active ? tone.volume : 0, t, active ? TONE_FADE : FADE);
		this.flowing = active;
	}
}
