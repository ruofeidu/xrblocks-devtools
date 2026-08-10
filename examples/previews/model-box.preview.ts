export default function preview({THREE}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.65, 0.8),
    new THREE.MeshStandardMaterial({color: '#44aaff', roughness: 0.45})
  );
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.08, 0.12, 0.88),
    new THREE.MeshStandardMaterial({color: '#f6c85f', roughness: 0.35})
  );
  lid.position.y = 0.39;
  group.add(body, lid);
  return group;
}
