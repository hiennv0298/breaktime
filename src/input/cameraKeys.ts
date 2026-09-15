import { classifyKey, isTypingTarget } from '../logic/keyMap';
import { rotateCamera } from '../render/cameraView';

/**
 * Desktop camera keys (D-19 revised 15/09/2026, D-27, CTRL-05): KeyZ rotates -90°, KeyC rotates +90°; nothing else.
 * The arrow keys are movement keys now and E is the secondary action key, so neither ever rotates.
 * Its own window listener (movement / action / pause stay in keyboard.ts). Intents come from the pure key map, so
 * Ctrl+Z / Cmd+Z never rotate; keys typed into a text field are ignored; held keys do not auto-repeat rotations.
 * No preventDefault (Z / C have no default action worth blocking). Returns a detach function.
 */
export function attachCameraKeys(): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat || isTypingTarget(e.target)) return;
    const intent = classifyKey(e.code, e);
    if (intent === 'rotate-left') rotateCamera(-1);
    else if (intent === 'rotate-right') rotateCamera(1);
  }

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
