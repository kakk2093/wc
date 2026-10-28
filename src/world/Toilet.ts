import * as THREE from 'three';
import type { CircleColliders } from '../physics/CircleColliders.js';
import type { RoomBounds } from './Room.js';
import {
	createPatchworkTexture,
	createWoodPanelTexture,
	createSink,
	createMirror,
	createTowelRing,
	createSoapDish,
	createToilet,
	createPaperTray,
	createPlainDoor,
} from './ToiletProps.js';
import { PeeStream } from './PeeStream.js';
import { createToiletMan, TOILET_MAN_FACE_Y } from './ToiletMan.js';

/** Тесный туалет: поперёк (X) и вглубь (Z), м. Вход — в южной стене, раковина и унитаз — у северной. */
const WIDTH = 1.7;
const DEPTH = 2.4;
const HEIGHT = 2.6;
const NORTH_Z = -DEPTH / 2;
const SOUTH_Z = DEPTH / 2;
/** Сторона плитки на стене, м. */
const TILE = 0.2;
/** Верх раковины над полом. */
const SINK_TOP = 0.85;
const SINK_X = -0.35;
const TOILET_X = 0.42;
const DOOR_WIDTH = 0.8;
const DOOR_HEIGHT = 2.05;
/** Глубина тёмного коридора за дверью, м — оттуда входит мужик. */
const CORRIDOR_DEPTH = 3;
/** Насколько распахивается дверь внутрь туалета, рад. */
const DOOR_SWING = 1.75;
/** Насколько мужик в полный рост может опустить голову, глядя на жука, рад. */
const WALKER_LOOK_DOWN = 0.6;
/** Тёплый жёлтый свет одной лампы под потолком. */
const LAMP_COLOR = '#ffcf70';
/** Где низ мужика из унитаза, когда он вылез: тело уходит в чашу, над ободком — грудь, руки и голова. */
const MAN_BASE_Y = 0.15;

/** Туалет по референсу: лоскутная плитка, стена из тёмных досок, раковина под зеркалом в золотой раме, унитаз. */
export class Toilet {
	readonly scene = new THREE.Scene();
	readonly bounds: RoomBounds = { minX: -WIDTH / 2, maxX: WIDTH / 2, minZ: NORTH_Z, maxZ: SOUTH_Z };
	/** Старт — у двери, лицом к раковине (yaw = 0 — взгляд на север, −Z). */
	readonly spawnPoint = { x: 0, z: SOUTH_Z - 0.7, yaw: 0 };
	/** Дверь обратно — середина полотна на полу. */
	readonly door = { x: 0, z: SOUTH_Z };
	private readonly doorHinge = new THREE.Group();
	/** Мужик в полный рост — входит в дверь (катсцена с жуком). Узлы: голова, ноги, ботинок правой. */
	private readonly walker = createToiletMan(true);
	private readonly walkerHead = this.walker.getObjectByName('head')!;
	private readonly walkerLegs = [this.walker.getObjectByName('legL')!, this.walker.getObjectByName('legR')!];
	private readonly walkerArms = [this.walker.getObjectByName('armL')!, this.walker.getObjectByName('armR')!];
	private readonly walkerShoe = this.walker.getObjectByName('shoeR')!;
	private readonly lookTarget = new THREE.Vector3();
	/** Перед унитазом: отсюда подсказка «обоссать» (в пределах reach) и сюда встаёт игрок, глядя в чашу. */
	readonly toiletSpot = { x: TOILET_X, z: NORTH_Z + 1.05, yaw: 0, pitch: -1.0, reach: 0.75 };
	/** Куда ведёт маркер задачи в туалете — над чашей унитаза. */
	readonly toiletMarker = new THREE.Vector3(TOILET_X, 1.0, NORTH_Z + 0.4);
	/** Вода в чаше — на неё смотрит камера в катсцене. */
	readonly bowl = new THREE.Vector3(TOILET_X, 0.38, NORTH_Z + 0.4);
	/** Мужик из унитаза: спрятан, пока riseMan не выдвинет его из чаши. */
	private readonly man = createToiletMan();
	private readonly manHead = this.man.getObjectByName('head')!;
	private readonly manArms = [this.man.getObjectByName('armL')!, this.man.getObjectByName('armR')!];
	/** Лицо мужика в мире — на него смотрит камера, когда он вылез. */
	readonly manFace = new THREE.Vector3(TOILET_X, MAN_BASE_Y + TOILET_MAN_FACE_Y, NORTH_Z + 0.4);
	readonly ceiling = HEIGHT;
	readonly stream = new PeeStream(this);

	constructor(private readonly colliders: CircleColliders) {
		this.scene.background = new THREE.Color('#120d08');
		this.scene.add(new THREE.AmbientLight('#ffdca0', 0.35));
		const lamp = new THREE.PointLight(LAMP_COLOR, 3, 6, 2);
		lamp.position.set(0, HEIGHT - 0.2, -0.2);
		lamp.castShadow = true;
		this.scene.add(lamp);

		this._buildShell();
		this._buildFixtures();
		this.scene.add(this.stream.group);
		this.man.visible = false;
		this.man.position.set(TOILET_X, 0, NORTH_Z + 0.4);
		this.scene.add(this.man);
		this.walker.visible = false;
		this.scene.add(this.walker);
	}

	/**
	 * Мужик вылезает из чаши: k — от 0 (спрятан) до 1 (вылез). Растёт с лёгким перехлёстом («выпрыгивает»)
	 * и одновременно поднимается из воды.
	 */
	riseMan(k: number, eye: THREE.Vector3): void {
		k = THREE.MathUtils.clamp(k, 0, 1);
		this.man.visible = k > 0;
		// easeOutBack: к концу чуть больше нормы, потом возвращается.
		const s = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
		this.man.scale.setScalar(Math.max(0.001, s));
		this.man.position.y = THREE.MathUtils.lerp(-0.25, MAN_BASE_Y, k);
		// Смотрит на игрока: тело — поворотом к нему, голова — ещё и вверх, в глаза.
		this.man.rotation.y = Math.atan2(eye.x - this.man.position.x, eye.z - this.man.position.z);
		this.man.updateMatrixWorld();
		this.manHead.lookAt(eye);
	}

	/**
	 * Хватает и утаскивает: reach 0..1 — руки поднимаются от ободка и вытягиваются к игроку;
	 * sink 0..1 — мужик уходит обратно в чашу (вместе с игроком). Вызывать после riseMan(1, ...).
	 */
	grabMan(reach: number, sink: number): void {
		reach = THREE.MathUtils.clamp(reach, 0, 1);
		for (const arm of this.manArms) {
			const side = arm.name === 'armL' ? -1 : 1;
			arm.rotation.x = THREE.MathUtils.lerp(-1.2, -2.5, reach);
			arm.rotation.z = side * THREE.MathUtils.lerp(0.3, 0.05, reach);
			arm.scale.y = THREE.MathUtils.lerp(1, 2.8, reach);
		}
		this.man.position.y = THREE.MathUtils.lerp(MAN_BASE_Y, -0.7, THREE.MathUtils.clamp(sink, 0, 1));
	}

	/** Дверь: 0 — закрыта, 1 — распахнута внутрь (поворот на петле). */
	openDoor(k: number): void {
		this.doorHinge.rotation.y = Math.PI - DOOR_SWING * THREE.MathUtils.clamp(k, 0, 1);
	}

	/**
	 * Мужик в полный рост в точке (0, z) — посередине проёма и дальше в туалет; смотрит на eye (голова — прямо в
	 * глаза). walk — фаза шага (рад): ноги и руки ходят вразнобой; stomp 0..1 — правая нога поднята вперёд
	 * (вместо шага), чтобы наступить.
	 */
	placeWalker(z: number, walk: number, stomp: number, eye: THREE.Vector3): void {
		this.walker.visible = true;
		this.walker.position.set(0, 0, z);
		this.walker.rotation.y = Math.atan2(eye.x - this.walker.position.x, eye.z - z);
		const swing = Math.sin(walk) * 0.45;
		this.walkerLegs[0].rotation.x = swing;
		this.walkerLegs[1].rotation.x = stomp > 0 ? -1.15 * stomp : -swing;
		this.walkerArms[0].rotation.x = -swing * 0.8;
		this.walkerArms[1].rotation.x = swing * 0.8;
		this.walker.updateMatrixWorld();
		// Голова смотрит на жука, но опускается не ниже WALKER_LOOK_DOWN — иначе лицо уходит в грудь.
		const head = this.walkerHead.getWorldPosition(this.lookTarget);
		const horizontal = Math.hypot(eye.x - head.x, eye.z - head.z);
		const lowest = head.y - horizontal * Math.tan(WALKER_LOOK_DOWN);
		this.walkerHead.lookAt(this.lookTarget.set(eye.x, Math.max(eye.y, lowest), eye.z));
	}

	/** Лицо мужика в полный рост и подошва его правого ботинка — в мире (out). */
	walkerFace(out: THREE.Vector3): THREE.Vector3 {
		return this.walkerHead.getWorldPosition(out);
	}

	walkerFoot(out: THREE.Vector3): THREE.Vector3 {
		return this.walkerShoe.getWorldPosition(out);
	}

	/** Спрятать мужика (после того как утащил). */
	hideMan(): void {
		this.man.visible = false;
	}

	/** Пол ровный: высота везде 0. */
	getHeightAt(_x: number, _z: number): number {
		return 0;
	}

	/** Вода в чаше унитаза (внутренний овал). */
	isWater(x: number, z: number): boolean {
		return ((x - TOILET_X) / 0.135) ** 2 + ((z - (NORTH_Z + 0.4)) / 0.175) ** 2 <= 1;
	}

	/**
	 * Во что упирается струя над точкой (x, z): вода в чаше, сиденье, бачок с поднятой крышкой, раковина, пол;
	 * за стенами — Infinity (бьёт в стену). Формы грубые — по габаритам моделей из ToiletProps.
	 */
	surfaceAt(x: number, z: number): number {
		const { minX, maxX, minZ, maxZ } = this.bounds;
		if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) return Infinity;
		// Унитаз: чаша и сиденье — вложенные овалы вокруг центра чаши.
		const bx = x - TOILET_X;
		const bz = z - (NORTH_Z + 0.4);
		const inBowl = (rx: number, rz: number) => (bx / rx) ** 2 + (bz / rz) ** 2 <= 1;
		if (this.isWater(x, z)) return 0.38;
		if (inBowl(0.178, 0.23)) return 0.43;
		if (Math.abs(bx) <= 0.18 && z <= NORTH_Z + 0.22) return 0.84;
		// Раковина: бортик и дно чаши.
		const sx = Math.abs(x - SINK_X);
		if (sx <= 0.26 && z <= NORTH_Z + 0.42) return sx <= 0.22 && z <= NORTH_Z + 0.38 && z >= NORTH_Z + 0.11 ? 0.72 : SINK_TOP;
		return 0;
	}

	private _buildShell(): void {
		// Стены — плоскости лицом внутрь: снаружи туалет никто не увидит.
		const wall = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rotY: number) => {
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
			mesh.position.set(x, y, z);
			mesh.rotation.y = rotY;
			mesh.receiveShadow = true;
			this.scene.add(mesh);
		};
		const tiles = (w: number, h: number, seed: number, shade = 1) =>
			new THREE.MeshStandardMaterial({
				map: createPatchworkTexture(Math.round(w / TILE), Math.round(h / TILE), seed, shade),
				roughness: 0.6,
			});
		wall(WIDTH, HEIGHT, tiles(WIDTH, HEIGHT, 1), 0, HEIGHT / 2, NORTH_Z, 0);
		// Южная стена — вокруг дверного проёма: слева, справа и над дверью (за дверью — тёмный коридор).
		const side = (WIDTH - DOOR_WIDTH) / 2;
		const lintel = HEIGHT - DOOR_HEIGHT;
		wall(side, HEIGHT, tiles(side, HEIGHT, 2), -(DOOR_WIDTH + side) / 2, HEIGHT / 2, SOUTH_Z, Math.PI);
		wall(side, HEIGHT, tiles(side, HEIGHT, 4), (DOOR_WIDTH + side) / 2, HEIGHT / 2, SOUTH_Z, Math.PI);
		wall(DOOR_WIDTH, lintel, tiles(DOOR_WIDTH, lintel, 5), 0, DOOR_HEIGHT + lintel / 2, SOUTH_Z, Math.PI);
		// Коридор за дверью — чёрная коробка изнутри: когда дверь распахнут, там ничего не видно.
		const corridor = new THREE.Mesh(
			new THREE.BoxGeometry(DOOR_WIDTH + 0.6, DOOR_HEIGHT + 0.2, CORRIDOR_DEPTH),
			new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.BackSide })
		);
		corridor.position.set(0, (DOOR_HEIGHT + 0.2) / 2, SOUTH_Z + CORRIDOR_DEPTH / 2 + 0.001);
		this.scene.add(corridor);
		wall(DEPTH, HEIGHT, new THREE.MeshStandardMaterial({ map: createWoodPanelTexture(), roughness: 0.5 }), -WIDTH / 2, HEIGHT / 2, 0, Math.PI / 2);
		wall(DEPTH, HEIGHT, new THREE.MeshStandardMaterial({ color: '#e8dcb8' }), WIDTH / 2, HEIGHT / 2, 0, -Math.PI / 2);

		const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), tiles(WIDTH, DEPTH, 3, 0.55));
		floor.rotation.x = -Math.PI / 2;
		floor.receiveShadow = true;
		this.scene.add(floor);
		const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), new THREE.MeshStandardMaterial({ color: '#3a3026' }));
		ceiling.rotation.x = Math.PI / 2;
		ceiling.position.y = HEIGHT;
		this.scene.add(ceiling);
		// Плафон — светящийся круг на потолке над лампой.
		const shade = new THREE.Mesh(
			new THREE.CircleGeometry(0.14, 16),
			new THREE.MeshStandardMaterial({ color: LAMP_COLOR, emissive: LAMP_COLOR, emissiveIntensity: 1.5 })
		);
		shade.rotation.x = Math.PI / 2;
		shade.position.set(0, HEIGHT - 0.005, -0.2);
		this.scene.add(shade);

		// Дверь висит на петле у восточного края проёма; openDoor распахивает её внутрь туалета.
		const door = createPlainDoor(DOOR_WIDTH, DOOR_HEIGHT);
		door.position.x = DOOR_WIDTH / 2;
		this.doorHinge.position.set(DOOR_WIDTH / 2, 0, SOUTH_Z - 0.03);
		this.doorHinge.rotation.y = Math.PI;
		this.doorHinge.add(door);
		this.scene.add(this.doorHinge);
	}

	/** Северная стена: раковина, над ней зеркало, правее — мыльница и полотенце; унитаз справа, бумага между ними. */
	private _buildFixtures(): void {
		const put = (obj: THREE.Object3D, x: number, y: number, z = NORTH_Z) => {
			obj.position.set(x, y, z);
			this.scene.add(obj);
		};
		put(createSink(SINK_TOP), SINK_X, SINK_TOP);
		put(createMirror(0.5, 0.85), SINK_X, 1.62);
		put(createSoapDish(), SINK_X + 0.36, 1.0);
		put(createTowelRing(), TOILET_X - 0.05, 1.4);
		put(createToilet(), TOILET_X, 0);
		put(createPaperTray(), 0.02, 0, NORTH_Z + 0.12);

		this.colliders.add(SINK_X, NORTH_Z + 0.25, 0.28);
		this.colliders.add(TOILET_X, NORTH_Z + 0.4, 0.3);
	}
}
