import type {XRBlocksSession} from './session.js';
import type {JsonObject} from '../types.js';
import {
  NAMED_HAND_POSES,
  type NamedHandPose,
  type PhysicalHand,
} from './types.js';
import {
  ANGULAR_SPEED,
  boundedSpeed,
  HAND_MOVE_SPEED,
  type SpeedConfig,
  VIEWER_MOVE_SPEED,
} from './motion.js';

type AgentActionDefinition = {
  name: string;
  description: string;
  parameters: JsonObject;
  prompt?: string;
  execute(
    session: XRBlocksSession,
    args: JsonObject
  ): unknown | Promise<unknown>;
};

const SchemaType = {
  array: 'ARRAY',
  integer: 'INTEGER',
  number: 'NUMBER',
  object: 'OBJECT',
  string: 'STRING',
} as const;

const AGENT_ACTIONS: readonly AgentActionDefinition[] = Object.freeze([
  {
    name: 'say',
    description:
      'Speak English text into the app through its synthetic microphone.',
    parameters: {
      type: SchemaType.object,
      properties: {text: {type: SchemaType.string}},
      required: ['text'],
    },
    prompt:
      'say speaks text through the app microphone and waits until delivery completes. Use it for voice-controlled app interactions.',
    execute: (session, args) =>
      session.injectAudio({text: requireString(args.text, 'text')}),
  },
  {
    name: 'move',
    description: 'Move the user relative to the current view direction.',
    parameters: linearMotionSchema(VIEWER_MOVE_SPEED, false),
    execute: (session, args) => session.move(linearMotionArgs(args)),
  },
  {
    name: 'rotate',
    description:
      'Rotate the user by relative YXZ Euler angles. Positive pitch is up, yaw is left, and roll is counterclockwise.',
    parameters: rotationSchema(false),
    execute: (session, args) => session.rotate(rotationArgs(args)),
  },
  {
    name: 'move_hand',
    description:
      'Move one hand relative to the current view direction without rotating it.',
    parameters: linearMotionSchema(HAND_MOVE_SPEED, true),
    execute: (session, args) =>
      session.moveHand(handArg(args), linearMotionArgs(args)),
  },
  {
    name: 'rotate_hand',
    description:
      'Rotate one hand by relative YXZ Euler angles. Positive pitch is up, yaw is left, and roll is counterclockwise.',
    parameters: rotationSchema(true),
    execute: (session, args) =>
      session.rotateHand(handArg(args), rotationArgs(args)),
  },
  {
    name: 'gesture',
    description: 'Apply a named pose to the selected hand.',
    parameters: {
      type: SchemaType.object,
      properties: {
        hand: {type: SchemaType.string, enum: ['left', 'right']},
        pose: {type: SchemaType.string, enum: [...NAMED_HAND_POSES]},
      },
      required: ['hand', 'pose'],
    },
    execute: (session, args) =>
      session.gesture(requiredHandArg(args), poseArg(args.pose)),
  },
  {
    name: 'look_at_target',
    description:
      'Rotate the camera to look at a unique scene name, Devtools tag, or world position.',
    parameters: targetToolSchema(false, ANGULAR_SPEED, true),
    prompt:
      'look_at_target smoothly rotates the camera toward a named or tagged target at 90 degrees per second by default.',
    execute: (session, args) =>
      session.lookAtTarget(requireTarget(args), angularSpeedOptions(args)),
  },
  {
    name: 'point_to_target',
    description:
      'Aim the selected hand ray at a unique scene name, Devtools tag, or world position without moving the hand.',
    parameters: targetToolSchema(true, ANGULAR_SPEED, true),
    prompt:
      'point_to_target smoothly aims a hand ray at a named or tagged target at 90 degrees per second by default. It is usually the right action before click.',
    execute: (session, args) =>
      session.pointTo(
        handArg(args),
        requireTarget(args),
        angularSpeedOptions(args)
      ),
  },
  {
    name: 'reach_to_target',
    description:
      'Move the selected hand to a unique scene name, Devtools tag, or world position.',
    parameters: targetToolSchema(true, HAND_MOVE_SPEED, false),
    prompt:
      'reach_to_target smoothly moves a hand to a named or tagged target at 0.5 meters per second by default. Use point_to_target when only aiming is needed.',
    execute: (session, args) =>
      session.reachTo(
        handArg(args),
        requireTarget(args),
        linearSpeedOptions(args, HAND_MOVE_SPEED)
      ),
  },
  {
    name: 'click',
    description: 'Perform a WebXR select gesture with the left or right hand.',
    parameters: {
      type: SchemaType.object,
      properties: {
        hand: {type: SchemaType.string, enum: ['left', 'right']},
        duration_ms: {type: SchemaType.integer},
      },
    },
    execute(session, args) {
      const durationMs = optionalPositiveNumber(
        args.duration_ms,
        'duration_ms'
      );
      return session.click(
        handArg(args),
        durationMs === undefined ? undefined : {durationMs}
      );
    },
  },
  {
    name: 'start_select',
    description:
      'Begin holding a WebXR select gesture with the left or right hand; no-op if already selecting.',
    parameters: handToolSchema(),
    execute: (session, args) => session.startSelect(handArg(args)),
  },
  {
    name: 'end_select',
    description:
      'Release a held WebXR select gesture with the left or right hand.',
    parameters: handToolSchema(),
    execute: (session, args) => session.endSelect(handArg(args)),
  },
]);

export function agentActionDeclarations() {
  return AGENT_ACTIONS.map(({name, description, parameters}) => ({
    name,
    description,
    parameters,
  }));
}

export function agentActionPrompt() {
  return AGENT_ACTIONS.flatMap((definition) =>
    definition.prompt ? [definition.prompt] : []
  ).join('\n');
}

export function executeAgentAction(
  session: XRBlocksSession,
  name: string,
  args: JsonObject
) {
  const definition = AGENT_ACTIONS.find((candidate) => candidate.name === name);
  if (!definition) throw new Error(`Unknown autonomous runner tool: ${name}`);
  return definition.execute(session, args);
}

function requireTarget(args: JsonObject) {
  if (
    typeof args.target === 'string' ||
    isVec3(args.target) ||
    isTaggedTarget(args.target)
  ) {
    return args.target;
  }
  throw new Error(
    'Target must be a context name, Devtools tag, or vec3 tuple.'
  );
}

function requireString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function angularSpeedOptions(args: JsonObject) {
  return {
    speedDegreesPerSecond: boundedSpeed(
      optionalNumber(args.speed_degrees_per_second),
      ANGULAR_SPEED,
      'speed_degrees_per_second'
    ),
  };
}

function linearSpeedOptions(args: JsonObject, config: SpeedConfig) {
  return {
    speedMetersPerSecond: boundedSpeed(
      optionalNumber(args.speed_meters_per_second),
      config,
      'speed_meters_per_second'
    ),
  };
}

function linearMotionArgs(args: JsonObject) {
  const config = args.hand === undefined ? VIEWER_MOVE_SPEED : HAND_MOVE_SPEED;
  return {
    rightMeters: optionalNumber(args.right_meters),
    upMeters: optionalNumber(args.up_meters),
    forwardMeters: optionalNumber(args.forward_meters),
    ...linearSpeedOptions(args, config),
  };
}

function rotationArgs(args: JsonObject) {
  return {
    pitchDegrees: optionalNumber(args.pitch_degrees),
    yawDegrees: optionalNumber(args.yaw_degrees),
    rollDegrees: optionalNumber(args.roll_degrees),
    ...angularSpeedOptions(args),
  };
}

function handArg(args: JsonObject): PhysicalHand {
  const hand = args.hand ?? 'right';
  if (hand === 'left' || hand === 'right') return hand;
  throw new Error('Hand must be left or right.');
}

function requiredHandArg(args: JsonObject): PhysicalHand {
  if (args.hand === undefined) throw new Error('Hand is required.');
  return handArg(args);
}

function poseArg(value: unknown): NamedHandPose {
  if (typeof value !== 'string') throw new Error('Pose must be a string.');
  if ((NAMED_HAND_POSES as readonly string[]).includes(value)) {
    return value as NamedHandPose;
  }
  throw new Error(`Pose must be one of: ${NAMED_HAND_POSES.join(', ')}.`);
}

function optionalPositiveNumber(value: unknown, label: string) {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return parsed;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return Number(value);
}

function isVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => Number.isFinite(component))
  );
}

function isTaggedTarget(value: unknown): value is {tag: string} {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as {tag?: unknown}).tag === 'string' &&
    Boolean((value as {tag: string}).tag.trim())
  );
}

function handToolSchema() {
  return {
    type: SchemaType.object,
    properties: {
      hand: {type: SchemaType.string, enum: ['left', 'right']},
    },
    required: ['hand'],
  };
}

function targetToolSchema(
  includeHand: boolean,
  speed: SpeedConfig,
  angular: boolean
) {
  const speedName = angular
    ? 'speed_degrees_per_second'
    : 'speed_meters_per_second';
  const properties: JsonObject = {
    target: {
      description:
        'An exact scene/context name, [x,y,z] world position, or {"tag":"..."} Devtools target.',
      anyOf: [
        {type: SchemaType.string},
        {
          type: SchemaType.array,
          items: {type: SchemaType.number},
          minItems: 3,
          maxItems: 3,
        },
        {
          type: SchemaType.object,
          properties: {tag: {type: SchemaType.string}},
          required: ['tag'],
          additionalProperties: false,
        },
      ],
    },
    [speedName]: {
      type: SchemaType.number,
      minimum: speed.minimum,
      maximum: speed.maximum,
      description: `Movement speed in ${speed.units}; defaults to ${speed.default}.`,
    },
  };
  if (includeHand)
    properties.hand = {type: SchemaType.string, enum: ['left', 'right']};
  return {
    type: SchemaType.object,
    properties,
    required: includeHand ? ['hand', 'target'] : ['target'],
  };
}

function linearMotionSchema(speed: SpeedConfig, includeHand: boolean) {
  const properties: JsonObject = {
    right_meters: numberProperty('Positive moves right; negative moves left.'),
    up_meters: numberProperty('Positive moves up; negative moves down.'),
    forward_meters: numberProperty(
      'Positive moves forward; negative moves backward.'
    ),
    speed_meters_per_second: speedProperty(speed),
  };
  if (includeHand)
    properties.hand = {type: SchemaType.string, enum: ['left', 'right']};
  const schema: JsonObject = {type: SchemaType.object, properties};
  if (includeHand) schema.required = ['hand'];
  return schema;
}

function rotationSchema(includeHand: boolean) {
  const properties: JsonObject = {
    pitch_degrees: numberProperty('Positive pitches up.'),
    yaw_degrees: numberProperty('Positive yaws left.'),
    roll_degrees: numberProperty('Positive rolls counterclockwise.'),
    speed_degrees_per_second: speedProperty(ANGULAR_SPEED),
  };
  if (includeHand)
    properties.hand = {type: SchemaType.string, enum: ['left', 'right']};
  const schema: JsonObject = {type: SchemaType.object, properties};
  if (includeHand) schema.required = ['hand'];
  return schema;
}

function speedProperty(speed: SpeedConfig) {
  return {
    type: SchemaType.number,
    minimum: speed.minimum,
    maximum: speed.maximum,
    description: `Defaults to ${speed.default} ${speed.units}.`,
  };
}

function numberProperty(description: string) {
  return {type: SchemaType.number, description};
}
