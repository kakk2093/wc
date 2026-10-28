import * as THREE from 'three';
import { Input } from './Input.js';
import { PlayerController } from '../player/PlayerController.js';
import { SwimArms } from '../player/SwimArms.js';
import { CircleColliders } from '../physics/CircleColliders.js';
import { Room } from '../world/Room.js';
import { Toilet } from '../world/Toilet.js';
import { Underwater } from '../world/Underwater.js';
import { TvRoom } from '../world/TvRoom.js';
import { Footsteps } from '../audio/Footsteps.js';
import { PostProcess } from '../render/PostProcess.js';
import { Sfx } from '../audio/Sfx.js';
import { DreadAmbient } from '../audio/DreadAmbient.js';
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
/**
 * После смыва игрок — размером с жука: во сколько раз меньше человека (глаза — около 3 см над полом) и ближняя
 * плоскость камеры — иначе пол и стены у самых глаз обрезаются.
 */
const BUG_SIZE = 0.02;
const BUG_NEAR = 0.002;
/**
 * Катсцена жука в туалете (время — с момента, как вынесло в туалет; заливка сходит к ~1.7 с): рамки; 2 с смотрим
 * вперёд; поворот к двери; музыка обрывается; быстрые шаги за дверью; дверь — с ноги; входит мужик; реплика (не
 * пропустить); наступает — и чёрное.
 */
const BUG_LETTERBOX = 1.9;
const BUG_TURN = BUG_LETTERBOX + 2;
const BUG_MUSIC_CUT = BUG_TURN + 1.3;
const BUG_STEPS_FROM = BUG_MUSIC_CUT + 0.5;
const BUG_STEPS = 9;
const BUG_STEP_GAP = 0.2;
const BUG_DOOR = BUG_STEPS_FROM + BUG_STEPS * BUG_STEP_GAP + 0.1;
/** За сколько дверь распахивается, с. */
const BUG_DOOR_SWING = 0.15;
/**
 * Мужик: откуда входит (за дверью, в темноте), где встаёт говорить (м от жука — издали, чтобы жуку было видно лицо),
 * за сколько доходит (с), и куда шагает, чтобы наступить (м от жука).
 */
const WALKER_FROM = 0.9;
const WALKER_TALK = 0.95;
const WALKER_STOMP = 0.45;
/** Жук в туалете — дальше от двери, чем обычный вход: мужику есть где встать. */
const BUG_SPAWN_Z = 0.1;
const BUG_WALK_FROM = BUG_DOOR + 0.25;
const BUG_WALK_TIME = 1.5;
const BUG_SAY = BUG_WALK_FROM + BUG_WALK_TIME + 0.4;
/** Наступает: за сколько поднимает ногу, сколько держит над жуком и за сколько опускает до удара, с. */
const STOMP_LIFT = 0.6;
const STOMP_HOLD = 0.35;
const STOMP_SLAM = 0.1;
/** Куда опускается нога при ударе (доля подъёма) — почти до пола. */
const STOMP_LOW = 0.55;
const MAN_LINE = 'Леди и джентльмены, тренируем свою меткость в туалете';
/**
 * Финал: после «наступил» — чёрное (CRUSH_HOLD), и оказывается, это шло по телевизору. Время — с начала финала:
 * чёрное сходит с экрана телевизора (камера вплотную); отъезд — видно телевизор и фигуру в балахоне спиной;
 * поднимает пульт; выключает; разворачивается к нам, камера подъезжает к лицу («?») и амулету («A»);
 * говорит тарабарщину (не пропустить); чёрное — и вместо «Конец» тоже тарабарщина.
 */
const CRUSH_HOLD = 1.2;
const TV_FADE_IN = 0.8;
const TV_PULL_FROM = 1.2;
const TV_PULL_TO = 5.2;
const TV_REMOTE = 5.6;
const TV_OFF = 6.3;
const TV_OFF_TIME = 0.35;
const TV_TURN = 7.3;
const TV_TURN_TIME = 1.2;
const TV_CLOSE_FROM = 7.6;
const TV_CLOSE_TO = 9.8;
const TV_SAY = 10.2;
const END_FADE = 2;
/** Камера у экрана (насколько перед ним), куда отъезжает (видно телевизор и фигуру спиной) и где встаёт напротив лица и амулета. */
const TV_NEAR = new THREE.Vector3(0, 0, 0.22);
const TV_WIDE = new THREE.Vector3(0.35, 1.55, 1.7);
const TV_WIDE_LOOK = new THREE.Vector3(0, 1.0, -1.3);
const TV_CLOSE = new THREE.Vector3(0, 1.42, 0.55);
/** Картинка в телевизоре: размер (пиксели) и откуда «снимают» туалет — из верхнего угла на мужика у двери. */
const TV_IMAGE_W = 160;
const TV_IMAGE_H = 120;
const TV_SHOT = new THREE.Vector3(0.75, 2.4, -1.1);
const TV_SHOT_LOOK = new THREE.Vector3(0, 0.6, 0.8);
const GIBBERISH = 'Ырр-гха 7ш’тоол @@ вэммэ 0кхаа ӂ#3… зу’ал ʘ 41 хъыррр, #ӭӭ@ — 9∴';
const GIBBERISH_TAIL = ' ¤#@8∆¤';
const GIBBERISH_END = 'ӜЭ#7 ∴ @ʘЪ4Ӂ';
/** Заливка экрана при переходе (жёлтая): скрывает смену места. Мягкая, не резкая. */
const FLASH_IN = 0.35;
const FLASH_HOLD = 0.3;
const FLASH_OUT = 1.4;
const FLASH_COLOR = '#f2d23a';
/** Высота «голоса» при печати реплик, Гц. */
const VOICE_PITCH: Record<Voice, number> = { dinnerLady: 330, cashier: 260, player: 170, toiletMan: 120, hooded: 95 };
/** Катсцена у унитаза: через сколько секунд вылезает мужик и за сколько вылезает целиком. */
const MAN_DELAY = 3;
const MAN_RISE = 0.6;
/** Хватание: за сколько руки дотягиваются до камеры, за сколько камеру утаскивает в чашу и когда начать заливку. */
const GRAB_REACH = 0.3;
const GRAB_PULL = 0.9;
const GRAB_FLASH_AT = 0.4;
/** Сколько длится сбой картинки и звука на глитч-хвосте реплики, с. */
const GLITCH_TIME = 0.4;
/**
 * Задачи: после мыслей у доски; с первой струёй у унитаза; под водой — до расщелины, вниз к унитазу на её дне,
 * у него — смыться.
 */
const OBJECTIVE_TEXT = 'ПОКАЖИ НА ЧТО СПОСОБЕН';
const PISS_OBJECTIVE = 'Обоссы всё вокруг';
const SWIM_OBJECTIVE = 'Плыви вперёд';
const DIVE_OBJECTIVE = 'Посмотри, как низко ты можешь опуститься';
const FLUSH_OBJECTIVE = 'Смойся';
/** Смыв: с какого расстояния до мочи в огромном унитазе можно смыться (E), м; сколько крутит, прежде чем вынесет в туалет, с. */
const FLUSH_REACH = 4;
const FLUSH_TIME = 4;
/** Когда при смыве начинает наползать жёлтое и когда экран залит целиком — доли FLUSH_TIME. */
const FLUSH_FADE_FROM = 0.4;
const FLUSH_FADE_TO = 0.75;
/** Когда под водой задача сменится на «Смойся»: насколько близко подплыть к огромному унитазу, м. */
const BIG_TOILET_NEAR = 10;
/** Сколько секунд надо лить, чтобы полоса заполнилась. */
const PISS_TIME = 12;

/** Где сейчас игрок: у каждого места своя сцена и свои коллайдеры, в пространстве они не связаны. */
type Place = 'office' | 'toilet' | 'underwater' | 'tv';

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
	/** Лёгкий жуткий фон финала (комната с телевизором). */
	private readonly dread = new DreadAmbient();
	/** Фаза гребка (доля круга) в прошлом кадре — по ней ловим начало каждого гребка, чтобы плеснуть звуком. */
	private lastStroke = 0;
	private readonly dialogue = new DialogueBox();
	private readonly letterbox = new Letterbox();
	private readonly objectiveHud = new ObjectiveHud();
	private readonly targetMarker = new TargetMarker();
	/** Текущая задача (плашка в углу и маркер к цели); null — задачи нет. */
	private objective: string | null = null;
	/** Под водой доплыли до расщелины — задача сменилась на «опуститься». */
	private reachedCrevice = false;
	/** Под водой доплыли до огромного унитаза — задача «Смойся», на моче в нём — E. */
	private reachedBigToilet = false;
	/** Время с начала смыва; null — не смывает. Откуда начали — flushFrom. */
	private flushTime: number | null = null;
	private readonly flushFrom = new THREE.Vector3();
	/** Сила колыхания картинки (под водой 1, при смыве — сильнее). */
	private wave = 0;
	/** Время катсцены жука в туалете; null — её нет. Шагов уже прозвучало; время с начала «наступает»; раздавлен. */
	private bugTime: number | null = null;
	private bugSteps = 0;
	private stompTime: number | null = null;
	private crushed = false;
	/** Время с «наступил»; финал (телевизор) — tvTime с его начала; null — ещё нет. */
	private crushTime = 0;
	private tvTime: number | null = null;
	/** Туалет для телевизора — рендерится в картинку tvImage своей камерой. */
	private readonly tvImage = new THREE.WebGLRenderTarget(TV_IMAGE_W, TV_IMAGE_H, {
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
	});
	private readonly tvCamera = new THREE.PerspectiveCamera(70, TV_IMAGE_W / TV_IMAGE_H, 0.05, 50);
	private tvOn = true;
	readonly tvRoom = new TvRoom(this.tvImage.texture);
	/** Надпись вместо «Конец» — тарабарщина; появляется после затемнения. */
	private readonly endText = document.createElement('div');
	/** Время с начала финального затемнения; null — ещё не началось. */
	private endTime: number | null = null;
	private readonly posePos = new THREE.Vector3();
	private readonly poseLook = new THREE.Vector3();
	private readonly poseTmp = new THREE.Vector3();
	private readonly lookAt = new THREE.Vector3();
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
		// Жук топает тихо.
		this.player.onStep = (loud) => this.footsteps.play(loud * (this.player.size < 1 ? 0.3 : 1));
		const { spawnPoint } = this.room;
		this.player.spawn(spawnPoint.x, spawnPoint.z, spawnPoint.yaw);
		// Игра начинается с залитого экрана (см. index.html): жёлтое держится до первого клика, потом расходится —
		// и игрок стоит у доски.
		this.flash.style.background = FLASH_COLOR;
		// Поверх — стартовый экран (см. index.html): «надень наушники» и «Старт»; по кнопке он убирается, мышь
		// захватывается, заливка расходится.
		const startScreen = document.getElementById('start')!;
		document.getElementById('start-button')!.addEventListener(
			'click',
			() => {
				startScreen.remove();
				this.input.lockPointer();
				this.started = true;
				this.flashTime = FLASH_IN;
				// Музыка — с нажатия «Старт» (раньше браузер звук не даст) и на всю игру.
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

		Object.assign(this.endText.style, {
			position: 'fixed',
			inset: '0',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			color: '#e8dcc0',
			font: 'bold 64px Georgia, serif',
			letterSpacing: '0.2em',
			opacity: '0',
			transition: 'opacity 1.5s',
			pointerEvents: 'none',
			zIndex: '10',
		});
		this.endText.textContent = GIBBERISH_END;
		document.body.appendChild(this.endText);

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
			if (this.place === 'underwater') {
				this.swimArms.update(this.camera, this.player.strokePhase, this.player.swimEffort, dt);
				// Гребок — когда руки пошли назад (доля круга 0.35, см. SwimArms): «вжух», громче, чем сильнее гребём.
				const stroke = THREE.MathUtils.euclideanModulo(this.player.strokePhase / (Math.PI * 2) - 0.35, 1);
				if (stroke < this.lastStroke && this.player.swimEffort > 0.3 && !this.cutscene) this.sfx.stroke(this.player.swimEffort);
				this.lastStroke = stroke;
			}
			this._updateFlash(dt);
			if (this.introPending && this.flashTime === null) {
				this.introPending = false;
				this.startDialogue({ ...INTRO, onEnd: () => (this.objective = OBJECTIVE_TEXT) });
			}
			this._updateDoor();
			this._updateGlitch(dt);
			const pissing = this.atToilet && !this.dialogue.active && this.input.isPointerLocked && this.input.isDown('Mouse0');
			this.toilet.stream.update(dt, pissing, this.camera.position, this.player.yaw, this.player.pitch);
			this.streamSound.update(pissing, this.toilet.stream.hitting);
			// С первой струёй — новая задача (плашка вспыхивает) и полоса. Растёт полоса, только пока струя бьёт
			// во что-то твёрдое — стены, пол, сам унитаз, сиденье; в воду в чаше или в полёте — не считается.
			if (pissing && this.pissTime === null) {
				this.objective = PISS_OBJECTIVE;
				this.pissTime = 0;
			}
			if (pissing && this.toilet.stream.hitting === 'hard') this.pissTime = Math.min(PISS_TIME, this.pissTime! + dt);
		}
		this.pissBar.set(this.pissTime === null ? null : this.pissTime / PISS_TIME);
		// Задача: плашка в углу и маркер цели (маркер прячем на время разговора и когда уже стоим у унитаза).
		if (this.place === 'underwater' && !this.reachedCrevice && this.camera.position.z < this.underwater.creviceStartZ) {
			this.reachedCrevice = true;
			this.objective = DIVE_OBJECTIVE;
		}
		if (this.reachedCrevice && !this.reachedBigToilet && this.camera.position.distanceTo(this.underwater.bigToiletWater) < BIG_TOILET_NEAR) {
			this.reachedBigToilet = true;
			this.objective = FLUSH_OBJECTIVE;
		}
		this.objectiveHud.set(this.objective);
		this.targetMarker.update(this.camera, this.objective && !this.dialogue.active && !this.atToilet ? this._objectiveTarget() : null);

		// До «Старт» подсказки нет — там свой экран.
		this.hint.style.display = !this.started || this.input.isPointerLocked ? 'none' : 'flex';
		this.input.endFrame();
		// Под водой картинка колышется; при смыве — всё сильнее.
		this.wave = this.place !== 'underwater' ? 0 : this.flushTime === null ? 1 : 1 + 5 * Math.min(1, this.flushTime / FLUSH_TIME);
		this.post.setWave(this.wave, time / 1000);
		// В телевизоре — туалет: рендерим его в картинку для экрана, пока телевизор не выключили.
		if (this.place === 'tv' && this.tvOn) {
			this.renderer.setRenderTarget(this.tvImage);
			this.renderer.render(this.toilet.scene, this.tvCamera);
			this.renderer.setRenderTarget(null);
		}
		this.post.render(this._location().scene, this.camera);
	}

	/**
	 * Подсказка и действие по E: из офиса — в туалет (через жёлтую заливку; из туалета выхода нет);
	 * у унитаза — встать к нему (дальше ЛКМ — струя; отойти уже нельзя); под водой, у мочи в огромном унитазе, — смыться.
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
			// В катсцене жука реплику не пропустить: она закроется сама.
			if (this.input.consumePress('Mouse0') && this.bugTime === null && this.tvTime === null) this.dialogue.advance();
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
				this.objective = null;
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
		} else if (this.place === 'underwater') {
			if (this.reachedBigToilet && cam.distanceTo(this.underwater.bigToiletWater) < FLUSH_REACH) {
				text = 'смыться';
				run = () => {
					// Смыв: рамка, управления нет — крутит воронкой и затягивает в мочу (см. _updateFlush).
					this.cutscene = true;
					this.flushTime = 0;
					this.flushFrom.copy(cam);
					this.objective = null;
					this.letterbox.show();
					this.sfx.flush(FLUSH_TIME);
				};
			}
		} else if (this.player.size < 1) {
			// Жуку у унитаза пока делать нечего.
		} else if (near(spot.x, spot.z, spot.reach)) {
			text = 'обоссать';
			run = () => {
				// Встаём ровно перед унитазом, взгляд — в чашу; дальше мышь крутит взгляд (и струю), ноги стоят.
				this.atToilet = true;
				this.player.rooted = true;
				this.player.spawn(spot.x, spot.z, spot.yaw);
				this.player.setPose(spot.x, cam.y, spot.z, spot.yaw, spot.pitch);
			};
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
		if (this.tvTime !== null) {
			this._updateTv(dt);
			return;
		}
		if (this.bugTime !== null) {
			this._updateBug(dt);
			return;
		}
		if (this.flushTime !== null) {
			this._updateFlush(dt);
			return;
		}
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

	/**
	 * Смыв: камеру крутит по сужающейся спирали над мочой в огромном унитазе и всё быстрее затягивает вниз, в неё;
	 * взгляд крутится вокруг и падает в воронку. Жёлтое наползает заранее и медленно (FLUSH_FADE_FROM..TO) — экран
	 * залит раньше, чем камера доберётся до воды; к концу FLUSH_TIME под заливкой — снова туалет.
	 */
	private _updateFlush(dt: number): void {
		const t = (this.flushTime! += dt);
		const k = Math.min(1, t / FLUSH_TIME);
		const e = k * k * (3 - 2 * k);
		const water = this.underwater.bigToiletWater;
		const from = this.flushFrom;
		const r0 = Math.hypot(from.x - water.x, from.z - water.z);
		// Угол по спирали — с разгоном: крутит всё быстрее.
		const angle = Math.atan2(from.z - water.z, from.x - water.x) + 1.5 * t + 1.6 * t * t;
		const r = r0 * (1 - e);
		this.player.yaw += (2 + 10 * k) * dt;
		this.player.setPose(
			water.x + Math.cos(angle) * r,
			THREE.MathUtils.lerp(from.y, water.y + 0.3, e),
			water.z + Math.sin(angle) * r,
			this.player.yaw,
			THREE.MathUtils.lerp(-0.6, -1.45, e)
		);
		if (this.flashTime === null) {
			this.flash.style.background = FLASH_COLOR;
			this.flash.style.opacity = String(THREE.MathUtils.smoothstep(k, FLUSH_FADE_FROM, FLUSH_FADE_TO));
			if (k >= 1) {
				// Экран уже залит: сразу меняем место и дальше — обычный выход из заливки.
				this.beginTransition(() => this._goTo('toilet'));
				this.flashTime = FLASH_IN;
			}
		}
	}

	/** Финал начался: место — комната с телевизором, камера вплотную к экрану (в нём — туалет). */
	private _startTv(): void {
		this.bugTime = null;
		this.tvTime = 0;
		this.place = 'tv';
		this.tvCamera.position.copy(TV_SHOT);
		this.tvCamera.lookAt(TV_SHOT_LOOK);
		this.camera.near = 0.05;
		this.camera.updateProjectionMatrix();
		this.dread.start();
		this._pose(this.posePos.copy(this.tvRoom.screenCenter).add(TV_NEAR), this.tvRoom.screenCenter);
	}

	/** Финал по таймлайну TV_* (см. их описание). */
	private _updateTv(dt: number): void {
		const prev = this.tvTime!;
		const t = (this.tvTime! += dt);
		const passed = (at: number) => prev < at && t >= at;
		const span = (from: number, to: number) => THREE.MathUtils.smoothstep(t, from, to);
		const room = this.tvRoom;

		// Чёрное сходит — камера вплотную к экрану, будто всё время смотрели телевизор.
		if (prev < TV_FADE_IN) this.flash.style.opacity = String(1 - Math.min(1, t / TV_FADE_IN));
		// Отъезд от экрана — к общему плану; потом — к фигуре, напротив лица и амулета.
		const pull = span(TV_PULL_FROM, TV_PULL_TO);
		const close = span(TV_CLOSE_FROM, TV_CLOSE_TO);
		this.poseTmp.copy(room.screenCenter).add(TV_NEAR);
		this.posePos.lerpVectors(this.poseTmp, TV_WIDE, pull).lerp(TV_CLOSE, close);
		this.poseLook.lerpVectors(room.screenCenter, TV_WIDE_LOOK, pull);
		this.poseTmp.lerpVectors(room.face, room.amulet, 0.5);
		this.poseLook.lerp(this.poseTmp, close);
		this._pose(this.posePos, this.poseLook);

		// Пульт: поднимает к телевизору, опускает, когда разворачивается.
		room.raiseRemote(span(TV_REMOTE, TV_REMOTE + 0.5) - span(TV_TURN, TV_TURN + 0.6));
		if (passed(TV_OFF)) {
			this.sfx.tvOff();
			this.tvOn = false;
		}
		room.switchOff((t - TV_OFF) / TV_OFF_TIME);
		room.setTurn(span(TV_TURN, TV_TURN + TV_TURN_TIME));

		if (passed(TV_SAY)) {
			this.startDialogue({
				lines: [{ speaker: '?', voice: 'hooded', text: GIBBERISH, glitch: GIBBERISH_TAIL, noSkip: true, autoClose: 1.8 }],
				onEnd: () => (this.endTime = 0),
			});
		}
		// Конец: в чёрное, и на чёрном — тарабарщина вместо «Конец».
		if (this.endTime !== null) {
			this.endTime += dt;
			this.flash.style.background = '#000000';
			this.flash.style.opacity = String(Math.min(1, this.endTime / END_FADE));
			if (this.endTime >= END_FADE && this.endText.style.opacity !== '1') {
				this.letterbox.hide();
				this.endText.style.opacity = '1';
			}
		}
	}

	/** Камера в точке pos смотрит на target (катсцены). */
	private _pose(pos: THREE.Vector3, target: THREE.Vector3): void {
		const dx = target.x - pos.x;
		const dz = target.z - pos.z;
		this.player.setPose(pos.x, pos.y, pos.z, Math.atan2(-dx, -dz), Math.atan2(target.y - pos.y, Math.hypot(dx, dz)));
	}

	/** Куда ведёт маркер: из офиса — к двери, в туалете — к унитазу, под водой — к расщелине, потом на её дно. */
	private _objectiveTarget(): THREE.Vector3 {
		if (this.place === 'underwater') {
			if (this.reachedBigToilet) return this.underwater.bigToiletWater;
			return this.reachedCrevice ? this.underwater.bigToiletMarker : this.underwater.creviceMarker;
		}
		return this.place === 'toilet' ? this.toilet.toiletMarker : this.room.doorMarker;
	}

	/** Пока экран залит — переключаем место и коллайдеры игрока. В офис возвращаемся у двери, лицом в комнату. */
	private _goTo(place: Place): void {
		const from = this.place;
		this.place = place;
		if (from === 'underwater') this._leaveUnderwater();
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
			this.underwater.scene.add(this.swimArms.group, this.swimArms.bubbles);
			const { spawnPoint } = this.underwater;
			this.player.spawn(spawnPoint.x, spawnPoint.z, spawnPoint.yaw);
			this.music.setIntense(true);
			this.objective = SWIM_OBJECTIVE;
			return;
		}
		if (place === 'toilet') {
			this.player.colliders = this.toiletColliders;
			const { spawnPoint } = this.toilet;
			this.player.spawn(spawnPoint.x, this.player.size < 1 ? BUG_SPAWN_Z : spawnPoint.z, spawnPoint.yaw);
			return;
		}
		this.player.colliders = this.colliders;
		if (this.room.isDoorOpen) this.room.toggleDoor();
		const { doorway } = this.room;
		this.player.spawn(doorway.wallX - 0.8, doorway.z, Math.PI / 2);
	}

	/**
	 * Смыло обратно в туалет: снова ходим по полу, музыка — спокойная и полной громкости; всё, что было с мужиком
	 * и под водой, сбрасываем. Сам игрок теперь размером с жука.
	 */
	private _leaveUnderwater(): void {
		this.cutscene = false;
		this.flushTime = null;
		this.letterbox.hide();
		this.objective = null;
		this.reachedCrevice = false;
		this.reachedBigToilet = false;
		this.player.underwater = false;
		this.player.ground = this.room;
		this.player.rooted = false;
		this.music.setIntense(false);
		this.music.setFade(1);
		this.cutsceneTime = 0;
		this.manSpoke = false;
		this.grabTime = null;
		this.toilet.grabMan(0, 0);
		this.toilet.hideMan();
		// Вынесло обратно — уже размером с жука: туалет вокруг огромный.
		this.player.size = BUG_SIZE;
		this.camera.near = BUG_NEAR;
		this.camera.updateProjectionMatrix();
		// И сразу — катсцена жука (см. _updateBug).
		this.cutscene = true;
		this.bugTime = 0;
		this.bugSteps = 0;
	}

	/** Катсцена жука в туалете — по таймлайну BUG_* (см. их описание). Кончается чёрным экраном. */
	private _updateBug(dt: number): void {
		if (this.crushed) {
			// Чёрное держится — и дальше уже финал с телевизором.
			this.crushTime += dt;
			if (this.crushTime >= CRUSH_HOLD) this._startTv();
			return;
		}
		const prev = this.bugTime!;
		const t = (this.bugTime! += dt);
		const passed = (at: number) => prev < at && t >= at;
		const eye = this.camera.position;
		const { door } = this.toilet;

		if (passed(BUG_LETTERBOX)) this.letterbox.show();
		if (passed(BUG_MUSIC_CUT)) this.music.cut();
		// Шаги за дверью: быстрые и всё громче — бегут сюда.
		while (this.bugSteps < BUG_STEPS && t >= BUG_STEPS_FROM + this.bugSteps * BUG_STEP_GAP) {
			this.footsteps.play(1.2 + (this.bugSteps / BUG_STEPS) * 2);
			this.bugSteps++;
		}
		if (passed(BUG_DOOR)) {
			this.sfx.bang(1.4);
			this.player.shake(1);
		}
		this.toilet.openDoor((t - BUG_DOOR) / BUG_DOOR_SWING);

		// Мужик: из темноты за дверью — к жуку; говорит издали, потом шагает вплотную и наступает.
		const walk = THREE.MathUtils.clamp((t - BUG_WALK_FROM) / BUG_WALK_TIME, 0, 1);
		let walkerZ = THREE.MathUtils.lerp(door.z + WALKER_FROM, eye.z + WALKER_TALK, walk);
		let stomp = 0;
		if (this.stompTime !== null) {
			const st = (this.stompTime += dt);
			const lift = THREE.MathUtils.smoothstep(st, 0, STOMP_LIFT);
			walkerZ = THREE.MathUtils.lerp(eye.z + WALKER_TALK, eye.z + WALKER_STOMP, lift);
			const slam = THREE.MathUtils.clamp((st - STOMP_LIFT - STOMP_HOLD) / STOMP_SLAM, 0, 1);
			stomp = lift - slam * (1 - STOMP_LOW);
			if (slam >= 1) {
				// Наступил: удар, тряска — и сразу чёрное; дальше ничего.
				this.sfx.bang(2);
				this.player.shake(1);
				this.flash.style.background = '#000000';
				this.flash.style.opacity = '1';
				this.crushed = true;
			}
		}
		if (t >= BUG_WALK_FROM) {
			this.toilet.placeWalker(walkerZ, walk < 1 ? (t - BUG_WALK_FROM) * 9 : 0, stomp, eye);
		}
		if (passed(BUG_SAY)) {
			this.startDialogue({
				lines: [{ speaker: '???', voice: 'toiletMan', text: MAN_LINE, noSkip: true, autoClose: 1.5 }],
				onEnd: () => (this.stompTime = 0),
			});
		}

		// Взгляд: вперёд — потом к двери — потом на мужика (в лицо), а когда поднимает ногу — на ботинок.
		if (t < BUG_TURN) return;
		if (this.stompTime !== null) this.toilet.walkerFoot(this.lookAt);
		else if (t >= BUG_WALK_FROM) this.toilet.walkerFace(this.lookAt);
		else this.lookAt.set(door.x, 1, door.z);
		this.player.lookToward(this.lookAt, dt);
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
	private _location(): Room | Toilet | Underwater | TvRoom {
		if (this.place === 'tv') return this.tvRoom;
		return this.place === 'toilet' ? this.toilet : this.place === 'underwater' ? this.underwater : this.room;
	}

	private _clamp(): void {
		const pos = this.camera.position;
		const { bounds } = this._location();
		// Маленький подходит к стене ближе.
		const margin = WALL_MARGIN * this.player.size;
		pos.x = THREE.MathUtils.clamp(pos.x, bounds.minX + margin, bounds.maxX - margin);
		pos.z = THREE.MathUtils.clamp(pos.z, bounds.minZ + margin, bounds.maxZ - margin);
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
