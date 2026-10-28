import * as THREE from 'three';
import type { RoomBounds } from './Room.js';

/**
 * Финал: тёмная комната, старый телевизор на тумбе — в нём шёл весь туалет. Перед телевизором, спиной к нам, —
 * фигура в балахоне до пола с капюшоном и пультом; вместо лица — светящийся «?», на груди — круглый амулет с «A».
 * Телевизор смотрит на +Z, фигура стоит между ним и камерой.
 */

const SIZE = 6;
const ROBE = '#1b1820';
const AMULET = '#c9a23a';
/** Экран телевизора: размер и центр, м. */
const SCREEN_W = 0.52;
const SCREEN_H = 0.39;
const TV_Z = -2;
const SCREEN_Y = 0.78;
/** Где стоит фигура (в метре с небольшим от телевизора) и высота её лица и амулета. */
const FIGURE_Z = -0.6;
const FACE_Y = 1.68;
const AMULET_Y = 1.24;
/** Свечение экрана — единственный заметный свет в комнате, пока телевизор включён. */
const GLOW = 2.5;
/** Полуширина проёма капюшона спереди, рад. */
const HOOD_OPENING = 1;

/** Знак на тёмном круге — светящаяся надпись (лицо «?», буква на амулете). */
function signTexture(sign: string, color: string, background: string): THREE.CanvasTexture {
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const g = canvas.getContext('2d')!;
	g.fillStyle = background;
	g.fillRect(0, 0, size, size);
	g.fillStyle = color;
	g.font = 'bold 46px Georgia, serif';
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText(sign, size / 2, size / 2 + 3);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

export class TvRoom {
	readonly scene = new THREE.Scene();
	readonly bounds: RoomBounds = { minX: -SIZE / 2, maxX: SIZE / 2, minZ: -SIZE / 2, maxZ: SIZE / 2 };
	/** Центр экрана — с него начинается отъезд камеры. */
	readonly screenCenter = new THREE.Vector3(0, SCREEN_Y, TV_Z + 0.26);
	readonly face = new THREE.Vector3(0, FACE_Y, FIGURE_Z);
	readonly amulet = new THREE.Vector3(0, AMULET_Y, FIGURE_Z);
	private readonly screen: THREE.Mesh;
	private readonly screenMaterial: THREE.MeshBasicMaterial;
	private readonly glow = new THREE.PointLight('#a8c8ff', GLOW, 6, 1.5);
	private readonly figure = new THREE.Group();
	private readonly remoteArm = new THREE.Group();

	/** tvImage — картинка на экране (туалет, который рендерит Game). */
	constructor(tvImage: THREE.Texture) {
		this.scene.background = new THREE.Color('#050407');
		this.scene.add(new THREE.AmbientLight('#7a7090', 0.35));
		// Холодный свет спереди-сверху на фигуру — когда телевизор гаснет, лицо и амулет всё равно видно.
		const key = new THREE.SpotLight('#c8c0ff', 6, 6, 0.6, 0.7, 1.2);
		key.position.set(0.6, 2.4, 1.4);
		key.target.position.set(0, FACE_Y - 0.2, FIGURE_Z);
		this.scene.add(key, key.target);

		const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 1 }));
		floor.rotation.x = -Math.PI / 2;
		this.scene.add(floor);
		const back = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, 3), new THREE.MeshStandardMaterial({ color: '#211c22' }));
		back.position.set(0, 1.5, TV_Z - 0.6);
		this.scene.add(back);

		// Тумба и телевизор-«ящик»; экран — картинка tvImage.
		const plastic = new THREE.MeshStandardMaterial({ color: '#2b2a2c', roughness: 0.6 });
		const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: '#3a2a1c' }));
		stand.position.set(0, 0.25, TV_Z);
		this.scene.add(stand);
		const box = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.56, 0.5), plastic);
		box.position.set(0, SCREEN_Y, TV_Z);
		this.scene.add(box);
		this.screenMaterial = new THREE.MeshBasicMaterial({ map: tvImage, fog: false });
		this.screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), this.screenMaterial);
		this.screen.position.copy(this.screenCenter);
		this.scene.add(this.screen);
		// Антенна-«рога».
		for (const side of [-1, 1]) {
			const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 4), plastic);
			rod.position.set(side * 0.1, SCREEN_Y + 0.28 + 0.17, TV_Z);
			rod.rotation.z = -side * 0.5;
			this.scene.add(rod);
		}
		this.glow.position.set(0, SCREEN_Y, TV_Z + 0.6);
		this.scene.add(this.glow);

		this._buildFigure();
	}

	/** Балахон до пола, капюшон, «?» вместо лица, амулет с «A»; правая рука — с пультом (raiseRemote). */
	private _buildFigure(): void {
		const robe = new THREE.MeshStandardMaterial({ color: ROBE, roughness: 1, flatShading: true });
		const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.44, 1.5, 9), robe);
		body.position.y = 0.75;
		this.figure.add(body);
		const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.24, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), robe);
		// Плечи — низкие и плоские: верх ниже лица, балахон не наползает на него.
		shoulders.scale.set(1, 0.45, 0.8);
		shoulders.position.y = 1.4;
		this.figure.add(shoulders);
		// Капюшон — шар с остриём назад, спереди открыт (изнутри тоже виден); лицо — тёмный круг со светящимся «?»
		// в глубине проёма.
		const hood = new THREE.Mesh(
			new THREE.SphereGeometry(0.17, 12, 8, Math.PI / 2 + HOOD_OPENING, Math.PI * 2 - HOOD_OPENING * 2),
			new THREE.MeshStandardMaterial({ color: ROBE, roughness: 1, flatShading: true, side: THREE.DoubleSide })
		);
		hood.scale.set(1, 1.15, 1.05);
		hood.position.y = FACE_Y;
		this.figure.add(hood);
		const peak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 7), robe);
		peak.position.set(0, FACE_Y + 0.12, -0.12);
		peak.rotation.x = -0.9;
		this.figure.add(peak);
		const faceSign = signTexture('?', '#f2e6c4', '#060507');
		const face = new THREE.Mesh(
			new THREE.CircleGeometry(0.105, 14),
			new THREE.MeshStandardMaterial({ map: faceSign, emissive: '#ffffff', emissiveMap: faceSign, emissiveIntensity: 0.9 })
		);
		face.scale.y = 1.2;
		face.position.set(0, FACE_Y - 0.01, 0.1);
		this.figure.add(face);

		// Амулет на цепочке: золотой диск с «A».
		const gold = new THREE.MeshStandardMaterial({ color: AMULET, metalness: 0.7, roughness: 0.35 });
		const chain = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.006, 4, 16, Math.PI), gold);
		chain.rotation.set(-0.3, 0, Math.PI);
		chain.position.set(0, 1.42, 0.13);
		this.figure.add(chain);
		const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 16), gold);
		disc.rotation.x = Math.PI / 2;
		disc.position.set(0, AMULET_Y, 0.27);
		this.figure.add(disc);
		// «A» — отдельный круг поверх диска: у крышки цилиндра картинка легла бы на бок.
		const letter = signTexture('A', '#fff1b0', AMULET);
		const front = new THREE.Mesh(
			new THREE.CircleGeometry(0.07, 16),
			new THREE.MeshStandardMaterial({ map: letter, emissive: '#ffffff', emissiveMap: letter, emissiveIntensity: 0.5, metalness: 0.5 })
		);
		front.position.set(0, AMULET_Y, 0.279);
		this.figure.add(front);

		// Правая рука в рукаве, в кисти — пульт; поднимается вперёд, к телевизору.
		this.remoteArm.position.set(0.22, 1.4, 0);
		const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 7), robe);
		sleeve.position.y = -0.3;
		this.remoteArm.add(sleeve);
		const remote = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.17), new THREE.MeshStandardMaterial({ color: '#141414' }));
		remote.position.set(0, -0.62, 0.05);
		this.remoteArm.add(remote);
		const button = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.006, 0.015), new THREE.MeshBasicMaterial({ color: '#d03020' }));
		button.position.set(0, -0.6, 0.11);
		this.remoteArm.add(button);
		this.figure.add(this.remoteArm);

		this.figure.position.set(0, 0, FIGURE_Z);
		this.setTurn(0);
		this.scene.add(this.figure);
	}

	/** 0 — фигура лицом к телевизору (спиной к нам), 1 — развернулась к нам (вокруг себя: лицо и амулет на месте). */
	setTurn(k: number): void {
		this.figure.rotation.y = Math.PI * (1 - THREE.MathUtils.clamp(k, 0, 1));
	}

	/** 0 — рука с пультом опущена, 1 — вытянута вперёд, к телевизору. */
	raiseRemote(k: number): void {
		this.remoteArm.rotation.x = -1.35 * THREE.MathUtils.clamp(k, 0, 1);
	}

	/**
	 * Выключение, как у старого кинескопа: k 0..1 — картинка белеет и схлопывается в горизонтальную полосу, полоса
	 * — в точку, свет от экрана гаснет.
	 */
	switchOff(k: number): void {
		k = THREE.MathUtils.clamp(k, 0, 1);
		if (k <= 0) return;
		this.screenMaterial.map = null;
		this.screenMaterial.color.set(k < 1 ? '#ffffff' : '#000000');
		this.screenMaterial.needsUpdate = true;
		const squash = THREE.MathUtils.clamp(k / 0.5, 0, 1);
		const shrink = THREE.MathUtils.clamp((k - 0.5) / 0.5, 0, 1);
		this.screen.scale.set(Math.max(0.01, 1 - shrink), Math.max(0.02, 1 - squash), 1);
		this.glow.intensity = GLOW * (1 - k) * 0.6;
		if (k >= 1) {
			// Погасший экран — тёмное стекло во весь размер.
			this.screen.scale.set(1, 1, 1);
		}
	}
}
