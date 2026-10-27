import * as THREE from 'three';
import type { CircleColliders } from '../physics/CircleColliders.js';
import {
	createDesk,
	createChair,
	createWindow,
	createAcUnit,
	createMuralTexture,
	createDoor,
	createFirstAidCabinet,
	createWhiteboard,
	createWallShelves,
	createCeilingTileTexture,
} from './Furniture.js';
import {
	createMonitor,
	createLaptop,
	createKeyboard,
	createMouse,
	createMousePad,
	createMug,
	createPaperCup,
	createPaperStack,
	createNotebook,
	createStickyPad,
	createStickyNote,
	createDeskPlant,
	createHeadphones,
	createWaterBottle,
	createPhone,
	createCan,
	createDeskLamp,
	createScreenTexture,
	type ScreenKind,
} from './DeskItems.js';

const WIDTH = 10;
const DEPTH = 9;
/** Северная стена (с росписью, к ней торцом стоят столы) — на месте; комната тянется от неё на DEPTH к южной (с доской). */
const NORTH_Z = -6;
const SOUTH_Z = NORTH_Z + DEPTH;
const CENTER_Z = (NORTH_Z + SOUTH_Z) / 2;
const HEIGHT = 3;
const WALL_THICKNESS = 0.2;
/** Сторона плиты подвесного потолка. */
const CEILING_TILE = 0.6;
/** Окна в западной стене: центр стекла по X/Y, размер; одно с видом на улицу, другое за закрытыми жалюзи. */
const WINDOW_WIDTH = 1.8;
const WINDOW_HEIGHT = 1.4;
const WINDOW_X = -WIDTH / 2 + WALL_THICKNESS / 2 + 0.01;
const WINDOW_Y = 1.6;
const WINDOW_VIEW_Z = 1;
const WINDOW_CLOSED_Z = -3;
/** Центры клеток потолка под светильники (швы сетки идут через 0 с шагом CEILING_TILE): два ряда над блоками столов,
 * вдоль комнаты — через клетку-две. */
const LAMP_X = [-2.1, 2.1];
const LAMP_Z = [-4.5, -2.7, -0.9, 0.9, 2.1];
/** У каких светильников есть точечный свет [z, отбрасывает тень]. */
const LIGHT_Z: [number, boolean][] = [
	[-4.5, true],
	[-0.9, true],
	[2.1, false],
];
/** Верх столешницы: createDesk кладёт её центр в y=0.74 при толщине 0.04. */
const DESK_SURFACE_Y = 0.76;
/** Столы в ряду стоят вплотную: шаг равен длине стола (вдвое длиннее обычного). Всего 2 ряда по 3 — 6 столов. */
const SEATS_PER_ROW = 3;
const DESK_LENGTH = 1.8;
const SEAT_SPACING = DESK_LENGTH;
/** Ряды упираются торцом в северную стену — напротив доски: дальний стол касается стены. */
const ROW_CENTER_Z = NORTH_Z + WALL_THICKNESS / 2 + (SEATS_PER_ROW * DESK_LENGTH) / 2;
/** Половина ширины столешницы (0.7) — на этот шаг раздвинуты 2 колонки блока, чтобы столы касались краями. */
const DESK_HALF_WIDTH = 0.35;
const SCREEN_KINDS: ScreenKind[] = ['code', 'game', 'art', 'desktop'];
const MUG_COLORS = ['#c94f3d', '#2c5aa0', '#f2f2ee', '#3fa35a', '#f4d94a', '#26282b', '#e27a9a'];
const STICKY_COLORS = ['#f4e04a', '#f29ab8', '#8fd3f0', '#a8e07a'];

/** Дверь в восточной стене: реальный вырез (проём), полотно открывается по E.
 * Снаружи ничего не пристроено: за дверью просто небо в проёме. */
const DOOR_WIDTH = 1.0;
const DOOR_HEIGHT = 2.1;
/** Дверь — в 1.7 м от южной стены. */
const DOOR_Z = SOUTH_Z - 1.7;
/** Сколько секунд едет полотно между открытым и закрытым положением. */
const DOOR_ANIM_TIME = 0.5;
/** Центр маркерной доски на южной стене по X — у неё игрок начинает. */
const WHITEBOARD_X = 0.8;
/** Небо пасмурного дня, видное в проёме открытой двери. */
const SKY_COLOR = '#b3ac9e';

export interface RoomBounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export interface Doorway {
	wallX: number;
	z: number;
	zMin: number;
	zMax: number;
}

/** Простой офис: пол/стены/потолок, окна на одной стене, два ряда столов с мониторами и стульями. */
export class Room {
	readonly scene = new THREE.Scene();
	readonly bounds: RoomBounds = { minX: -WIDTH / 2, maxX: WIDTH / 2, minZ: NORTH_Z, maxZ: SOUTH_Z };
	/** Старт — в 2.2 м перед маркерной доской, лицом к ней. yaw = π — взгляд на юг (+Z). */
	readonly spawnPoint = { x: WHITEBOARD_X, z: SOUTH_Z - 2.2, yaw: Math.PI };
	readonly doorway: Doorway = {
		wallX: WIDTH / 2,
		z: DOOR_Z,
		zMin: DOOR_Z - DOOR_WIDTH / 2,
		zMax: DOOR_Z + DOOR_WIDTH / 2,
	};
	private doorOpenState = false;
	/** Начало координат полотна — на петле (см. createDoor), поэтому анимация — просто поворот группы. */
	private readonly doorLeaf = createDoor(DOOR_WIDTH, DOOR_HEIGHT);
	private readonly doorClosedRot = -Math.PI / 2;
	/** Открыта наружу: полотно лежит вдоль стены, а не поперёк проёма. */
	private readonly doorOpenRot = 0;
	/** Ход анимации: 0 — у старта, 1 — доехало до цели. */
	private doorAnimFrom = this.doorClosedRot;
	private doorAnimTo = this.doorClosedRot;
	private doorAnimT = 1;
	/** Номер рабочего места — зерно для разброса, чтобы столы отличались, но одинаково при каждом запуске. */
	private seatIndex = 0;

	get isDoorOpen(): boolean {
		return this.doorOpenState;
	}

	/** Куда ведёт маркер задачи в офисе — над дверью. */
	get doorMarker(): THREE.Vector3 {
		return new THREE.Vector3(this.doorway.wallX, DOOR_HEIGHT + 0.3, this.doorway.z);
	}

	/** windowView — что видно в «живом» окне; без неё — тусклое стекло. */
	constructor(
		private readonly colliders: CircleColliders,
		private readonly windowView?: THREE.Texture
	) {
		// Фон сцены виден только сквозь открытый проём — тусклое небо в тучах снаружи.
		this.scene.background = new THREE.Color(SKY_COLOR);
		this.scene.add(new THREE.AmbientLight('#ffffff', 0.7));
		// Тусклый рассеянный свет пасмурного дня — некоторые лампы в офисе ярче, эта лишь мягкая подсветка.
		const sun = new THREE.DirectionalLight('#d7d0c0', 0.5);
		sun.position.set(4, 6, 3);
		sun.castShadow = true;
		this.scene.add(sun);

		this._buildShell();
		this._buildWindows();
		this._buildAc();
		this._buildSouthWallDecor();
		this._buildDoor();
		this._buildCeilingLights();
		this._buildDeskBlock(-1.9);
		this._buildDeskBlock(1.9);
	}

	/** E у двери: переключает открыто/закрыто, полотно плавно поворачивается на петле (см. update). */
	toggleDoor(): void {
		this.doorOpenState = !this.doorOpenState;
		this.doorAnimFrom = this.doorLeaf.rotation.y;
		this.doorAnimTo = this.doorOpenState ? this.doorOpenRot : this.doorClosedRot;
		this.doorAnimT = 0;
	}

	/** Довести анимацию поворота полотна до текущего кадра. */
	update(dt: number): void {
		if (this.doorAnimT >= 1) return;
		this.doorAnimT = Math.min(1, this.doorAnimT + dt / DOOR_ANIM_TIME);
		const eased = 1 - (1 - this.doorAnimT) ** 3;
		this.doorLeaf.rotation.y = THREE.MathUtils.lerp(this.doorAnimFrom, this.doorAnimTo, eased);
	}

	/** Блок из 2 впритык составленных рядов по 3 стола (6 столов), стулья по обе стороны блока. */
	private _buildDeskBlock(centerX: number): void {
		const seatZ = Array.from(
			{ length: SEATS_PER_ROW },
			(_, i) => ROW_CENTER_Z + (i - (SEATS_PER_ROW - 1) / 2) * SEAT_SPACING
		);
		this._buildDeskRow(centerX - DESK_HALF_WIDTH, seatZ, -1);
		this._buildDeskRow(centerX + DESK_HALF_WIDTH, seatZ, 1);
	}

	/** Пол ровный: высота везде 0. */
	getHeightAt(_x: number, _z: number): number {
		return 0;
	}

	private _buildShell(): void {
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), new THREE.MeshStandardMaterial({ color: '#2b2c2e' }));
		floor.rotation.x = -Math.PI / 2;
		floor.position.z = CENTER_Z;
		floor.receiveShadow = true;
		this.scene.add(floor);

		// Сетку плит сдвигаем так, чтобы швы шли через x = 0 и z = 0: светильники встают ровно в клетки (см. LAMP_X/LAMP_Z).
		const ceilingTex = createCeilingTileTexture(WIDTH / CEILING_TILE, DEPTH / CEILING_TILE);
		ceilingTex.offset.set(-((WIDTH / 2) % CEILING_TILE) / CEILING_TILE, -((-NORTH_Z) % CEILING_TILE) / CEILING_TILE);
		const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), new THREE.MeshStandardMaterial({ map: ceilingTex }));
		ceiling.rotation.x = Math.PI / 2;
		ceiling.position.set(0, HEIGHT, CENTER_Z);
		this.scene.add(ceiling);

		const wallMat = new THREE.MeshStandardMaterial({ color: '#eae7df' });
		const muralMat = new THREE.MeshStandardMaterial({ map: createMuralTexture() });
		const north = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, HEIGHT, WALL_THICKNESS), muralMat);
		north.position.set(0, HEIGHT / 2, NORTH_Z);
		const south = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, HEIGHT, WALL_THICKNESS), wallMat);
		south.position.set(0, HEIGHT / 2, SOUTH_Z);
		const west = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, HEIGHT, DEPTH), wallMat);
		west.position.set(-WIDTH / 2, HEIGHT / 2, CENTER_Z);
		for (const wall of [north, south, west]) {
			wall.receiveShadow = true;
			this.scene.add(wall);
		}
		this._buildEastWallWithDoorway(wallMat);
	}

	/** Восточная стена с реальным вырезом под дверь: 2 простенка по бокам + перемычка сверху. */
	private _buildEastWallWithDoorway(wallMat: THREE.Material): void {
		const { zMin, zMax } = this.doorway;

		const northLen = zMin - NORTH_Z;
		const northWall = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, HEIGHT, northLen), wallMat);
		northWall.position.set(WIDTH / 2, HEIGHT / 2, NORTH_Z + northLen / 2);

		const southLen = SOUTH_Z - zMax;
		const southWall = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, HEIGHT, southLen), wallMat);
		southWall.position.set(WIDTH / 2, HEIGHT / 2, SOUTH_Z - southLen / 2);

		const lintelHeight = HEIGHT - DOOR_HEIGHT;
		const lintel = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, lintelHeight, DOOR_WIDTH), wallMat);
		lintel.position.set(WIDTH / 2, DOOR_HEIGHT + lintelHeight / 2, DOOR_Z);

		for (const wall of [northWall, southWall, lintel]) {
			wall.receiveShadow = true;
			this.scene.add(wall);
		}
	}

	private _buildWindows(): void {
		// Оба окна наглухо закрыты жалюзи; на подоконнике левого — цветок.
		for (const [z, options] of [
			[WINDOW_CLOSED_Z, { blinds: 1, blindsTilt: 1.35 }],
			[WINDOW_VIEW_Z, { plant: true, blinds: 1, blindsTilt: 1.35, view: this.windowView }],
		] as const) {
			const win = createWindow(WINDOW_WIDTH, WINDOW_HEIGHT, options);
			win.position.set(WINDOW_X, WINDOW_Y, z);
			win.rotation.y = Math.PI / 2;
			this.scene.add(win);
		}
	}

	private _buildAc(): void {
		const ac = createAcUnit();
		ac.position.set(-3, HEIGHT - 0.35, NORTH_Z + WALL_THICKNESS / 2 + 0.12);
		this.scene.add(ac);
	}

	/** Южная стена — справа от двери, если стоять к ней лицом: у двери аптечка, по центру маркерная доска
	 * с надписью, дальше навесные полки с мелочёвкой. Всё вешается на внутреннюю грань стены лицом в комнату. */
	private _buildSouthWallDecor(): void {
		const wallZ = SOUTH_Z - WALL_THICKNESS / 2;
		for (const [item, x, y] of [
			[createFirstAidCabinet(), WIDTH / 2 - 0.9, 1.5],
			[createWhiteboard(3.2, 1.5), WHITEBOARD_X, 1.6],
			[createWallShelves(), -3.0, 1.2],
		] as const) {
			item.position.set(x, y, wallZ);
			item.rotation.y = Math.PI;
			this.scene.add(item);
		}
	}

	/** Полотно двери (закрыто по умолчанию), петля — на северном крае проёма. */
	private _buildDoor(): void {
		this.doorLeaf.position.set(WIDTH / 2 - WALL_THICKNESS / 2 - 0.01, 0, this.doorway.zMin);
		this.doorLeaf.rotation.y = this.doorClosedRot;
		this.scene.add(this.doorLeaf);
	}

	/** Встроенные квадратные светильники в клетках потолка — сетка над блоками столов; точечный свет — у части из них. */
	private _buildCeilingLights(): void {
		for (const x of LAMP_X) {
			for (const z of LAMP_Z) this._buildCeilingLamp(x, z);
		}
		for (const x of LAMP_X) {
			for (const [z, shadow] of LIGHT_Z) {
				const light = new THREE.PointLight('#fff3d8', 9, 8, 2);
				light.position.set(x, HEIGHT - 0.25, z);
				light.castShadow = shadow;
				this.scene.add(light);
			}
		}
	}

	/** Светильник-панель во всю плиту потолка: белая рамка и светящийся рассеиватель. */
	private _buildCeilingLamp(x: number, z: number): void {
		const frame = new THREE.Mesh(
			new THREE.BoxGeometry(CEILING_TILE - 0.02, 0.02, CEILING_TILE - 0.02),
			new THREE.MeshStandardMaterial({ color: '#e4e3de' })
		);
		frame.position.set(x, HEIGHT - 0.01, z);
		this.scene.add(frame);
		const diffuser = new THREE.Mesh(
			new THREE.BoxGeometry(CEILING_TILE - 0.1, 0.01, CEILING_TILE - 0.1),
			new THREE.MeshStandardMaterial({ color: '#fff8e6', emissive: '#fff8e6', emissiveIntensity: 1.4 })
		);
		diffuser.position.set(x, HEIGHT - 0.022, z);
		this.scene.add(diffuser);
	}

	/** Ряд рабочих мест: отдельный стол на каждое место + стул; что на столе — см. _buildWorkstation.
	 * chairSide — в какую сторону от центра блока вынесен стул (наружу блока). */
	private _buildDeskRow(x: number, seatZ: number[], chairSide: -1 | 1): void {
		for (const z of seatZ) {
			const desk = createDesk(DESK_LENGTH);
			desk.position.set(x, 0, z);
			this.scene.add(desk);
			// Один круг не покрывает весь длинный стол — ставим два вдоль его длины.
			this.colliders.add(x, z - DESK_LENGTH / 4, 0.5);
			this.colliders.add(x, z + DESK_LENGTH / 4, 0.5);

			this._buildWorkstation(x, z, chairSide);

			const chair = createChair();
			chair.position.set(x + chairSide * 0.85, 0, z);
			chair.rotation.y = chairSide > 0 ? -Math.PI / 2 : Math.PI / 2;
			this.scene.add(chair);
			this.colliders.add(chair.position.x, chair.position.z, 0.3);
		}
	}

	/**
	 * Что стоит на столе у одного места. Сидящий смотрит в сторону −chairSide по X; d — отступ от центра стола
	 * к монитору, l — вправо от сидящего. Техника у всех своя (один/два монитора, монитор + ноутбук),
	 * мышь справа на коврике (у одного — слева), кружка и мелочёвка в случайных свободных местах.
	 */
	private _buildWorkstation(x: number, z: number, s: -1 | 1): void {
		const index = this.seatIndex++;
		let seed = index * 9301 + 49297;
		const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
		// Локальный +Z предмета смотрит на сидящего, локальный +X — вправо от него.
		const yaw = (s * Math.PI) / 2;
		const put = (obj: THREE.Object3D, d: number, l: number, rot = 0) => {
			obj.position.set(x - s * d, DESK_SURFACE_Y, z - s * l);
			obj.rotation.y = yaw + rot;
			this.scene.add(obj);
		};
		const screen = () => createScreenTexture(pick(SCREEN_KINDS), index * 3 + Math.floor(rand() * 3));
		const monitorWithNotes = () => {
			const monitor = createMonitor(screen());
			if (rand() < 0.45) {
				const count = 1 + Math.floor(rand() * 2);
				for (let i = 0; i < count; i++) {
					const note = createStickyNote(pick(STICKY_COLORS));
					note.position.set(0.25 - i * 0.07, 0.47 - i * 0.02, -0.053);
					note.rotation.z = (rand() - 0.5) * 0.4;
					monitor.add(note);
				}
			}
			return monitor;
		};

		// Свободные места под мелочёвку [d, l] — слева и справа от клавиатуры.
		let slots: [number, number][] = [
			[-0.1, -0.52],
			[0.12, -0.7],
			[-0.2, -0.78],
			[0.22, -0.58],
			[-0.15, 0.62],
			[0.1, 0.74],
			[0.22, 0.52],
			[-0.22, 0.8],
		];

		const setup = index % 3;
		if (setup === 1) {
			put(monitorWithNotes(), 0.2, -0.33, 0.25);
			put(monitorWithNotes(), 0.2, 0.3, -0.25);
			slots = slots.filter(([d, l]) => !(d > 0.12 && Math.abs(l) < 0.65));
		} else {
			put(monitorWithNotes(), 0.2, -0.05, (rand() - 0.5) * 0.1);
			if (setup === 2) {
				put(createLaptop(screen()), 0.0, -0.6, 0.35);
				slots = slots.filter(([, l]) => l > 0);
			}
		}

		put(createKeyboard(), -0.12, -0.05, (rand() - 0.5) * 0.08);
		const leftHanded = index === 4;
		const padL = leftHanded ? -0.42 : 0.3;
		put(createMousePad(pick(['#23262b', '#2f3f5a', '#4a2f3a'])), -0.1, padL, (rand() - 0.5) * 0.2);
		const mouse = createMouse(pick(['#2a2a2c', '#d8d8d4']));
		put(mouse, -0.1 + (rand() - 0.5) * 0.04, padL + (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.3);
		mouse.position.y += 0.004;
		if (leftHanded) slots = slots.filter(([, l]) => !(l < 0 && l > -0.6));

		// Перемешиваем места и раздаём: кружка (или стакан навынос), потом 2–4 случайные мелочи.
		for (let i = slots.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[slots[i], slots[j]] = [slots[j], slots[i]];
		}
		const items: (() => THREE.Object3D)[] = [];
		const drink = rand();
		if (drink < 0.65) items.push(() => createMug(pick(MUG_COLORS)));
		else if (drink < 0.85) items.push(() => createPaperCup());
		const pool: (() => THREE.Object3D)[] = [
			() => createPaperStack(3 + Math.floor(rand() * 4)),
			() => createNotebook(pick(['#2f4f7a', '#8a2f2a', '#3f6b45', '#26282b'])),
			() => createStickyPad(pick(STICKY_COLORS)),
			() => createDeskPlant(),
			() => createHeadphones(pick(['#2a2b2e', '#e8e6e0', '#c42d22'])),
			() => createWaterBottle(),
			() => createPhone(),
			() => createCan(pick(['#2c8a4a', '#c42d22', '#2c5aa0', '#e8e6e0'])),
			() => createDeskLamp(pick(['#2a2b2e', '#f2f2ee', '#c9a23a'])),
		];
		const extras = 2 + Math.floor(rand() * 3);
		for (let i = 0; i < extras; i++) items.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
		items.forEach((make, i) => {
			if (i >= slots.length) return;
			const [d, l] = slots[i];
			put(make(), d, l, (rand() - 0.5) * 1.2);
		});
	}
}
