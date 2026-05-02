import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CSS3DObject, CSS3DRenderer } from 'https://unpkg.com/three@0.160.0/examples/jsm/renderers/CSS3DRenderer.js';

import { getRoomPose, type RoomPoseId } from './camera-paths.ts';
import { getRoomSkinById } from './skins.ts';
import type { RoomSlotId, SlotComponent } from './slots.ts';

interface RoomSceneOptions {
  host: HTMLElement;
  skinId?: string;
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

export class RoomScene {
  private host: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private cssRenderer: CSS3DRenderer;
  private frameHandle = 0;
  private disposed = false;

  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;

  private materials: {
    floor: THREE.MeshStandardMaterial;
    wall: THREE.MeshStandardMaterial;
    sideWall: THREE.MeshStandardMaterial;
    wallPanel: THREE.MeshStandardMaterial;
    panelFrame: THREE.MeshStandardMaterial;
    desk: THREE.MeshStandardMaterial;
    windowGlow: THREE.MeshStandardMaterial;
  };

  private slotAnchors = new Map<RoomSlotId, THREE.Object3D>();
  private slotMounts = new Map<RoomSlotId, SlotMount>();
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

  constructor(options: RoomSceneOptions) {
    this.host = options.host;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.cssRenderer = new CSS3DRenderer();

    this.materials = {
      floor: new THREE.MeshStandardMaterial({ roughness: 0.84, metalness: 0.03 }),
      wall: new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 }),
      sideWall: new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02 }),
      wallPanel: new THREE.MeshStandardMaterial({ roughness: 0.76, metalness: 0.02 }),
      panelFrame: new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.03 }),
      desk: new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.05 }),
      windowGlow: new THREE.MeshStandardMaterial({ emissiveIntensity: 0.35, toneMapped: false }),
    };

    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.7);
    this.keyLight = new THREE.DirectionalLight('#ffe2c5', 1.0);
    this.rimLight = new THREE.DirectionalLight('#9ec1ff', 0.55);

    this.setupHost();
    this.buildRoom();
    this.applySkin(options.skinId || 'warm-study');
    this.applyPoseImmediately('front');
    this.enterCameraAnimation();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    window.addEventListener('resize', this.resize);

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

    this.materials.floor.color.set(skin.colors.floor);
    this.materials.wall.color.set(skin.colors.wall);
    this.materials.sideWall.color.set(skin.colors.sideWall);
    this.materials.wallPanel.color.set(skin.colors.wall);
    this.materials.wallPanel.color.offsetHSL(0, -0.05, 0.08);
    this.materials.panelFrame.color.set(skin.colors.sideWall);
    this.materials.panelFrame.color.offsetHSL(0, 0.04, -0.08);
    this.materials.desk.color.set(skin.colors.desk);
    this.materials.windowGlow.color.set(skin.colors.windowGlow);
    this.materials.windowGlow.emissive = new THREE.Color(skin.colors.windowGlow);

    this.ambientLight.intensity = skin.lighting.ambient;
    this.keyLight.intensity = skin.lighting.key;
    this.rimLight.intensity = skin.lighting.rim;
  }

  destroy(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameHandle);

    this.slotMounts.forEach((_, slotId) => this.unmountSlot(slotId));

    window.removeEventListener('resize', this.resize);
    this.resizeObserver.disconnect();

    this.renderer.dispose();

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

    this.cssRenderer.domElement.style.pointerEvents = 'none';
  }

  private buildRoom(): void {
    const room = new THREE.Group();
    this.scene.add(room);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 8.4), this.materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = false;
    room.add(floor);

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 4.6), this.materials.wall);
    backWall.position.set(0, 2.3, -4.2);
    room.add(backWall);

    const sideWallThickness = 0.32;
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(sideWallThickness, 4.6, 8.4), this.materials.sideWall);
    leftWall.position.set(-5.45, 2.3, 0);
    leftWall.castShadow = false;
    room.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(sideWallThickness, 4.6, 8.4), this.materials.sideWall);
    rightWall.position.set(5.45, 2.3, 0);
    rightWall.castShadow = false;
    room.add(rightWall);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 8.4), this.materials.wall);
    ceiling.position.set(0, 4.6, 0);
    ceiling.rotation.x = Math.PI / 2;
    room.add(ceiling);

    const windowFrame = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 2.9), this.materials.wall);
    windowFrame.position.set(0, 2.55, -4.15);
    windowFrame.renderOrder = 1;
    room.add(windowFrame);

    const windowGlow = new THREE.Mesh(new THREE.PlaneGeometry(5.35, 2.35), this.materials.windowGlow);
    windowGlow.position.set(0, 2.55, -4.12);
    windowGlow.renderOrder = 2;
    room.add(windowGlow);

    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 1.4), this.materials.desk);
    deskTop.position.set(0, 0.8, -1.45);
    deskTop.castShadow = false;
    room.add(deskTop);

    const legGeo = new THREE.BoxGeometry(0.1, 0.75, 0.1);
    const legOffsets = [
      [-1.25, 0.38, -0.84],
      [1.25, 0.38, -0.84],
      [-1.25, 0.38, -2.06],
      [1.25, 0.38, -2.06],
    ] as const;

    legOffsets.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, this.materials.desk);
      leg.position.set(x, y, z);
      leg.castShadow = false;
      room.add(leg);
    });

    const shelfPanel = this.createWallProjectionPanel({ width: 3.2, height: 3.3 });
    shelfPanel.position.set(-5.28, 2.2, 0);
    shelfPanel.rotation.y = Math.PI / 2;
    room.add(shelfPanel);

    const notesPanel = this.createWallProjectionPanel({ width: 3.2, height: 3.3 });
    notesPanel.position.set(5.28, 2.2, 0);
    notesPanel.rotation.y = -Math.PI / 2;
    room.add(notesPanel);

    this.keyLight.position.set(0, 4.1, 2.8);
    this.keyLight.castShadow = false;

    this.rimLight.position.set(-3.6, 2.8, -2.9);

    this.scene.add(this.ambientLight, this.keyLight, this.rimLight);

    this.registerSlot('shelfWall', [-5.22, 2.2, 0], [0, Math.PI / 2, 0], [0.0095, 0.0095, 0.0095]);
    this.registerSlot('notesWall', [5.22, 2.2, 0], [0, -Math.PI / 2, 0], [0.0095, 0.0095, 0.0095]);
    this.registerSlot('desk', [0, 1.22, -1.45], [-Math.PI / 2, 0, 0], [0.0048, 0.0048, 0.0048]);
  }

  private createWallProjectionPanel({ width, height }: { width: number; height: number }): THREE.Group {
    const group = new THREE.Group();

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.materials.wallPanel);
    panel.position.z = 0.001;
    group.add(panel);

    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.24, height + 0.24),
      this.materials.panelFrame,
    );
    frame.position.z = -0.003;
    group.add(frame);

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

  private renderLoop = (): void => {
    if (this.disposed) return;
    this.frameHandle = window.requestAnimationFrame(this.renderLoop);
    this.updateCameraFrame(performance.now());
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
  };

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
