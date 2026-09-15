/**
 * Quick add / remove of coworkers in play (plan 02-04; D-02 +/− keys and the "− N +" pill, D-01 cap 15).
 * Pure: no three.js, no Rapier, no DOM, no storage (D-12, NPC-06). Plan 02-08 wires it to the keys and the pill.
 *
 * Add = the next present member not yet in the office (roster order); remove = the last one that came in (LIFO).
 * Both are no-ops at 0 and at min(15, present members).
 */

import { maxOnFloor, normalizeRoster, onFloorMembers, presentMembers, type Roster, type RosterMember } from './roster';

function copyMember(m: RosterMember): RosterMember {
  return { id: m.id, name: m.name, look: m.look, temper: m.temper };
}

/** The present member that quick add would bring in next, or null at the cap. */
export function nextQuickCandidate(r: Roster): RosterMember | null {
  const base = normalizeRoster(r);
  if (base.count >= maxOnFloor(base)) return null;
  const next = presentMembers(base)[base.count];
  return next === undefined ? null : copyMember(next);
}

/** One more coworker on the floor; `member` is the one entering. */
export function quickAdd(r: Roster): { roster: Roster; changed: boolean; member: RosterMember | null } {
  const base = normalizeRoster(r);
  const member = nextQuickCandidate(base);
  if (member === null) return { roster: base, changed: false, member: null };
  const roster = normalizeRoster({ members: base.members, present: base.present, count: base.count + 1 });
  return { roster, changed: true, member };
}

/** One coworker fewer on the floor; `member` is the one leaving (the last one added). */
export function quickRemove(r: Roster): { roster: Roster; changed: boolean; member: RosterMember | null } {
  const base = normalizeRoster(r);
  if (base.count <= 0) return { roster: base, changed: false, member: null };
  const leaving = onFloorMembers(base)[base.count - 1];
  const roster = normalizeRoster({ members: base.members, present: base.present, count: base.count - 1 });
  return { roster, changed: true, member: leaving === undefined ? null : copyMember(leaving) };
}
