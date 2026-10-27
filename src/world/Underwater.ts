import * as THREE from 'three';
import type { CircleColliders } from '../physics/CircleColliders.js';
import type { RoomBounds } from './Room.js';
import { createPoop, POOP_HEIGHT, POOP_RADIUS } from './Poop.js';
import { createBrokenToilet, createPaperRoll, PaperStrip } from './Junk.js';

/**
 * Подводный уровень — куда утаскивает мужик из унитаза: каньон, который уходит вперёд (на −Z). По бокам и сзади —
 * отвесные скалы, только вперёд. Песчаное дно в дюнах, камни, заросли размотанной туалетной бумаги, рыбы, пузыри.
 */

/** Полуширина каньона (где можно плыть), м; длина вперёд от старта, м. */
const HALF_WIDTH = 9;
const LENGTH = 70;
/** Ширина дна целиком — со скалами и водой за ними, м. */
const SIZE = 70;
/** Высота поверхности воды над дном, м; выше этого (глаза) не всплыть. */
const SURFACE_Y = 9;
const SWIM_CEILING = SURFACE_Y - 2.5;
/** Скалы стен: шаг вдоль стены, м. */
const CLIFF_STEP = 1.6;
/** Дно по Z: от FLOOR_FRONT (за спиной старта) до −(LENGTH + 20). */
const FLOOR_FRONT = 15;
const FLOOR_LENGTH = LENGTH + 20 + FLOOR_FRONT;
/** Вода жёлтая, как моча: муть, свет сквозь неё, блики. */
const WATER_COLOR = '#7a6614';
const SAND_COLOR = '#c9b77f';
/** Сколько чего на дне. */
const ROCKS = 24;
const PAPER_WEEDS = 45;
const BUBBLES = 320;
const SCHOOLS = 5;
const FISH_PER_SCHOOL = 9;
const SHAFTS = 16;
/** Мусор на дне: разбитые унитазы, какашки поменьше, рулоны бумаги (у части — размотанная лента вверх). */
const BROKEN_TOILETS = 10;
const SMALL_POOPS = 24;
const ROLLS = 16;
/** Глыбы стен: размер от и до, м. */
const ROCK_MIN = 1.1;
const ROCK_MAX = 2;

/**
 * Расщелина в конце каньона: прямоугольный провал в дне (по X — ±CREVICE_HALF, по Z — от CREVICE_NEAR до конца),
 * стенки — крутой спуск шириной CREVICE_EDGE. Чем ниже, тем темнее и тише; на дне — подсвеченная какашка.
 */
const CREVICE_HALF = 5;
const CREVICE_NEAR = -LENGTH + 13;
const CREVICE_EDGE = 1.5;
/** Сколько не доставлять пропсы до края расщелины, м. */
const CREVICE_GAP = 2.5;
/** Глыбы стен расщелины торчат внутрь — ближе этого к краю (м) не подплыть, чтобы не влезть в них. */
const CREVICE_WALL_IN = 1.5;
const CREVICE_DEPTH = 100;
/** Глаза ниже этого — уже в расщелине: стенки не пускают в стороны. */
const CREVICE_RIM = -1;
/** На какой глубине (ниже кромки) свет и музыка гаснут совсем, м. */
const DARK_DEPTH = 80;
/** Какашка — посередине дна расщелины. */
const POOP_Z = (CREVICE_NEAR - LENGTH) / 2;
const BLACK = new THREE.Color('#000000');
/** Свет у поверхности: рассеянный, сверху; дальность мути, м; яркость каустики. */
const AMBIENT = 0.9;
const SUN = 1.4;
const FOG_FAR = 22;
const CAUSTIC_OPACITY = 0.35;
/** Луч на какашку: откуда светит (над ней) и сила. */
const POOP_LIGHT_HEIGHT = 9;
const POOP_LIGHT = 60;

/** Насколько точка внутри расщелины: 0 — снаружи, 1 — над её ровным дном; на стенках — между. */
function creviceMask(x: number, z: number): number {
	const sx = THREE.MathUtils.smoothstep(CREVICE_HALF - Math.abs(x), 0, CREVICE_EDGE);
	const sz = THREE.MathUtils.smoothstep(CREVICE_NEAR - z, 0, CREVICE_EDGE) * THREE.MathUtils.smoothstep(z + LENGTH, 0, CREVICE_EDGE);
	return sx * sz;
}

/** Высота дна: дюны, а в конце каньона — провал расщелины. */
function floorHeight(x: number, z: number): number {
	const mask = creviceMask(x, z);
	return THREE.MathUtils.lerp(duneHeight(x, z), -CREVICE_DEPTH, mask);
}

/** Дюны: плавные холмы по дну, м. Та же функция — и для геометрии, и для высоты под игроком. */
function duneHeight(x: number, z: number): number {
	return 0.35 * Math.sin(x * 0.31) * Math.cos(z * 0.27) + 0.12 * Math.sin(x * 0.83 + z * 0.61);
}

/** Случайная точка в каньоне (с отступом от скал) и вдоль него — от старта до дальнего конца. */
const randomX = (random: () => number) => (random() * 2 - 1) * (HALF_WIDTH - 1);
// До расщелины не доходим с запасом: на её краю дно уже уходит вниз, и вещи повисли бы в воде.
const randomZ = (random: () => number) => 1 - random() * (1 - CREVICE_NEAR - CREVICE_GAP);

/** Детерминированный «рандом»: дно одинаковое при каждом запуске. */
function makeRandom(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 16807) % 2147483647;
		return (s - 1) / 2147483646;
	};
}

/** Песок: зерно и светлые полосы ряби. */
function createSandTexture(): THREE.CanvasTexture {
	const size = 128;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const g = canvas.getContext('2d')!;
	g.fillStyle = SAND_COLOR;
	g.fillRect(0, 0, size, size);
	const random = makeRandom(7);
	for (let i = 0; i < 1400; i++) {
		const v = random();
		g.fillStyle = v < 0.5 ? 'rgba(90, 70, 40, 0.25)' : 'rgba(255, 245, 210, 0.25)';
		g.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1);
	}
	// Рябь — волнистые полосы поперёк; период кратен размеру, чтобы текстура стыковалась.
	g.strokeStyle = 'rgba(255, 240, 200, 0.18)';
	g.lineWidth = 2;
	for (let row = 0; row < 8; row++) {
		g.beginPath();
		for (let x = 0; x <= size; x += 4) {
			const y = row * 16 + 3 * Math.sin((x / size) * Math.PI * 4 + row);
			if (x === 0) g.moveTo(x, y);
			else g.lineTo(x, y);
		}
		g.stroke();
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(SIZE / 4, FLOOR_LENGTH / 4);
	texture.magFilter = THREE.NearestFilter;
	return texture;
}

/**
 * Каустика — сетка светлых прожилок, как от волн наверху. Сумма периодических синусов: где она близка к нулю —
 * яркая линия. Частоты целые — текстура стыкуется, её можно двигать.
 */
function createCausticTexture(): THREE.CanvasTexture {
	const size = 128;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const g = canvas.getContext('2d')!;
	const image = g.createImageData(size, size);
	const waves = [
		[2, 1, 0.3],
		[-1, 3, 1.7],
		[3, -2, 4.1],
		[1, 4, 2.6],
	];
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			let sum = 0;
			for (const [a, b, phase] of waves) sum += Math.sin(((a * x + b * y) / size) * Math.PI * 2 + phase);
			const v = Math.pow(Math.max(0, 1 - Math.abs(sum) / 1.1), 5);
			const i = (y * size + x) * 4;
			image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
			image.data[i + 3] = Math.round(v * 255);
		}
	}
	g.putImageData(image, 0, 0);
	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(SIZE / 6, FLOOR_LENGTH / 6);
	return texture;
}

interface Fish {
	mesh: THREE.Object3D;
	/** Место в стае: сдвиг по кругу (рад), по радиусу и по высоте. */
	angle: number;
	radius: number;
	height: number;
}

interface School {
	center: THREE.Vector2;
	radius: number;
	y: number;
	/** Угловая скорость по кругу, рад/с (знак — направление). */
	speed: number;
	fish: Fish[];
}

export class Underwater {
	readonly scene = new THREE.Scene();
	/** Где можно плыть: между скалами каньона, сзади — скала за стартом, впереди — дальний конец. */
	readonly bounds: RoomBounds = { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minZ: -LENGTH, maxZ: 2 };
	/** Выше этого (глаза) не всплыть — поверхность недосягаема. */
	readonly swimCeiling = SWIM_CEILING;
	/** Старт — у задней скалы, лицом вперёд, вдоль каньона. */
	readonly spawnPoint = { x: 0, z: 0, yaw: 0 };
	private time = 0;
	private readonly caustics: THREE.Texture[] = [];
	private readonly bubbles: THREE.Points;
	private readonly bubbleSpeed = new Float32Array(BUBBLES);
	private readonly schools: School[] = [];
	private readonly shafts: THREE.Mesh[] = [];
	private readonly strips: PaperStrip[] = [];
	private readonly surface: THREE.Texture;
	/** Свет и муть — их гасит глубина (setDepth). */
	private readonly ambient = new THREE.AmbientLight('#f0d860', AMBIENT);
	private readonly sun = new THREE.DirectionalLight('#fff1a8', SUN);
	private readonly fog = new THREE.Fog(WATER_COLOR, 2.5, FOG_FAR);
	private readonly water = new THREE.Color(WATER_COLOR);
	private readonly causticMaterials: THREE.MeshBasicMaterial[] = [];
	/** 0 — у поверхности, 1 — в самой глубине расщелины (темно). */
	private darkness = 0;

	constructor(private readonly colliders: CircleColliders) {
		this.scene.background = new THREE.Color(WATER_COLOR);
		this.scene.fog = this.fog;
		this.scene.add(this.ambient);
		// Свет сверху, сквозь воду — холодный.
		this.sun.position.set(3, 10, 2);
		this.scene.add(this.sun);
		this._buildPoop();

		const random = makeRandom(42);
		this._buildFloor();
		this._buildCrevice();
		this.surface = this._buildSurface();
		this._buildShafts(random);
		this._buildCliffs(random);
		this._buildRocks(random);
		this._buildPaperWeeds(random);
		this.bubbles = this._buildBubbles(random);
		this._buildFish(random);
		this._buildJunk(random);
	}

	/** Высота дна под точкой — по ней ходит игрок. */
	getHeightAt(x: number, z: number): number {
		// Какашку не проплыть насквозь: над ней «дно» поднимается конусом.
		const r = Math.hypot(x, z - POOP_Z);
		const poop = r < POOP_RADIUS ? -CREVICE_DEPTH + POOP_HEIGHT * (1 - r / POOP_RADIUS) : -Infinity;
		return Math.max(floorHeight(x, z), poop);
	}

	update(dt: number): void {
		this.time += dt;
		const t = this.time;
		// Каустика: два слоя бегут в разные стороны — сетка всё время переплетается.
		this.caustics[0].offset.set(t * 0.03, t * 0.017);
		this.caustics[1].offset.set(-t * 0.021, t * 0.026);
		this.surface.offset.set(t * 0.01, -t * 0.006);

		// Пузыри всплывают, слегка виляя; у поверхности — снова со дна.
		const pos = this.bubbles.geometry.attributes.position as THREE.BufferAttribute;
		for (let i = 0; i < BUBBLES; i++) {
			let y = pos.getY(i) + this.bubbleSpeed[i] * dt;
			let x = pos.getX(i) + Math.sin(t * 3 + i) * 0.15 * dt;
			if (y > SURFACE_Y) {
				x = randomX(Math.random);
				const z = randomZ(Math.random);
				pos.setZ(i, z);
				y = floorHeight(x, z);
			}
			pos.setXY(i, x, y);
		}
		pos.needsUpdate = true;

		// Стаи кружат, рыбы в них — слегка вразнобой; нос — по ходу движения.
		for (const school of this.schools) {
			for (const fish of school.fish) {
				const a = fish.angle + t * school.speed;
				const r = school.radius + fish.radius + Math.sin(t * 0.7 + fish.angle * 3) * 0.3;
				const x = school.center.x + Math.cos(a) * r;
				const z = school.center.y + Math.sin(a) * r;
				fish.mesh.position.set(x, school.y + fish.height + Math.sin(t * 1.3 + fish.angle * 5) * 0.15, z);
				// Касательная к кругу — направление хода.
				const dir = Math.sign(school.speed);
				fish.mesh.rotation.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir) - Math.PI / 2;
				// Хвост виляет — вся рыба чуть поворачивается туда-сюда.
				fish.mesh.rotation.z = Math.sin(t * 9 + fish.angle * 7) * 0.08;
			}
		}

		// Ленты бумаги (и «заросли» из них) колышутся течением.
		for (const strip of this.strips) strip.wave(t);

		// Лучи света медленно покачиваются и мерцают.
		this.shafts.forEach((shaft, i) => {
			shaft.rotation.z = Math.sin(t * 0.25 + i) * 0.08;
			(shaft.material as THREE.MeshBasicMaterial).opacity = (0.05 + 0.025 * Math.sin(t * 0.9 + i * 2.3)) * (1 - this.darkness);
		});
	}

	/**
	 * Глубина глаз: ниже кромки расщелины свет, каустика и лучи гаснут, муть темнеет до чёрной и густеет.
	 * Возвращает темноту 0..1 — по ней Game приглушает музыку.
	 */
	setDepth(eyeY: number): number {
		const k = THREE.MathUtils.smoothstep(CREVICE_RIM - eyeY, 0, DARK_DEPTH);
		this.darkness = k;
		const light = 1 - k;
		this.ambient.intensity = AMBIENT * light;
		this.sun.intensity = SUN * light;
		for (const material of this.causticMaterials) material.opacity = CAUSTIC_OPACITY * light;
		this.fog.color.lerpColors(this.water, BLACK, k);
		(this.scene.background as THREE.Color).copy(this.fog.color);
		this.fog.far = THREE.MathUtils.lerp(FOG_FAR, 16, k);
		return k;
	}

	/** В расщелине (глаза ниже кромки) — только внутри неё: стенки не пускают в стороны и назад. */
	clampDeep(pos: THREE.Vector3): void {
		if (pos.y > CREVICE_RIM) return;
		const margin = CREVICE_WALL_IN;
		pos.x = THREE.MathUtils.clamp(pos.x, -CREVICE_HALF + margin, CREVICE_HALF - margin);
		pos.z = THREE.MathUtils.clamp(pos.z, -LENGTH + margin, CREVICE_NEAR - margin);
	}

	/** Какашка на дне расщелины и луч сверху прямо на неё — единственный свет в темноте. */
	private _buildPoop(): void {
		const poop = createPoop();
		poop.position.set(0, -CREVICE_DEPTH, POOP_Z);
		poop.rotation.y = 0.6;
		this.scene.add(poop);
		const spot = new THREE.SpotLight('#ffe2b0', POOP_LIGHT, 20, 0.5, 0.6, 1.2);
		spot.position.set(0, -CREVICE_DEPTH + POOP_LIGHT_HEIGHT, POOP_Z + 1.5);
		spot.target.position.set(0, -CREVICE_DEPTH + 1, POOP_Z);
		this.scene.add(spot, spot.target);
	}

	/** Мусор по каньону (до расщелины): разбитые унитазы с осколками, какашки, рулоны и ленты бумаги. */
	private _buildJunk(random: () => number): void {
		const place = (obj: THREE.Object3D, x: number, z: number) => {
			obj.position.set(x, floorHeight(x, z), z);
			obj.rotation.y = random() * Math.PI * 2;
			this.scene.add(obj);
		};
		for (let i = 0; i < BROKEN_TOILETS; i++) {
			const x = randomX(random);
			const z = randomZ(random);
			if (z > -3) continue;
			const toilet = createBrokenToilet(random);
			toilet.scale.setScalar(1.2 + random() * 0.4);
			place(toilet, x, z);
			this.colliders.add(x, z, 0.45);
		}
		for (let i = 0; i < SMALL_POOPS; i++) {
			const poop = createPoop();
			// Большая на дне расщелины — около 4 м в ширину; здесь — от ладони до полуметра.
			poop.scale.setScalar(0.06 + random() * random() * 0.12);
			place(poop, randomX(random), randomZ(random));
		}
		for (let i = 0; i < ROLLS; i++) {
			const roll = createPaperRoll();
			place(roll, randomX(random), randomZ(random));
			if (random() < 0.6) {
				const strip = new PaperStrip(0.8 + random() * 1.8, random() * Math.PI * 2);
				strip.mesh.position.set(0, 0.08, 0);
				roll.add(strip.mesh);
				this.strips.push(strip);
			}
		}
	}

	/** Дно в дюнах, а поверх него — два слоя бегущей каустики (светлые прожилки, складываются со светом). */
	private _buildFloor(): void {
		const geometry = new THREE.PlaneGeometry(SIZE, FLOOR_LENGTH, SIZE, FLOOR_LENGTH);
		geometry.rotateX(-Math.PI / 2);
		geometry.translate(0, 0, FLOOR_FRONT - FLOOR_LENGTH / 2);
		const pos = geometry.attributes.position;
		for (let i = 0; i < pos.count; i++) pos.setY(i, duneHeight(pos.getX(i), pos.getZ(i)));
		// Над расщелиной в дне — дыра: треугольники оттуда выкидываем. Её края попадают ровно на сетку (метр на клетку),
		// а стенки и дно расщелины — отдельные плоскости (_buildCrevice): иначе песок вытягивается на 100 м полосами.
		const index = geometry.index!;
		const kept: number[] = [];
		for (let i = 0; i < index.count; i += 3) {
			let x = 0;
			let z = 0;
			for (let k = 0; k < 3; k++) {
				x += pos.getX(index.getX(i + k)) / 3;
				z += pos.getZ(index.getX(i + k)) / 3;
			}
			if (Math.abs(x) < CREVICE_HALF && z < CREVICE_NEAR && z > -LENGTH) continue;
			for (let k = 0; k < 3; k++) kept.push(index.getX(i + k));
		}
		geometry.setIndex(kept);
		geometry.computeVertexNormals();
		this.scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: createSandTexture(), roughness: 1 })));

		for (let layer = 0; layer < 2; layer++) {
			const texture = createCausticTexture();
			if (layer === 1) texture.repeat.multiplyScalar(1.37);
			this.caustics.push(texture);
			const material = new THREE.MeshBasicMaterial({
					map: texture,
					color: '#fff3a0',
					transparent: true,
					opacity: CAUSTIC_OPACITY,
					blending: THREE.AdditiveBlending,
					depthWrite: false,
				});
			this.causticMaterials.push(material);
			const mesh = new THREE.Mesh(geometry, material);
			// Чуть над песком, чтобы не мерцало сквозь него.
			mesh.position.y = 0.01 + layer * 0.005;
			this.scene.add(mesh);
		}
	}

	/**
	 * Расщелина: дно из песка далеко внизу и четыре отвесные стенки — ровные тёмные плоскости без текстуры (их почти
	 * целиком закрывают глыбы из _buildCliffs, а между глыбами видно просто тёмный камень).
	 */
	private _buildCrevice(): void {
		const width = CREVICE_HALF * 2;
		const length = CREVICE_NEAR + LENGTH;
		const centerZ = (CREVICE_NEAR - LENGTH) / 2;
		const sand = createSandTexture();
		sand.repeat.set(width / 4, length / 4);
		const bottom = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }));
		bottom.rotation.x = -Math.PI / 2;
		bottom.position.set(0, -CREVICE_DEPTH, centerZ);
		this.scene.add(bottom);

		const rock = new THREE.MeshStandardMaterial({ color: '#3a4442', roughness: 1 });
		// Верх стенок — чуть над песком у кромки (там дюны), низ — у дна.
		const top = 0.6;
		const height = CREVICE_DEPTH + top;
		const wall = (w: number, x: number, z: number, rotY: number) => {
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, height), rock);
			mesh.position.set(x, top - height / 2, z);
			mesh.rotation.y = rotY;
			this.scene.add(mesh);
		};
		wall(length, -CREVICE_HALF, centerZ, Math.PI / 2);
		wall(length, CREVICE_HALF, centerZ, -Math.PI / 2);
		wall(width, 0, CREVICE_NEAR, Math.PI);
		wall(width, 0, -LENGTH, 0);
	}

	/** Поверхность воды снизу — светлое колышущееся «зеркало» (муть его не гасит). */
	private _buildSurface(): THREE.Texture {
		const texture = createCausticTexture();
		texture.repeat.set(SIZE / 10, FLOOR_LENGTH / 10);
		const surface = new THREE.Mesh(
			new THREE.PlaneGeometry(SIZE, FLOOR_LENGTH),
			new THREE.MeshBasicMaterial({ color: '#c9a92a', map: texture, fog: false, side: THREE.DoubleSide })
		);
		surface.rotation.x = Math.PI / 2;
		surface.position.set(0, SURFACE_Y, FLOOR_FRONT - FLOOR_LENGTH / 2);
		this.scene.add(surface);
		return texture;
	}

	/** Лучи света от поверхности к дну — полупрозрачные конусы, складываются со сценой. */
	private _buildShafts(random: () => number): void {
		for (let i = 0; i < SHAFTS; i++) {
			const top = 0.6 + random() * 0.8;
			const shaft = new THREE.Mesh(
				new THREE.CylinderGeometry(top, top * 2.2, SURFACE_Y, 8, 1, true),
				new THREE.MeshBasicMaterial({
					color: '#fff4b8',
					transparent: true,
					opacity: 0.06,
					blending: THREE.AdditiveBlending,
					depthWrite: false,
					side: THREE.DoubleSide,
				})
			);
			shaft.position.set(randomX(random), SURFACE_Y / 2, randomZ(random));
			shaft.rotation.x = (random() - 0.5) * 0.2;
			this.shafts.push(shaft);
			this.scene.add(shaft);
		}
	}

	/**
	 * Стены: каньона — по бокам и поперёк на обоих концах, расщелины — по её четырём краям от кромки до дна.
	 * Стена — столбики из глыб друг на друге (а не вытянутые шипы); глыбы — одна InstancedMesh, их тысячи.
	 */
	private _buildCliffs(random: () => number): void {
		const matrices: THREE.Matrix4[] = [];
		const quat = new THREE.Quaternion();
		const euler = new THREE.Euler();
		const scale = new THREE.Vector3();
		const pos = new THREE.Vector3();
		/** Столбик глыб в точке (x, z) от bottom до top; глыбы чуть разбросаны и повёрнуты как попало. */
		const column = (x: number, z: number, bottom: number, top: number) => {
			let y = bottom;
			while (y < top) {
				const size = ROCK_MIN + random() * (ROCK_MAX - ROCK_MIN);
				scale.set(size * (0.9 + random() * 0.4), size * (0.7 + random() * 0.3), size * (0.9 + random() * 0.4));
				euler.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
				quat.setFromEuler(euler);
				pos.set(x + (random() - 0.5) * 0.5, y + scale.y * 0.5, z + (random() - 0.5) * 0.5);
				matrices.push(new THREE.Matrix4().compose(pos, quat, scale));
				y += scale.y * 1.3;
			}
		};
		const wallTop = (row: number) => (row === 0 ? 5 : 8) + random() * 2;
		// Бока каньона — два ряда, задний выше: стена ступенькой уходит к поверхности.
		for (let z = 6; z > -LENGTH - 4; z -= CLIFF_STEP) {
			for (const side of [-1, 1]) {
				for (let row = 0; row < 2; row++) {
					const x = side * (HALF_WIDTH + 1.6 + row * 2.2 + random() * 0.8);
					const zz = z + random() * CLIFF_STEP;
					column(x, zz, floorHeight(x, zz) - 0.5, wallTop(row));
				}
			}
		}
		// Поперёк — за стартом и в самом конце, за расщелиной: каньон закрыт с обоих концов.
		for (let x = -HALF_WIDTH - 2; x <= HALF_WIDTH + 2; x += CLIFF_STEP) {
			for (let row = 0; row < 2; row++) {
				column(x + random() * CLIFF_STEP, 4.2 + row * 2.2 + random() * 0.8, -0.5, wallTop(row));
				column(x + random() * CLIFF_STEP, -LENGTH - 2.2 - row * 2.2 - random() * 0.8, -CREVICE_DEPTH, wallTop(row));
			}
		}
		// Стены расщелины: по её краям, чуть снаружи — глыбы закрывают отвесный спуск песка и торчат внутрь
		// не дальше, чем пускает clampDeep.
		const out = 1.2;
		for (let z = CREVICE_NEAR; z >= -LENGTH; z -= CLIFF_STEP) {
			for (const side of [-1, 1]) column(side * (CREVICE_HALF + out), z, -CREVICE_DEPTH, 0);
		}
		for (let x = -CREVICE_HALF; x <= CREVICE_HALF; x += CLIFF_STEP) {
			column(x, CREVICE_NEAR + out, -CREVICE_DEPTH, 0);
			column(x, -LENGTH - out, -CREVICE_DEPTH, 0);
		}

		const cliffs = new THREE.InstancedMesh(
			new THREE.DodecahedronGeometry(1, 0),
			new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }),
			matrices.length
		);
		const colors = ['#46524f', '#525f55', '#3a4442', '#5c5b4e'].map((c) => new THREE.Color(c));
		matrices.forEach((matrix, i) => {
			cliffs.setMatrixAt(i, matrix);
			cliffs.setColorAt(i, colors[Math.floor(random() * colors.length)]);
		});
		this.scene.add(cliffs);
	}

	/** Камни — гранёные глыбы, наполовину в песке; большие не пускают игрока. */
	private _buildRocks(random: () => number): void {
		const geometry = new THREE.IcosahedronGeometry(1, 0);
		const colors = ['#4f5d57', '#5d6b5f', '#3f4a48', '#6b6a5a'];
		for (let i = 0; i < ROCKS; i++) {
			const x = randomX(random);
			const z = randomZ(random);
			// Не на старте: игрок появляется в свободном месте.
			if (Math.hypot(x - this.spawnPoint.x, z - this.spawnPoint.z) < 3) continue;
			const size = 0.3 + random() * random() * 1.6;
			const rock = new THREE.Mesh(
				geometry,
				new THREE.MeshStandardMaterial({ color: colors[i % colors.length], flatShading: true, roughness: 1 })
			);
			rock.scale.set(size * (0.8 + random() * 0.6), size * (0.5 + random() * 0.5), size * (0.8 + random() * 0.6));
			rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
			rock.position.set(x, floorHeight(x, z) + size * 0.15, z);
			this.scene.add(rock);
			if (size > 0.6) this.colliders.add(x, z, size * 0.9);
		}
	}

	/**
	 * Вместо водорослей — бумага: пучки размотанных лент туалетной бумаги тянутся со дна вверх и колышутся;
	 * у части пучков у основания валяется сам рулон.
	 */
	private _buildPaperWeeds(random: () => number): void {
		for (let i = 0; i < PAPER_WEEDS; i++) {
			const cx = randomX(random);
			const cz = randomZ(random);
			const strips = 2 + Math.floor(random() * 4);
			for (let s = 0; s < strips; s++) {
				const x = cx + (random() - 0.5) * 0.7;
				const z = cz + (random() - 0.5) * 0.7;
				const strip = new PaperStrip(1 + random() * 2.2, random() * Math.PI * 2);
				strip.mesh.position.set(x, floorHeight(x, z) - 0.05, z);
				strip.mesh.rotation.y = random() * Math.PI;
				this.scene.add(strip.mesh);
				this.strips.push(strip);
			}
			if (random() < 0.5) {
				const roll = createPaperRoll();
				roll.position.set(cx, floorHeight(cx, cz), cz);
				roll.rotation.y = random() * Math.PI * 2;
				this.scene.add(roll);
			}
		}
	}

	/** Пузыри — точки, всплывающие с дна с разной скоростью. */
	private _buildBubbles(random: () => number): THREE.Points {
		const positions = new Float32Array(BUBBLES * 3);
		for (let i = 0; i < BUBBLES; i++) {
			const x = randomX(random);
			const z = randomZ(random);
			positions.set([x, floorHeight(x, z) + random() * SURFACE_Y, z], i * 3);
			this.bubbleSpeed[i] = 0.4 + random() * 0.9;
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const bubbles = new THREE.Points(
			geometry,
			new THREE.PointsMaterial({ color: '#fff8d0', size: 0.06, transparent: true, opacity: 0.7, depthWrite: false })
		);
		bubbles.frustumCulled = false;
		this.scene.add(bubbles);
		return bubbles;
	}

	/** Стаи рыб: тело — вытянутый ромб, хвост — плоский треугольник; рыба смотрит носом на +X. */
	private _buildFish(random: () => number): void {
		const body = new THREE.OctahedronGeometry(0.12, 0);
		body.scale(1.8, 0.8, 0.45);
		const tail = new THREE.ConeGeometry(0.09, 0.14, 3);
		tail.rotateZ(Math.PI / 2);
		tail.scale(1, 1, 0.3);
		tail.translate(-0.27, 0, 0);
		const colors = ['#f2a33a', '#e8e0c8', '#5fc4d8'];
		for (let s = 0; s < SCHOOLS; s++) {
			const material = new THREE.MeshStandardMaterial({ color: colors[s % colors.length], flatShading: true, roughness: 0.5 });
			const school: School = {
				// Стаи — друг за другом вдоль каньона, первая — недалеко от старта.
				center: new THREE.Vector2((random() - 0.5) * 4, -8 - (s * (LENGTH - 20)) / SCHOOLS - random() * 10),
				radius: 2 + random() * 3,
				y: 1.5 + random() * 3,
				speed: (0.15 + random() * 0.15) * (random() < 0.5 ? -1 : 1),
				fish: [],
			};
			for (let f = 0; f < FISH_PER_SCHOOL; f++) {
				const mesh = new THREE.Group();
				mesh.add(new THREE.Mesh(body, material), new THREE.Mesh(tail, material));
				this.scene.add(mesh);
				school.fish.push({ mesh, angle: random() * 0.9, radius: (random() - 0.5) * 1.2, height: (random() - 0.5) * 0.8 });
			}
			this.schools.push(school);
		}
	}
}
