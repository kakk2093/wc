import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/** Палитра «лоскутной» плитки: кремовый, светлый, коричневый, тёмно-коричневый, серо-голубой. */
const TILE_COLORS = ['#e3cf9d', '#f0e2b8', '#8c6544', '#5a4030', '#7f8a9c'];
/** Сторона одной плитки в текстуре, px: мелко — чтобы картинка оставалась пиксельной. */
const TILE_PX = 32;

const ceramic = () => new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.2 });
const chrome = () => new THREE.MeshStandardMaterial({ color: '#c9c9c4', metalness: 0.8, roughness: 0.3 });
const blackMetal = () => new THREE.MeshStandardMaterial({ color: '#1e1e20', metalness: 0.5, roughness: 0.4 });

function nearestTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
	const texture = new THREE.CanvasTexture(canvas);
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/**
 * Пэчворк-плитка: каждая плитка — свой геометрический узор (треугольники, ромб, квадрат в квадрате, крест,
 * восьмиугольник, меандр, шашка), повёрнутый на случайные 90°. seed — чтобы стены отличались, но одинаково
 * при каждом запуске; shade < 1 — темнее (пол).
 */
export function createPatchworkTexture(cols: number, rows: number, seed: number, shade = 1): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = cols * TILE_PX;
	canvas.height = rows * TILE_PX;
	const ctx = canvas.getContext('2d')!;
	ctx.imageSmoothingEnabled = false;
	let s = seed * 9301 + 49297;
	const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
	const pick = () => TILE_COLORS[Math.floor(rand() * TILE_COLORS.length)];
	const t = TILE_PX;

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const base = pick();
			let ink = pick();
			if (ink === base) ink = TILE_COLORS[(TILE_COLORS.indexOf(base) + 2) % TILE_COLORS.length];
			ctx.save();
			ctx.translate(col * t + t / 2, row * t + t / 2);
			ctx.rotate(Math.floor(rand() * 4) * (Math.PI / 2));
			ctx.translate(-t / 2, -t / 2);
			ctx.fillStyle = base;
			ctx.fillRect(0, 0, t, t);
			ctx.fillStyle = ink;
			ctx.strokeStyle = ink;
			ctx.lineWidth = 5;
			const poly = (points: [number, number][]) => {
				ctx.beginPath();
				points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
				ctx.closePath();
				ctx.fill();
			};
			switch (Math.floor(rand() * 7)) {
				case 0: // Пополам по диагонали.
					poly([[0, 0], [t, 0], [0, t]]);
					break;
				case 1: // Квадрат в квадрате.
					ctx.fillRect(6, 6, t - 12, t - 12);
					ctx.fillStyle = base;
					ctx.fillRect(12, 12, t - 24, t - 24);
					break;
				case 2: // Ромб.
					poly([[t / 2, 2], [t - 2, t / 2], [t / 2, t - 2], [2, t / 2]]);
					break;
				case 3: // Крест по диагоналям.
					ctx.beginPath();
					ctx.moveTo(0, 0);
					ctx.lineTo(t, t);
					ctx.moveTo(t, 0);
					ctx.lineTo(0, t);
					ctx.stroke();
					break;
				case 4: { // Восьмиугольник контуром.
					const a = 9;
					ctx.lineWidth = 3;
					ctx.beginPath();
					[[a, 3], [t - a, 3], [t - 3, a], [t - 3, t - a], [t - a, t - 3], [a, t - 3], [3, t - a], [3, a]].forEach(([x, y], i) =>
						i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
					);
					ctx.closePath();
					ctx.stroke();
					break;
				}
				case 5: // Меандр: «Е» из полос.
					ctx.fillRect(4, 4, 5, t - 8);
					for (const y of [4, t / 2 - 2, t - 9]) ctx.fillRect(4, y, t - 10, 5);
					break;
				default: // Шашка 2×2 из треугольников.
					poly([[0, 0], [t / 2, 0], [0, t / 2]]);
					poly([[t, t], [t / 2, t], [t, t / 2]]);
					poly([[t, 0], [t, t / 2], [t / 2, 0]]);
					poly([[0, t], [0, t / 2], [t / 2, t]]);
			}
			ctx.restore();
		}
	}
	// Швы между плитками.
	ctx.fillStyle = 'rgba(40,30,20,0.55)';
	for (let col = 0; col <= cols; col++) ctx.fillRect(col * t - 1, 0, 1, canvas.height);
	for (let row = 0; row <= rows; row++) ctx.fillRect(0, row * t - 1, canvas.width, 1);
	if (shade < 1) {
		ctx.fillStyle = `rgba(20,14,8,${1 - shade})`;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	return nearestTexture(canvas);
}

/** Стена из тёмных вертикальных досок с прожилками. */
export function createWoodPanelTexture(): THREE.CanvasTexture {
	const w = 128;
	const h = 160;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;
	let s = 7;
	const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
	const board = 16;
	for (let x = 0; x < w; x += board) {
		ctx.fillStyle = ['#4a2e1c', '#563622', '#40281a'][Math.floor(rand() * 3)];
		ctx.fillRect(x, 0, board, h);
		// Прожилки — тонкие волнистые полосы вдоль доски.
		ctx.fillStyle = 'rgba(25,14,8,0.45)';
		for (let i = 0; i < 4; i++) {
			const gx = x + 2 + Math.floor(rand() * (board - 4));
			for (let y = 0; y < h; y += 4) ctx.fillRect(gx + Math.round(Math.sin(y * 0.08 + i) * 1.5), y, 1, 4);
		}
		ctx.fillStyle = '#24160d';
		ctx.fillRect(x, 0, 1, h);
	}
	return nearestTexture(canvas);
}

/**
 * Подвесная раковина на чёрной раме: полая чаша, чёрный смеситель, слив. Начало координат — на стене,
 * на уровне верха раковины topY над полом; перёд — +Z.
 */
export function createSink(topY: number): THREE.Group {
	const group = new THREE.Group();
	const mat = ceramic();
	const w = 0.52;
	const d = 0.42;
	const h = 0.16;
	const part = (pw: number, ph: number, pd: number, x: number, y: number, z: number, m: THREE.Material = mat) => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), m);
		mesh.position.set(x, y, z);
		mesh.castShadow = true;
		group.add(mesh);
		return mesh;
	};
	// Чаша: дно, стенки; задняя толще — на ней стоит смеситель.
	part(w, 0.03, d, 0, -h + 0.015, d / 2);
	part(w, h, 0.04, 0, -h / 2, d - 0.02);
	part(w, h, 0.11, 0, -h / 2, 0.055);
	part(0.04, h, d, -w / 2 + 0.02, -h / 2, d / 2);
	part(0.04, h, d, w / 2 - 0.02, -h / 2, d / 2);
	// Слив.
	const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 10), chrome());
	drain.position.set(0, -h + 0.032, d * 0.6);
	group.add(drain);
	// Смеситель: стойка, излив, рычажок.
	const black = blackMetal();
	const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.16, 8), black);
	stem.position.set(0, 0.08, 0.06);
	group.add(stem);
	part(0.024, 0.024, 0.1, 0, 0.15, 0.1, black);
	part(0.012, 0.012, 0.06, 0, 0.18, 0.04, black);
	// Рама под раковиной — две чёрные стойки до пола.
	const legH = topY - h;
	for (const x of [-0.19, 0.19]) part(0.025, legH, 0.025, x, -h - legH / 2, d - 0.08, black);
	return group;
}

/** Зеркало в широкой золочёной раме: настоящее отражение (Reflector), пониженное разрешение — под пиксели. */
export function createMirror(width: number, height: number): THREE.Group {
	const group = new THREE.Group();
	const glass = new Reflector(new THREE.PlaneGeometry(width, height), {
		textureWidth: 128,
		textureHeight: Math.round((128 * height) / width),
		color: 0xb8b3a0,
	});
	glass.position.z = 0.02;
	group.add(glass);
	const gold = new THREE.MeshStandardMaterial({ color: '#a9852f', metalness: 0.7, roughness: 0.35 });
	const f = 0.07;
	for (const [x, y, fw, fh] of [
		[0, height / 2 + f / 2, width + f * 2, f],
		[0, -height / 2 - f / 2, width + f * 2, f],
		[-width / 2 - f / 2, 0, f, height],
		[width / 2 + f / 2, 0, f, height],
	] as const) {
		const edge = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), gold);
		edge.position.set(x, y, 0.025);
		group.add(edge);
	}
	return group;
}

/** Хромированное кольцо-полотенцедержатель с висящим полотенцем. Начало координат — центр кольца на стене. */
export function createTowelRing(): THREE.Group {
	const group = new THREE.Group();
	const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 6, 20), chrome());
	ring.position.z = 0.04;
	group.add(ring);
	const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 8), chrome());
	mount.rotation.x = Math.PI / 2;
	mount.position.set(0, 0.07, 0.02);
	group.add(mount);
	// Полотенце перекинуто через низ кольца: две половины, передняя чуть длиннее и неровно.
	const cloth = new THREE.MeshStandardMaterial({ color: '#eeeae0', roughness: 0.95 });
	for (const [z, len, tilt] of [
		[0.03, 0.26, 0.04],
		[0.05, 0.32, -0.08],
	] as const) {
		const half = new THREE.Mesh(new THREE.BoxGeometry(0.15, len, 0.015), cloth);
		half.position.set(0, -0.07 - len / 2, z);
		half.rotation.z = tilt;
		half.castShadow = true;
		group.add(half);
	}
	return group;
}

/** Мыльница-решётка с куском мыла. Начало координат — на стене, перёд — +Z. */
export function createSoapDish(): THREE.Group {
	const group = new THREE.Group();
	const tray = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.015, 0.09), chrome());
	tray.position.set(0, 0, 0.05);
	group.add(tray);
	const soap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.05), new THREE.MeshStandardMaterial({ color: '#e6dcc0' }));
	soap.position.set(0, 0.02, 0.05);
	group.add(soap);
	return group;
}

/**
 * Унитаз с бачком, крышка поднята. Начало координат — на полу у стены, перёд (чаша) — +Z.
 * Овалы — растянутые по Z цилиндры и тор.
 */
export function createToilet(): THREE.Group {
	const group = new THREE.Group();
	const mat = ceramic();
	const tank = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.17), mat);
	tank.position.set(0, 0.6, 0.09);
	tank.castShadow = true;
	group.add(tank);
	const button = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 10), chrome());
	button.position.set(0, 0.795, 0.09);
	group.add(button);

	const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.38, 14), mat);
	bowl.scale.z = 1.35;
	bowl.position.set(0, 0.19, 0.38);
	bowl.castShadow = true;
	group.add(bowl);
	// Внутри чаши — тень и вода.
	const inside = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.005, 14), new THREE.MeshStandardMaterial({ color: '#8f8a7c' }));
	inside.scale.z = 1.3;
	inside.position.set(0, 0.383, 0.4);
	group.add(inside);
	const water = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.005, 10), new THREE.MeshStandardMaterial({ color: '#4f5a5e' }));
	water.scale.z = 1.3;
	water.position.set(0, 0.386, 0.37);
	group.add(water);

	const seat = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 6, 18), mat);
	seat.scale.y = 1.3;
	seat.rotation.x = -Math.PI / 2;
	seat.position.set(0, 0.4, 0.4);
	group.add(seat);
	// Крышка поднята и чуть откинута на бачок.
	const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 16), mat);
	lid.scale.z = 1.3;
	lid.rotation.x = Math.PI / 2 - 0.15;
	lid.position.set(0, 0.62, 0.2);
	lid.castShadow = true;
	group.add(lid);
	return group;
}

/** Прозрачный лоток на полу с двумя стоящими рулонами туалетной бумаги. */
export function createPaperTray(): THREE.Group {
	const group = new THREE.Group();
	const tray = new THREE.Mesh(
		new THREE.BoxGeometry(0.3, 0.05, 0.15),
		new THREE.MeshStandardMaterial({ color: '#c8c6be', transparent: true, opacity: 0.5 })
	);
	tray.position.y = 0.025;
	group.add(tray);
	const paper = new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.9 });
	const hole = new THREE.MeshStandardMaterial({ color: '#8a7a5c' });
	for (const x of [-0.07, 0.07]) {
		const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 12), paper);
		roll.position.set(x, 0.06, 0);
		group.add(roll);
		const core = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.102, 8), hole);
		core.position.copy(roll.position);
		group.add(core);
	}
	return group;
}

/** Глухая тёмно-серая дверь с ручкой-рычагом. Начало координат — низ по центру полотна, перёд — +Z. */
export function createPlainDoor(width: number, height: number): THREE.Group {
	const group = new THREE.Group();
	const slab = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.05), new THREE.MeshStandardMaterial({ color: '#3a3d42' }));
	slab.position.set(0, height / 2, 0);
	group.add(slab);
	const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), chrome());
	handle.position.set(-width / 2 + 0.12, 1.0, 0.05);
	group.add(handle);
	return group;
}
