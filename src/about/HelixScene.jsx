// HelixScene — hélice de datos 3D del hero del About (Three.js + bloom).
// Dos cadenas (violeta = plan, ámbar = venta) unidas por peldaños con anillos que brillan;
// gira sola, sigue al mouse y el scroll del hero (progressRef 0→1) la acerca y la voltea.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BG = 0x05030a;

export default function HelixScene({ progressRef }) {
  const host = useRef(null);

  useEffect(() => {
    const el = host.current; if (!el) return;
    let w = el.clientWidth, h = el.clientHeight;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.FogExp2(BG, 0.04);
    // Reflejos metálicos: entorno de estudio (sin él el metal se ve negro)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    const cam = new THREE.PerspectiveCamera(38, w / h, 0.1, 120);
    cam.position.set(0, 0, 16);

    const helix = new THREE.Group();
    helix.rotation.z = -0.62;
    scene.add(helix);

    // ── Geometría de la hélice
    const N = 64, TURNS = 3.4, LEN = 26, R = 2.3;
    const at = (i, phase) => {
      const t = i / (N - 1), a = t * TURNS * Math.PI * 2 + phase;
      return new THREE.Vector3(Math.cos(a) * R, (t - 0.5) * LEN, Math.sin(a) * R);
    };
    const ptsA = [], ptsB = [];
    for (let i = 0; i < N; i++) { ptsA.push(at(i, 0)); ptsB.push(at(i, Math.PI)); }

    const shell = new THREE.MeshPhysicalMaterial({ color: 0x5b5486, metalness: 0.9, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.9, emissive: 0x140d2a, emissiveIntensity: 0.6 });
    [ptsA, ptsB].forEach((pts) => {
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 420, 0.2, 18, false);
      helix.add(new THREE.Mesh(tube, shell));
    });

    // Peldaños (barras metálicas) + anillos brillantes alternando violeta / ámbar
    const rungGeo = new THREE.CylinderGeometry(0.075, 0.075, 1, 12);
    const ringGeo = new THREE.TorusGeometry(0.17, 0.05, 12, 32);
    const glowV = new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0x7c3aed, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.3 });
    const glowA = new THREE.MeshStandardMaterial({ color: 0xfcd34d, emissive: 0xf59e0b, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.3 });
    const rings = [];
    for (let i = 1; i < N - 1; i += 2) {
      const a = ptsA[i], b = ptsB[i];
      const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a), len = dir.length();
      const rung = new THREE.Mesh(rungGeo, shell);
      rung.scale.y = len; rung.position.copy(mid);
      rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      helix.add(rung);
      const k = (i >> 1) % 3;
      if (k !== 2) {
        const ring = new THREE.Mesh(ringGeo, k ? glowA : glowV);
        ring.position.copy(a.clone().lerp(b, k ? 0.3 : 0.7));
        ring.quaternion.copy(rung.quaternion); ring.rotateX(Math.PI / 2);
        ring.userData.base = ring.scale.x; ring.userData.off = i * 0.37;
        helix.add(ring); rings.push(ring);
      }
    }
    // Nodos en las cadenas
    const nodeGeo = new THREE.SphereGeometry(0.11, 16, 16);
    const nodes = new THREE.InstancedMesh(nodeGeo, glowV, N);
    const m4 = new THREE.Matrix4();
    ptsA.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); nodes.setMatrixAt(i, m4); });
    helix.add(nodes);
    const nodesB = new THREE.InstancedMesh(nodeGeo, glowA, N);
    ptsB.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); nodesB.setMatrixAt(i, m4); });
    helix.add(nodesB);

    // Polvo de datos alrededor
    const P = 900, pos = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) {
      const r = 3 + Math.random() * 9, a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - 0.5) * 34; pos[i * 3 + 2] = Math.sin(a) * r - 2;
    }
    const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xc4b5fd, size: 0.045, transparent: true, opacity: 0.55, depthWrite: false }));
    scene.add(dust);

    // Luces
    scene.add(new THREE.AmbientLight(0x4c3d73, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(4, 6, 8); scene.add(key);
    const lv = new THREE.PointLight(0x8b5cf6, 60, 30); lv.position.set(-5, 2, 4); scene.add(lv);
    const la = new THREE.PointLight(0xf59e0b, 40, 30); la.position.set(5, -3, 3); scene.add(la);

    // Bloom
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.5, 0.35);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // Interacción
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e) => { mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2; mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2; };
    window.addEventListener('pointermove', onMove, { passive: true });
    const onResize = () => {
      w = el.clientWidth; h = el.clientHeight;
      renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h);
      cam.aspect = w / h; cam.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(el);

    let raf, t0 = performance.now(), spin = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
      const p = progressRef?.current ?? 0;
      mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
      spin += dt * (reduce ? 0 : 0.22);
      helix.rotation.y = spin + p * 2.4;
      helix.rotation.z = -0.62 + p * 0.5;
      const narrow = w < 768;
      helix.position.x = (narrow ? 1.2 : 2.2) - p * (narrow ? 1.2 : 2.6);
      cam.position.z = (w < 768 ? 22 : 16) - p * 7;
      cam.position.x = mouse.x * 0.8; cam.position.y = -mouse.y * 0.5 + p * 1.5;
      cam.lookAt(helix.position.x * 0.4, p * 1.2, 0);
      const tt = now / 1000;
      rings.forEach((r) => { const s = 1 + Math.sin(tt * 2 + r.userData.off) * 0.18; r.scale.setScalar(s); });
      dust.rotation.y = tt * 0.02;
      bloom.strength = 0.7 + p * 0.25;
      composer.render();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); io.disconnect();
      window.removeEventListener('pointermove', onMove); window.removeEventListener('resize', onResize);
      scene.traverse((o) => { o.geometry?.dispose?.(); });
      [shell, glowV, glowA, dust.material].forEach((m) => m.dispose());
      envTex.dispose(); pmrem.dispose(); composer.dispose?.(); renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [progressRef]);

  return <div ref={host} className="absolute inset-0" />;
}
