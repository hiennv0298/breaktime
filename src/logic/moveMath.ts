/**
 * Camera-relative movement (pure, Vitest-covered).
 * Screen input: x +1 = right (D), y +1 = forward (W).
 * For camera yaw `yawRad`, forward in world XZ is (-sin yaw, -cos yaw) and right is (cos yaw, -sin yaw),
 * so at yaw 0 forward is world -Z. The result is normalised only when longer than 1 (analog input keeps
 * its magnitude). Non-finite inputs count as 0.
 */
export function cameraRelativeMove(x: number, y: number, yawRad: number): { x: number; z: number } {
  const ix = Number.isFinite(x) ? x : 0;
  const iy = Number.isFinite(y) ? y : 0;
  const yaw = Number.isFinite(yawRad) ? yawRad : 0;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  let wx = ix * c - iy * s;
  let wz = -ix * s - iy * c;
  const len = Math.hypot(wx, wz);
  if (len > 1) {
    wx /= len;
    wz /= len;
  }
  return { x: wx, z: wz };
}
