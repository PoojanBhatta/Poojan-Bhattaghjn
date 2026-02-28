/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pickaxe, Heart, Trophy, Skull, Play, RefreshCw, Gem, Coins, Sword } from 'lucide-react';
import { GameStatus, TileType, GameState, Vector2, Entity, Tile, Particle } from './types';
import { 
  GRID_WIDTH, 
  GRID_HEIGHT, 
  TILE_SIZE, 
  COLORS, 
  TILE_DURABILITY, 
  VIEWPORT_WIDTH, 
  VIEWPORT_HEIGHT 
} from './constants';

class SoundManager {
  private ctx: AudioContext | null = null;
  private bgmOsc: OscillatorNode | null = null;
  private bgmGain: GainNode | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playHit() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playEnemyHit() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playMine() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  startBGM() {
    this.init();
    if (!this.ctx || this.bgmOsc) return;
    this.bgmOsc = this.ctx.createOscillator();
    this.bgmGain = this.ctx.createGain();
    this.bgmOsc.type = 'triangle';
    this.bgmOsc.frequency.setValueAtTime(110, this.ctx.currentTime);
    this.bgmGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    this.bgmOsc.connect(this.bgmGain);
    this.bgmGain.connect(this.ctx.destination);
    this.bgmOsc.start();
  }

  stopBGM() {
    if (this.bgmOsc) {
      try {
        this.bgmOsc.stop();
      } catch (e) {}
      this.bgmOsc = null;
    }
  }
}

const sounds = new SoundManager();

const INITIAL_PLAYER_HEALTH = 200;
const ENEMY_SPAWN_COUNT = 12;
const SHARD_GOAL = 10;
const GOLD_COUNT = 5;
const DIAMOND_COUNT = 3;
const ATTACK_COOLDOWN = 20;
const SWORD_DAMAGE = 34; // 3 hits to kill (102 total)
const CLICK_DAMAGE = 34; // 3 clicks to kill
const ENEMY_DAMAGE = 34; // 3 hits to kill player
const DAMAGE_COOLDOWN = 60; // 1 second at 60fps

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const keysPressed = useRef<Set<string>>(new Set());
  const lastTimeRef = useRef<number>(0);

  const initGame = useCallback(() => {
    const grid: Tile[][] = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      grid[y] = [];
      for (let x = 0; x < GRID_WIDTH; x++) {
        let type = TileType.AIR;
        if (y === 5) type = TileType.GRASS;
        else if (y > 5 && y < 10) type = TileType.DIRT;
        else if (y >= 10) type = TileType.STONE;
        grid[y][x] = { type, durability: TILE_DURABILITY[type] || 0, maxDurability: TILE_DURABILITY[type] || 0 };
      }
    }

    // Cave generation
    for (let i = 0; i < 15; i++) {
      let cx = Math.floor(Math.random() * GRID_WIDTH);
      let cy = Math.floor(Math.random() * (GRID_HEIGHT - 15)) + 15;
      const length = Math.floor(Math.random() * 40) + 20;
      for (let j = 0; j < length; j++) {
        const radius = Math.floor(Math.random() * 2) + 2;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 10 && ny < GRID_HEIGHT) {
              if (Math.hypot(dx, dy) <= radius) grid[ny][nx] = { type: TileType.AIR, durability: 0, maxDurability: 0 };
            }
          }
        }
        cx += Math.floor(Math.random() * 5) - 2;
        cy += Math.floor(Math.random() * 3) - 1;
        if (cx < 0 || cx >= GRID_WIDTH || cy < 10 || cy >= GRID_HEIGHT) break;
      }
    }

    const placeResource = (type: TileType, count: number, minY: number) => {
      let placed = 0;
      while (placed < count) {
        const rx = Math.floor(Math.random() * GRID_WIDTH);
        const ry = Math.floor(Math.random() * (GRID_HEIGHT - minY)) + minY;
        if (grid[ry][rx].type === TileType.STONE || grid[ry][rx].type === TileType.DIRT) {
          grid[ry][rx] = { type, durability: TILE_DURABILITY[type], maxDurability: TILE_DURABILITY[type] };
          placed++;
        }
      }
    };

    placeResource(TileType.SHARD, 15, 12);
    placeResource(TileType.GOLD, GOLD_COUNT, 20);
    placeResource(TileType.DIAMOND, DIAMOND_COUNT, 40);

    const enemies: Entity[] = [];
    for (let i = 0; i < ENEMY_SPAWN_COUNT; i++) {
      enemies.push({
        id: `enemy-${i}`,
        pos: { x: Math.random() * GRID_WIDTH * TILE_SIZE, y: (Math.random() * (GRID_HEIGHT - 15) + 15) * TILE_SIZE },
        targetPos: { x: 0, y: 0 },
        type: Math.random() > 0.7 ? 'CREEPER' : 'ZOMBIE',
        health: 100,
        maxHealth: 100,
        direction: 1,
      });
    }

    setGameState({
      status: GameStatus.MENU,
      player: {
        id: 'player',
        pos: { x: (GRID_WIDTH / 2) * TILE_SIZE, y: 4 * TILE_SIZE },
        targetPos: { x: (GRID_WIDTH / 2) * TILE_SIZE, y: 4 * TILE_SIZE },
        type: 'PLAYER',
        health: INITIAL_PLAYER_HEALTH,
        maxHealth: INITIAL_PLAYER_HEALTH,
        direction: 1,
        isAttacking: false,
        attackCooldown: 0,
      },
      enemies,
      grid,
      shardsCollected: 0,
      goldCollected: 0,
      diamondsCollected: 0,
      camera: { x: 0, y: 0 },
      selectedTile: null,
      particles: [],
      screenShake: 0,
    });
  }, []);

  useEffect(() => { initGame(); }, [initGame]);

  const handleKeyDown = (e: KeyboardEvent) => {
    keysPressed.current.add(e.code);
    if (e.code === 'Space') handleAttack();
  };
  const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleAttack = () => {
    setGameState(prev => {
      if (!prev || prev.status !== GameStatus.PLAYING || (prev.player.attackCooldown || 0) > 0) return prev;
      const next = { ...prev };
      next.player.isAttacking = true;
      next.player.attackCooldown = ATTACK_COOLDOWN;

      // Damage enemies in range
      let hit = false;
      next.enemies = next.enemies.map(enemy => {
        const dist = Math.hypot(next.player.pos.x - enemy.pos.x, next.player.pos.y - enemy.pos.y);
        if (dist < TILE_SIZE * 1.5) {
          hit = true;
          const eNext = { ...enemy };
          eNext.health -= SWORD_DAMAGE;
          // Particle effect for hit
          for (let i = 0; i < 5; i++) {
            next.particles.push({
              pos: { x: enemy.pos.x + TILE_SIZE / 2, y: enemy.pos.y + TILE_SIZE / 2 },
              vel: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 },
              life: 20,
              color: '#ff0000',
            });
          }
          return eNext;
        }
        return enemy;
      }).filter(e => e.health > 0);

      if (hit) sounds.playEnemyHit();

      return next;
    });
  };

  const spawnMiningParticles = (x: number, y: number, color: string) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < 3; i++) {
      newParticles.push({
        pos: { x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE },
        vel: { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6 },
        life: 30,
        color,
      });
    }
    return newParticles;
  };

  const update = useCallback((time: number) => {
    if (!gameState || gameState.status !== GameStatus.PLAYING) return;

    setGameState(prev => {
      if (!prev) return null;
      const next = { ...prev };
      const { player, grid, enemies, particles } = next;

      // Cooldowns
      if (player.attackCooldown && player.attackCooldown > 0) {
        player.attackCooldown--;
        if (player.attackCooldown < ATTACK_COOLDOWN - 5) player.isAttacking = false;
      }
      if (player.damageCooldown && player.damageCooldown > 0) player.damageCooldown--;

      // Movement
      const speed = 5;
      let dx = 0, dy = 0;
      if (keysPressed.current.has('KeyA') || keysPressed.current.has('ArrowLeft')) { dx -= speed; player.direction = -1; }
      if (keysPressed.current.has('KeyD') || keysPressed.current.has('ArrowRight')) { dx += speed; player.direction = 1; }
      if (keysPressed.current.has('KeyW') || keysPressed.current.has('ArrowUp')) dy -= speed;
      if (keysPressed.current.has('KeyS') || keysPressed.current.has('ArrowDown')) dy += speed;

      const checkCollision = (px: number, py: number) => {
        const margin = 8;
        const left = Math.floor((px + margin) / TILE_SIZE), right = Math.floor((px + TILE_SIZE - margin) / TILE_SIZE);
        const top = Math.floor((py + margin) / TILE_SIZE), bottom = Math.floor((py + TILE_SIZE - margin) / TILE_SIZE);
        for (let y = top; y <= bottom; y++) {
          for (let x = left; x <= right; x++) {
            if (y < 0 || y >= GRID_HEIGHT || x < 0 || x >= GRID_WIDTH) return true;
            if (grid[y][x].type !== TileType.AIR) return true;
          }
        }
        return false;
      };

      if (!checkCollision(player.pos.x + dx, player.pos.y)) player.pos.x += dx;
      if (!checkCollision(player.pos.x, player.pos.y + dy)) player.pos.y += dy;

      next.camera = {
        x: player.pos.x - VIEWPORT_WIDTH / 2 + TILE_SIZE / 2,
        y: player.pos.y - VIEWPORT_HEIGHT / 2 + TILE_SIZE / 2,
      };

      // Screen shake decay
      if (next.screenShake > 0) next.screenShake *= 0.9;

      // Particles
      next.particles = particles.map(p => ({
        ...p,
        pos: { x: p.pos.x + p.vel.x, y: p.pos.y + p.vel.y },
        vel: { x: p.vel.x, y: p.vel.y + 0.2 }, // Gravity
        life: p.life - 1,
      })).filter(p => p.life > 0);

      // Enemies
      next.enemies = enemies.map(enemy => {
        const dist = Math.hypot(player.pos.x - enemy.pos.x, player.pos.y - enemy.pos.y);
        const eNext = { ...enemy };
        if (dist < 250) {
          const angle = Math.atan2(player.pos.y - enemy.pos.y, player.pos.x - enemy.pos.x);
          const ex = enemy.pos.x + Math.cos(angle) * 1.5, ey = enemy.pos.y + Math.sin(angle) * 1.5;
          if (!checkCollision(ex, enemy.pos.y)) eNext.pos.x = ex;
          if (!checkCollision(enemy.pos.x, ey)) eNext.pos.y = ey;
          eNext.direction = player.pos.x > enemy.pos.x ? 1 : -1;
        }
        if (dist < TILE_SIZE * 0.7 && (!player.damageCooldown || player.damageCooldown === 0)) {
          player.health -= ENEMY_DAMAGE;
          player.damageCooldown = DAMAGE_COOLDOWN;
          next.screenShake = 10;
          sounds.playHit();
          // Hit particles for player
          for (let i = 0; i < 5; i++) {
            next.particles.push({
              pos: { x: player.pos.x + TILE_SIZE / 2, y: player.pos.y + TILE_SIZE / 2 },
              vel: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 },
              life: 20,
              color: '#ff0000',
            });
          }
        }
        return eNext;
      });

      if (player.health <= 0) next.status = GameStatus.LOST;
      return next;
    });

    requestRef.current = requestAnimationFrame(update);
  }, [gameState]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [update]);

  const drawTile = (ctx: CanvasRenderingContext2D, x: number, y: number, type: TileType, durability: number, maxDurability: number) => {
    const baseColor = COLORS[type as keyof typeof COLORS];
    ctx.fillStyle = baseColor;
    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

    // Glow for ores
    if (type === TileType.GOLD || type === TileType.DIAMOND || type === TileType.SHARD) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = baseColor;
    }

    // Minecraft-style texture
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 6; i++) {
      const rx = (Math.sin(x * 123 + y * 456 + i) * 0.5 + 0.5) * (TILE_SIZE - 4);
      const ry = (Math.cos(x * 789 + y * 123 + i) * 0.5 + 0.5) * (TILE_SIZE - 4);
      ctx.fillRect(x * TILE_SIZE + rx, y * TILE_SIZE + ry, 4, 4);
    }
    ctx.shadowBlur = 0;

    if (durability < maxDurability) {
      const crackLevel = Math.floor((1 - durability / maxDurability) * 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      for (let i = 0; i < crackLevel; i++) {
        ctx.beginPath();
        ctx.moveTo(x * TILE_SIZE + Math.random() * TILE_SIZE, y * TILE_SIZE + Math.random() * TILE_SIZE);
        ctx.lineTo(x * TILE_SIZE + Math.random() * TILE_SIZE, y * TILE_SIZE + Math.random() * TILE_SIZE);
        ctx.stroke();
      }
    }
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D, player: Entity) => {
    const { x, y } = player.pos;
    const dir = player.direction;
    const isAttacking = player.isAttacking;

    ctx.save();
    // Bobbing animation
    const bob = Math.sin(Date.now() / 150) * 2;
    ctx.translate(0, bob);

    // Back arm
    ctx.fillStyle = COLORS.PLAYER_SKIN;
    ctx.fillRect(x + (dir === 1 ? 4 : 28), y + 14, 8, 16);
    
    // Body
    ctx.fillStyle = COLORS.PLAYER_SHIRT;
    ctx.fillRect(x + 8, y + 14, 24, 18);
    
    // Front Arm (Sword)
    ctx.fillStyle = COLORS.PLAYER_SKIN;
    const armX = dir === 1 ? x + 28 : x + 4;
    ctx.save();
    if (isAttacking) {
      ctx.translate(armX + 4, y + 18);
      ctx.rotate(dir === 1 ? -Math.PI / 2 : Math.PI / 2);
      ctx.fillRect(-4, -4, 8, 16);
      // Sword
      ctx.fillStyle = '#a8a8a8';
      ctx.fillRect(-2, 12, 4, 20);
      ctx.fillStyle = '#5c4033';
      ctx.fillRect(-4, 10, 8, 2);
    } else {
      ctx.fillRect(armX, y + 14, 8, 16);
    }
    ctx.restore();
    
    // Pants
    ctx.fillStyle = COLORS.PLAYER_PANTS;
    ctx.fillRect(x + 8, y + 32, 24, 8);
    
    // Head
    ctx.fillStyle = COLORS.PLAYER_SKIN;
    ctx.fillRect(x + 10, y + 2, 20, 12);
    ctx.fillStyle = '#4b3621';
    ctx.fillRect(x + 10, y + 2, 20, 4);
    ctx.fillStyle = 'white';
    const eyeX = dir === 1 ? x + 22 : x + 12;
    ctx.fillRect(eyeX, y + 6, 6, 3);
    ctx.fillStyle = '#333';
    ctx.fillRect(eyeX + (dir === 1 ? 4 : 0), y + 6, 2, 3);

    ctx.restore();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { camera, grid, player, enemies, selectedTile, particles, screenShake } = gameState;
    
    // Background transition based on depth
    const skyColor = '#87ceeb';
    const caveColor = '#050505'; // Even darker
    // Transition starts after the overworld (y=8)
    const depthFactor = Math.min(1, Math.max(0, (player.pos.y / TILE_SIZE - 8) / 4));
    
    // Interpolate background color for a smoother transition to "dark theme"
    const r = Math.floor(135 * (1 - depthFactor) + 5 * depthFactor);
    const g = Math.floor(206 * (1 - depthFactor) + 5 * depthFactor);
    const b = Math.floor(235 * (1 - depthFactor) + 5 * depthFactor);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Apply screen shake
    if (screenShake > 0) {
      ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    }
    ctx.translate(-camera.x, -camera.y);

    const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE)), endX = Math.min(GRID_WIDTH, Math.ceil((camera.x + VIEWPORT_WIDTH) / TILE_SIZE));
    const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE)), endY = Math.min(GRID_HEIGHT, Math.ceil((camera.y + VIEWPORT_HEIGHT) / TILE_SIZE));

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = grid[y][x];
        if (tile.type !== TileType.AIR) drawTile(ctx, x, y, tile.type, tile.durability, tile.maxDurability);
      }
    }

    if (selectedTile && grid[selectedTile.y] && grid[selectedTile.y][selectedTile.x]) {
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.strokeRect(selectedTile.x * TILE_SIZE, selectedTile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(selectedTile.x * TILE_SIZE, selectedTile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // Mining progress bar
      const tile = grid[selectedTile.y][selectedTile.x];
      if (tile && tile.type !== TileType.AIR && tile.durability < tile.maxDurability) {
        const progress = 1 - (tile.durability / tile.maxDurability);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(selectedTile.x * TILE_SIZE + 5, selectedTile.y * TILE_SIZE + TILE_SIZE - 10, TILE_SIZE - 10, 5);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(selectedTile.x * TILE_SIZE + 5, selectedTile.y * TILE_SIZE + TILE_SIZE - 10, (TILE_SIZE - 10) * progress, 5);
      }
    }

    particles.forEach(p => {
      if (p.text) {
        ctx.fillStyle = p.color;
        ctx.font = 'bold 12px Inter';
        ctx.globalAlpha = p.life / 30;
        ctx.fillText(p.text, p.pos.x, p.pos.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 30;
        ctx.fillRect(p.pos.x, p.pos.y, 4, 4);
      }
    });
    ctx.globalAlpha = 1;

    enemies.forEach(enemy => {
      ctx.fillStyle = COLORS[enemy.type as keyof typeof COLORS];
      ctx.fillRect(enemy.pos.x + 4, enemy.pos.y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      
      // Enemy Health Bar
      const barWidth = TILE_SIZE;
      const barHeight = 4;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(enemy.pos.x, enemy.pos.y - 10, barWidth, barHeight);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(enemy.pos.x, enemy.pos.y - 10, barWidth * (enemy.health / enemy.maxHealth), barHeight);

      ctx.fillStyle = 'white';
      const eyeX = enemy.direction === 1 ? enemy.pos.x + 24 : enemy.pos.x + 8;
      ctx.fillRect(eyeX, enemy.pos.y + 10, 6, 6);
    });

    drawPlayer(ctx, player);
    ctx.restore();
  }, [gameState]);

  useEffect(() => { draw(); }, [draw]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!gameState || gameState.status !== GameStatus.PLAYING) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left + gameState.camera.x, mouseY = e.clientY - rect.top + gameState.camera.y;
    
    // Check for enemy hits first
    let hitAnyEnemy = false;
    setGameState(prev => {
      if (!prev) return null;
      const next = { ...prev };
      const initialEnemyCount = next.enemies.length;
      next.enemies = next.enemies.map(enemy => {
        const dist = Math.hypot(mouseX - (enemy.pos.x + TILE_SIZE / 2), mouseY - (enemy.pos.y + TILE_SIZE / 2));
        if (dist < TILE_SIZE * 0.8) {
          const eNext = { ...enemy };
          eNext.health -= CLICK_DAMAGE;
          hitAnyEnemy = true;
          sounds.playEnemyHit();
          // Hit particles
          for (let i = 0; i < 5; i++) {
            next.particles.push({
              pos: { x: enemy.pos.x + TILE_SIZE / 2, y: enemy.pos.y + TILE_SIZE / 2 },
              vel: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 },
              life: 20,
              color: '#ff0000',
            });
          }
          return eNext;
        }
        return enemy;
      }).filter(e => e.health > 0);
      
      // If we killed an enemy, maybe give some health? (Optional, user didn't explicitly ask but said "make health more")
      if (next.enemies.length < initialEnemyCount) {
        next.player.health = Math.min(INITIAL_PLAYER_HEALTH, next.player.health + 20);
      }
      
      return next;
    });

    if (hitAnyEnemy) return;

    const tx = Math.floor(mouseX / TILE_SIZE), ty = Math.floor(mouseY / TILE_SIZE);
    if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) return;
    const dist = Math.hypot((tx + 0.5) * TILE_SIZE - (gameState.player.pos.x + TILE_SIZE / 2), (ty + 0.5) * TILE_SIZE - (gameState.player.pos.y + TILE_SIZE / 2));

    if (dist < TILE_SIZE * 3.5) {
      setGameState(prev => {
        if (!prev) return null;
        const next = { ...prev };
        const tile = next.grid[ty][tx];
        if (tile.type !== TileType.AIR) {
          tile.durability -= 8;
          sounds.playMine();
          next.particles.push(...spawnMiningParticles(tx, ty, COLORS[tile.type as keyof typeof COLORS]));
          if (tile.durability <= 0) {
            next.screenShake = 5;
            if (tile.type === TileType.SHARD) { 
              next.shardsCollected += 1; 
              next.particles.push({ pos: { x: (tx + 0.5) * TILE_SIZE, y: ty * TILE_SIZE }, vel: { x: 0, y: -1 }, life: 40, color: COLORS.SHARD, text: '+1 SHARD' });
              if (next.shardsCollected >= SHARD_GOAL) next.status = GameStatus.WON; 
            }
            else if (tile.type === TileType.GOLD) {
              next.goldCollected += 1;
              next.particles.push({ pos: { x: (tx + 0.5) * TILE_SIZE, y: ty * TILE_SIZE }, vel: { x: 0, y: -1 }, life: 40, color: COLORS.GOLD, text: '+1 GOLD' });
            }
            else if (tile.type === TileType.DIAMOND) {
              next.diamondsCollected += 1;
              next.particles.push({ pos: { x: (tx + 0.5) * TILE_SIZE, y: ty * TILE_SIZE }, vel: { x: 0, y: -1 }, life: 40, color: COLORS.DIAMOND, text: '+1 DIAMOND' });
            }
            tile.type = TileType.AIR;
          }
        }
        return next;
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!gameState || gameState.status !== GameStatus.PLAYING) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left + gameState.camera.x, mouseY = e.clientY - rect.top + gameState.camera.y;
    const tx = Math.floor(mouseX / TILE_SIZE), ty = Math.floor(mouseY / TILE_SIZE);
    if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) {
      setGameState(prev => prev ? ({ ...prev, selectedTile: null }) : null);
      return;
    }
    setGameState(prev => prev ? ({ ...prev, selectedTile: { x: tx, y: ty } }) : null);
  };

  const startGame = () => { 
    sounds.stopBGM();
    sounds.startBGM();
    initGame(); 
    setGameState(prev => prev ? ({ ...prev, status: GameStatus.PLAYING }) : null); 
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center font-sans text-white overflow-hidden">
      <div className="relative border-4 border-neutral-800 rounded-xl shadow-2xl overflow-hidden bg-neutral-900">
        <canvas ref={canvasRef} width={VIEWPORT_WIDTH} height={VIEWPORT_HEIGHT} onClick={handleCanvasClick} onMouseMove={handleMouseMove} className="cursor-crosshair" />
        {gameState?.status === GameStatus.PLAYING && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md p-2 px-4 rounded-full border border-white/10">
                <div className="flex flex-col"><span className="text-[10px] text-neutral-400 font-black uppercase tracking-widest">Player</span><span className="text-xs font-bold text-white">Minor Dai</span></div>
              </div>
              <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md p-2 px-4 rounded-full border border-white/10">
                <Heart className="w-5 h-5 text-red-500 fill-red-500" /><div className="w-32 h-3 bg-neutral-800 rounded-full overflow-hidden"><motion.div className="h-full bg-red-500" animate={{ width: `${(gameState.player.health / INITIAL_PLAYER_HEALTH) * 100}%` }} /></div>
              </div>
              <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md p-2 px-4 rounded-full border border-white/10">
                <Pickaxe className="w-5 h-5 text-indigo-400" /><span className="text-sm font-bold">{gameState.shardsCollected} / {SHARD_GOAL} SHARDS</span>
              </div>
              <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md p-2 px-4 rounded-full border border-white/10">
                <Sword className="w-5 h-5 text-neutral-400" /><span className="text-[10px] font-bold uppercase">Left Click to Attack</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md p-2 px-4 rounded-full border border-white/10"><Coins className="w-5 h-5 text-yellow-400" /><span className="text-sm font-bold">GOLD: {gameState.goldCollected}</span></div>
              <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md p-2 px-4 rounded-full border border-white/10"><Gem className="w-5 h-5 text-cyan-400" /><span className="text-sm font-bold">DIAMONDS: {gameState.diamondsCollected}</span></div>
            </div>
          </div>
        )}
        <AnimatePresence>
          {gameState?.status === GameStatus.MENU && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
              <h1 className="text-7xl font-black mb-4 tracking-tighter uppercase italic text-white drop-shadow-lg">MINOR DAI</h1>
              <p className="text-cyan-400 font-bold mb-12 tracking-widest uppercase text-2xl animate-pulse">GO DOWN TO FIND SUPRISES ;)</p>
              <button onClick={startGame} className="px-12 py-4 bg-white text-black font-black text-2xl rounded-full hover:scale-105 transition-transform flex items-center gap-3"><Play className="w-8 h-8 fill-black" /> START ADVENTURE</button>
            </motion.div>
          )}
          {gameState?.status === GameStatus.LOST && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 bg-red-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
              <Skull className="w-24 h-24 text-red-500 mb-6" />
              <h2 className="text-6xl font-black mb-4 tracking-tighter uppercase">You died.</h2>
              <p className="text-red-200/60 mb-8 text-xl">Would you like to restart?</p>
              <button onClick={startGame} className="px-10 py-4 bg-white text-black font-black text-xl rounded-full hover:bg-neutral-200 transition-colors flex items-center gap-3"><RefreshCw className="w-6 h-6" /> RESTART</button>
            </motion.div>
          )}
          {gameState?.status === GameStatus.WON && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 bg-indigo-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
              <Trophy className="w-24 h-24 text-yellow-400 mb-6" />
              <h2 className="text-6xl font-black mb-4 tracking-tighter uppercase">You won.</h2>
              <p className="text-indigo-200/60 mb-8 text-xl">Would you like to restart?</p>
              <button onClick={startGame} className="px-10 py-4 bg-white text-black font-black text-xl rounded-full hover:bg-neutral-200 transition-colors flex items-center gap-3"><RefreshCw className="w-6 h-6" /> RESTART</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
