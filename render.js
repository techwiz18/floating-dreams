// Drawing only: takes THREE, the world and the DOM nodes it paints into.
// No clock, no input, no globals, so it loads under node with a stub THREE.

const SKY = 0xcfe4ee;
const DUST_COUNT = 400;
const PALETTE = [0xa8dadc, 0xcdb4db, 0xffc8dd, 0xbde0fe, 0xb9fbc0, 0xffd6a5];

// update(dt, time, events) is a function of its arguments, like step().
export function createRenderer({ THREE, world, dom }) {
  const { parent, score, count } = dom;

  // --- scene, camera and renderer -----------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 45, 120);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
  camera.position.set(0, 16, 20);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(1, 1);
  parent.appendChild(renderer.domElement);

  // --- soft lighting -------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c7d4, 1.2));
  const sun = new THREE.DirectionalLight(0xfff4e2, 0.9);
  sun.position.set(12, 24, 8);
  scene.add(sun);

  // --- the orb you steer ---------------------------------------------------
  const orb = new THREE.Group();
  orb.add(new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0xfff6e5,
      emissive: 0xffd9a8,
      emissiveIntensity: 0.5,
      roughness: 0.35
    })
  ));
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xffe9c6,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })
  );
  orb.add(glow);
  orb.position.set(world.orb.x, world.orb.y, world.orb.z);
  scene.add(orb);

  // --- one mesh per crystal ------------------------------------------------
  const crystalGeometry = new THREE.OctahedronGeometry(0.55);
  const crystals = world.crystals.map((crystal, i) => {
    const color = PALETTE[i % PALETTE.length];
    const mesh = new THREE.Mesh(crystalGeometry, new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
      roughness: 0.3
    }));
    mesh.position.set(crystal.x, crystal.y, crystal.z);
    scene.add(mesh);
    return mesh;
  });

  // --- ambient dust motes --------------------------------------------------
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustSpeeds = new Float32Array(DUST_COUNT);

  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 140;
    dustPositions[i * 3 + 1] = Math.random() * 26;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 140;
    dustSpeeds[i] = 0.2 + Math.random() * 0.5;
  }

  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.22,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  }));
  scene.add(dust);

  // --- collect bursts ------------------------------------------------------
  const bursts = [];

  function spawnBurst(position) {
    const dots = 18;
    const points = new Float32Array(dots * 3);
    for (let i = 0; i < dots; i++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize().multiplyScalar(Math.random() * 0.5);
      points[i * 3] = dir.x;
      points[i * 3 + 1] = dir.y;
      points[i * 3 + 2] = dir.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    const material = new THREE.PointsMaterial({
      color: 0xfff3d6,
      size: 0.3,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const cloud = new THREE.Points(geometry, material);
    cloud.position.copy(position);
    scene.add(cloud);
    bursts.push({ cloud, age: 0 });
  }

  // --- score pill ----------------------------------------------------------
  function addScore() {
    count.textContent = world.score;
    score.classList.remove('pop');
    void score.offsetWidth; // restart the pop animation
    score.classList.add('pop');
  }

  // --- camera --------------------------------------------------------------
  const cameraOffset = new THREE.Vector3(0, 16, 20);
  const cameraGoal = new THREE.Vector3();

  function resize(width, height, pixelRatio) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
  }

  function update(dt, time, events) {
    for (const event of events) {
      if (event.type !== 'collect') continue;
      spawnBurst(new THREE.Vector3(event.x, event.y, event.z));
      addScore();
    }

    // --- orb ---------------------------------------------------------------
    orb.position.set(world.orb.x, world.orb.y, world.orb.z);
    glow.scale.setScalar(1 + Math.sin(time * 2) * 0.05);

    // --- crystals ----------------------------------------------------------
    for (let i = 0; i < crystals.length; i++) {
      const mesh = crystals[i];
      const crystal = world.crystals[i];
      mesh.position.set(crystal.x, crystal.y, crystal.z);
      mesh.rotation.y += crystal.spin * dt;
      mesh.rotation.x = Math.sin(time * 0.4 + crystal.phase) * 0.15;
    }

    // --- dust drift --------------------------------------------------------
    const dustArray = dustGeometry.attributes.position.array;
    for (let i = 0; i < DUST_COUNT; i++) {
      dustArray[i * 3 + 1] += dustSpeeds[i] * dt;
      dustArray[i * 3] += Math.sin(time * 0.3 + i) * 0.15 * dt;
      if (dustArray[i * 3 + 1] > 26) dustArray[i * 3 + 1] = 0;
    }
    dustGeometry.attributes.position.needsUpdate = true;

    // --- bursts ------------------------------------------------------------
    for (let i = bursts.length - 1; i >= 0; i--) {
      const burst = bursts[i];
      burst.age += dt;
      burst.cloud.scale.setScalar(1 + burst.age * 5);
      burst.cloud.material.opacity = Math.max(0, 1 - burst.age / 0.9);
      if (burst.age > 0.9) {
        scene.remove(burst.cloud);
        burst.cloud.geometry.dispose();
        burst.cloud.material.dispose();
        bursts.splice(i, 1);
      }
    }

    // --- camera follow -----------------------------------------------------
    cameraGoal.copy(orb.position).add(cameraOffset);
    camera.position.lerp(cameraGoal, 1 - Math.exp(-3 * dt));
    camera.lookAt(orb.position.x, orb.position.y + 0.5, orb.position.z);

    renderer.render(scene, camera);
  }

  return { update, resize };
}
