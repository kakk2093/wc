import * as THREE from 'three';
import type { RoomBounds } from './Room.js';

/** Скорость вылета струи, м/с: хватает, чтобы снизу добить до потолка (~1.7 м вверх). */
const SPEED = 6.5;
const GRAVITY = 9.8;
/** Шаг расчёта дуги, с, и сколько шагов максимум (≈ 0.7 с полёта). */
const STEP = 0.012;
const MAX_STEPS = 60;
/** На сколько струя направлена выше взгляда, рад: смотришь в унитаз — в него и попадаешь. */
const AIM_LIFT = 0.2;
/** Круче этого вверх не бьёт — иначе струя перевалит назад, за голову. */
const MAX_AIM = Math.PI / 2 - 0.05;
/** Откуда бьёт: ниже глаз и чуть вперёд, м. */
const ORIGIN_DROP = 0.8;
const ORIGIN_FORWARD = 0.15;
/** Толщина струи (радиус), м. */
const RADIUS = 0.008;
/** Брызги на месте попадания: сколько капель, сколько живут (с), с какой скоростью разлетаются (м/с). */
const DROPS = 32;
const DROP_LIFE = 0.35;
const DROP_SPEED = 0.9;
const COLOR = '#f2d040';
/** Пятна там, куда попало (кроме воды в унитазе): остаются насовсем. Сколько всего (старые затираются новыми),
 * как часто ставим новое (с), разброс вокруг точки попадания и размер (м), насколько прозрачное одно пятно. */
const STAINS = 3000;
const STAIN_EVERY = 0.03;
const STAIN_SPREAD = 0.025;
const STAIN_MIN = 0.02;
const STAIN_MAX = 0.05;
const STAIN_OPACITY = 0.6;
const STAIN_COLOR = '#ffd21a';
/** Пятно чуть над поверхностью, чтобы не мерцало. */
const STAIN_LIFT = 0.002;
/** Куда смотрит лицо круга-пятна до поворота. */
const STAIN_FACE = new THREE.Vector3(0, 0, 1);

/** Что струе надо знать о комнате. */
export interface StreamWorld {
	readonly bounds: RoomBounds;
	/** Высота потолка. */
	readonly ceiling: number;
	/** Высота, ниже которой струя упирается (пол, сантехника); Infinity — за стеной. */
	surfaceAt(x: number, z: number): number;
	/** Вода в унитазе: туда струя уходит без следа. */
	isWater(x: number, z: number): boolean;
}

/**
 * Струя: баллистическая дуга от игрока по направлению взгляда, пока не упрётся в стену, потолок или то,
 * что снизу (см. StreamWorld); там, где попала, остаются пятна. Пока держат ЛКМ — фронт летит с настоящей скоростью (дуга дорастает), в точке попадания — брызги.
 * Дуга — цепочка тонких цилиндров (по одному на шаг расчёта), а не линия: линия в пиксель слишком тонкая.
 */
export class PeeStream {
	readonly group = new THREE.Group();
	/** Куда бьёт струя в этом кадре — для звука: ещё летит (или не льётся), в воду или во что-то твёрдое. */
	hitting: 'none' | 'water' | 'hard' = 'none';
	private readonly segments: THREE.InstancedMesh;
	/** Сколько секунд уже льётся — до этого времени и считаем полёт фронта. */
	private flowTime = 0;
	private wobble = 0;
	private readonly drops: THREE.Points;
	private readonly dropPos = new Float32Array(DROPS * 3);
	private readonly dropVel: THREE.Vector3[] = [];
	private readonly dropAge = new Float32Array(DROPS).fill(DROP_LIFE);
	private nextDrop = 0;
	private readonly origin = new THREE.Vector3();
	private readonly velocity = new THREE.Vector3();
	private readonly prev = new THREE.Vector3();
	private readonly point = new THREE.Vector3();
	private readonly segDir = new THREE.Vector3();
	private readonly segMid = new THREE.Vector3();
	private readonly segQuat = new THREE.Quaternion();
	private readonly segScale = new THREE.Vector3();
	private readonly segMatrix = new THREE.Matrix4();
	private readonly stains: THREE.InstancedMesh;
	private nextStain = 0;
	private stainTimer = 0;
	private readonly normal = new THREE.Vector3();
	private readonly stainPos = new THREE.Vector3();

	constructor(private readonly world: StreamWorld) {
		const material = new THREE.MeshStandardMaterial({ color: COLOR, emissive: COLOR, emissiveIntensity: 0.25, roughness: 0.2 });
		this.segments = new THREE.InstancedMesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 1, 6), material, MAX_STEPS);
		this.segments.frustumCulled = false;
		this.segments.count = 0;
		this.group.add(this.segments);

		const dropGeometry = new THREE.BufferGeometry();
		dropGeometry.setAttribute('position', new THREE.BufferAttribute(this.dropPos, 3));
		this.drops = new THREE.Points(dropGeometry, new THREE.PointsMaterial({ color: COLOR, size: 3, sizeAttenuation: false }));
		this.drops.frustumCulled = false;
		for (let i = 0; i < DROPS; i++) {
			this.dropVel.push(new THREE.Vector3());
			this.dropPos[i * 3 + 1] = -100;
		}
		this.group.add(this.drops);

		// Пятно — плоский круг лицом по +Z; поворачиваем по нормали поверхности.
		this.stains = new THREE.InstancedMesh(
			new THREE.CircleGeometry(1, 8),
			new THREE.MeshStandardMaterial({
				color: STAIN_COLOR,
				// Чуть светится — чтобы и в полутьме туалета пятно было жёлтым, а не бурым.
				emissive: STAIN_COLOR,
				emissiveIntensity: 0.35,
				transparent: true,
				opacity: STAIN_OPACITY,
				depthWrite: false,
				polygonOffset: true,
				polygonOffsetFactor: -1,
				polygonOffsetUnits: -1,
			}),
			STAINS
		);
		this.stains.frustumCulled = false;
		this.stains.count = 0;
		this.group.add(this.stains);
	}

	/** eye — позиция глаз, yaw/pitch — взгляд игрока; active — держат ЛКМ. */
	update(dt: number, active: boolean, eye: THREE.Vector3, yaw: number, pitch: number): void {
		this._updateDrops(dt);
		this.hitting = 'none';
		if (!active) {
			this.flowTime = 0;
			this.segments.count = 0;
			return;
		}
		this.flowTime += dt;
		this.wobble += dt;

		const fx = -Math.sin(yaw);
		const fz = -Math.cos(yaw);
		this.origin.set(eye.x + fx * ORIGIN_FORWARD, eye.y - ORIGIN_DROP, eye.z + fz * ORIGIN_FORWARD);
		// Напор слегка гуляет — струя живая, а не палка.
		const speed = SPEED * (1 + 0.04 * Math.sin(this.wobble * 13) + 0.02 * Math.sin(this.wobble * 31));
		const p = Math.min(pitch + AIM_LIFT, MAX_AIM);
		this.velocity.set(fx * Math.cos(p), Math.sin(p), fz * Math.cos(p)).multiplyScalar(speed);

		const steps = Math.min(MAX_STEPS, Math.ceil(this.flowTime / STEP));
		let count = 0;
		this.prev.copy(this.origin);
		for (let i = 1; i <= steps; i++) {
			const t = i * STEP;
			this.point.copy(this.origin).addScaledVector(this.velocity, t);
			this.point.y -= 0.5 * GRAVITY * t * t;
			const hit = this._hit(this.point);
			this._setSegment(count++, this.prev, this.point);
			this.prev.copy(this.point);
			if (hit) {
				this.hitting = this.normal.y > 0.5 && this.world.isWater(this.point.x, this.point.z) ? 'water' : 'hard';
				this._splash(this.point, dt, this.normal.y < -0.5);
				this.stainTimer += dt;
				if (this.stainTimer >= STAIN_EVERY && !this.world.isWater(this.point.x, this.point.z)) {
					this.stainTimer = 0;
					this._stain(this.point, this.normal);
				}
				break;
			}
		}
		this.segments.count = count;
		this.segments.instanceMatrix.needsUpdate = true;
	}

	/**
	 * Упёрлась ли струя в точке p: потолок, стена (за границей комнаты) или то, что снизу (surfaceAt).
	 * При попадании ставит p на поверхность и пишет её нормаль в this.normal.
	 */
	private _hit(p: THREE.Vector3): boolean {
		const { bounds, ceiling } = this.world;
		if (p.x <= bounds.minX || p.x >= bounds.maxX || p.z <= bounds.minZ || p.z >= bounds.maxZ) {
			// Стена: какую пересекли сильнее — та и нормаль (внутрь комнаты).
			const over = [bounds.minX - p.x, p.x - bounds.maxX, bounds.minZ - p.z, p.z - bounds.maxZ];
			const wall = over.indexOf(Math.max(...over));
			this.normal.set([1, -1, 0, 0][wall], 0, [0, 0, 1, -1][wall]);
			p.x = THREE.MathUtils.clamp(p.x, bounds.minX, bounds.maxX);
			p.z = THREE.MathUtils.clamp(p.z, bounds.minZ, bounds.maxZ);
			p.y = Math.min(p.y, ceiling);
			return true;
		}
		if (p.y >= ceiling) {
			p.y = ceiling;
			this.normal.set(0, -1, 0);
			return true;
		}
		const surface = this.world.surfaceAt(p.x, p.z);
		if (p.y > surface) return false;
		p.y = surface;
		this.normal.set(0, 1, 0);
		return true;
	}

	/** Новое пятно рядом с точкой попадания, в плоскости поверхности; старые затираются по кругу. */
	private _stain(at: THREE.Vector3, normal: THREE.Vector3): void {
		this.segQuat.setFromUnitVectors(STAIN_FACE, normal);
		// Разброс — в плоскости пятна (локальные X/Y круга), потом поворот на нормаль.
		this.stainPos.set((Math.random() - 0.5) * 2 * STAIN_SPREAD, (Math.random() - 0.5) * 2 * STAIN_SPREAD, 0);
		this.stainPos.applyQuaternion(this.segQuat).add(at).addScaledVector(normal, STAIN_LIFT);
		const size = STAIN_MIN + Math.random() * (STAIN_MAX - STAIN_MIN);
		this.segScale.set(size, size, 1);
		this.segMatrix.compose(this.stainPos, this.segQuat, this.segScale);
		this.stains.setMatrixAt(this.nextStain, this.segMatrix);
		this.nextStain = (this.nextStain + 1) % STAINS;
		this.stains.count = Math.max(this.stains.count, this.nextStain === 0 ? STAINS : this.nextStain);
		this.stains.instanceMatrix.needsUpdate = true;
	}

	/** Цилиндр-отрезок от a до b: ось Y цилиндра — вдоль отрезка, длина — масштабом. */
	private _setSegment(index: number, a: THREE.Vector3, b: THREE.Vector3): void {
		this.segDir.subVectors(b, a);
		const length = this.segDir.length();
		if (length > 1e-6) this.segQuat.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.segDir.divideScalar(length));
		this.segScale.set(1, length, 1);
		this.segMatrix.compose(this.segMid.addVectors(a, b).multiplyScalar(0.5), this.segQuat, this.segScale);
		this.segments.setMatrixAt(index, this.segMatrix);
	}

	/** Пара новых капель в точке попадания: от поверхности и в стороны (с потолка — вниз). */
	private _splash(at: THREE.Vector3, dt: number, fromCeiling: boolean): void {
		const spawn = Math.max(1, Math.round(dt * 150));
		for (let n = 0; n < spawn; n++) {
			const i = this.nextDrop;
			this.nextDrop = (this.nextDrop + 1) % DROPS;
			this.dropAge[i] = 0;
			at.toArray(this.dropPos, i * 3);
			const angle = Math.random() * Math.PI * 2;
			const out = DROP_SPEED * (0.3 + Math.random() * 0.7);
			this.dropVel[i].set(Math.cos(angle) * out * 0.5, fromCeiling ? -out * 0.3 : out, Math.sin(angle) * out * 0.5);
		}
	}

	private _updateDrops(dt: number): void {
		for (let i = 0; i < DROPS; i++) {
			if (this.dropAge[i] >= DROP_LIFE) {
				this.dropPos[i * 3 + 1] = -100;
				continue;
			}
			this.dropAge[i] += dt;
			const v = this.dropVel[i];
			v.y -= GRAVITY * dt;
			this.dropPos[i * 3] += v.x * dt;
			this.dropPos[i * 3 + 1] += v.y * dt;
			this.dropPos[i * 3 + 2] += v.z * dt;
		}
		this.drops.geometry.attributes.position.needsUpdate = true;
	}
}
