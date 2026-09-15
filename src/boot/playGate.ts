// "Chơi" gate (D-23). Callbacks registered here run synchronously inside the click handler,
// so audio unlock / fullscreen requests (later plans) keep their user-gesture activation.

const gestureCallbacks: Array<() => void> = [];

export function onPlayGesture(cb: () => void): void {
  gestureCallbacks.push(cb);
}

export function waitForPlay(opts: { autoplay: boolean }): Promise<void> {
  if (opts.autoplay) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const btn = document.createElement('button');
    btn.id = 'play';
    btn.type = 'button';
    btn.textContent = 'Chơi';
    let fired = false;
    btn.addEventListener('click', () => {
      if (fired) return;
      fired = true;
      for (const cb of gestureCallbacks) {
        try {
          cb();
        } catch (e) {
          console.warn('play gesture callback failed', e);
        }
      }
      btn.remove();
      resolve();
    });
    document.body.appendChild(btn);
  });
}
