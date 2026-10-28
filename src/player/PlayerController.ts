import * as THREE from 'three';
import type { Input } from '../core/Input.js';
import type { CircleColliders } from '../physics/CircleColliders.js';

const WALK_SPEED = 2.2;
const SPRINT_SPEED = 4.5;
const EYE_HEIGHT = 1.7;
const RADIUS = 0.35;
const GRAVITY = 20;
const JUMP_SPEED = 7;
/** Пройденный по земле путь между шагами, м: шагом — короче, бегом — шире. */
const STEP_LENGTH = 1.1;
const SPRINT_STEP_LENGTH = 1.6;
/** Максимальный спуск за кадр, при котором игрок «прилипает» к земле, а не падает. */
const STEP_DOWN = 0.5;
const MOUSE_SENSITIVITY = 0.002;
const MAX_PITCH = Math.PI / 2 - 0.01;
/** Покачивание при ходьбе: подъём глаз к середине шага (м) и крен в сторону шагающей ноги (рад); бегом — сильнее. */
const BOB_HEIGHT = 0.03;
const SPRINT_BOB_HEIGHT = 0.045;
const BOB_ROLL = 0.006;
/** Тряска от выстрела: подброс взгляда вверх (рад) и дрожь (рад) при силе 1; за сколько секунд затихает. */
const SHAKE_KICK = 0.05;
const SHAKE_JITTER = 0.012;
const SHAKE_TIME = 0.35;
/** Как быстро покачивание нарастает, когда пошёл, и затихает, когда встал (1/с). */
const BOB_BLEND = 8;
/** Как быстро взгляд доворачивается к цели в катсцене (1/с). */
const LOOK_TURN = 3;
/** Плавание: скорость, м/с (с Shift — быстрее); как быстро набирает и гасит скорость вода, 1/с; медленное погружение без гребков, м/с. */
const SWIM_SPEED = 2;
const SWIM_FAST = 3.2;
const SWIM_DRAG = 2.2;
const SINK_SPEED = 0.15;
/** Как низко над дном могут быть глаза, м. */
const SWIM_FLOOR_GAP = 0.6;
/** Размах покачивания течением, рад. */
const UNDERWATER_SWAY = 0.02;
/** Фаза гребка: сколько радиан за метр пути и сколько — на месте (руки шевелятся, держась в воде), рад/с. */
const STROKE_PER_METER = 2.4;
const STROKE_IDLE = 1.6;

export interface Ground {
	getHeightAt(x: number, z: number): number;
}

/** Контроллер от первого лица: WASD/Shift — движение, Space — прыжок, мышь — обзор. */
export class PlayerController {
	yaw = 0;
	pitch = 0;
	velocityY = 0;
	grounded = true;
	/** Стоим на месте (у унитаза): мышь крутит взгляд, ходьба и прыжок не работают. */
	rooted = false;
	/**
	 * Под водой: не ходим, а плывём — W/S по взгляду (и вверх-вниз, куда смотришь), A/D вбок, Space — вверх, C — вниз;
	 * взгляд слегка покачивает течением. Выше swimCeiling (глаза) не всплыть.
	 */
	underwater = false;
	swimCeiling = Infinity;
	/**
	 * Размер игрока: 1 — человек, меньше — во столько раз ниже глаза, уже «тело» и шаг покачивания. Скорость, шаг
	 * и прыжок — пропорционально корню из размера: жук бегает медленнее человека, но не ползёт.
	 */
	size = 1;
	/** Фаза гребка (для рук) и насколько сильно сейчас гребём, 0..1. */
	strokePhase = 0;
	swimEffort = 0;
	private readonly swimVelocity = new THREE.Vector3();
	private readonly swimTarget = new THREE.Vector3();
	private readonly lookDir = new THREE.Vector3();
	/** Время для покачивания под водой, с. */
	private swayTime = 0;
	/** Вызывается на каждом шаге по земле; loud > 1 — бег или приземление. */
	onStep: ((loud: number) => void) | null = null;
	/** Направление взгляда в плоскости XZ (нормированное). */
	readonly forward = new THREE.Vector3(0, 0, -1);
	private stepDistance = 0;
	/** Высота глаз сидя; null — стоим. Сидя камера неподвижна: взгляд — на стол, пока не встанешь. */
	private seatedEyeY: number | null = null;
	private readonly move = new THREE.Vector3();
	/** Фаза шага: +π за шаг (футфолы — на кратных π, как и звук шага); сила покачивания 0..1 и его размах. */
	bobPhase = 0;
	bobWeight = 0;
	private bobHeight = BOB_HEIGHT;
	/** Сила тряски 0..1 — поверх взгляда, сам yaw/pitch не меняет (прицел после тряски на месте). */
	private shakeAmount = 0;

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly input: Input,
		/** Не readonly: у подводного уровня дно неровное — Game подставляет его. */
		public ground: Ground,
		/** Не readonly: при смене сцены (офис/улица) Game подставляет свой набор коллайдеров. */
		public colliders: CircleColliders
	) {
		this.camera.rotation.order = 'YXZ';
	}

	/** Поставить игрока в точку (x, z) на землю и повернуть на yaw. */
	spawn(x: number, z: number, yaw: number): void {
		this.camera.position.set(x, 0, z);
		this.camera.position.y = this._groundEyeY();
		this.yaw = yaw;
		this.pitch = 0;
		this.velocityY = 0;
		this.grounded = true;
		this._applyRotation();
	}

	/** Сесть: камера над табуреткой на высоте eyeY, взгляд — по yaw и чуть вниз, на стол. */
	sit(x: number, z: number, yaw: number, eyeY: number): void {
		this.camera.position.set(x, eyeY, z);
		this.seatedEyeY = eyeY;
		this.yaw = yaw;
		this.pitch = -0.45;
		this.velocityY = 0;
		this.grounded = true;
		this._applyRotation();
	}

	/** Катсцена: поставить глаза и взгляд напрямую (сидя — мышь и ходьба и так не работают). */
	setPose(x: number, y: number, z: number, yaw: number, pitch: number): void {
		this.camera.position.set(x, y, z);
		this.yaw = yaw;
		this.pitch = pitch;
		this._applyRotation();
	}

	/**
	 * Катсцена на ногах: стоим на месте (на земле), взгляд плавно поворачивается к точке target; мышь и ходьба
	 * не работают, тряска затихает как обычно. После — управление продолжается с того взгляда, где остановились.
	 */
	lookToward(target: THREE.Vector3, dt: number): void {
		this.shakeAmount = Math.max(0, this.shakeAmount - dt / SHAKE_TIME);
		this.bobWeight += (0 - this.bobWeight) * (1 - Math.exp(-dt * BOB_BLEND));
		const pos = this.camera.position;
		pos.y = this._groundEyeY();
		this.velocityY = 0;
		this.grounded = true;
		const dx = target.x - pos.x;
		const dz = target.z - pos.z;
		const yaw = Math.atan2(-dx, -dz);
		const pitch = THREE.MathUtils.clamp(Math.atan2(target.y - pos.y, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH);
		// Поворот — по кратчайшей дуге.
		const k = 1 - Math.exp(-dt * LOOK_TURN);
		this.yaw += (THREE.MathUtils.euclideanModulo(yaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI) * k;
		this.pitch += (pitch - this.pitch) * k;
		this._applyRotation();
	}

	/** Встать в точке (x, z), взгляд — прежний. */
	stand(x: number, z: number): void {
		this.seatedEyeY = null;
		const pitch = this.pitch;
		this.spawn(x, z, this.yaw);
		this.pitch = pitch;
		this._applyRotation();
	}

	/** Тряхнуть камеру (выстрел): strength 1 — полная. */
	shake(strength = 1): void {
		this.shakeAmount = Math.max(this.shakeAmount, strength);
	}

	update(dt: number): void {
		this.shakeAmount = Math.max(0, this.shakeAmount - dt / SHAKE_TIME);
		this.swayTime += dt;
		this._updateLook();
		if (this.seatedEyeY !== null || this.rooted) return;
		if (this.underwater) {
			this._updateSwim(dt);
			return;
		}
		this._updateMovement(dt);
		this._updateVertical(dt);
	}

	private _groundEyeY(): number {
		const { x, z } = this.camera.position;
		return this.ground.getHeightAt(x, z) + EYE_HEIGHT * this.size;
	}

	/** Смещение глаз от покачивания сейчас (м): внизу — в момент шага, выше всего — в середине. */
	private _bobY(): number {
		return Math.abs(Math.sin(this.bobPhase)) * this.bobHeight * this.bobWeight;
	}

	private _applyRotation(): void {
		// Лёгкий крен в такт шагам: в сторону то одной, то другой ноги.
		// Тряска: взгляд подбрасывает вверх и он возвращается, плюс мелкая дрожь; квадрат — резкий толчок, мягкий спад.
		const shake = this.shakeAmount * this.shakeAmount;
		// Под водой — медленное покачивание течением (поверх взгляда, сам yaw/pitch не трогает).
		const sway = this.underwater ? UNDERWATER_SWAY : 0;
		const t = this.swayTime;
		const jitter = () => (Math.random() * 2 - 1) * SHAKE_JITTER * shake;
		this.camera.rotation.set(
			this.pitch + shake * SHAKE_KICK + jitter() + Math.sin(t * 0.9) * sway * 0.5,
			this.yaw + jitter() + Math.sin(t * 0.6 + 1) * sway * 0.4,
			Math.sin(this.bobPhase) * BOB_ROLL * this.bobWeight + jitter() + Math.sin(t * 0.7) * sway
		);
		this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
	}

	private _updateVertical(dt: number): void {
		const pos = this.camera.position;

		if (this.grounded && this.input.isDown('Space')) {
			this.velocityY = JUMP_SPEED * this._pace();
			this.grounded = false;
		}

		if (this.grounded) {
			// Идём по земле: липнем к ней при небольшом спуске, иначе начинаем падать.
			const targetY = this._groundEyeY();
			if (pos.y - targetY - this._bobY() <= STEP_DOWN * this.size) {
				pos.y = targetY + this._bobY();
				return;
			}
			this.grounded = false;
			this.velocityY = 0;
		}

		this.velocityY -= GRAVITY * dt;
		pos.y += this.velocityY * dt;

		const groundY = this._groundEyeY();
		if (pos.y <= groundY && this.velocityY <= 0) {
			// Приземление — громкий шаг.
			if (this.velocityY < -3) this.onStep?.(1.6);
			pos.y = groundY;
			this.velocityY = 0;
			this.grounded = true;
		}
	}

	private _updateLook(): void {
		const mouse = this.input.consumeMouseDelta();
		// Сидя мышь не поворачивает камеру (движение сбрасываем, чтобы не было рывка, когда встанешь).
		if (this.seatedEyeY !== null) return;
		this.yaw -= mouse.x * MOUSE_SENSITIVITY;
		this.pitch -= mouse.y * MOUSE_SENSITIVITY;
		this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
		this._applyRotation();
	}

	private _updateMovement(dt: number): void {
		const { input } = this;
		const pos = this.camera.position;
		const startX = pos.x;
		const startZ = pos.z;
		const forward = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
		const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);

		if (forward !== 0 || strafe !== 0) {
			const speed = (input.isDown('ShiftLeft') ? SPRINT_SPEED : WALK_SPEED) * this._pace();
			// Движение только в горизонтальной плоскости, направление — по yaw.
			this.move.set(strafe, 0, -forward).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
			pos.x += this.move.x * speed * dt;
			pos.z += this.move.z * speed * dt;
		}

		this.colliders.resolve(pos, RADIUS * this.size);

		// Шаги считаем по реально пройденному пути (упор в препятствие не даёт шагов).
		const moved = Math.hypot(pos.x - startX, pos.z - startZ);
		const sprint = input.isDown('ShiftLeft');
		if (this.grounded) {
			const stepLength = (sprint ? SPRINT_STEP_LENGTH : STEP_LENGTH) * this._pace();
			this.stepDistance += moved;
			this.bobPhase += (moved / stepLength) * Math.PI;
			if (this.stepDistance >= stepLength) {
				this.stepDistance -= stepLength;
				this.onStep?.(sprint ? 1.3 : 1);
			}
		}
		// Покачивание — только пока идём по земле; остановился или в прыжке — плавно затихает.
		const walking = this.grounded && moved > 0.0005;
		this.bobWeight += ((walking ? 1 : 0) - this.bobWeight) * (1 - Math.exp(-dt * BOB_BLEND));
		this.bobHeight += ((sprint ? SPRINT_BOB_HEIGHT : BOB_HEIGHT) * this.size - this.bobHeight) * (1 - Math.exp(-dt * BOB_BLEND));
		this._applyRotation();
	}

	/** Плавание: скорость тянется к желаемой (вода — инерция), без гребков медленно тонем; дно и «потолок» не пускают. */
	private _updateSwim(dt: number): void {
		const { input } = this;
		const pos = this.camera.position;
		const forward = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
		const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
		const rise = (input.isDown('Space') ? 1 : 0) - (input.isDown('KeyC') || input.isDown('ControlLeft') ? 1 : 0);
		// Вперёд — по взгляду целиком (смотришь вниз — плывёшь вниз), вбок — по горизонтали.
		this.lookDir.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
		this.swimTarget.copy(this.lookDir).multiplyScalar(forward);
		this.swimTarget.x += Math.cos(this.yaw) * strafe;
		this.swimTarget.z -= Math.sin(this.yaw) * strafe;
		this.swimTarget.y += rise;
		const effort = Math.min(1, this.swimTarget.length());
		if (effort > 0) this.swimTarget.normalize().multiplyScalar(input.isDown('ShiftLeft') ? SWIM_FAST : SWIM_SPEED);
		else this.swimTarget.set(0, -SINK_SPEED, 0);
		this.swimVelocity.lerp(this.swimTarget, 1 - Math.exp(-dt * SWIM_DRAG));
		pos.addScaledVector(this.swimVelocity, dt);
		this.colliders.resolve(pos, RADIUS);

		const floor = this.ground.getHeightAt(pos.x, pos.z) + SWIM_FLOOR_GAP;
		if (pos.y < floor) {
			pos.y = floor;
			this.swimVelocity.y = Math.max(0, this.swimVelocity.y);
		}
		if (pos.y > this.swimCeiling) {
			pos.y = this.swimCeiling;
			this.swimVelocity.y = Math.min(0, this.swimVelocity.y);
		}

		// Руки: гребок тем быстрее, чем быстрее плывём; на месте — медленно «держатся» в воде.
		this.swimEffort += (effort - this.swimEffort) * (1 - Math.exp(-dt * 4));
		this.strokePhase += (this.swimVelocity.length() * STROKE_PER_METER + STROKE_IDLE * (1 - this.swimEffort)) * dt;
		this.bobWeight = 0;
		this._applyRotation();
	}

	/** Множитель скорости, длины шага и прыжка от размера (см. size). */
	private _pace(): number {
		return Math.sqrt(this.size);
	}
}
