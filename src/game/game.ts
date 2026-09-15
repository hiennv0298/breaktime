import { registerDebug } from '../debug/testHook';
import { consumeInteract, createInputState, type InputState } from '../input/inputState';
import { attachJoystick } from '../input/joystick';
import { attachKeyboard } from '../input/keyboard';
import { attachTouchButtons } from '../input/touchButtons';
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS } from '../physics/characterController';
import { createProps } from '../physics/props';
import type { Physics } from '../physics/rapier';
import { createBlobShadows } from '../render/blobShadows';
import { createCameraView, getCameraYaw } from '../render/cameraView';
import { parseOfficeAssets } from '../render/officeAssets';
import type { RenderCtx } from '../render/renderer';
import { buildRoom } from '../render/room';
import { PLAYER_SPAWN, PROP_PLACEMENTS, TEST_BOX_ID } from './layout';
import { createPlayer } from './player';

export interface GameCtx extends RenderCtx {
  physics: Physics;
  loaded: Map<string, unknown>;
}

export interface Game {
  /** Shared input written by keyboard and touch controls; the loop consumes pause toggles from it. */
  readonly input: InputState;
  fixedUpdate(dt: number): void;
  frameUpdate(dt: number, nowMs: number): void;
  timeScale(nowMs: number): number;
}

const INTERACT_RADIUS = 1.5; // m, XZ distance player -> box

function loadedBuffer(ctx: GameCtx, id: string): ArrayBuffer {
  const v = ctx.loaded.get(id);
  if (!(v instanceof ArrayBuffer)) throw new Error(`load task ${id} did not produce an ArrayBuffer`);
  return v;
}

/** Office slice (plan 01-10): Kenney open-space office + pantry, physics props, blob shadows, follow camera. */
export async function createGame(ctx: GameCtx): Promise<Game> {
  const assets = await parseOfficeAssets(loadedBuffer(ctx, 'office'), loadedBuffer(ctx, 'food'));

  const room = buildRoom(ctx, assets);
  const props = createProps(ctx, PROP_PLACEMENTS, assets, { surfaceTop: (id) => room.surfaceTop(id) });
  const canvas = ctx.renderer.domElement;
  props.setCamera(ctx.camera, () => ({ width: canvas.clientWidth, height: canvas.clientHeight }));

  const input = createInputState();
  attachKeyboard(input);
  // Touch controls share the same InputState (D-17, D-18); they live for the page lifetime like the keyboard.
  const uiRoot = document.getElementById('app') ?? document.body;
  attachJoystick(uiRoot, input);
  attachTouchButtons(uiRoot, input);

  const player = createPlayer(ctx, PLAYER_SPAWN);
  const cameraView = createCameraView(ctx.camera);

  // D-14: one InstancedMesh of blobs for the player and every dynamic prop.
  const shadows = createBlobShadows(ctx.scene);
  const playerFoot = { x: 0, y: 0, z: 0 };
  shadows.addCaster(() => {
    const p = player.pos();
    playerFoot.x = p.x;
    playerFoot.y = p.y - CAPSULE_HALF_HEIGHT - CAPSULE_RADIUS;
    playerFoot.z = p.z;
    return playerFoot;
  }, CAPSULE_RADIUS * 1.5);
  for (const rec of props.list()) {
    shadows.addCaster(() => rec.object.position, rec.radius * 1.2);
  }

  const testBox = props.get(TEST_BOX_ID);
  if (!testBox) throw new Error('layout has no test box ' + TEST_BOX_ID);

  let interactCount = 0;
  registerDebug('box', () => {
    const p = testBox.body.translation();
    return { pos: [p.x, p.y, p.z] };
  });
  registerDebug('interactCount', () => interactCount);

  return {
    input,
    fixedUpdate(dt) {
      player.fixedUpdate(dt, input);

      if (consumeInteract(input)) {
        const p = player.pos();
        const b = testBox.body.translation();
        if (Math.hypot(b.x - p.x, b.z - p.z) <= INTERACT_RADIUS) {
          props.push(testBox.id, b.x - p.x, b.z - p.z);
          interactCount++;
        }
      }
      props.fixedUpdate();
    },
    frameUpdate(dt) {
      player.frameUpdate(dt);
      props.sync();
      cameraView.update(dt, player.pos());
      room.update(getCameraYaw());
      shadows.update();
    },
    timeScale() {
      return 1;
    },
  };
}
