export const GRID_WIDTH = 40;
export const GRID_HEIGHT = 60;
export const TILE_SIZE = 40;

export const COLORS = {
  PLAYER_SKIN: '#ffdbac',
  PLAYER_SHIRT: '#00ced1',
  PLAYER_PANTS: '#0000cd',
  ZOMBIE: '#10b981',
  CREEPER: '#22c55e',
  DIRT: '#8b4513',
  GRASS: '#228b22',
  STONE: '#808080',
  GOLD: '#ffd700',
  SHARD: '#9370db',
  DIAMOND: '#00ffff',
  AIR: 'transparent',
  HIGHLIGHT: 'rgba(255, 255, 255, 0.4)',
};

export const TILE_DURABILITY: Record<string, number> = {
  DIRT: 5,
  GRASS: 5,
  STONE: 15,
  GOLD: 10,
  SHARD: 12,
  DIAMOND: 20,
  AIR: 0,
};

export const VIEWPORT_WIDTH = 800;
export const VIEWPORT_HEIGHT = 600;
