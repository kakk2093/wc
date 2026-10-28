import * as THREE from 'three';

/**
 * Лоуполи-руки игрока под водой: рукав рубашки от плеча до кисти и ладонь. Висят перед камерой (в её осях:
 * +X — вправо, +Y — вверх, −Z — вперёд). При плавании — брасс, на месте — медленно «держатся» в воде.
 */

const SLEEVE = '#dfe3ea';
const SKIN = '#d9b49a';
/** Плечи — за краем кадра снизу, оттуда руки и тянутся в кадр. */
const SHOULDER = new THREE.Vector3(0.2, -0.32, 0.05);
/**
 * Брасс — положение правой кисти по фазе гребка (u от 0 до 1; левая — зеркально): руки вместе впереди →
 * разводим в стороны → тянем назад и вниз → сводим под подбородком → снова вперёд.
 */
const STROKE: [number, THREE.Vector3][] = [
	[0, new THREE.Vector3(0.06, -0.12, -0.55)],
	[0.35, new THREE.Vector3(0.36, -0.1, -0.42)],
	[0.6, new THREE.Vector3(0.22, -0.2, -0.22)],
	[0.78, new THREE.Vector3(0.06, -0.18, -0.2)],
	[1, new THREE.Vector3(0.06, -0.12, -0.55)],
];
/** На месте: кисти описывают маленькие круги вокруг этой точки. */
const IDLE = new THREE.Vector3(0.18, -0.24, -0.36);
const IDLE_RADIUS = new THREE.Vector2(0.04, 0.03);
const FORWARD = new THREE.Vector3(0, 0, -1);
/** Пузыри: сколько всего, сколько живёт пузырь (с), сколько в секунду срывается с каждой кисти при гребке во всю. */
const BUBBLES = 80;
const BUBBLE_LIFE = 1.6;
const BUBBLE_RATE = 14;
/** Изо рта: раз в сколько секунд (в среднем) — горстка пузырей перед лицом. */
const BREATH_EVERY = 3.5;

interface Arm {
	side: number;
	sleeve: THREE.Mesh;
	hand: THREE.Mesh;
}

export class SwimArms {
	/** Добавить в сцену подводного уровня; каждый кадр встаёт туда же, куда камера (update). */
	readonly group = new THREE.Group();
	/** Пузыри — в мире, а не у камеры (тоже добавить в сцену): сорвались с руки — и всплывают сами. */
	readonly bubbles: THREE.Points;
	private readonly bubblePos = new Float32Array(BUBBLES * 3);
	private readonly bubbleAge = new Float32Array(BUBBLES).fill(BUBBLE_LIFE);
	private nextBubble = 0;
	/** Накопленная «доля» пузыря на каждую кисть и время до следующего выдоха. */
	private readonly emit = [0, 0];
	private breath = BREATH_EVERY;
	private readonly world = new THREE.Vector3();
	private readonly arms: Arm[] = [];
	private readonly target = new THREE.Vector3();
	private readonly idle = new THREE.Vector3();
	private readonly shoulder = new THREE.Vector3();
	private readonly dir = new THREE.Vector3();

	constructor() {
		// Рукав — коробка длиной 1 вдоль −Z от начала координат: растягиваем по Z до нужной длины.
		const sleeveGeometry = new THREE.BoxGeometry(0.08, 0.08, 1);
		sleeveGeometry.translate(0, 0, -0.5);
		const handGeometry = new THREE.BoxGeometry(0.075, 0.03, 0.12);
		handGeometry.translate(0, 0, -0.04);
		const sleeve = new THREE.MeshStandardMaterial({ color: SLEEVE, flatShading: true });
		const skin = new THREE.MeshStandardMaterial({ color: SKIN, flatShading: true });
		for (const side of [-1, 1]) {
			const arm: Arm = { side, sleeve: new THREE.Mesh(sleeveGeometry, sleeve), hand: new THREE.Mesh(handGeometry, skin) };
			this.group.add(arm.sleeve, arm.hand);
			this.arms.push(arm);
		}
		this.group.visible = false;

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(this.bubblePos, 3));
		this.bubbles = new THREE.Points(
			geometry,
			new THREE.PointsMaterial({ color: '#fff8d0', size: 0.025, transparent: true, opacity: 0.8, depthWrite: false })
		);
		this.bubbles.frustumCulled = false;
		// Пока пузыря нет — он далеко внизу, его не видно.
		for (let i = 0; i < BUBBLES; i++) this.bubblePos[i * 3 + 1] = -1000;
	}

	/** phase — фаза гребка (рад, растёт), effort — 0 (на месте) .. 1 (гребём во всю). */
	update(camera: THREE.Camera, phase: number, effort: number, dt: number): void {
		this.group.visible = true;
		this.group.position.copy(camera.position);
		this.group.quaternion.copy(camera.quaternion);
		const u = THREE.MathUtils.euclideanModulo(phase / (Math.PI * 2), 1);
		for (const arm of this.arms) {
			this._strokeAt(u, this.target);
			// Руки на месте — каждая крутит свой кружок, вразнобой с другой.
			const a = phase * 0.8 + (arm.side > 0 ? 0 : Math.PI);
			this.idle.set(IDLE.x + Math.cos(a) * IDLE_RADIUS.x, IDLE.y + Math.sin(a) * IDLE_RADIUS.y, IDLE.z);
			this.target.lerpVectors(this.idle, this.target, effort);
			this.target.x *= arm.side;
			this.shoulder.set(SHOULDER.x * arm.side, SHOULDER.y, SHOULDER.z);
			this.dir.subVectors(this.target, this.shoulder);
			const length = this.dir.length();
			this.dir.divideScalar(length);
			arm.sleeve.position.copy(this.shoulder);
			arm.sleeve.quaternion.setFromUnitVectors(FORWARD, this.dir);
			arm.sleeve.scale.set(1, 1, length);
			arm.hand.position.copy(this.target);
			arm.hand.quaternion.copy(arm.sleeve.quaternion);
		}
		this._updateBubbles(camera, effort, dt);
	}

	/** С кистей при гребке срываются пузыри, изредка — выдох перед лицом; все всплывают, виляя, и лопаются. */
	private _updateBubbles(camera: THREE.Camera, effort: number, dt: number): void {
		this.group.updateMatrixWorld();
		this.arms.forEach((arm, i) => {
			this.emit[i] += BUBBLE_RATE * effort * dt;
			while (this.emit[i] >= 1) {
				this.emit[i] -= 1;
				this._spawn(arm.hand.getWorldPosition(this.world), 0.03);
			}
		});
		this.breath -= dt * (0.5 + Math.random());
		if (this.breath <= 0) {
			this.breath = BREATH_EVERY;
			// Выдох: чуть ниже и впереди глаз.
			this.world.set(0, -0.12, -0.25).applyQuaternion(camera.quaternion).add(camera.position);
			for (let i = 0; i < 6; i++) this._spawn(this.world, 0.04);
		}
		for (let i = 0; i < BUBBLES; i++) {
			if (this.bubbleAge[i] >= BUBBLE_LIFE) continue;
			this.bubbleAge[i] += dt;
			const o = i * 3;
			if (this.bubbleAge[i] >= BUBBLE_LIFE) {
				this.bubblePos[o + 1] = -1000;
				continue;
			}
			this.bubblePos[o] += Math.sin(this.bubbleAge[i] * 9 + i) * 0.12 * dt;
			this.bubblePos[o + 1] += (0.5 + this.bubbleAge[i] * 0.6) * dt;
			this.bubblePos[o + 2] += Math.cos(this.bubbleAge[i] * 7 + i) * 0.12 * dt;
		}
		(this.bubbles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
	}

	/** Новый пузырь в точке at с разбросом spread (м) — на место самого старого. */
	private _spawn(at: THREE.Vector3, spread: number): void {
		const o = this.nextBubble * 3;
		this.bubblePos[o] = at.x + (Math.random() - 0.5) * spread;
		this.bubblePos[o + 1] = at.y + (Math.random() - 0.5) * spread;
		this.bubblePos[o + 2] = at.z + (Math.random() - 0.5) * spread;
		this.bubbleAge[this.nextBubble] = 0;
		this.nextBubble = (this.nextBubble + 1) % BUBBLES;
	}

	/** Положение правой кисти в брассе при фазе u (0..1): мягко между ключевыми точками. */
	private _strokeAt(u: number, out: THREE.Vector3): void {
		for (let i = 1; i < STROKE.length; i++) {
			const [u1, p1] = STROKE[i];
			if (u > u1) continue;
			const [u0, p0] = STROKE[i - 1];
			const k = (u - u0) / (u1 - u0);
			out.lerpVectors(p0, p1, (1 - Math.cos(k * Math.PI)) / 2);
			return;
		}
		out.copy(STROKE[0][1]);
	}
}
