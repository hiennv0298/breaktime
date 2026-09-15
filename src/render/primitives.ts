import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, type Object3D } from 'three';

/*
 * The Furniture Kit has no printer or water cooler (plan 01-05 inventory), so both are built from three.js
 * primitives in kit-like flat colours. Made in this repository, CC0 by construction (D-09, CREDITS.md).
 * Each returns one Object3D whose local origin is the bottom-centre, like OfficeAssets.cloneProp.
 */

let printerMats: { body: MeshLambertMaterial; panel: MeshLambertMaterial; paper: MeshLambertMaterial } | null = null;
let coolerMats: { base: MeshLambertMaterial; bottle: MeshLambertMaterial } | null = null;

function box(w: number, h: number, d: number, mat: MeshLambertMaterial, x: number, y: number, z: number): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function buildPrinter(): Object3D {
  printerMats ??= {
    body: new MeshLambertMaterial({ color: '#d8d8d8' }),
    panel: new MeshLambertMaterial({ color: '#3b3b3b' }),
    paper: new MeshLambertMaterial({ color: '#ffffff' }),
  };
  const g = new Group();
  g.name = 'printer';
  g.add(box(0.9, 1.0, 0.7, printerMats.body, 0, 0.5, 0));
  g.add(box(0.9, 0.08, 0.7, printerMats.panel, 0, 1.04, 0));
  g.add(box(0.5, 0.03, 0.3, printerMats.paper, 0, 1.095, 0.12));
  return g;
}

export function buildWaterCooler(): Object3D {
  coolerMats ??= {
    base: new MeshLambertMaterial({ color: '#e9ecef' }),
    bottle: new MeshLambertMaterial({ color: '#7cc6ff' }), // opaque on purpose: no transparent sorting cost
  };
  const g = new Group();
  g.name = 'waterCooler';
  g.add(box(0.35, 1.0, 0.35, coolerMats.base, 0, 0.5, 0));
  const bottle = new Mesh(new CylinderGeometry(0.16, 0.16, 0.45), coolerMats.bottle);
  bottle.position.set(0, 1.225, 0);
  g.add(bottle);
  return g;
}

/** Primitive builders by layout role. */
export const PRIMITIVE_BUILDERS: Readonly<Record<string, () => Object3D>> = {
  printer: buildPrinter,
  waterCooler: buildWaterCooler,
};
