import * as THREE from 'three';
import { Input } from './Input.js';
import { PlayerController } from '../player/PlayerController.js';
import { SwimArms } from '../player/SwimArms.js';
import { CircleColliders } from '../physics/CircleColliders.js';
import { Room } from '../world/Room.js';
import { Toilet } from '../world/Toilet.js';
import { Underwater } from '../world/Underwater.js';
import { Footsteps } from '../audio/Footsteps.js';
import { PostProcess } from '../render/PostProcess.js';
import { Sfx } from '../audio/Sfx.js';
import { LofiMusic } from '../audio/LofiMusic.js';
import { StreamSound } from '../audio/StreamSound.js';
import type { Dialogue, Voice } from './Interaction.js';
import { DialogueBox } from '../ui/DialogueBox.js';
import { Letterbox, LETTERBOX_SLIDE_TIME } from '../ui/Letterbox.js';
import { INTRO } from './Intro.js';
import { ObjectiveHud } from '../ui/ObjectiveHud.js';
import { TargetMarker } from '../ui/TargetMarker.js';
import { ProgressBar } from '../ui/ProgressBar.js';

/** Во сколько раз буфер рендера меньше экрана — размер «пикселя». */
const PIXEL_SIZE = 4;
/** Сколько не доходить до стены, м. */
const WALL_MARGIN = 0.4;
/** С какого расстояния до двери она открывается по E. */
const DOOR_REACH = 2.2;
/** В тесном туалете дверь рядом всегда — подсказка только вплотную к ней. */
const TOILET_DOOR_REACH = 0.6;
/** Заливка экрана при переходе (жёлтая): скрывает смену места. Мягкая, не резкая. */
const FLASH_IN = 0.35;
const FLASH_HOLD = 0.3;
const FLASH_OUT = 1.4;
const FLASH_COLOR = '#f2d23a';
/** Высота «голоса» при печати реплик, Гц. */
const VOICE_PITCH: Record<Voice, number> = { dinnerLady: 330, cashier: 260, player: 170, toiletMan: 120 };
/** Катсцена у унитаза: через сколько секунд вылезает мужик и за сколько вылезает целиком. */
const MAN_DELAY = 3;
const MAN_RISE = 0.6;
/** Хватание: за сколько руки дотягиваются до камеры, за сколько камеру утаскивает в чашу и когда начать заливку. */
const GRAB_REACH = 0.3;
const GRAB_PULL = 0.9;
const GRAB_FLASH_AT = 0.4;
/** Сколько длится сбой картинки и звука на глитч-хвосте реплики, с. */
const GLITCH_TIME = 0.4;
/** Задача после мыслей у доски. */
const OBJECTIVE_TEXT = 'ПОКАЖИ НА ЧТО СПОСОБЕН';
/** Сколько секунд надо лить, чтобы полоса заполнилась. */
const PISS_TIME = 12;

/** Где сейчас игрок: у каждого места своя сцена и свои коллайдеры, в пространстве они не связаны. */
type Place = 'office' | 'toilet' | 'underwater';

/** Композиция: рендерер, цикл, ресайз. Логика — в Room / Toilet / PlayerController. */
export class Game {
	private readonly renderer = new THREE.WebGLRenderer({ antialias: false });
	private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
	private readonly post = new PostProcess(this.renderer);
	private readonly timer = new THREE.Timer();
	private readonly input: Input;
	private readonly colliders = new CircleColliders();
	private readonly toiletColliders = new CircleColliders();
	private readonly footsteps = new Footsteps();
	private readonly sfx = new Sfx();
	private readonly music = new LofiMusic();
	private readonly streamSound = new StreamSound();
	private readonly dialogue = new DialogueBox();
	private readonly letterbox = new Letterbox();
	private readonly objectiveHud = new ObjectiveHud();
	private readonly targetMarker = new TargetMarker();
	/** Мысли у доски закончились — задача выдана. */
	private hasObjective = false;
	private readonly pissBar = new ProgressBar();
	/** Сколько уже налито, с; null — ещё не начинали (полосы нет). */
	private pissTime: number | null = null;
	/** Время с начала сбоя картинки; null — сбоя нет. */
	private glitchTime: number | null = null;
	private readonly hint = document.getElementById('hint')!;
	private readonly prompt = document.getElementById('prompt')!;
	private readonly flash = document.getElementById('flash')!;
	/** Время с начала перехода; null — перехода нет. */
	private flashTime: number | null = null;
	/** Что сделать, пока экран залит (смена места); вызывается один раз за переход. */
	private onFlashCovered: (() => void) | null = null;
	private place: Place = 'office';
	/** Был первый клик: до него экран залит жёлтым, игрок стоит. */
	private started = false;
	/** Мысли героя у доски ещё не звучали: начнутся, как только сойдёт стартовая заливка. */
	private introPending = true;
	/** Стоим у унитаза: ходить нельзя, ЛКМ — струя. */
	private atToilet = false;
	/** Катсцена после остановки у унитаза: рамка, управления нет, взгляд сам поворачивается к чаше. */
	private cutscene = false;
	/** Время с начала катсцены у унитаза. */
	private cutsceneTime = 0;
	/** Мужик из унитаза уже сказал своё. */
	private manSpoke = false;
	/** Время с начала хватания; null — ещё не хватает. Откуда камеру тащат в чашу — grabFrom и grabPitch. */
	private grabTime: number | null = null;
	private readonly grabFrom = new THREE.Vector3();
	private grabPitch = 0;
	private readonly underwaterColliders = new CircleColliders();
	readonly underwater = new Underwater(this.underwaterColliders);
	/** Руки игрока под водой — живут в сцене подводного уровня. */
	private readonly swimArms = new SwimArms();
	readonly room: Room;
	readonly toilet: Toilet;
	readonly player: PlayerController;

	constructor() {
		this.renderer.setPixelRatio(1);
		this.renderer.shadowMap.enabled = true;
		document.body.appendChild(this.renderer.domElement);

		this.input = new Input(this.renderer.domElement);
		this.room = new Room(this.colliders);
		this.toilet = new Toilet(this.toiletColliders);
		// Пол ровный и в офисе, и в туалете — высоту земли берём у офиса для обоих мест.
		this.player = new PlayerController(this.camera, this.input, this.room, this.colliders);
		this.player.onStep = (loud) => this.footsteps.play(loud);
		const { spawnPoint } = this.room;
		this.player.spawn(spawnPoint.x, spawnPoint.z, spawnPoint.yaw);
		// Игра начинается с залитого экрана (см. index.html): жёлтое держится до первого клика, потом расходится —
		// и игрок стоит у доски.
		this.flash.style.background = FLASH_COLOR;
		this.renderer.domElement.addEventListener(
			'click',
			() => {
				this.started = true;
				this.flashTime = FLASH_IN;
				// Музыка — с первого клика (раньше браузер звук не даст) и на всю игру.
				this.music.start();
				this.hint.textContent = 'Кликни, чтобы осмотреться';
			},
			{ once: true }
		);

		this.dialogue.onBlip = (voice) => this.sfx.voice(VOICE_PITCH[voice]);
		// В катсцене рамка остаётся и после реплик — уберёт её сама катсцена.
		this.dialogue.onEnd = () => {
			if (!this.cutscene) this.letterbox.hide();
		};
		this.dialogue.onGlitch = () => {
			this.glitchTime = 0;
			this.sfx.glitch(GLITCH_TIME);
		};

		window.addEventListener('resize', () => this._resize());
		this._resize();
	}

	start(): void {
		this.timer.connect(document);
		this.renderer.setAnimationLoop((time) => this._frame(time));
	}

	private _frame(time: number): void {
		this.timer.update(time);
		const dt = Math.min(this.timer.getDelta(), 0.1);

		if (this.started) {
			// Во время разговора (и пока сходит заливка до мыслей у доски) стоим на месте; движение мыши сбрасываем,
			// чтобы после не было рывка взгляда.
			if (this.cutscene) this._updateCutscene(dt);
			else if (this.dialogue.active || this.introPending) this.input.consumeMouseDelta();
			else this.player.update(dt);
			this.dialogue.update(dt);
			this.room.update(dt);
			if (this.place === 'underwater') {
				this.underwater.update(dt);
				// Чем глубже в расщелину, тем темнее и тише.
				this.music.setFade(1 - this.underwater.setDepth(this.camera.position.y));
			}
			// В катсцене камеру ставит сама катсцена (в том числе в чашу) — не клэмпим.
			if (!this.cutscene) this._clamp();
			// Руки — после клэмпа: встают перед камерой в её итоговом положении.
			if (this.place === 'underwater') this.swimArms.update(this.camera, this.player.strokePhase, this.player.swimEffort);
			this._updateFlash(dt);
			if (this.introPending && this.flashTime === null) {
				this.introPending = false;
				this.startDialogue({ ...INTRO, onEnd: () => (this.hasObjective = true) });
			}
			this._updateDoor();
			this._updateGlitch(dt);
			const pissing = this.atToilet && !this.dialogue.active && this.input.isPointerLocked && this.input.isDown('Mouse0');
			this.toilet.stream.update(dt, pissing, this.camera.position, this.player.yaw, this.player.pitch);
			this.streamSound.update(pissing, this.toilet.stream.hitting);
			// Полоса появляется с первой струёй и растёт, пока льётся.
			if (pissing) this.pissTime = Math.min(PISS_TIME, (this.pissTime ?? 0) + dt);
		}
		this.pissBar.set(this.pissTime === null ? null : this.pissTime / PISS_TIME);
		// Задача: плашка в углу и маркер цели (маркер прячем на время разговора и когда уже стоим у унитаза).
		this.objectiveHud.set(this.hasObjective ? OBJECTIVE_TEXT : null);
		this.targetMarker.update(this.camera, this.hasObjective && !this.dialogue.active && !this.atToilet ? this._objectiveTarget() : null);

		this.hint.style.display = this.input.isPointerLocked ? 'none' : 'flex';
		this.input.endFrame();
		// Под водой картинка колышется.
		this.post.setWave(this.place === 'underwater' ? 1 : 0, time / 1000);
		this.post.render(this._location().scene, this.camera);
	}

	/**
	 * Подсказка и действие по E: из офиса — в туалет, из туалета — обратно (через жёлтую заливку);
	 * у унитаза — встать к нему (дальше ЛКМ — струя; отойти уже нельзя).
	 */
	private _updateDoor(): void {
		const cam = this.camera.position;
		const near = (x: number, z: number, reach: number) => Math.hypot(cam.x - x, cam.z - z) < reach;
		const spot = this.toilet.toiletSpot;
		let text: string | null = null;
		let run: (() => void) | null = null;
		this.prompt.classList.remove('low');
		if (this.dialogue.active) {
			this.prompt.style.display = 'none';
			// Реплики листаются левой кнопкой мыши; E во время разговора ничего не делает.
			if (this.input.consumePress('Mouse0')) this.dialogue.advance();
			return;
		}
		if (this.cutscene) {
			this.prompt.style.display = 'none';
			return;
		}
		if (this.atToilet) {
			// Полоса заполнена — можно остановиться (даже не отпуская ЛКМ): задача выполнена, дальше — катсцена.
			const full = this.pissTime !== null && this.pissTime >= PISS_TIME;
			this.pissBar.setCaption(full ? 'E — остановиться. Или продолжай, это твоё дело' : null);
			if (full && this.input.consumePress('KeyE')) {
				this.atToilet = false;
				this.pissTime = null;
				this.hasObjective = false;
				this.cutscene = true;
				this.letterbox.show();
				this.prompt.style.display = 'none';
				return;
			}
			// Пока льётся — подсказку убираем, чтобы не мешала смотреть.
			if (this.input.isDown('Mouse0')) {
				this.prompt.style.display = 'none';
				return;
			}
			// Встал к унитазу — уже не отойти.
			this.prompt.textContent = 'ЛКМ — ссать';
			this.prompt.classList.add('low');
			this.prompt.style.display = 'block';
			return;
		}
		if (this.place === 'office') {
			const { doorway } = this.room;
			if (near(doorway.wallX, doorway.z, DOOR_REACH)) {
				text = 'открыть дверь';
				run = () => {
					this.room.toggleDoor();
					this.beginTransition(() => this._goTo('toilet'));
				};
			}
		} else if (this.place !== 'toilet') {
			// Там, куда утащили, действий пока нет.
		} else if (near(spot.x, spot.z, spot.reach)) {
			text = 'обоссать';
			run = () => {
				// Встаём ровно перед унитазом, взгляд — в чашу; дальше мышь крутит взгляд (и струю), ноги стоят.
				this.atToilet = true;
				this.player.rooted = true;
				this.player.spawn(spot.x, spot.z, spot.yaw);
				this.player.setPose(spot.x, cam.y, spot.z, spot.yaw, spot.pitch);
			};
		} else if (near(this.toilet.door.x, this.toilet.door.z, TOILET_DOOR_REACH)) {
			text = 'выйти';
			run = () => this.beginTransition(() => this._goTo('office'));
		}
		if (this.flashTime !== null || !text || !run) {
			this.prompt.style.display = 'none';
			return;
		}
		this.prompt.textContent = `E — ${text}`;
		this.prompt.style.display = 'block';
		if (this.input.consumePress('KeyE')) run();
	}

	/**
	 * Катсцена у унитаза: управления нет, взгляд сам идёт к чаше; через MAN_DELAY из неё вылезает мужик —
	 * взгляд переходит на его лицо, а когда вылез целиком — реплика.
	 */
	private _updateCutscene(dt: number): void {
		this.input.consumeMouseDelta();
		if (this.grabTime !== null) {
			this._updateGrab(dt);
			return;
		}
		this.cutsceneTime += dt;
		const k = (this.cutsceneTime - MAN_DELAY) / MAN_RISE;
		this.toilet.riseMan(k, this.camera.position);
		this.player.lookToward(k > 0 ? this.toilet.manFace : this.toilet.bowl, dt);
		if (k >= 1 && !this.manSpoke) {
			this.manSpoke = true;
			this.startDialogue({
				lines: [{ speaker: '???', voice: 'toiletMan', text: 'ПАПАЛСЯ' }],
				onEnd: () => {
					// После реплики — хватает: запоминаем, откуда камеру потащат в чашу.
					this.grabTime = 0;
					this.grabFrom.copy(this.camera.position);
					this.grabPitch = this.player.pitch;
				},
			});
		}
	}

	/**
	 * Мужик хватает и утаскивает: руки рывком тянутся к камере (тряска), потом камеру тянет вниз, в чашу, взгляд
	 * падает в воду; пока тащит — жёлтая заливка, под ней — уже другое место.
	 */
	private _updateGrab(dt: number): void {
		const wasReaching = this.grabTime! < GRAB_REACH;
		const t = (this.grabTime! += dt);
		if (wasReaching && t >= GRAB_REACH) this.player.shake(0.8);
		const pull = THREE.MathUtils.clamp((t - GRAB_REACH) / GRAB_PULL, 0, 1);
		const e = pull * pull;
		this.toilet.grabMan(t / GRAB_REACH, e);
		const { bowl } = this.toilet;
		this.player.setPose(
			THREE.MathUtils.lerp(this.grabFrom.x, bowl.x, e),
			THREE.MathUtils.lerp(this.grabFrom.y, bowl.y - 0.1, e),
			THREE.MathUtils.lerp(this.grabFrom.z, bowl.z, e),
			this.player.yaw,
			THREE.MathUtils.lerp(this.grabPitch, -1.5, e)
		);
		if (t >= GRAB_REACH + GRAB_FLASH_AT && this.flashTime === null && this.place === 'toilet') {
			this.beginTransition(() => this._goTo('underwater'));
		}
	}

	/** Куда ведёт маркер: из офиса — к двери, в туалете — к унитазу. */
	private _objectiveTarget(): THREE.Vector3 {
		return this.place === 'toilet' ? this.toilet.toiletMarker : this.room.doorMarker;
	}

	/** Пока экран залит — переключаем место и коллайдеры игрока. В офис возвращаемся у двери, лицом в комнату. */
	private _goTo(place: Place): void {
		this.place = place;
		if (place === 'underwater') {
			// Утащили под воду: катсцена кончилась, управление — снова наше (но медленное, «водное»); музыка — громче и плотнее.
			this.cutscene = false;
			this.grabTime = null;
			this.letterbox.hide();
			this.toilet.hideMan();
			this.player.rooted = false;
			this.player.colliders = this.underwaterColliders;
			this.player.ground = this.underwater;
			this.player.underwater = true;
			this.player.swimCeiling = this.underwater.swimCeiling;
			this.underwater.scene.add(this.swimArms.group);
			const { spawnPoint } = this.underwater;
			this.player.spawn(spawnPoint.x, spawnPoint.z, spawnPoint.yaw);
			this.music.setIntense(true);
			return;
		}
		if (place === 'toilet') {
			this.player.colliders = this.toiletColliders;
			const { spawnPoint } = this.toilet;
			this.player.spawn(spawnPoint.x, spawnPoint.z, spawnPoint.yaw);
			return;
		}
		this.player.colliders = this.colliders;
		if (this.room.isDoorOpen) this.room.toggleDoor();
		const { doorway } = this.room;
		this.player.spawn(doorway.wallX - 0.8, doorway.z, Math.PI / 2);
	}

	/** Разговор всегда в кинорамке: полосы выезжают, реплики — на нижней, когда полосы доехали (если уже стоят —
	 * сразу). Уезжают полосы по dialogue.onEnd. */
	startDialogue(dialogue: Dialogue): void {
		const delay = this.letterbox.visible ? 0 : LETTERBOX_SLIDE_TIME;
		this.letterbox.show();
		this.dialogue.start(dialogue, delay);
	}

	/** Сбой картинки на глитч-хвосте реплики: полосы и блоки скачут каждый кадр, к концу — слабее. */
	private _updateGlitch(dt: number): void {
		if (this.glitchTime === null) return;
		this.glitchTime += dt;
		if (this.glitchTime >= GLITCH_TIME) {
			this.glitchTime = null;
			this.post.setGlitch(0, 0);
			return;
		}
		const fade = 1 - (this.glitchTime / GLITCH_TIME) * 0.5;
		this.post.setGlitch((Math.random() < 0.75 ? 1 : 0.15) * fade, Math.random() * 100);
	}

	/** Мягкая жёлтая заливка на весь экран: в середине хода — onCovered (смена места), к концу — исчезает. */
	beginTransition(onCovered: () => void): void {
		this.flash.style.background = FLASH_COLOR;
		this.onFlashCovered = onCovered;
		this.flashTime = 0;
	}

	private _updateFlash(dt: number): void {
		if (this.flashTime === null) return;
		this.flashTime += dt;
		const t = this.flashTime;

		if (this.onFlashCovered && t >= FLASH_IN) {
			this.onFlashCovered();
			this.onFlashCovered = null;
		}

		let opacity: number;
		if (t < FLASH_IN) {
			opacity = t / FLASH_IN;
		} else if (t < FLASH_IN + FLASH_HOLD) {
			opacity = 1;
		} else if (t < FLASH_IN + FLASH_HOLD + FLASH_OUT) {
			// Выход — плавный: сначала гаснет медленно, в середине быстрее, к концу снова мягко.
			const k = (t - FLASH_IN - FLASH_HOLD) / FLASH_OUT;
			opacity = 1 - k * k * (3 - 2 * k);
		} else {
			opacity = 0;
			this.flashTime = null;
		}
		this.flash.style.opacity = String(opacity);
	}

	/** Клэмп по границам комнаты — простой прямоугольник. */
	/** Текущее место: его сцена рисуется, по его границам клэмпим. */
	private _location(): Room | Toilet | Underwater {
		return this.place === 'toilet' ? this.toilet : this.place === 'underwater' ? this.underwater : this.room;
	}

	private _clamp(): void {
		const pos = this.camera.position;
		const { bounds } = this._location();
		pos.x = THREE.MathUtils.clamp(pos.x, bounds.minX + WALL_MARGIN, bounds.maxX - WALL_MARGIN);
		pos.z = THREE.MathUtils.clamp(pos.z, bounds.minZ + WALL_MARGIN, bounds.maxZ - WALL_MARGIN);
		if (this.place === 'underwater') this.underwater.clampDeep(pos);
	}

	private _resize(): void {
		// Рисуем в уменьшенном буфере; канвас растягивается на экран CSS (image-rendering: pixelated) — крупные пиксели.
		const width = Math.ceil(window.innerWidth / PIXEL_SIZE);
		const height = Math.ceil(window.innerHeight / PIXEL_SIZE);
		this.renderer.setSize(width, height, false);
		this.post.setSize(width, height);
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
	}
}
