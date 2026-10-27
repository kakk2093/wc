/**
 * Статичные круглые коллайдеры на плоскости XZ (мебель, колонны и т.п.) с пространственной сеткой.
 */
export interface Circle {
	x: number;
	z: number;
	radius: number;
}

export class CircleColliders {
	private readonly cells = new Map<number, Circle[]>();

	/** @param cellSize размер ячейки сетки, м (≥ диаметра крупнейшего коллайдера) */
	constructor(private readonly cellSize = 2) {}

	add(x: number, z: number, radius: number): Circle {
		const circle = { x, z, radius };
		const key = this._key(this._cell(x), this._cell(z));
		let list = this.cells.get(key);
		if (!list) this.cells.set(key, (list = []));
		list.push(circle);
		return circle;
	}

	remove(circle: Circle): void {
		const list = this.cells.get(this._key(this._cell(circle.x), this._cell(circle.z)));
		const i = list ? list.indexOf(circle) : -1;
		if (i >= 0) list!.splice(i, 1);
	}

	/** Пересекается ли круг (x, z, radius) хоть с одним коллайдером. */
	overlaps(x: number, z: number, radius: number): boolean {
		const cx = this._cell(x);
		const cz = this._cell(z);
		for (let i = cx - 1; i <= cx + 1; i++) {
			for (let j = cz - 1; j <= cz + 1; j++) {
				const list = this.cells.get(this._key(i, j));
				if (!list) continue;
				for (const c of list) {
					const min = radius + c.radius;
					if ((x - c.x) ** 2 + (z - c.z) ** 2 < min * min) return true;
				}
			}
		}
		return false;
	}

	/** Выталкивает круг игрока из пересекающихся коллайдеров. Меняет position.x / position.z. */
	resolve(position: { x: number; z: number }, radius: number): void {
		// Пара итераций — чтобы выталкивание из одного не заталкивало в соседний.
		for (let iter = 0; iter < 2; iter++) {
			const cx = this._cell(position.x);
			const cz = this._cell(position.z);
			for (let i = cx - 1; i <= cx + 1; i++) {
				for (let j = cz - 1; j <= cz + 1; j++) {
					const list = this.cells.get(this._key(i, j));
					if (list) for (const c of list) this._push(position, radius, c);
				}
			}
		}
	}

	private _push(position: { x: number; z: number }, radius: number, c: Circle): void {
		const dx = position.x - c.x;
		const dz = position.z - c.z;
		const minDist = radius + c.radius;
		const distSq = dx * dx + dz * dz;
		if (distSq >= minDist * minDist) return;

		const dist = Math.sqrt(distSq);
		if (dist < 1e-6) {
			position.x += minDist;
			return;
		}
		const k = (minDist - dist) / dist;
		position.x += dx * k;
		position.z += dz * k;
	}

	private _cell(v: number): number {
		return Math.floor(v / this.cellSize);
	}

	private _key(cx: number, cz: number): number {
		return (cx + 1048576) * 2097152 + (cz + 1048576);
	}
}
