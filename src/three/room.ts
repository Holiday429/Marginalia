import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { getRoomPose, type RoomPoseId } from './camera-paths.ts';
import { getRoomSkinById } from './skins.ts';
import type { RoomSlotId, SlotComponent } from './slots.ts';

interface RoomSceneOptions {
  host: HTMLElement;
  skinId?: string;
  onGlobeSelect?: () => void;
  onLaptopSelect?: () => void;
  onOrganizeSelect?: () => void;
  onSapiensSelect?: () => void;
  onHeroBookSelect?: () => void;
  onInteractiveHover?: (action: InteractiveAction | null, pointer?: { x: number; y: number }) => void;
}

type CameraSpeedPreset = 'default' | 'quick';

interface CameraTween {
  active: boolean;
  startedAt: number;
  durationMs: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromFov: number;
  toFov: number;
}

interface SlotMount {
  object: CSS3DObject;
  container: HTMLElement;
  component: SlotComponent;
}

type InteractiveAction = 'map' | 'shelf' | 'organize' | 'sapiens' | 'heroBook';

interface DecorAssetSpec {
  id?: string;
  url: string;
  position: [number, number, number];
  liftY?: number;
  yAlign?: 'bottom' | 'center' | 'top';
  rotationX?: number;
  rotationY: number;
  rotationZ?: number;
  targetHeight: number;
  scaleMultiplier?: number;
  preservePivotXZ?: boolean;
  clampDepth?: number;
  photoTextureUrl?: string;
  photoMaterialNameIncludes?: string;
  surfaceTextureSet?: SurfaceTextureSetSpec;
  interactiveAction?: InteractiveAction;
}

interface SurfaceTextureSetSpec {
  colorMap: string;
  normalMap?: string;
  roughnessMap?: string;
  bumpMap?: string;
  repeat: [number, number];
  normalScale?: number;
  bumpScale?: number;
}


// Room geometry constants — positions derived from these, not magic numbers.
const ROOM = {
  LEFT_WALL_X: -5.26,
  RIGHT_WALL_X: 5.26,
  BACK_WALL_Z: -4.2,
  FLOOR_Y: 0,
  CEILING_Y: 4.6,
  DESK_SURFACE_Y: 0.95,  // top face of desk geometry
  DESK_CENTER_Z: -1.45,
} as const;

// Interactive objects — raycasted, each triggers a named action.
const INTERACTIVE_ASSETS: DecorAssetSpec[] = [
  {
    id: 'hero-book-shelf',
    url: '/book.glb',
    position: [-4.5, 1.43, -0.35],
    rotationY: Math.PI,
    targetHeight: 0.38,
    interactiveAction: 'heroBook',
  },
  {
    id: 'bookshelf-a',
    url: '/3d/book_shelf.glb',
    position: [-4.6, 0, 1.0],
    rotationY: Math.PI / 2,
    targetHeight: 2.46,
    scaleMultiplier: 1.15,
    interactiveAction: 'organize',
  },
  {
    id: 'bookshelf-b',
    url: '/3d/bookshelf real.glb',
    position: [-4.6, 0, 2.6],
    rotationY: Math.PI / 2,
    targetHeight: 2.46,
    scaleMultiplier: 1.15,
    interactiveAction: 'organize',
  },
  {
    id: 'globe',
    url: '/3d/antique_globe.glb',
    position: [-1.28, ROOM.DESK_SURFACE_Y + 0.06, -1.86],
    rotationY: -1.08,
    targetHeight: 0.58,
    interactiveAction: 'map',
  },
  {
    id: 'macbook',
    url: '/3d/macbook.glb',
    position: [0.3, ROOM.DESK_SURFACE_Y + 0.06, -1.22],
    liftY: 0.02, // pivot compensation: model origin is not at base
    rotationY: -0.42,
    targetHeight: 0.46,
    interactiveAction: 'shelf',
  },
  {
    id: 'desk-book-sapiens',
    url: '/book.glb',
    position: [-0.5, ROOM.DESK_SURFACE_Y + 0.14, -0.72],
    liftY: 0,
    rotationX: -Math.PI / 2,
    rotationY: 0,
    rotationZ: 0,
    targetHeight: 0.62,
    photoTextureUrl: '/covers/sapiens-zh.jpg',
    photoMaterialNameIncludes: '*',
    interactiveAction: 'sapiens',
  },
];

// Furniture — large structural pieces, not interactive.
const FURNITURE_ASSETS: DecorAssetSpec[] = [
  {
    id: 'chair',
    url: '/3d/chair.glb',
    position: [0.62, 0, 0.3],
    rotationY: 0.5 - Math.PI / 2,
    targetHeight: 1.22,
  },
  {
    id: 'sofa',
    url: '/3d/lounge_chair.glb',
    position: [4.44, 0, 2.62],
    rotationY: -0.42,
    targetHeight: 0.96,
    scaleMultiplier: 1.2,
  },
];

// Decorative props — ambient detail, not interactive.
const PROP_ASSETS: DecorAssetSpec[] = [
  {
    id: 'picture-frame',
    url: '/3d/wooden_picture_frame.glb',
    position: [1.34, ROOM.DESK_SURFACE_Y + 0.06, -1.96],
    liftY: 0.17, // pivot compensation: frame origin sits below visual base
    rotationY: -0.42,
    targetHeight: 0.4,
    photoTextureUrl: '/3d/me.jpg',
    photoMaterialNameIncludes: 'Image',
  },
  {
    id: 'floor-lamp',
    url: '/3d/floor_lamp.glb',
    position: [-3.94, 0, -3.06],
    liftY: 1.52, // pivot compensation: lamp GLB origin is mid-pole, not base
    rotationY: 0.68,
    targetHeight: 4.5,
    scaleMultiplier: 0.64,
    preservePivotXZ: true,
  },
  {
    id: 'floor-plant',
    url: '/3d/bamboo_with_plant_pot.glb',
    position: [4.64, 0, -3.42],
    rotationY: -2.44,
    targetHeight: 3.02,
  },
  {
    id: 'ceiling-light',
    url: '/3d/roomlight.glb',
    position: [0, 3.1, -0.18],
    yAlign: 'top',
    rotationY: 0,
    targetHeight: 1.08,
  },
];

const DECOR_ASSETS: DecorAssetSpec[] = [
  ...INTERACTIVE_ASSETS,
  ...FURNITURE_ASSETS,
  ...PROP_ASSETS,
];

const WALL_TEXTURE_SET: SurfaceTextureSetSpec = {
  colorMap: '/textures/wall/beige_wall_001_diff_2k.jpg',
  normalMap: '/textures/wall/beige_wall_001_nor_gl_2k.exr',
  roughnessMap: '/textures/wall/beige_wall_001_rough_2k.jpg',
  bumpMap: '/textures/wall/beige_wall_001_disp_2k.png',
  repeat: [4.2, 2.2],
  normalScale: 0.52,
  bumpScale: 0.014,
};

const FLOOR_TEXTURE_SET: SurfaceTextureSetSpec = {
  colorMap: '/textures/floor/laminate_floor_03_diff_2k.jpg',
  normalMap: '/textures/floor/laminate_floor_03_nor_gl_2k.exr',
  roughnessMap: '/textures/floor/laminate_floor_03_rough_2k.exr',
  bumpMap: '/textures/floor/laminate_floor_03_disp_2k.png',
  repeat: [6.8, 4.8],
  normalScale: 0.7,
  bumpScale: 0.03,
};

const CARPET_TEXTURE_SET: SurfaceTextureSetSpec = {
  colorMap: '/textures/carpet/Carpet014_2K-JPG_Color.jpg',
  normalMap: '/textures/carpet/Carpet014_2K-JPG_NormalGL.jpg',
  roughnessMap: '/textures/carpet/Carpet014_2K-JPG_Roughness.jpg',
  bumpMap: '/textures/carpet/Carpet014_2K-JPG_Displacement.jpg',
  repeat: [2.2, 1.6],
  normalScale: 0.46,
  bumpScale: 0.02,
};

const BOARD_TEXTURE_SET: SurfaceTextureSetSpec = {
  colorMap: '/textures/board/oriented_strand_board_diff_2k.jpg',
  normalMap: '/textures/board/oriented_strand_board_nor_gl_2k.exr',
  roughnessMap: '/textures/board/oriented_strand_board_rough_2k.exr',
  bumpMap: '/textures/board/oriented_strand_board_disp_2k.png',
  repeat: [1.1, 0.9],
  normalScale: 0.62,
  bumpScale: 0.02,
};

const DESK_TEXTURE_SET: SurfaceTextureSetSpec = {
  colorMap: '/textures/desk/plywood_diff_2k.jpg',
  normalMap: '/textures/desk/plywood_nor_gl_2k.exr',
  roughnessMap: '/textures/desk/plywood_rough_2k.exr',
  repeat: [2.0, 1.2],
  normalScale: 0.42,
};

export class RoomScene {
  private host: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private cssRenderer: CSS3DRenderer;
  private orbitControls: OrbitControls;
  private frameHandle = 0;
  private disposed = false;
  private _paused = false;

  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private skyLight: THREE.HemisphereLight;

  private materials: {
    floor: THREE.MeshStandardMaterial;
    wall: THREE.MeshStandardMaterial;
    sideWall: THREE.MeshStandardMaterial;
    ceiling: THREE.MeshStandardMaterial;
    carpet: THREE.MeshStandardMaterial;
    board: THREE.MeshStandardMaterial;
    wallPanel: THREE.MeshStandardMaterial;
    panelFrame: THREE.MeshStandardMaterial;
    desk: THREE.MeshStandardMaterial;
    trim: THREE.MeshStandardMaterial;
    blind: THREE.MeshStandardMaterial;
    exterior: THREE.MeshStandardMaterial;
    shadowCatcher: THREE.MeshBasicMaterial;
    windowGlow: THREE.MeshStandardMaterial;
  };

  private slotAnchors = new Map<RoomSlotId, THREE.Object3D>();
  private slotMounts = new Map<RoomSlotId, SlotMount>();
  private decorRoot = new THREE.Group();
  private namedModels = new Map<string, THREE.Object3D>();
  private pullTween: { model: THREE.Object3D; startX: number; targetX: number; startedAt: number; durationMs: number; onComplete: () => void } | null = null;
  private gltfLoader = new GLTFLoader();
  private dracoLoader = new DRACOLoader();
  private textureLoader = new THREE.TextureLoader();
  private exrLoader = new EXRLoader();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private interactiveTargets: THREE.Object3D[] = [];
  private interactiveHandlers = new Map<THREE.Object3D, () => void>();
  private interactiveActions = new Map<THREE.Object3D, InteractiveAction>();
  private hoveredInteractiveAction: InteractiveAction | null = null;
  private onGlobeSelect: (() => void) | null = null;
  private onLaptopSelect: (() => void) | null = null;
  private onOrganizeSelect: (() => void) | null = null;
  private onSapiensSelect: (() => void) | null = null;
  private onHeroBookSelect: (() => void) | null = null;
  private onInteractiveHover: ((action: InteractiveAction | null, pointer?: { x: number; y: number }) => void) | null = null;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private hasWallSurfaceTexture = false;
  private hasFloorSurfaceTexture = false;
  private hasDeskSurfaceTexture = false;
  private hasCarpetSurfaceTexture = false;
  private hasBoardSurfaceTexture = false;
  private resizeObserver: ResizeObserver;
  private currentPoseId: RoomPoseId = 'front';
  private cameraSpeedPreset: CameraSpeedPreset = 'default';
  private poseZoomOffset: Record<RoomPoseId, number> = {
    front: 0,
    approach: 0,
    shelf: 0,
    notes: 0,
  };
  private idleEnabled = true;
  private idleStartedAt = performance.now();
  private currentLookTarget = new THREE.Vector3();
  private desiredLookTarget = new THREE.Vector3();
  private desiredPosition = new THREE.Vector3();
  private desiredFov = 42;
  private cameraTween: CameraTween = {
    active: false,
    startedAt: 0,
    durationMs: 0,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    fromFov: 42,
    toFov: 42,
  };
  private queuedCameraTween: CameraTween | null = null;
  private freeLookEnabled = false;

  constructor(options: RoomSceneOptions) {
    this.host = options.host;
    this.onGlobeSelect = typeof options.onGlobeSelect === 'function' ? options.onGlobeSelect : null;
    this.onLaptopSelect = typeof options.onLaptopSelect === 'function' ? options.onLaptopSelect : null;
    this.onOrganizeSelect = typeof options.onOrganizeSelect === 'function' ? options.onOrganizeSelect : null;
    this.onSapiensSelect = typeof options.onSapiensSelect === 'function' ? options.onSapiensSelect : null;
    this.onHeroBookSelect = typeof options.onHeroBookSelect === 'function' ? options.onHeroBookSelect : null;
    this.onInteractiveHover = typeof options.onInteractiveHover === 'function' ? options.onInteractiveHover : null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.dracoLoader.setDecoderPath('/draco/');
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.cssRenderer = new CSS3DRenderer();
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enabled = false;
    this.orbitControls.enablePan = true;
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.minDistance = 1.4;
    this.orbitControls.maxDistance = 14;
    this.orbitControls.minPolarAngle = 0.24;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.04;

    this.materials = {
      floor: new THREE.MeshStandardMaterial({ roughness: 0.84, metalness: 0.03 }),
      wall: new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 }),
      sideWall: new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02 }),
      ceiling: new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0.01 }),
      carpet: new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0.01 }),
      board: new THREE.MeshStandardMaterial({ roughness: 0.84, metalness: 0.02 }),
      wallPanel: new THREE.MeshStandardMaterial({ roughness: 0.76, metalness: 0.02 }),
      panelFrame: new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.03 }),
      desk: new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.05 }),
      trim: new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.03 }),
      blind: new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.04 }),
      exterior: new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, toneMapped: false }),
      shadowCatcher: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
      windowGlow: new THREE.MeshStandardMaterial({ emissiveIntensity: 0.35, toneMapped: false }),
    };

    this.ambientLight = new THREE.AmbientLight('#f6efe5', 0.32);
    this.skyLight = new THREE.HemisphereLight('#d9e7ff', '#b59674', 0.58);
    this.keyLight = new THREE.DirectionalLight('#fff4db', 1.7);
    this.fillLight = new THREE.DirectionalLight('#e9d4bc', 0.5);
    this.rimLight = new THREE.DirectionalLight('#adc7ff', 0.34);

    this.setupImageBasedLighting();
    this.setupHost();
    this.buildRoom();
    this.setupSurfaceTextures();
    this.mountDecorAssets();
    this.applySkin(options.skinId || 'warm-study');
    this.applyPoseImmediately('front');
    this.enterCameraAnimation();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    window.addEventListener('resize', this.resize);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.addEventListener('click', this.handleCanvasClick);

    this.resize();
    this.renderLoop();
  }

  mountSlot(slotId: RoomSlotId, component: SlotComponent): void {
    const anchor = this.slotAnchors.get(slotId);
    if (!anchor) return;

    this.unmountSlot(slotId);

    const dims = component.getDimensions();
    const container = document.createElement('div');
    container.className = `three-slot-root three-slot-root--${slotId}`;
    container.style.width = `${Math.max(320, Math.round(dims.width))}px`;
    container.style.height = `${Math.max(220, Math.round(dims.height))}px`;

    component.mount(container);

    const cssObject = new CSS3DObject(container);
    cssObject.position.set(0, 0, 0.02);
    anchor.add(cssObject);

    this.slotMounts.set(slotId, {
      object: cssObject,
      container,
      component,
    });
  }

  unmountSlot(slotId: RoomSlotId): void {
    const mount = this.slotMounts.get(slotId);
    if (!mount) return;

    mount.component.unmount();
    mount.object.removeFromParent();
    this.slotMounts.delete(slotId);
  }

  goToPose(poseId: RoomPoseId, immediate = false): void {
    if (this.freeLookEnabled) this.setFreeLookEnabled(false);
    const pose = getRoomPose(poseId);
    const previousPoseId = this.currentPoseId;
    this.currentPoseId = poseId;
    this.idleStartedAt = performance.now();

    if (immediate) {
      this.applyPoseImmediately(poseId);
      return;
    }

    if (this.isSideToSideTransition(previousPoseId, poseId)) {
      this.startSideToSideTransition(poseId);
      return;
    }

    const duration = this.resolveDuration(pose.defaultDurationMs);
    this.startCameraTween(
      this.camera.position.clone(),
      this.currentLookTarget.clone(),
      this.camera.fov,
      this.getPosePositionWithZoom(poseId),
      new THREE.Vector3(...pose.target),
      pose.fov,
      duration,
    );
  }

  setCameraSpeedPreset(preset: CameraSpeedPreset): void {
    this.cameraSpeedPreset = preset === 'quick' ? 'quick' : 'default';
  }

  setIdleEnabled(enabled: boolean): void {
    this.idleEnabled = Boolean(enabled);
    this.idleStartedAt = performance.now();
  }

  replayIntro(): void {
    this.enterCameraAnimation();
  }

  zoomCurrentPose(step: number): void {
    const poseId = this.currentPoseId;
    this.poseZoomOffset[poseId] = clamp((this.poseZoomOffset[poseId] || 0) + step, -2.0, 2.4);
    if (!this.cameraTween.active) this.idleStartedAt = performance.now();
  }

  resetCurrentPoseZoom(): void {
    this.poseZoomOffset[this.currentPoseId] = 0;
    if (!this.cameraTween.active) this.idleStartedAt = performance.now();
  }

  applySkin(skinId: string): void {
    const skin = getRoomSkinById(skinId);

    this.scene.background = new THREE.Color(skin.colors.background);

    this.materials.floor.color.set(this.hasFloorSurfaceTexture ? '#ffffff' : skin.colors.floor);
    this.materials.wall.color.set(this.hasWallSurfaceTexture ? '#ffffff' : skin.colors.wall);
    this.materials.sideWall.color.set(this.hasWallSurfaceTexture ? '#ffffff' : skin.colors.sideWall);
    this.materials.ceiling.color.set(skin.colors.ceiling);
    this.materials.carpet.color.set(this.hasCarpetSurfaceTexture ? '#cbbba6' : '#ad9b88');
    this.materials.board.color.set(this.hasBoardSurfaceTexture ? '#ffffff' : '#9a744e');
    this.materials.wallPanel.color.set(skin.colors.wall);
    this.materials.wallPanel.color.offsetHSL(0, -0.05, 0.08);
    this.materials.panelFrame.color.set(skin.colors.sideWall);
    this.materials.panelFrame.color.offsetHSL(0, 0.04, -0.08);
    this.materials.desk.color.set(this.hasDeskSurfaceTexture ? '#ffffff' : skin.colors.desk);
    this.materials.trim.color.set('#b7a791');
    this.materials.blind.color.set('#c9b9a2');
    this.materials.exterior.color.set('#edf3fb');
    this.materials.shadowCatcher.color.set('#000000');
    this.materials.shadowCatcher.opacity = 0.18;
    this.materials.windowGlow.color.set(skin.colors.windowGlow);
    this.materials.windowGlow.emissive = new THREE.Color(skin.colors.windowGlow);

    this.ambientLight.intensity = skin.lighting.ambient;
    this.keyLight.intensity = skin.lighting.key;
    this.fillLight.intensity = skin.lighting.key * 0.34;
    this.rimLight.intensity = skin.lighting.rim * 0.72;
    this.skyLight.intensity = 0.58;
  }

  animateHeroBookPull(onComplete: () => void, durationMs = 600): void {
    const model = this.namedModels.get('hero-book-shelf');
    if (!model) { onComplete(); return; }
    this.pullTween = {
      model,
      startX: model.position.x,
      targetX: model.position.x + 1.8,
      startedAt: performance.now(),
      durationMs,
      onComplete,
    };
  }

  /** Returns the hero book's current screen-space position as {x, y} (0–1 normalized),
   *  or null if the model hasn't loaded yet. Used to position the DOM hotspot overlay. */
  getHeroBookScreenPos(): { x: number; y: number } | null {
    const model = this.namedModels.get('hero-book-shelf');
    if (!model) return null;
    const worldPos = new THREE.Vector3();
    model.getWorldPosition(worldPos);
    worldPos.project(this.camera);
    return {
      x: (worldPos.x + 1) / 2,
      y: (-worldPos.y + 1) / 2,
    };
  }

  pause(): void {
    this._paused = true;
    window.cancelAnimationFrame(this.frameHandle);
  }

  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this.frameHandle = window.requestAnimationFrame(this.renderLoop);
  }

  destroy(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameHandle);

    this.slotMounts.forEach((_, slotId) => this.unmountSlot(slotId));
    this.decorRoot.clear();
    this.scene.environment = null;
    if (this.envRenderTarget) {
      this.envRenderTarget.dispose();
      this.envRenderTarget = null;
    }

    window.removeEventListener('resize', this.resize);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.removeEventListener('click', this.handleCanvasClick);
    this.renderer.domElement.style.cursor = '';
    this.emitInteractiveHover(null);
    this.orbitControls.dispose();

    this.renderer.dispose();
    this.dracoLoader.dispose();

    this.host.innerHTML = '';
  }

  private setupHost(): void {
    this.host.innerHTML = '';
    this.host.classList.add('three-room-host');

    const glWrap = document.createElement('div');
    glWrap.className = 'three-room-layer three-room-layer--gl';
    glWrap.appendChild(this.renderer.domElement);

    const cssWrap = document.createElement('div');
    cssWrap.className = 'three-room-layer three-room-layer--css';
    cssWrap.appendChild(this.cssRenderer.domElement);

    this.host.append(glWrap, cssWrap);

    cssWrap.style.pointerEvents = 'none';
    this.cssRenderer.domElement.style.pointerEvents = 'none';
  }

  private setupImageBasedLighting(): void {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.envRenderTarget = pmremGenerator.fromScene(envScene, 0.035);
    this.scene.environment = this.envRenderTarget.texture;
    envScene.dispose();
    pmremGenerator.dispose();
  }

  private setupSurfaceTextures(): void {
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.applyTextureSetToMaterials([this.materials.wall], WALL_TEXTURE_SET, anisotropy, () => {
      this.hasWallSurfaceTexture = true;
      this.materials.wall.color.set('#ffffff');
      this.materials.sideWall.color.set('#ffffff');
    });
    this.applyTextureSetToMaterials([this.materials.floor], FLOOR_TEXTURE_SET, anisotropy, () => {
      this.hasFloorSurfaceTexture = true;
      this.materials.floor.color.set('#ffffff');
    });
    this.applyTextureSetToMaterials([this.materials.desk], DESK_TEXTURE_SET, anisotropy, () => {
      this.hasDeskSurfaceTexture = true;
      this.materials.desk.color.set('#ffffff');
    });
    this.applyTextureSetToMaterials([this.materials.carpet], CARPET_TEXTURE_SET, anisotropy, () => {
      this.hasCarpetSurfaceTexture = true;
      this.materials.carpet.color.set('#cbbba6');
    });
    this.applyTextureSetToMaterials([this.materials.board], BOARD_TEXTURE_SET, anisotropy, () => {
      this.hasBoardSurfaceTexture = true;
      this.materials.board.color.set('#ffffff');
    });
  }

  private applyTextureSetToMaterials(
    materials: THREE.MeshStandardMaterial[],
    textureSet: SurfaceTextureSetSpec,
    anisotropy: number,
    onReady?: () => void,
  ): void {
    const steps: Array<{ kind: string; url: string; apply: (texture: THREE.Texture) => void }> = [];
    steps.push({
      kind: 'color texture',
      url: textureSet.colorMap,
      apply: (texture) => {
        materials.forEach((material) => {
          material.map = texture;
          material.needsUpdate = true;
        });
      },
    });
    if (textureSet.normalMap) {
      steps.push({
        kind: 'normal texture',
        url: textureSet.normalMap,
        apply: (texture) => {
          materials.forEach((material) => {
            material.normalMap = texture;
            material.normalScale.setScalar(textureSet.normalScale ?? 0.5);
            material.needsUpdate = true;
          });
        },
      });
    }
    if (textureSet.roughnessMap) {
      steps.push({
        kind: 'roughness texture',
        url: textureSet.roughnessMap,
        apply: (texture) => {
          materials.forEach((material) => {
            material.roughnessMap = texture;
            material.roughness = 1;
            material.needsUpdate = true;
          });
        },
      });
    }
    if (textureSet.bumpMap) {
      steps.push({
        kind: 'height texture',
        url: textureSet.bumpMap,
        apply: (texture) => {
          materials.forEach((material) => {
            material.bumpMap = texture;
            material.bumpScale = textureSet.bumpScale ?? 0.01;
            material.needsUpdate = true;
          });
        },
      });
    }

    let remaining = steps.length;
    if (remaining === 0) {
      onReady?.();
      return;
    }
    const done = () => {
      remaining -= 1;
      if (remaining === 0) onReady?.();
    };
    const onError = (kind: string, url: string, error: unknown) => {
      console.warn(`[room] Failed to load ${kind}:`, url, error);
      done();
    };

    steps.forEach((step) => {
      const loader = step.url.toLowerCase().endsWith('.exr')
        ? this.loadExrTexture.bind(this)
        : this.loadBitmapTexture.bind(this);
      const isColorTexture = step.kind === 'color texture';
      loader(
        step.url,
        anisotropy,
        textureSet.repeat,
        isColorTexture,
        (texture: THREE.Texture) => {
          step.apply(texture);
          done();
        },
        (error: unknown) => onError(step.kind, step.url, error),
      );
    });
  }

  private loadBitmapTexture(
    url: string,
    anisotropy: number,
    repeat: [number, number],
    isColorTexture: boolean,
    onLoad: (texture: THREE.Texture) => void,
    onError: (error: unknown) => void,
  ): void {
    this.textureLoader.load(
      url,
      (texture) => {
        this.configureSurfaceTexture(texture, anisotropy, repeat, isColorTexture);
        onLoad(texture);
      },
      undefined,
      onError,
    );
  }

  private loadExrTexture(
    url: string,
    anisotropy: number,
    repeat: [number, number],
    isColorTexture: boolean,
    onLoad: (texture: THREE.Texture) => void,
    onError: (error: unknown) => void,
  ): void {
    this.exrLoader.load(
      url,
      (texture) => {
        this.configureSurfaceTexture(texture, anisotropy, repeat, isColorTexture);
        onLoad(texture);
      },
      undefined,
      onError,
    );
  }

  private configureSurfaceTexture(
    texture: THREE.Texture,
    anisotropy: number,
    repeat: [number, number],
    isColorTexture: boolean,
  ): void {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.offset.set(0, 0);
    texture.anisotropy = anisotropy;
    texture.colorSpace = isColorTexture ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.needsUpdate = true;
  }

  private buildRoom(): void {
    const room = new THREE.Group();
    this.scene.add(room);

    const windowSpec = {
      width: 5.35,
      height: 2.35,
      centerY: 2.55,
      z: -4.12,
      frameDepth: 0.2,
    };

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 8.4), this.materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    room.add(floor);

    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4.6), this.materials.carpet);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.012, -0.72);
    carpet.receiveShadow = true;
    room.add(carpet);

    const backWallPieces = [
      { width: 10.6, height: 4.6 - (windowSpec.centerY + (windowSpec.height / 2)), x: 0, y: (windowSpec.centerY + (windowSpec.height / 2) + 4.6) / 2 },
      { width: 10.6, height: windowSpec.centerY - (windowSpec.height / 2), x: 0, y: (windowSpec.centerY - (windowSpec.height / 2)) / 2 },
      {
        width: (10.6 - windowSpec.width) / 2,
        height: windowSpec.height,
        x: -((windowSpec.width / 2) + ((10.6 - windowSpec.width) / 4)),
        y: windowSpec.centerY,
      },
      {
        width: (10.6 - windowSpec.width) / 2,
        height: windowSpec.height,
        x: (windowSpec.width / 2) + ((10.6 - windowSpec.width) / 4),
        y: windowSpec.centerY,
      },
    ];

    backWallPieces.forEach(({ width, height, x, y }) => {
      const piece = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.materials.wall);
      piece.position.set(x, y, -4.2);
      piece.receiveShadow = true;
      room.add(piece);
    });

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 4.6), this.materials.wall);
    leftWall.position.set(-5.26, 2.3, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    room.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 4.6), this.materials.wall);
    rightWall.position.set(5.26, 2.3, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    room.add(rightWall);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 8.4), this.materials.ceiling);
    ceiling.position.set(0, 4.6, 0);
    ceiling.rotation.x = Math.PI / 2;
    room.add(ceiling);

    const windowAssembly = this.createWindowAssembly(windowSpec);
    room.add(windowAssembly);

    const deskShadow = this.createSoftShadowPlane(4.24, 1.86, 0.24, 0.7);
    deskShadow.rotation.x = -Math.PI / 2;
    deskShadow.position.set(0, 0.014, -1.52);
    room.add(deskShadow);

    const wallShadow = this.createSoftShadowPlane(3.9, 1.65, 0.12, 0.84);
    wallShadow.position.set(0, 1.05, -4.06);
    room.add(wallShadow);

    // Cork board — framed panel centered on the right wall, sized like a hung painting
    const notesBoard = this.createWallProjectionPanel({
      width: 4.4,
      height: 2.6,
      panelMaterial: this.materials.board,
      frameMaterial: this.materials.panelFrame,
    });
    notesBoard.position.set(5.20, 2.3, 0);
    notesBoard.rotation.y = -Math.PI / 2;
    notesBoard.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    room.add(notesBoard);

    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.9), this.materials.desk);
    deskTop.position.set(0, ROOM.DESK_SURFACE_Y, ROOM.DESK_CENTER_Z);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    room.add(deskTop);

    const legGeo = new THREE.BoxGeometry(0.1, 0.89, 0.1);
    const legOffsets = [
      [-1.64, 0.445, -0.64],
      [1.64, 0.445, -0.64],
      [-1.64, 0.445, -2.26],
      [1.64, 0.445, -2.26],
    ] as const;

    legOffsets.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, this.materials.desk);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      leg.receiveShadow = true;
      room.add(leg);
    });

    this.keyLight.position.set(-0.8, 3.8, -5.45);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 18;
    this.keyLight.shadow.camera.left = -4.6;
    this.keyLight.shadow.camera.right = 4.6;
    this.keyLight.shadow.camera.top = 4.4;
    this.keyLight.shadow.camera.bottom = -3.6;
    this.keyLight.shadow.bias = -0.00022;
    this.keyLight.shadow.normalBias = 0.012;
    this.keyLight.target.position.set(0.15, 1.15, -1.45);

    this.fillLight.position.set(4.4, 2.7, 2.5);
    this.fillLight.target.position.set(0, 1.6, -1.3);

    this.rimLight.position.set(-3.6, 3.0, -2.2);
    this.rimLight.target.position.set(2.3, 1.3, -0.4);

    this.scene.add(
      this.ambientLight,
      this.skyLight,
      this.keyLight,
      this.keyLight.target,
      this.fillLight,
      this.fillLight.target,
      this.rimLight,
      this.rimLight.target,
    );
    this.scene.add(this.decorRoot);

    this.registerSlot('shelfWall', [-5.22, 2.2, 0], [0, Math.PI / 2, 0], [0.0095, 0.0095, 0.0095]);
    // notesWall: matches cork board interior. container=880×520px, scale=0.005 → 4.4×2.6 world units
    // x=5.10 so the CSS3D layer sits in front of the cork board mesh (board is at x=5.20)
    this.registerSlot('notesWall', [5.10, 2.3, 0], [0, -Math.PI / 2, 0], [0.005, 0.005, 0.005]);
    this.registerSlot('desk', [0, ROOM.DESK_SURFACE_Y + 0.12, ROOM.DESK_CENTER_Z], [-Math.PI / 2, 0, 0], [0.0048, 0.0048, 0.0048]);
  }

  private createWallProjectionPanel({
    width,
    height,
    panelMaterial = this.materials.wallPanel,
    frameMaterial = this.materials.panelFrame,
  }: {
    width: number;
    height: number;
    panelMaterial?: THREE.Material;
    frameMaterial?: THREE.Material;
  }): THREE.Group {
    const group = new THREE.Group();

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), panelMaterial);
    panel.position.z = 0.001;
    group.add(panel);

    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.24, height + 0.24),
      frameMaterial,
    );
    frame.position.z = -0.003;
    group.add(frame);

    return group;
  }

  private createWindowAssembly(spec: {
    width: number;
    height: number;
    centerY: number;
    z: number;
    frameDepth: number;
  }): THREE.Group {
    const group = new THREE.Group();
    const outerWidth = spec.width + 0.44;
    const outerHeight = spec.height + 0.34;
    const revealDepth = spec.frameDepth;
    const frameThickness = 0.11;
    const slatCount = 18;

    group.position.set(0, spec.centerY, spec.z);

    const makeBox = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    makeBox(outerWidth, frameThickness, revealDepth, 0, (outerHeight / 2) - (frameThickness / 2), -revealDepth / 2, this.materials.trim);
    makeBox(outerWidth, frameThickness, revealDepth, 0, -(outerHeight / 2) + (frameThickness / 2), -revealDepth / 2, this.materials.trim);
    makeBox(frameThickness, outerHeight, revealDepth, -(outerWidth / 2) + (frameThickness / 2), 0, -revealDepth / 2, this.materials.trim);
    makeBox(frameThickness, outerHeight, revealDepth, (outerWidth / 2) - (frameThickness / 2), 0, -revealDepth / 2, this.materials.trim);

    const sill = makeBox(outerWidth + 0.18, 0.08, 0.28, 0, -(outerHeight / 2) - 0.06, -0.04, this.materials.trim);
    sill.receiveShadow = true;

    const exterior = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), this.materials.exterior);
    exterior.position.set(0, 0, -revealDepth - 0.05);
    group.add(exterior);

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(spec.width - 0.06, spec.height - 0.06), this.materials.windowGlow);
    glow.position.set(0, 0, -revealDepth + 0.014);
    glow.renderOrder = 1;
    group.add(glow);

    const slatWidth = spec.width - 0.12;
    const slatHeight = 0.026;
    const slatGap = spec.height / (slatCount + 1);
    for (let index = 0; index < slatCount; index += 1) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(slatWidth, slatHeight, 0.028),
        this.materials.blind,
      );
      slat.position.set(0, (spec.height / 2) - ((index + 1) * slatGap), -revealDepth + 0.034);
      slat.rotation.x = -0.07;
      slat.castShadow = true;
      slat.receiveShadow = true;
      group.add(slat);
    }

    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, spec.height, 0.04), this.materials.trim);
    mullion.position.set(0, 0, -revealDepth + 0.016);
    mullion.castShadow = true;
    mullion.receiveShadow = true;
    group.add(mullion);

    return group;
  }

  private createSoftShadowPlane(width: number, height: number, opacity: number, blur: number): THREE.Mesh {
    const material = this.materials.shadowCatcher.clone();
    material.map = createSoftShadowTexture(blur);
    material.opacity = opacity;
    material.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.renderOrder = 3;
    return mesh;
  }

  private createPinnedNotesCluster(): THREE.Group {
    const group = new THREE.Group();
    const noteGeo = new THREE.PlaneGeometry(0.32, 0.24);
    const pinGeo = new THREE.SphereGeometry(0.015, 14, 14);
    const pinMat = new THREE.MeshStandardMaterial({ color: '#d2b086', roughness: 0.38, metalness: 0.28 });
    const notes = [
      { x: -0.74, y: 0.34, z: 0.018, rot: -0.08, color: '#f0dc95' },
      { x: -0.26, y: 0.38, z: 0.02, rot: 0.06, color: '#cddbb4' },
      { x: 0.22, y: 0.29, z: 0.019, rot: -0.04, color: '#d4e0bf' },
      { x: 0.66, y: 0.35, z: 0.017, rot: 0.09, color: '#ebd7a6' },
      { x: -0.52, y: -0.03, z: 0.019, rot: 0.03, color: '#d5e6c7' },
      { x: -0.04, y: -0.09, z: 0.021, rot: -0.07, color: '#f3de9b' },
      { x: 0.44, y: -0.07, z: 0.019, rot: 0.05, color: '#c9d9b6' },
    ];

    notes.forEach((note) => {
      const noteMat = new THREE.MeshStandardMaterial({ color: note.color, roughness: 0.88, metalness: 0.02 });
      const paper = new THREE.Mesh(noteGeo, noteMat);
      paper.position.set(note.x, note.y, note.z);
      paper.rotation.z = note.rot;
      group.add(paper);

      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(note.x, note.y + 0.082, note.z + 0.012);
      group.add(pin);
    });

    return group;
  }

  private registerSlot(
    slotId: RoomSlotId,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number],
  ): void {
    const anchor = new THREE.Object3D();
    anchor.position.set(...position);
    anchor.rotation.set(...rotation);
    anchor.scale.set(...scale);
    this.scene.add(anchor);
    this.slotAnchors.set(slotId, anchor);
  }

  private mountDecorAssets(): void {
    DECOR_ASSETS.forEach((asset) => this.mountDecorAsset(asset));
  }

  private mountDecorAsset(asset: DecorAssetSpec): void {
    this.gltfLoader.load(
      asset.url,
      (gltf) => {
        if (this.disposed) return;
        const model = gltf.scene;
        if (!model) return;
        this.finalizeDecorAsset(model, asset);
      },
      undefined,
      (error) => {
        console.warn('[room] Failed to load decor model:', asset.url, error);
      },
    );
  }

  private finalizeDecorAsset(model: THREE.Object3D, asset: DecorAssetSpec): void {
    const normalized = this.normalizeModelPivot(
      model,
      Boolean(asset.preservePivotXZ),
      asset.yAlign || 'bottom',
    );
    const scale = asset.targetHeight / Math.max(normalized.height, 0.001);
    model.scale.setScalar(scale);
    if (asset.scaleMultiplier && Number.isFinite(asset.scaleMultiplier)) {
      model.scale.multiplyScalar(Math.max(0.001, asset.scaleMultiplier));
    }

    if (asset.clampDepth) {
      const scaledDepth = normalized.depth * scale;
      if (scaledDepth > asset.clampDepth) {
        const shrink = asset.clampDepth / Math.max(scaledDepth, 0.001);
        model.scale.multiplyScalar(shrink);
      }
    }

    model.position.set(...asset.position);
    if (asset.liftY) model.position.y += asset.liftY;
    model.rotation.set(asset.rotationX ?? 0, asset.rotationY, asset.rotationZ ?? 0);

    if (asset.interactiveAction === 'map') {
      this.registerInteractiveTarget(model, () => this.onGlobeSelect?.(), asset.interactiveAction);
    } else if (asset.interactiveAction === 'shelf') {
      this.registerInteractiveTarget(model, () => this.onLaptopSelect?.(), asset.interactiveAction);
    } else if (asset.interactiveAction === 'organize') {
      this.registerInteractiveTarget(model, () => this.onOrganizeSelect?.(), asset.interactiveAction);
    } else if (asset.interactiveAction === 'sapiens') {
      this.registerInteractiveTarget(model, () => this.onSapiensSelect?.(), asset.interactiveAction);
    } else if (asset.interactiveAction === 'heroBook') {
      this.registerInteractiveTarget(model, () => this.onHeroBookSelect?.(), asset.interactiveAction);
    }

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    if (asset.surfaceTextureSet) {
      this.applyDecorSurfaceTextureSet(model, asset.surfaceTextureSet);
    }

    if (asset.photoTextureUrl) {
      this.applyDecorPhotoTexture(model, asset.photoTextureUrl, asset.photoMaterialNameIncludes || 'Image');
    }

    if (asset.id) this.namedModels.set(asset.id, model);
    this.decorRoot.add(model);
  }

  private normalizeModelPivot(
    model: THREE.Object3D,
    preservePivotXZ = false,
    yAlign: 'bottom' | 'center' | 'top' = 'bottom',
  ): { height: number; depth: number } {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    if (!preservePivotXZ) {
      model.position.x -= center.x;
      model.position.z -= center.z;
    }
    if (yAlign === 'top') {
      model.position.y -= box.max.y;
    } else if (yAlign === 'center') {
      model.position.y -= center.y;
    } else {
      model.position.y -= box.min.y;
    }

    return {
      height: Math.max(size.y, 0.001),
      depth: Math.max(size.z, 0.001),
    };
  }

  private registerInteractiveTarget(target: THREE.Object3D, onClick: () => void, action: InteractiveAction): void {
    this.interactiveTargets.push(target);
    this.interactiveHandlers.set(target, onClick);
    this.interactiveActions.set(target, action);
  }

  private updatePointerFromEvent(event: MouseEvent | PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.pointer.set(-10, -10);
      return;
    }
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    this.pointer.set((px * 2) - 1, -(py * 2) + 1);
  }

  private pickInteractiveTarget(event: MouseEvent | PointerEvent): { object: THREE.Object3D; onClick: () => void; action: InteractiveAction | null } | null {
    if (!this.interactiveTargets.length) return null;
    this.updatePointerFromEvent(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactiveTargets, true);
    if (!hits.length) return null;
    const rootTarget = this.interactiveTargets.find((target) => {
      let node: THREE.Object3D | null = hits[0].object;
      while (node) {
        if (node === target) return true;
        node = node.parent;
      }
      return false;
    });
    if (!rootTarget) return null;
    const onClick = this.interactiveHandlers.get(rootTarget);
    if (!onClick) return null;
    const action = this.interactiveActions.get(rootTarget) || null;
    return { object: rootTarget, onClick, action };
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.disposed) return;
    const hit = this.pickInteractiveTarget(event);
    this.renderer.domElement.style.cursor = hit ? 'pointer' : '';
    this.emitInteractiveHover(hit?.action || null, { x: event.clientX, y: event.clientY });
  };

  private handlePointerLeave = (): void => {
    if (this.disposed) return;
    this.renderer.domElement.style.cursor = '';
    this.emitInteractiveHover(null);
  };

  private handleCanvasClick = (event: MouseEvent): void => {
    if (this.disposed) return;
    const hit = this.pickInteractiveTarget(event);
    if (!hit) return;
    hit.onClick();
  };

  private emitInteractiveHover(action: InteractiveAction | null, pointer?: { x: number; y: number }): void {
    const normalizedAction = action || null;
    if (!this.onInteractiveHover) return;
    if (normalizedAction !== this.hoveredInteractiveAction) {
      this.hoveredInteractiveAction = normalizedAction;
    }
    this.onInteractiveHover(normalizedAction, pointer);
  }

  private applyDecorPhotoTexture(model: THREE.Object3D, textureUrl: string, materialNameHint: string): void {
    this.textureLoader.load(
      textureUrl,
      (texture) => {
        if (this.disposed) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = true;
        texture.needsUpdate = true;

        const hint = materialNameHint.toLowerCase();
        const matchAll = hint === '*';
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh || !mesh.material) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => {
            const name = String(material.name || '').toLowerCase();
            if (!matchAll && !name.includes(hint)) return;
            const maybeTextured = material as THREE.MeshStandardMaterial;
            maybeTextured.map = texture;
            maybeTextured.needsUpdate = true;
          });
        });
      },
      undefined,
      (error) => {
        console.warn('[room] Failed to load frame photo texture:', textureUrl, error);
      },
    );
  }

  private applyDecorSurfaceTextureSet(model: THREE.Object3D, textureSet: SurfaceTextureSetSpec): void {
    const materials = this.collectMeshStandardMaterials(model);
    if (!materials.length) return;
    materials.forEach((material) => {
      material.color.set('#ffffff');
      material.emissive.set('#000000');
      material.roughness = Math.max(material.roughness, 0.72);
      material.metalness = Math.min(material.metalness, 0.08);
      material.needsUpdate = true;
    });
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.applyTextureSetToMaterials(materials, textureSet, anisotropy);
  }

  private collectMeshStandardMaterials(model: THREE.Object3D): THREE.MeshStandardMaterial[] {
    const bag = new Set<THREE.MeshStandardMaterial>();
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((material) => {
        if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          bag.add(material as THREE.MeshStandardMaterial);
        }
      });
    });
    return Array.from(bag);
  }

  private renderLoop = (): void => {
    if (this.disposed || this._paused) return;
    this.frameHandle = window.requestAnimationFrame(this.renderLoop);
    if (this.freeLookEnabled) {
      this.orbitControls.update();
      this.currentLookTarget.copy(this.orbitControls.target);
      this.desiredLookTarget.copy(this.orbitControls.target);
      this.desiredPosition.copy(this.camera.position);
      this.desiredFov = this.camera.fov;
    } else {
      this.updateCameraFrame(performance.now());
    }
    if (this.pullTween) {
      const t = Math.min(1, (performance.now() - this.pullTween.startedAt) / this.pullTween.durationMs);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.pullTween.model.position.x = this.pullTween.startX + (this.pullTween.targetX - this.pullTween.startX) * ease;
      if (t >= 1) {
        this.pullTween.model.visible = false;
        const cb = this.pullTween.onComplete;
        this.pullTween = null;
        cb();
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.cssRenderer.render(this.scene, this.camera);
  };

  private resize = (): void => {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
    this.cssRenderer.setSize(width, height);
    this.orbitControls.update();
  };

  setFreeLookEnabled(enabled: boolean): void {
    const next = Boolean(enabled);
    if (this.freeLookEnabled === next) return;

    this.freeLookEnabled = next;
    this.orbitControls.enabled = next;
    if (next) {
      this.cameraTween.active = false;
      this.queuedCameraTween = null;
      this.idleStartedAt = performance.now();
      this.orbitControls.target.copy(this.currentLookTarget);
      this.orbitControls.update();
      return;
    }

    this.idleStartedAt = performance.now();
    this.applyPoseImmediately(this.currentPoseId);
  }

  isFreeLookEnabled(): boolean {
    return this.freeLookEnabled;
  }

  private enterCameraAnimation(): void {
    const initialPos = new THREE.Vector3(0, 2.2, 9.5);
    const initialTarget = new THREE.Vector3(0, 1.5, -2.0);
    const frontPose = getRoomPose('front');
    this.currentPoseId = 'front';
    this.idleStartedAt = performance.now();

    this.camera.position.copy(initialPos);
    this.currentLookTarget.copy(initialTarget);
    this.camera.lookAt(initialTarget);
    this.camera.fov = 46;
    this.camera.updateProjectionMatrix();

    this.startCameraTween(
      initialPos,
      initialTarget,
      46,
      this.getPosePositionWithZoom('front'),
      new THREE.Vector3(...frontPose.target),
      frontPose.fov,
      1200,
    );
  }

  private applyPoseImmediately(poseId: RoomPoseId): void {
    const pose = getRoomPose(poseId);
    this.currentPoseId = poseId;
    this.idleStartedAt = performance.now();

    const posePosition = this.getPosePositionWithZoom(poseId);
    this.camera.position.copy(posePosition);
    this.desiredPosition.copy(posePosition);
    this.currentLookTarget.set(...pose.target);
    this.desiredLookTarget.set(...pose.target);
    this.camera.fov = pose.fov;
    this.desiredFov = pose.fov;
    this.camera.lookAt(this.currentLookTarget);
    this.camera.updateProjectionMatrix();
    this.cameraTween.active = false;
  }

  private resolveDuration(defaultDurationMs: number): number {
    if (this.cameraSpeedPreset === 'quick') return Math.round(defaultDurationMs * 0.72);
    return defaultDurationMs;
  }

  private startCameraTween(
    fromPos: THREE.Vector3,
    fromTarget: THREE.Vector3,
    fromFov: number,
    toPos: THREE.Vector3,
    toTarget: THREE.Vector3,
    toFov: number,
    durationMs: number,
  ): void {
    this.cameraTween.active = true;
    this.cameraTween.startedAt = performance.now();
    this.cameraTween.durationMs = Math.max(240, durationMs);
    this.cameraTween.fromPos.copy(fromPos);
    this.cameraTween.fromTarget.copy(fromTarget);
    this.cameraTween.toPos.copy(toPos);
    this.cameraTween.toTarget.copy(toTarget);
    this.cameraTween.fromFov = fromFov;
    this.cameraTween.toFov = toFov;
    this.desiredFov = toFov;
    this.queuedCameraTween = null;
  }

  private updateCameraFrame(nowMs: number): void {
    const pose = getRoomPose(this.currentPoseId);
    const posePosition = this.getPosePositionWithZoom(this.currentPoseId);
    const idle = this.getIdleOffset(nowMs, pose.idleAmplitude.x, pose.idleAmplitude.y);

    if (this.cameraTween.active) {
      const tween = this.cameraTween;
      const progress = Math.min(1, (nowMs - tween.startedAt) / tween.durationMs);
      const eased = easeInOutCubic(progress);

      this.desiredPosition.lerpVectors(tween.fromPos, tween.toPos, eased);
      this.desiredLookTarget.lerpVectors(tween.fromTarget, tween.toTarget, eased);
      this.desiredFov = lerp(tween.fromFov, tween.toFov, eased);

      if (progress >= 1) {
        if (this.queuedCameraTween) {
          this.cameraTween = {
            ...this.queuedCameraTween,
            active: true,
            startedAt: nowMs,
          };
          this.queuedCameraTween = null;
        } else {
          this.cameraTween.active = false;
        }
      }
    } else {
      this.desiredPosition.copy(posePosition);
      this.desiredLookTarget.set(...pose.target);
      this.desiredFov = pose.fov;
    }

    this.applyCameraConstraints(this.desiredPosition, this.desiredLookTarget);

    const damping = this.cameraTween.active ? 0.18 : 0.11;
    this.camera.position.lerp(this.desiredPosition, damping);
    this.currentLookTarget.lerp(this.desiredLookTarget, damping);
    this.camera.fov = lerp(this.camera.fov, this.desiredFov, 0.14);

    const idleLook = this.currentLookTarget.clone();
    idleLook.x += idle.x;
    idleLook.y += idle.y;

    this.camera.lookAt(idleLook);
    this.camera.updateProjectionMatrix();
  }

  private getIdleOffset(nowMs: number, xAmp: number, yAmp: number): { x: number; y: number } {
    if (!this.idleEnabled || this.cameraTween.active) return { x: 0, y: 0 };
    const elapsed = (nowMs - this.idleStartedAt) / 1000;
    return {
      x: Math.sin(elapsed * 0.35) * xAmp,
      y: Math.sin(elapsed * 0.6) * yAmp,
    };
  }

  private applyCameraConstraints(position: THREE.Vector3, target: THREE.Vector3): void {
    position.x = clamp(position.x, -4.7, 4.7);
    position.y = clamp(position.y, 1.3, 2.45);
    position.z = clamp(position.z, -1.4, 8.85);

    target.x = clamp(target.x, -5.15, 5.15);
    target.y = clamp(target.y, 1.1, 2.8);
    target.z = clamp(target.z, -4.0, 1.2);
  }

  private getPosePositionWithZoom(poseId: RoomPoseId): THREE.Vector3 {
    const pose = getRoomPose(poseId);
    const basePosition = new THREE.Vector3(...pose.position);
    const target = new THREE.Vector3(...pose.target);
    const direction = target.clone().sub(basePosition).normalize();
    const zoomOffset = this.poseZoomOffset[poseId] || 0;
    return basePosition.addScaledVector(direction, zoomOffset);
  }

  private isSideToSideTransition(fromPoseId: RoomPoseId, toPoseId: RoomPoseId): boolean {
    return (
      (fromPoseId === 'shelf' && toPoseId === 'notes') ||
      (fromPoseId === 'notes' && toPoseId === 'shelf')
    );
  }

  private startSideToSideTransition(targetPoseId: RoomPoseId): void {
    const targetPose = getRoomPose(targetPoseId);
    const pivotPosition = new THREE.Vector3(0, targetPose.position[1], 0);
    const pivotTarget = new THREE.Vector3(0, targetPose.position[1], -4.2);
    const firstDuration = this.resolveDuration(380);
    const secondDuration = this.resolveDuration(520);

    this.startCameraTween(
      this.camera.position.clone(),
      this.currentLookTarget.clone(),
      this.camera.fov,
      pivotPosition,
      pivotTarget,
      targetPose.fov,
      firstDuration,
    );

    this.queuedCameraTween = this.createCameraTween(
      pivotPosition,
      pivotTarget,
      targetPose.fov,
      this.getPosePositionWithZoom(targetPoseId),
      new THREE.Vector3(...targetPose.target),
      targetPose.fov,
      secondDuration,
    );
  }

  private createCameraTween(
    fromPos: THREE.Vector3,
    fromTarget: THREE.Vector3,
    fromFov: number,
    toPos: THREE.Vector3,
    toTarget: THREE.Vector3,
    toFov: number,
    durationMs: number,
  ): CameraTween {
    return {
      active: true,
      startedAt: 0,
      durationMs: Math.max(240, durationMs),
      fromPos: fromPos.clone(),
      toPos: toPos.clone(),
      fromTarget: fromTarget.clone(),
      toTarget: toTarget.clone(),
      fromFov,
      toFov,
    };
  }
}

function easeInOutCubic(t: number): number {
  if (t < 0.5) return 4 * t * t * t;
  return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createSoftShadowTexture(blur: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.NoColorSpace;
    return fallback;
  }

  const radius = Math.max(0.18, Math.min(0.92, blur));
  const gradient = context.createRadialGradient(128, 128, 16, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(0,0,0,0.82)');
  gradient.addColorStop(radius, 'rgba(0,0,0,0.24)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
