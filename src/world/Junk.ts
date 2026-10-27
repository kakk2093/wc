import * as THREE from 'three';
import { createToilet } from './ToiletProps.js';

/** Мусор на дне жёлтого моря: разбитые унитазы, рулоны туалетной бумаги с размотанными лентами. */

const PAPER = '#f2efe6';
const CERAMIC = '#f4f1e8';

/**
 * Разбитый унитаз: тот же, что в туалете, но без кусков — без бачка или без крышки, со сколами по краю чаши;
 * отбитое валяется рядом. Начало координат — на дне.
 */
export function createBrokenToilet(random: () => number): THREE.Group {
	const group = new THREE.Group();
	const toilet = createToilet();
	// Части createToilet по порядку: бачок, кнопка, чаша, внутри, вода, сиденье, крышка.
	const [tank, button, , , , seat, lid] = toilet.children;
	const lost: THREE.Object3D[] = [];
	if (random() < 0.5) lost.push(tank, button);
	if (random() < 0.7) lost.push(lid);
	if (random() < 0.4) lost.push(seat);
	for (const part of lost) toilet.remove(part);
	// Лежит на боку или накренился, наполовину в песке.
	toilet.rotation.set((random() - 0.5) * 0.5, random() * Math.PI * 2, random() < 0.4 ? Math.PI / 2 - 0.2 : (random() - 0.5) * 0.4);
	toilet.position.y = -0.08;
	group.add(toilet);

	// Отбитое — рядом на песке: бачок, крышка, сиденье — как есть, только опрокинутые.
	for (const part of lost) {
		if (part === button) continue;
		part.position.set((random() - 0.5) * 1.4, part === tank ? 0.12 : 0.03, (random() - 0.5) * 1.4);
		part.rotation.set(random() < 0.5 ? Math.PI / 2 : 0, random() * Math.PI, (random() - 0.5) * 0.6);
		group.add(part);
	}
	// Осколки — острые гранёные куски.
	const shard = new THREE.MeshStandardMaterial({ color: CERAMIC, roughness: 0.2, flatShading: true });
	const shardGeometry = new THREE.TetrahedronGeometry(0.06, 0);
	const shards = 3 + Math.floor(random() * 5);
	for (let i = 0; i < shards; i++) {
		const piece = new THREE.Mesh(shardGeometry, shard);
		piece.scale.set(0.6 + random(), 0.3 + random() * 0.4, 0.6 + random());
		piece.position.set((random() - 0.5) * 1.2, 0.01, (random() - 0.5) * 1.2);
		piece.rotation.set(random() * 3, random() * 3, random() * 3);
		group.add(piece);
	}
	return group;
}

/** Рулон туалетной бумаги, лежит на боку. Начало координат — на дне. */
export function createPaperRoll(): THREE.Group {
	const group = new THREE.Group();
	const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 10), new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.9 }));
	roll.rotation.z = Math.PI / 2;
	roll.position.y = 0.055;
	group.add(roll);
	const core = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.102, 6), new THREE.MeshStandardMaterial({ color: '#8a7a5c' }));
	core.rotation.z = Math.PI / 2;
	core.position.y = 0.055;
	group.add(core);
	return group;
}

/** Размотанная лента бумаги: тянется от рулона вверх и колышется течением (wave). */
export class PaperStrip {
	readonly mesh: THREE.Mesh;
	private readonly base: Float32Array;
	private readonly phase: number;

	constructor(length: number, phase: number) {
		const geometry = new THREE.PlaneGeometry(0.1, length, 1, 12);
		// Низ ленты — в начале координат, лента растёт вверх.
		geometry.translate(0, length / 2, 0);
		this.base = Float32Array.from(geometry.attributes.position.array);
		this.mesh = new THREE.Mesh(
			geometry,
			new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.9, side: THREE.DoubleSide, flatShading: true })
		);
		this.phase = phase;
	}

	/** Лента гнётся волной: чем выше точка, тем сильнее её уводит в сторону. */
	wave(time: number): void {
		const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
		for (let i = 0; i < pos.count; i++) {
			const y = this.base[i * 3 + 1];
			const sway = y * y * 0.12;
			pos.setX(i, this.base[i * 3] + Math.sin(time * 1.3 + this.phase + y * 2) * sway);
			pos.setZ(i, this.base[i * 3 + 2] + Math.sin(time * 0.9 + this.phase * 1.7 + y * 1.6) * sway);
		}
		pos.needsUpdate = true;
		this.mesh.geometry.computeVertexNormals();
	}
}
