import * as THREE from 'three';

/** Большая лоуполи-какашка: витки-бублики друг на друге, всё уже к верху, сверху — загнутый хвостик. */

const COLOR = '#6b4423';
/** Радиусы витков снизу вверх, м; толщина витка — доля радиуса. */
const COILS = [1.5, 1.2, 0.9, 0.6];
const TUBE = 0.42;

/** Высота какашки, м (без хвостика) — по ней игрок «съезжает» по бокам, а не проплывает насквозь. */
export const POOP_HEIGHT = 2.6;
/** Радиус основания, м. */
export const POOP_RADIUS = 1.5 * (1 + TUBE);

export function createPoop(): THREE.Group {
	const group = new THREE.Group();
	// Чуть светится сама — в полной темноте её видно даже краем луча.
	const material = new THREE.MeshStandardMaterial({
		color: COLOR,
		emissive: '#3a2410',
		emissiveIntensity: 0.4,
		roughness: 0.45,
		flatShading: true,
	});
	let y = 0;
	COILS.forEach((radius, i) => {
		const tube = radius * TUBE;
		y += i === 0 ? tube : tube * 1.5;
		const coil = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 12), material);
		coil.rotation.x = Math.PI / 2;
		// Витки чуть повёрнуты и сдвинуты — спираль, а не ровная стопка.
		coil.rotation.z = i * 0.9;
		coil.position.set(Math.sin(i * 1.7) * 0.08, y, Math.cos(i * 1.7) * 0.08);
		group.add(coil);
	});
	// Серединка — чтобы сквозь дырки бубликов не было видно пустоты.
	const core = new THREE.Mesh(new THREE.ConeGeometry(1.1, y + 0.2, 8), material);
	core.position.y = (y + 0.2) / 2;
	group.add(core);
	// Хвостик — конус, загнутый вбок.
	const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 6), material);
	tip.position.set(0.12, y + 0.45, 0);
	tip.rotation.z = -0.45;
	group.add(tip);
	group.traverse((o) => (o.castShadow = true));
	return group;
}
