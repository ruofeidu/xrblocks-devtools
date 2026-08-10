export default function preview({THREE}) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.2, 0.9),
    new THREE.MeshStandardMaterial({color: '#4f7cff'})
  );
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 0.9, 24),
    new THREE.MeshStandardMaterial({color: '#ff7a59'})
  );
  tower.position.set(-0.3, 0.55, 0.15);
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 24, 16),
    new THREE.MeshStandardMaterial({color: '#33d17a'})
  );
  marker.position.set(0.42, 0.32, -0.22);
  group.add(base, tower, marker);
  return group;
}
