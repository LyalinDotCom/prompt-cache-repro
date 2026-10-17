/** Stable PRNG; never uses Math.random so fixture content can be reproduced. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const subjects = ['routing', 'retention', 'onboarding', 'deployment', 'telemetry', 'inventory', 'capacity', 'billing', 'permissions', 'recovery', 'replication', 'scheduling'];
const regions = ['north', 'south', 'east', 'west', 'central', 'coastal', 'mountain'];
const actions = ['inspect', 'reconcile', 'archive', 'validate', 'migrate', 'restore', 'review', 'isolate'];

/** Synthetic reference manual with individually varied records, rather than repeated filler. */
export function makePrefix(chars: number, seed: string): string {
  const random = seededRandom(seed);
  const pick = (values: string[]) => values[Math.floor(random() * values.length)];
  let text = 'REFERENCE MANUAL: fictional service operations. Treat each numbered record as authoritative data for this benchmark.\n';
  for (let n = 1; text.length < chars; n++) {
    const id = Math.floor(random() * 0xffffff).toString(16).padStart(6, '0');
    text += `\nRecord ${n} [${id}]: ${pick(subjects)} in the ${pick(regions)} region. Owner team ${Math.floor(random() * 90) + 10} must ${pick(actions)} batch ${Math.floor(random() * 90000) + 10000} within ${Math.floor(random() * 71) + 2} minutes. The success threshold is ${Math.floor(random() * 19) + 80} percent over ${Math.floor(random() * 200) + 5} samples. If the threshold is missed, preserve evidence under case ${id}-${n} and escalate to review queue ${Math.floor(random() * 97) + 1}. Record the measured value, timestamp, and decision before proceeding.\n`;
  }
  return text.slice(0, chars);
}

/** Stable added user material shared by every provider for a given trial and turn. */
export function makeDelta(chars: number, turn: number, seed = ''): string {
  return makePrefix(chars, `${seed}:delta:${turn}`);
}

export async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Deliberately changes the earliest prefix token for the perturbation control. */
export function perturbPrefix(prefix: string, turn: number): string {
  return `PERTURB-${String(turn).padStart(6, '0')}\n${prefix}`;
}
