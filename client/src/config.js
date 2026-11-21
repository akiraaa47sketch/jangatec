import { WORLD_LOOT_PARAMS } from './systems/loot.js';

const PROD_SERVER = import.meta.env.VITE_SERVER_URL || 'wss://jangatec.onrender.com';

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const DEFAULT_SERVER = local ? 'ws://localhost:3001' : PROD_SERVER;

export const CFG = {
  gravity: 22, jumpSpeed: 7.5, walk: 4.2, run: 6.8, swim: 2.6,
  step: 0.4,            // degrau máximo que o personagem sobe andando
  boatSpeed: 4.2, chunk: WORLD_LOOT_PARAMS.chunkSize, loadRadius: 2,
  islandChance: WORLD_LOOT_PARAMS.islandChance,
};
