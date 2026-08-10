function tuple3(vector) {
  if (!vector) return undefined;
  if (Array.isArray(vector))
    return [vector[0] ?? 0, vector[1] ?? 0, vector[2] ?? 0];
  return [vector.x ?? 0, vector.y ?? 0, vector.z ?? 0];
}

function tuple4(quaternion) {
  if (!quaternion) return undefined;
  if (Array.isArray(quaternion)) {
    return [
      quaternion[0] ?? 0,
      quaternion[1] ?? 0,
      quaternion[2] ?? 0,
      quaternion[3] ?? 1,
    ];
  }
  return [
    quaternion.x ?? 0,
    quaternion.y ?? 0,
    quaternion.z ?? 0,
    quaternion.w ?? 1,
  ];
}

function objectPose(object) {
  object?.updateMatrixWorld?.(true);
  const elements = object?.matrixWorld?.elements;
  const position = elements
    ? [elements[12] || 0, elements[13] || 0, elements[14] || 0]
    : tuple3(object?.position);
  const quaternion = tuple4(object?.quaternion);
  return {position: tuple3(position), quaternion: tuple4(quaternion)};
}

function objectTransform(object, space) {
  if (typeof object.updateWorldMatrix === 'function') {
    object.updateWorldMatrix(true, false);
  } else {
    object.updateMatrixWorld(true);
  }

  const position = object.position.clone();
  const quaternion = object.quaternion.clone();
  const scale = object.scale.clone();
  if (space === 'world') {
    object.matrixWorld.decompose(position, quaternion, scale);
  }
  return {
    position: tuple3(position),
    quaternion: tuple4(quaternion),
    scale: tuple3(scale),
  };
}

function objectIdentity(object) {
  return {
    id: object.uuid,
    name: object.name || '',
    type: object.type || object.constructor?.name || 'Object3D',
  };
}

function serializeInspectedObject(object) {
  return {
    ...objectIdentity(object),
    tag: devtoolsMetadata(object)?.tag,
    state: serializeDeclaredState(object),
    visible: object.visible !== false,
    parent: object.parent ? objectIdentity(object.parent) : undefined,
    children: object.children.map(objectIdentity),
    localTransform: objectTransform(object, 'local'),
    worldTransform: objectTransform(object, 'world'),
  };
}

function serializeObject(object) {
  const pose = objectPose(object);
  const scale = tuple3(object?.scale);
  return {
    id: object?.uuid,
    name: object?.name || '',
    type: object?.type || object?.constructor?.name || 'Object3D',
    visible: object?.visible !== false,
    position: pose.position,
    quaternion: pose.quaternion,
    scale,
    children: Array.from(object?.children || []).map(serializeObject),
  };
}
