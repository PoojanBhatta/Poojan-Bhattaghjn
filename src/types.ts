export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST'
}

export enum TileType {
  AIR = 'AIR',
  DIRT = 'DIRT',
  STONE = 'STONE',
  GOLD = 'GOLD',
  SHARD = 'SHARD',
  DIAMOND = 'DIAMOND',
  GRASS = 'GRASS'
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  pos: Vector2;
  targetPos: Vector2;
  type: 'PLAYER' | 'ZOMBIE' | 'CREEPER';
  health: number;
  maxHealth: number;
  direction: number; // -1 for left, 1 for right
  isAttacking?: boolean;
  attackCooldown?: number;
  damageCooldown?: number;
}

export interface Particle {
  pos: Vector2;
  vel: Vector2;
  life: number;
  color: string;
  text?: string;
}

export interface Tile {
  type: TileType;
  durability: number;
  maxDurability: number;
}

export interface GameState {
  status: GameStatus;
  player: Entity;
  enemies: Entity[];
  grid: Tile[][];
  shardsCollected: number;
  goldCollected: number;
  diamondsCollected: number;
  camera: Vector2;
  selectedTile: Vector2 | null;
  particles: Particle[];
  screenShake: number;
}
