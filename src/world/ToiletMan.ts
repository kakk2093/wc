import * as THREE from 'three';
import faceUrl from '../assets/toilet-man.png';

/** Мужик из унитаза: лоуполи — коробки и шар-голова; лицо — картинка спереди головы. Стоит лицом на +Z. */

const SKIN = '#d9b49a';
const HAIR = '#1d1b1b';
const SUIT = '#2a2c31';
const SHIRT = '#d8dce6';
const TIE = '#3b3e44';
/** Кусок картинки с лицом (волосы — подбородок), в долях: offset — левый нижний угол, repeat — размер. */
const FACE_OFFSET = new THREE.Vector2(0.31, 0.22);
const FACE_REPEAT = new THREE.Vector2(0.47, 0.74);

/** Размер головы (ширина, высота, глубина), м. */
const HEAD_SIZE = new THREE.Vector3(0.17, 0.24, 0.19);

/** Высота центра головы над низом модели — сюда смотрит камера в катсцене. */
export const TOILET_MAN_FACE_Y = 0.6;

export function createToiletMan(): THREE.Group {
	const group = new THREE.Group();
	const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
	const box = (w: number, h: number, d: number, material: THREE.Material | THREE.Material[], x: number, y: number, z = 0) => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
		mesh.position.set(x, y, z);
		mesh.castShadow = true;
		return mesh;
	};

	const skin = mat(SKIN);
	const hair = mat(HAIR);
	const suit = mat(SUIT);

	// Тело: пиджак, спереди — полоска рубашки и галстук.
	group.add(box(0.36, 0.4, 0.2, suit, 0, 0.2));
	group.add(box(0.1, 0.3, 0.01, mat(SHIRT), 0, 0.25, 0.1));
	group.add(box(0.035, 0.24, 0.012, mat(TIE), 0, 0.24, 0.106));
	group.add(box(0.07, 0.06, 0.07, skin, 0, 0.43));

	// Голова — вытянутый шар из двух половин: передняя с лицом, задняя — затылок в цвет волос.
	// Узел «head» — его поворачивает Toilet, чтобы мужик смотрел на игрока (лицо — на +Z узла).
	const head = new THREE.Group();
	head.name = 'head';
	head.position.y = TOILET_MAN_FACE_Y;
	head.scale.set(HEAD_SIZE.x / 2, HEAD_SIZE.y / 2, HEAD_SIZE.z / 2);
	const front = new THREE.SphereGeometry(1, 8, 10, 0, Math.PI);
	// Лицо — проекция картинки спереди (а не обёртка вокруг шара): не растягивается к бокам.
	const pos = front.attributes.position;
	const uv = front.attributes.uv;
	for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 1) / 2, (pos.getY(i) + 1) / 2);
	const face = new THREE.TextureLoader().load(faceUrl);
	face.colorSpace = THREE.SRGBColorSpace;
	face.offset.copy(FACE_OFFSET);
	face.repeat.copy(FACE_REPEAT);
	// Чётче: без мип-карт (они мылят мелкую картинку) и с анизотропией; пиксели даёт уже общий рендер.
	face.generateMipmaps = false;
	face.minFilter = THREE.LinearFilter;
	face.anisotropy = 8;
	// Лицо подсвечено само — в тёплом полумраке туалета иначе тонет в тени.
	const faceMat = new THREE.MeshStandardMaterial({ map: face, emissive: '#ffffff', emissiveMap: face, emissiveIntensity: 0.45, roughness: 0.8 });
	head.add(new THREE.Mesh(front, faceMat));
	head.add(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 10, Math.PI, Math.PI), hair));
	group.add(head);

	// Руки: от плеч вперёд и вниз — ладонями на передний край ободка.
	for (const side of [-1, 1]) {
		const shoulder = new THREE.Group();
		// Имена — для Toilet: руки тянутся к игроку, когда мужик хватает.
		shoulder.name = side < 0 ? 'armL' : 'armR';
		shoulder.position.set(side * 0.2, 0.36, 0);
		shoulder.rotation.z = side * 0.3;
		shoulder.rotation.x = -1.2;
		shoulder.add(box(0.085, 0.3, 0.085, suit, 0, -0.15));
		shoulder.add(box(0.07, 0.08, 0.05, skin, 0, -0.34));
		group.add(shoulder);
	}
	return group;
}
