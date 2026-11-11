import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GeologicalStratum, ProjectCampaign, WellOrFront } from '../types';
import {
  Play,
  Pause,
  RotateCcw,
  Layers,
  Eye,
  Compass,
  ChevronDown,
  ChevronUp,
  Activity,
  Fuel,
  Gauge,
} from 'lucide-react';

interface StratigraphicViewer4DProps {
  campaign: ProjectCampaign;
  selectedWellId: string | null;
  onSelectWell: (wellId: string | null) => void;
}

// Reusable module-scope math helpers to avoid GC in render loop
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

function createStratumTexture(
  renderer: THREE.WebGLRenderer,
  baseColorHex: string,
  lithologyType: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColorHex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add horizontal sedimentary bedding planes and mineral speckles
  for (let i = 0; i < 28; i++) {
    const y = (i / 28) * canvas.height;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y, canvas.width, 3 + (i % 4));
  }

  // Fracture veins or rock grain
  ctx.strokeStyle = lithologyType === 3 ? 'rgba(45, 212, 191, 0.28)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  for (let j = 0; j < 18; j++) {
    ctx.beginPath();
    const startX = (j * 37) % canvas.width;
    const startY = (j * 29) % canvas.height;
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + 45, startY + (j % 2 === 0 ? 18 : -18));
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

export const StratigraphicViewer4D: React.FC<StratigraphicViewer4DProps> = ({
  campaign,
  selectedWellId,
  onSelectWell,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // 4D Timeline & Visualization Controls
  const [timelinePercent, setTimelinePercent] = useState<number>(100);
  const [isPlaying4D, setIsPlaying4D] = useState<boolean>(false);
  const [strataExplode, setStrataExplode] = useState<number>(0.15);
  const [rockOpacity, setRockOpacity] = useState<number>(0.78);
  const [cameraPreset, setCameraPreset] = useState<'overview' | 'cross_section' | 'rigs' | 'top'>('overview');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [selectedStratum, setSelectedStratum] = useState<GeologicalStratum | null>(null);

  // Mutable refs for the WebGL loop
  const stateRef = useRef({
    timelinePercent: 100,
    isPlaying4D: false,
    strataExplode: 0.15,
    rockOpacity: 0.78,
    selectedWellId: selectedWellId,
    cameraPresetReached: true,
    desiredCamPos: new THREE.Vector3(78, 42, 86),
    desiredCamLook: new THREE.Vector3(0, -18, 0),
  });

  useEffect(() => {
    stateRef.current.timelinePercent = timelinePercent;
  }, [timelinePercent]);

  useEffect(() => {
    stateRef.current.isPlaying4D = isPlaying4D;
  }, [isPlaying4D]);

  useEffect(() => {
    stateRef.current.strataExplode = strataExplode;
  }, [strataExplode]);

  useEffect(() => {
    stateRef.current.rockOpacity = rockOpacity;
  }, [rockOpacity]);

  useEffect(() => {
    stateRef.current.selectedWellId = selectedWellId;
  }, [selectedWellId]);

  const handleSetCameraPreset = (preset: 'overview' | 'cross_section' | 'rigs' | 'top') => {
    setCameraPreset(preset);
    stateRef.current.cameraPresetReached = false;
    if (preset === 'overview') {
      stateRef.current.desiredCamPos.set(78, 42, 86);
      stateRef.current.desiredCamLook.set(0, -18, 0);
    } else if (preset === 'cross_section') {
      stateRef.current.desiredCamPos.set(0, -22, 98);
      stateRef.current.desiredCamLook.set(0, -24, 0);
    } else if (preset === 'rigs') {
      stateRef.current.desiredCamPos.set(42, 22, 44);
      stateRef.current.desiredCamLook.set(0, 2, 0);
    } else if (preset === 'top') {
      stateRef.current.desiredCamPos.set(0, 95, 12);
      stateRef.current.desiredCamLook.set(0, 0, 0);
    }
  };

  // Advance timeline when Play 4D is active
  useEffect(() => {
    if (!isPlaying4D) return;
    const interval = window.setInterval(() => {
      setTimelinePercent((prev) => {
        if (prev >= 100) {
          setIsPlaying4D(false);
          return 100;
        }
        return Math.min(100, +(prev + 1.25).toFixed(1));
      });
    }, 80);
    return () => window.clearInterval(interval);
  }, [isPlaying4D]);

  // Keyboard shortcut 'H' to toggle HUD dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          setDockCollapsed((c) => !c);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software WebGL Guard
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 580;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.0032);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 600);
    camera.position.set(78, 42, 86);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Studio Environment Map (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3. Balanced 3-Point Studio Lighting Rig + Warm/Cool Contrast
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x334155, 0.85);
    hemiLight.position.set(0, 80, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.1);
    keyLight.position.set(55, 85, 60);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 240;
    const d = 65;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
    rimLight.position.set(-65, 35, -55);
    scene.add(rimLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -18, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxDistance = 220;
    controls.minDistance = 18;
    controls.addEventListener('start', () => {
      stateRef.current.cameraPresetReached = true;
    });

    // Scale conversion: 10 meters depth = 1 Three.js unit on Y axis
    const DEPTH_SCALE = 0.1;
    const BLOCK_WIDTH = 76;
    const BLOCK_DEPTH = 56;

    const disposableGeometries: THREE.BufferGeometry[] = [];
    const disposableMaterials: THREE.Material[] = [];
    const disposableTextures: THREE.Texture[] = [];

    // Surface Reference Grid (offset by +0.04 on Y to avoid Z-fighting)
    const gridHelper = new THREE.GridHelper(BLOCK_WIDTH, 16, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = 0.04;
    scene.add(gridHelper);

    // 4. Build 3D Geological Strata Layers
    interface StratumMeshRef {
      stratum: GeologicalStratum;
      group: THREE.Group;
      mesh: THREE.Mesh;
      mat: THREE.MeshStandardMaterial;
      baseYCenter: number;
      index: number;
    }

    const stratumRefs: StratumMeshRef[] = [];
    const pickableObjects: THREE.Object3D[] = [];

    campaign.strata.forEach((st, idx) => {
      const thicknessM = Math.max(10, st.toDepthM - st.fromDepthM);
      const height3D = thicknessM * DEPTH_SCALE;
      const centerDepthM = (st.fromDepthM + st.toDepthM) / 2;
      const baseYCenter = -centerDepthM * DEPTH_SCALE;

      const group = new THREE.Group();
      group.position.set(0, baseYCenter, 0);

      const geo = new THREE.BoxGeometry(BLOCK_WIDTH, height3D - 0.12, BLOCK_DEPTH);
      disposableGeometries.push(geo);

      const tex = createStratumTexture(renderer, st.colorHex, idx);
      disposableTextures.push(tex);

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.72 - idx * 0.08,
        metalness: idx === campaign.strata.length - 1 ? 0.25 : 0.08,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      });
      disposableMaterials.push(mat);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = !isSoftwareGl;
      mesh.renderOrder = 1 + idx;
      mesh.userData = { type: 'stratum', stratum: st };
      pickableObjects.push(mesh);
      group.add(mesh);

      // Wireframe border for clean geological cross-section definition
      const edgesGeo = new THREE.EdgesGeometry(geo);
      const edgesMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(st.colorHex).lerp(new THREE.Color(0xffffff), 0.35),
        transparent: true,
        opacity: 0.45,
      });
      disposableGeometries.push(edgesGeo);
      disposableMaterials.push(edgesMat);
      const wireframe = new THREE.LineSegments(edgesGeo, edgesMat);
      group.add(wireframe);

      scene.add(group);
      stratumRefs.push({
        stratum: st,
        group,
        mesh,
        mat,
        baseYCenter,
        index: idx,
      });
    });

    // 5. Build Composite 3-12 Part Drilling Rigs, Mud Pits, Boreholes & Casing per Well/Front
    interface WellVisualRef {
      well: WellOrFront;
      rootGroup: THREE.Group;
      drilledMesh: THREE.Mesh;
      casingMesh: THREE.Mesh;
      bitGroup: THREE.Group;
      selectionRing: THREE.Mesh;
      kellyRod: THREE.Mesh;
      maxTarget3D: number;
      actualDrilled3D: number;
      actualCasing3D: number;
    }

    const wellRefs: WellVisualRef[] = [];

    // Shared materials with varied roughness/metalness (>= 0.25 difference)
    const padGravelMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.9,
      metalness: 0.05,
    });
    const rigSubstructureMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.75,
    });
    const rigMastMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.32,
      metalness: 0.65,
    });
    const rigCabinMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.6,
      metalness: 0.2,
    });
    const mudFluidMat = new THREE.MeshStandardMaterial({
      color: 0x0d9488,
      roughness: 0.15,
      metalness: 0.3,
    });
    const casingSteelMat = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      roughness: 0.22,
      metalness: 0.92,
      clearcoat: 0.6,
    });
    const bitGlowingMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0891b2,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.85,
    });

    disposableMaterials.push(
      padGravelMat,
      rigSubstructureMat,
      rigMastMat,
      rigCabinMat,
      mudFluidMat,
      casingSteelMat,
      bitGlowingMat
    );

    campaign.wells.forEach((well) => {
      const rootGroup = new THREE.Group();
      rootGroup.position.set(well.coords.x, 0, well.coords.z);

      // Part 1: Compacted Gravel Drilling Pad (Plataforma)
      const padGeo = new THREE.BoxGeometry(11, 0.45, 9);
      const padMesh = new THREE.Mesh(padGeo, padGravelMat);
      padMesh.position.y = 0.225;
      padMesh.receiveShadow = !isSoftwareGl;
      padMesh.userData = { type: 'well', wellId: well.id };
      pickableObjects.push(padMesh);
      rootGroup.add(padMesh);
      disposableGeometries.push(padGeo);

      // Selection Highlight Ring on Surface
      const ringGeo = new THREE.RingGeometry(4.8, 5.5, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const selectionRing = new THREE.Mesh(ringGeo, ringMat);
      selectionRing.position.y = 0.48;
      selectionRing.visible = well.id === stateRef.current.selectedWellId;
      rootGroup.add(selectionRing);
      disposableGeometries.push(ringGeo);
      disposableMaterials.push(ringMat);

      if (well.type === 'electromechanical') {
        // Composite Electromechanical Pumping Station & Manifold (6 distinct parts)
        const baseSkidGeo = new THREE.BoxGeometry(8, 0.7, 6);
        const baseSkid = new THREE.Mesh(baseSkidGeo, rigSubstructureMat);
        baseSkid.position.y = 0.8;
        rootGroup.add(baseSkid);

        const headerPipeGeo = new THREE.CylinderGeometry(0.45, 0.45, 6.8, 16);
        headerPipeGeo.rotateZ(Math.PI / 2);
        const headerPipe = new THREE.Mesh(headerPipeGeo, casingSteelMat);
        headerPipe.position.set(0, 2.1, 0);
        rootGroup.add(headerPipe);

        // Vertical VFD Cabinets
        for (let c = -1; c <= 1; c += 2) {
          const vfdGeo = new THREE.BoxGeometry(1.6, 2.8, 1.2);
          const vfd = new THREE.Mesh(vfdGeo, rigCabinMat);
          vfd.position.set(c * 2.2, 2.4, -1.8);
          rootGroup.add(vfd);
          disposableGeometries.push(vfdGeo);
        }

        // Accumulator / Surge Tank
        const vesselGeo = new THREE.CylinderGeometry(1.1, 1.1, 4.2, 20);
        const vessel = new THREE.Mesh(vesselGeo, rigMastMat);
        vessel.position.set(2.5, 3.1, 1.4);
        vessel.userData = { type: 'well', wellId: well.id };
        pickableObjects.push(vessel);
        rootGroup.add(vessel);

        disposableGeometries.push(baseSkidGeo, headerPipeGeo, vesselGeo);
      } else {
        // Composite 8-Part Drilling Rig (Sonda Diamantina / Rotaria)
        // Part 2: Steel Substructure
        const subGeo = new THREE.BoxGeometry(3.6, 1.2, 3.6);
        const subMesh = new THREE.Mesh(subGeo, rigSubstructureMat);
        subMesh.position.set(0, 1.05, 0);
        subMesh.castShadow = !isSoftwareGl;
        rootGroup.add(subMesh);

        // Part 3: Derrick Mast Legs & Crown (Torre de Perforación)
        const mastGeo = new THREE.BoxGeometry(1.5, 11.5, 1.5);
        const mastMesh = new THREE.Mesh(mastGeo, rigMastMat);
        mastMesh.position.set(0, 7.4, 0);
        mastMesh.castShadow = !isSoftwareGl;
        mastMesh.userData = { type: 'well', wellId: well.id };
        pickableObjects.push(mastMesh);
        rootGroup.add(mastMesh);

        // Part 4: Crown Block Warning Beacon at Top of Derrick
        const crownGeo = new THREE.BoxGeometry(2.1, 0.7, 2.1);
        const crownMesh = new THREE.Mesh(crownGeo, rigSubstructureMat);
        crownMesh.position.set(0, 13.4, 0);
        rootGroup.add(crownMesh);

        // Part 5: Doghouse / Operator Control Cabin
        const cabinGeo = new THREE.BoxGeometry(2.8, 2.1, 2.2);
        const cabinMesh = new THREE.Mesh(cabinGeo, rigCabinMat);
        cabinMesh.position.set(-3.1, 1.5, -1.2);
        cabinMesh.castShadow = !isSoftwareGl;
        rootGroup.add(cabinMesh);

        // Part 6: Triplex Mud Pump & Diesel Generator Skid
        const pumpGeo = new THREE.BoxGeometry(2.4, 1.5, 1.8);
        const pumpMesh = new THREE.Mesh(pumpGeo, rigSubstructureMat);
        pumpMesh.position.set(-3.1, 1.2, 1.8);
        rootGroup.add(pumpMesh);

        // Part 7: HDPE Lined Bentonite Mud Pit (Pileta de Lodos Bentoníticos)
        const pitFrameGeo = new THREE.BoxGeometry(3.4, 0.65, 5.2);
        const pitFrame = new THREE.Mesh(pitFrameGeo, rigSubstructureMat);
        pitFrame.position.set(3.2, 0.75, 0);
        rootGroup.add(pitFrame);

        const mudSurfaceGeo = new THREE.PlaneGeometry(2.9, 4.7);
        mudSurfaceGeo.rotateX(-Math.PI / 2);
        const mudSurface = new THREE.Mesh(mudSurfaceGeo, mudFluidMat);
        mudSurface.position.set(3.2, 1.1, 0);
        rootGroup.add(mudSurface);

        disposableGeometries.push(
          subGeo,
          mastGeo,
          crownGeo,
          cabinGeo,
          pumpGeo,
          pitFrameGeo,
          mudSurfaceGeo
        );
      }

      // Part 8: Rotating Top-Drive Kelly Rod
      const kellyGeo = new THREE.CylinderGeometry(0.22, 0.22, 9.5, 12);
      const kellyRod = new THREE.Mesh(kellyGeo, casingSteelMat);
      kellyRod.position.set(0, 6.2, 0);
      rootGroup.add(kellyRod);
      disposableGeometries.push(kellyGeo);

      // Underground Borehole Geometry:
      // 1. Target Depth Ghost Wireframe Cylinder
      const maxTarget3D = Math.max(4, well.targetDepthM * DEPTH_SCALE);
      const actualDrilled3D = Math.max(0.5, well.drilledDepthM * DEPTH_SCALE);
      const actualCasing3D = Math.max(0.5, well.casingDepthM * DEPTH_SCALE);

      const targetGeo = new THREE.CylinderGeometry(0.55, 0.55, maxTarget3D, 16);
      targetGeo.translate(0, -maxTarget3D / 2, 0);
      const targetMat = new THREE.MeshBasicMaterial({
        color: 0x64748b,
        wireframe: true,
        transparent: true,
        opacity: 0.25,
      });
      const targetMesh = new THREE.Mesh(targetGeo, targetMat);
      targetMesh.renderOrder = 10;
      rootGroup.add(targetMesh);
      disposableGeometries.push(targetGeo);
      disposableMaterials.push(targetMat);

      // 2. Active Drilled Borehole Column
      const drilledGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 18);
      drilledGeo.translate(0, -0.5, 0);
      const drilledColor =
        well.status === 'completed'
          ? 0x10b981
          : well.status === 'standby_woc'
          ? 0xf59e0b
          : 0x38bdf8;
      const drilledMat = new THREE.MeshStandardMaterial({
        color: drilledColor,
        emissive: drilledColor,
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.5,
      });
      const drilledMesh = new THREE.Mesh(drilledGeo, drilledMat);
      drilledMesh.scale.y = actualDrilled3D;
      drilledMesh.renderOrder = 12;
      drilledMesh.userData = { type: 'well', wellId: well.id };
      pickableObjects.push(drilledMesh);
      rootGroup.add(drilledMesh);
      disposableGeometries.push(drilledGeo);
      disposableMaterials.push(drilledMat);

      // 3. Steel API Casing Sleeve (Upper Section)
      const casingGeo = new THREE.CylinderGeometry(0.68, 0.68, 1, 20);
      casingGeo.translate(0, -0.5, 0);
      const casingMesh = new THREE.Mesh(casingGeo, casingSteelMat);
      casingMesh.scale.y = actualCasing3D;
      casingMesh.renderOrder = 13;
      rootGroup.add(casingMesh);
      disposableGeometries.push(casingGeo);

      // 4. Bottom-Hole Drill Bit & Mud Circulation Ring
      const bitGroup = new THREE.Group();
      const bitConeGeo = new THREE.ConeGeometry(0.85, 1.6, 16);
      bitConeGeo.rotateX(Math.PI);
      const bitCone = new THREE.Mesh(bitConeGeo, bitGlowingMat);
      bitGroup.add(bitCone);
      bitGroup.position.y = -actualDrilled3D;
      bitGroup.renderOrder = 14;
      rootGroup.add(bitGroup);
      disposableGeometries.push(bitConeGeo);

      scene.add(rootGroup);
      wellRefs.push({
        well,
        rootGroup,
        drilledMesh,
        casingMesh,
        bitGroup,
        selectionRing,
        kellyRod,
        maxTarget3D,
        actualDrilled3D,
        actualCasing3D,
      });
    });

    // Raycasting for clicking a Well or Geological Stratum
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = Math.abs(e.clientX - pointerDownPos.x);
      const dy = Math.abs(e.clientY - pointerDownPos.y);
      if (dx > 6 || dy > 6) return; // Dragged orbit controls

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickableObjects, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        if (hitObj.userData?.type === 'well') {
          onSelectWell(hitObj.userData.wellId);
          setSelectedStratum(null);
        } else if (hitObj.userData?.type === 'stratum') {
          setSelectedStratum(hitObj.userData.stratum);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Pre-warm shaders on hardware GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 6. Paced Render Loop with Software-WebGL fenceSync guard & smooth damping
    const clock = new THREE.Clock();
    let frameId = 0;
    let isDisposed = false;

    function afterDraw(cb: () => void) {
      if (isDisposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (isDisposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const st = stateRef.current;

      // Smoothly damp geological strata explosion & opacity
      stratumRefs.forEach((sRef) => {
        const explodeOffset = -sRef.index * st.strataExplode * 14;
        const targetY = sRef.baseYCenter + explodeOffset;
        sRef.group.position.y = THREE.MathUtils.damp(sRef.group.position.y, targetY, 6, delta);
        sRef.mat.opacity = THREE.MathUtils.damp(sRef.mat.opacity, st.rockOpacity, 6, delta);
      });

      // Smoothly damp 4D well drilling depth, casing depth & bit rotation
      const tFactor = Math.max(0.02, st.timelinePercent / 100);
      wellRefs.forEach((wRef) => {
        const targetDrillScale = Math.max(0.4, wRef.actualDrilled3D * tFactor);
        const targetCasingScale = Math.max(0.3, wRef.actualCasing3D * Math.min(1, tFactor * 1.1));

        wRef.drilledMesh.scale.y = THREE.MathUtils.damp(
          wRef.drilledMesh.scale.y,
          targetDrillScale,
          7,
          delta
        );
        wRef.casingMesh.scale.y = THREE.MathUtils.damp(
          wRef.casingMesh.scale.y,
          targetCasingScale,
          7,
          delta
        );
        wRef.bitGroup.position.y = -wRef.drilledMesh.scale.y;
        wRef.bitGroup.rotation.y = elapsed * 4.5;
        wRef.kellyRod.rotation.y = elapsed * 4.5;
        wRef.selectionRing.visible = wRef.well.id === st.selectedWellId;
      });

      // Smooth camera preset interpolation
      if (!st.cameraPresetReached) {
        _targetPos.copy(st.desiredCamPos);
        _targetLook.copy(st.desiredCamLook);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetPos.x, 5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetPos.y, 5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetPos.z, 5, delta);

        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLook.x, 5, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLook.y, 5, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLook.z, 5, delta);

        if (camera.position.distanceTo(_targetPos) < 0.5) {
          st.cameraPresetReached = true;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    const onResize = () => {
      if (!container || isDisposed) return;
      const newW = container.clientWidth || 960;
      const newH = container.clientHeight || 580;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', onResize);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      disposableGeometries.forEach((g) => g.dispose());
      disposableMaterials.forEach((m) => m.dispose());
      disposableTextures.forEach((t) => t.dispose());
      renderer.dispose();
    };
  }, [campaign]);

  const activeWell =
    campaign.wells.find((w) => w.id === selectedWellId) || campaign.wells[0] || null;

  const currentSimulatedDepth = activeWell
    ? Math.round((activeWell.drilledDepthM * timelinePercent) / 100)
    : 0;
  const currentSimulatedCasing = activeWell
    ? Math.round((activeWell.casingDepthM * timelinePercent) / 100)
    : 0;

  return (
    <div className="relative w-full h-[640px] bg-slate-950 rounded-xl border border-slate-800 overflow-hidden select-none">
      {/* Isolated WebGL Canvas Mount */}
      <div ref={canvasMountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-Left Minimal Spec Header Overlay (No backdrop-blur over WebGL) */}
      <div className="absolute top-4 left-4 z-10 pointer-events-auto bg-slate-950/92 border border-slate-800 rounded-lg px-4 py-3 max-w-md">
        <div className="text-xs font-medium text-amber-400 tracking-wide">
          Gemelo Digital Subterráneo 4D · {campaign.code}
        </div>
        <h3 className="text-sm font-bold text-slate-100 mt-0.5 truncate">{campaign.name}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1 tabular-nums">
          <span>Altitud: {campaign.altitudeMasl} m.s.n.m.</span>
          <span aria-hidden="true">·</span>
          <span>{campaign.strata.length} Estratos</span>
          <span aria-hidden="true">·</span>
          <span>{campaign.wells.length} Pozos / Frentes</span>
        </div>

        {/* Quick Well Selector Pills */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-800/80">
          {campaign.wells.map((w) => {
            const isSelected = activeWell?.id === w.id;
            return (
              <button
                key={w.id}
                onClick={() => {
                  onSelectWell(w.id);
                  setSelectedStratum(null);
                }}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {w.code}
              </button>
            );
          })}
        </div>
      </div>

      {/* Top-Right Selected Well or Stratum Telemetry Summary (Compact Header Bar) */}
      {activeWell && !selectedStratum && (
        <div className="absolute top-4 right-4 z-10 pointer-events-auto bg-slate-950/92 border border-slate-800 rounded-lg px-4 py-3 w-80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-sky-400">{activeWell.code}</span>
            <span className="text-xs text-slate-400">{activeWell.padName}</span>
          </div>
          <div className="text-xs font-semibold text-slate-100 mt-0.5 truncate">
            {activeWell.name}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2 border-t border-slate-800 text-xs tabular-nums">
            <div>
              <div className="text-slate-400">Prof. Perforada (4D)</div>
              <div className="text-slate-100 font-mono font-semibold">
                {currentSimulatedDepth} m / {activeWell.targetDepthM} m
              </div>
            </div>
            <div>
              <div className="text-slate-400">Entubado Casing API</div>
              <div className="text-slate-100 font-mono font-semibold">
                {currentSimulatedCasing} m ({activeWell.diameterInches.split('->')[0]})
              </div>
            </div>
            <div>
              <div className="text-slate-400 flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400" /> Running vs Stand-by
              </div>
              <div className="text-slate-100 font-mono font-semibold">
                {activeWell.runningHoursTotal}h / {activeWell.standbyHoursTotal}h
              </div>
            </div>
            <div>
              <div className="text-slate-400 flex items-center gap-1">
                <Fuel className="w-3 h-3 text-amber-400" /> Gasoil Consumido
              </div>
              <div className="text-slate-100 font-mono font-semibold">
                {activeWell.dieselConsumedLiters.toLocaleString()} L
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedStratum && (
        <div className="absolute top-4 right-4 z-10 pointer-events-auto bg-slate-950/92 border border-slate-800 rounded-lg px-4 py-3 w-80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-amber-400">
              {selectedStratum.code} · {selectedStratum.fromDepthM}m a {selectedStratum.toDepthM}m
            </span>
            <button
              onClick={() => setSelectedStratum(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Ver Pozo
            </button>
          </div>
          <div className="text-xs font-semibold text-slate-100 mt-0.5">{selectedStratum.name}</div>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{selectedStratum.lithology}</p>
          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-800 text-xs tabular-nums">
            <div>
              <div className="text-slate-400">RQD Roca</div>
              <div className="text-slate-100 font-mono font-semibold">
                {selectedStratum.hardnessRqd}%
              </div>
            </div>
            <div>
              <div className="text-slate-400">ROP Esp.</div>
              <div className="text-slate-100 font-mono font-semibold">
                {selectedStratum.expectedRopMph} m/h
              </div>
            </div>
            <div>
              <div className="text-slate-400">Lodo Req.</div>
              <div className="text-slate-100 font-mono font-semibold">
                {selectedStratum.mudDensityPpg} ppg
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-auto w-[94%] max-w-[920px] transition-transform duration-200"
        style={{
          transform: dockCollapsed ? 'translate(0, calc(100% - 34px))' : 'translate(0, 0)',
        }}
      >
        {/* Collapse / Expand Toggle Tab */}
        <div className="flex justify-center mb-1">
          <button
            onClick={() => setDockCollapsed((c) => !c)}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-700 rounded-t-lg text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Mostrar Controles 4D (H)
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> Ocultar Controles 4D (H)
              </>
            )}
          </button>
        </div>

        {/* Main Bottom Dock Surface */}
        <div className="bg-slate-950/95 border border-slate-800 rounded-xl p-3.5 shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* 4D Campaign Timeline Scrubber */}
            <div className="md:col-span-5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  Avance Temporal Campaña 4D
                </span>
                <span className="font-mono font-bold text-amber-400 tabular-nums">
                  {timelinePercent.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (timelinePercent >= 100) setTimelinePercent(0);
                    setIsPlaying4D((p) => !p);
                  }}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                >
                  {isPlaying4D ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying4D ? 'Pausar' : 'Simular 4D'}
                </button>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={timelinePercent}
                  onChange={(e) => {
                    setIsPlaying4D(false);
                    setTimelinePercent(Number(e.target.value));
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <button
                  onClick={() => {
                    setIsPlaying4D(false);
                    setTimelinePercent(100);
                  }}
                  title="Restaurar al 100% actual"
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-md border border-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Geological Strata Explode & Cutaway Opacity */}
            <div className="md:col-span-4 grid grid-cols-2 gap-3 border-t md:border-t-0 md:border-l border-slate-800 pt-2 md:pt-0 md:pl-3">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-sky-400" /> Separar Estratos
                  </span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {Math.round(strataExplode * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={strataExplode}
                  onChange={(e) => setStrataExplode(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" /> Opacidad Roca
                  </span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {Math.round(rockOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.15}
                  max={0.95}
                  step={0.05}
                  value={rockOpacity}
                  onChange={(e) => setRockOpacity(Number(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Camera View Presets */}
            <div className="md:col-span-3 border-t md:border-t-0 md:border-l border-slate-800 pt-2 md:pt-0 md:pl-3">
              <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-slate-400" /> Vistas de Cámara
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => handleSetCameraPreset('overview')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    cameraPreset === 'overview'
                      ? 'bg-slate-800 text-white border border-slate-600'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Campo 3D
                </button>
                <button
                  onClick={() => handleSetCameraPreset('cross_section')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    cameraPreset === 'cross_section'
                      ? 'bg-slate-800 text-white border border-slate-600'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Estratos
                </button>
                <button
                  onClick={() => handleSetCameraPreset('rigs')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    cameraPreset === 'rigs'
                      ? 'bg-slate-800 text-white border border-slate-600'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Sondas
                </button>
                <button
                  onClick={() => handleSetCameraPreset('top')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    cameraPreset === 'top'
                      ? 'bg-slate-800 text-white border border-slate-600'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Planta Pads
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
