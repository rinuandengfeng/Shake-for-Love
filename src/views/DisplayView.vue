<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import QRCode from 'qrcode'
import { socket } from '../socket'

interface LeaderboardEntry {
  rank: number
  name: string
  count: number
}

type GameState = 'waiting' | 'playing' | 'ended'

const qrDataUrl = ref('')
const gameState = ref<GameState>('waiting')
const countdown = ref(60)
const countdownTotal = ref(60)
const selectedDuration = ref(60)
const leaderboard = ref<LeaderboardEntry[]>([])
const totalPlayers = ref(0)

const shakeUrl = computed(() => `${window.location.origin}/shake`)
const maxCount = computed(() => leaderboard.value[0]?.count || 1)
const top3 = computed(() => leaderboard.value.slice(0, 3))
const rest = computed(() => leaderboard.value.slice(3))

// SVG 倒计时圆环：2π × 45 ≈ 282.74
const CIRC = 282.74
const strokeOffset = computed(() =>
  countdownTotal.value > 0
    ? CIRC * (1 - countdown.value / countdownTotal.value)
    : CIRC,
)
const ringColor = computed(() => {
  const p = countdownTotal.value > 0 ? countdown.value / countdownTotal.value : 0
  if (p > 0.5) return '#4ade80'
  if (p > 0.25) return '#facc15'
  return '#ef4444'
})

const medals = ['🥇', '🥈', '🥉']

function heartStyle(i: number) {
  return {
    left: `${((i * 73) % 100)}%`,
    fontSize: `${1.2 + ((i * 0.4) % 1.6)}rem`,
    animationDuration: `${6 + ((i * 0.9) % 6)}s`,
    animationDelay: `${((i * 1.1) % 6)}s`,
    opacity: 0.08 + ((i * 0.03) % 0.12),
  }
}

async function generateQR() {
  qrDataUrl.value = await QRCode.toDataURL(shakeUrl.value, {
    width: 300,
    margin: 2,
    color: { dark: '#1a0a1a', light: '#ffffff' },
  })
}

function startGame() {
  socket.emit('startGame', { duration: selectedDuration.value })
}

function resetGame() {
  if (confirm('确认重置游戏？所有数据将清空。')) {
    socket.emit('resetGame')
  }
}

onMounted(async () => {
  await generateQR()

  socket.on('sync', (data: { state: GameState; countdown: number; countdownTotal: number }) => {
    gameState.value = data.state
    countdown.value = data.countdown
    countdownTotal.value = data.countdownTotal
  })

  socket.on('tick', (value: number) => {
    countdown.value = value
  })

  socket.on('leaderboard', (data: { entries: LeaderboardEntry[]; total: number }) => {
    leaderboard.value = data.entries
    totalPlayers.value = data.total
  })
})

onUnmounted(() => {
  socket.off('sync')
  socket.off('tick')
  socket.off('leaderboard')
})
</script>

<template>
  <div class="display">
    <!-- 背景飘动的爱心 -->
    <div class="hearts-bg" aria-hidden="true">
      <span v-for="i in 18" :key="i" class="heart" :style="heartStyle(i)">❤️</span>
    </div>

    <!-- ══════════ 等待阶段 ══════════ -->
    <div v-if="gameState === 'waiting'" class="waiting">
      <div class="waiting-header">
        <h1 class="main-title">❤️ 婚礼摇一摇</h1>
        <p class="sub-title">摇出幸福 · 分享喜悦</p>
      </div>

      <div class="qr-wrap">
        <div class="qr-card">
          <img v-if="qrDataUrl" :src="qrDataUrl" class="qr-img" alt="扫码参与" />
          <div class="qr-scan-hint">微信扫码参与</div>
        </div>
        <div class="qr-url">{{ shakeUrl }}</div>
        <div class="joined-badge" v-if="totalPlayers > 0">
          已有 <strong>{{ totalPlayers }}</strong> 位嘉宾加入
        </div>
      </div>

      <div class="admin-panel">
        <div class="duration-group">
          <span class="duration-label">倒计时：</span>
          <button
            v-for="d in [30, 60, 90, 120]"
            :key="d"
            :class="['dur-btn', { active: selectedDuration === d }]"
            @click="selectedDuration = d"
          >{{ d }}秒</button>
        </div>
        <button class="btn-start" @click="startGame">
          ▶ 开始游戏
        </button>
      </div>
    </div>

    <!-- ══════════ 游戏中 / 结束 ══════════ -->
    <div v-else class="game-screen">
      <!-- 顶栏 -->
      <div class="game-header">
        <h2 class="game-title">❤️ 婚礼摇一摇</h2>

        <div v-if="gameState === 'playing'" class="countdown-wrap">
          <svg viewBox="0 0 100 100" class="countdown-ring">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#2a1a3a" stroke-width="7" />
            <circle
              cx="50" cy="50" r="45" fill="none"
              :stroke="ringColor" stroke-width="7"
              :stroke-dasharray="CIRC"
              :stroke-dashoffset="strokeOffset"
              stroke-linecap="round"
              transform="rotate(-90 50 50)"
              style="transition: stroke-dashoffset 0.95s linear, stroke 0.4s"
            />
          </svg>
          <div class="countdown-num">{{ countdown }}</div>
        </div>

        <div v-else class="ended-badge">🎉 游戏结束！</div>
      </div>

      <!-- 排行榜：空态 -->
      <div v-if="leaderboard.length === 0" class="empty-board">
        等待玩家摇一摇...
      </div>

      <!-- 排行榜：前三名 -->
      <div v-else>
        <TransitionGroup name="board" tag="div" class="top3-row">
          <div
            v-for="entry in top3"
            :key="entry.name"
            :class="['top3-card', `rank${entry.rank}`]"
          >
            <div class="medal">{{ medals[entry.rank - 1] }}</div>
            <div class="top3-name">{{ entry.name }}</div>
            <div class="top3-count">{{ entry.count }}<span>次</span></div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ width: `${(entry.count / maxCount) * 100}%` }"
              ></div>
            </div>
          </div>
        </TransitionGroup>

        <!-- 4~10 名 -->
        <TransitionGroup name="board" tag="div" class="rest-list" v-if="rest.length > 0">
          <div v-for="entry in rest" :key="entry.name" class="rest-row">
            <span class="rest-rank">{{ entry.rank }}</span>
            <span class="rest-name">{{ entry.name }}</span>
            <div class="rest-bar-track">
              <div
                class="rest-bar-fill"
                :style="{ width: `${(entry.count / maxCount) * 100}%` }"
              ></div>
            </div>
            <span class="rest-count">{{ entry.count }}次</span>
          </div>
        </TransitionGroup>
      </div>

      <!-- 重置按钮 -->
      <div v-if="gameState === 'ended'" class="reset-area">
        <button class="btn-reset" @click="resetGame">重新开始</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════ 整体 ══════════════════════════════════════ */
.display {
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at 50% 30%, #2d0a3a 0%, #0d0a15 70%);
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* ═══════════════════════════════ 背景爱心 ═════════════════════════════════ */
.hearts-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.heart {
  position: absolute;
  bottom: -5%;
  animation: float-heart linear infinite;
  user-select: none;
}
@keyframes float-heart {
  0%   { transform: translateY(0)      rotate(0deg);   opacity: inherit; }
  100% { transform: translateY(-110vh) rotate(20deg);  opacity: 0; }
}

/* ═══════════════════════════════ 等待阶段 ══════════════════════════════════ */
.waiting {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 3vh 4vw;
  gap: 2vh;
}

.waiting-header {
  text-align: center;
}
.main-title {
  font-size: clamp(2rem, 5vw, 4rem);
  font-weight: 800;
  background: linear-gradient(135deg, #ff9dc8, #ff3d7f, #ffd700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.05em;
}
.sub-title {
  color: #c084fc;
  font-size: clamp(0.9rem, 2vw, 1.4rem);
  margin-top: 0.4em;
  letter-spacing: 0.15em;
}

.qr-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2vh;
}
.qr-card {
  background: #fff;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 0 60px rgba(255, 61, 127, 0.3);
}
.qr-img {
  display: block;
  width: clamp(180px, 22vw, 280px);
  height: auto;
  border-radius: 8px;
}
.qr-scan-hint {
  text-align: center;
  color: #1a0a1a;
  font-size: 0.95rem;
  font-weight: 600;
  margin-top: 8px;
}
.qr-url {
  color: #a78bfa;
  font-size: clamp(0.7rem, 1.4vw, 1rem);
  letter-spacing: 0.05em;
}
.joined-badge {
  background: rgba(255, 61, 127, 0.15);
  border: 1px solid rgba(255, 61, 127, 0.4);
  color: #ff9dc8;
  border-radius: 999px;
  padding: 0.4em 1.4em;
  font-size: clamp(0.85rem, 1.6vw, 1.1rem);
}
.joined-badge strong {
  color: #ffd700;
  font-size: 1.3em;
}

/* 管理面板 */
.admin-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2vh;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 1.4vh 3vw;
}
.duration-group {
  display: flex;
  align-items: center;
  gap: 0.6em;
}
.duration-label {
  color: #c4b5fd;
  font-size: clamp(0.8rem, 1.4vw, 1rem);
}
.dur-btn {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #d4b8ff;
  border-radius: 8px;
  padding: 0.4em 1em;
  font-size: clamp(0.8rem, 1.3vw, 1rem);
  cursor: pointer;
  transition: all 0.2s;
}
.dur-btn:hover,
.dur-btn.active {
  background: rgba(255, 61, 127, 0.25);
  border-color: #ff3d7f;
  color: #fff;
}
.btn-start {
  background: linear-gradient(135deg, #ff3d7f, #c71f7e);
  border: none;
  color: #fff;
  font-size: clamp(1rem, 2vw, 1.4rem);
  font-weight: 700;
  padding: 0.6em 3em;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(255, 61, 127, 0.5);
  transition: transform 0.15s, box-shadow 0.15s;
}
.btn-start:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 32px rgba(255, 61, 127, 0.7);
}

/* ═══════════════════════════════ 游戏阶段 ══════════════════════════════════ */
.game-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1.5vh 2.5vw;
  gap: 1.5vh;
  overflow: hidden;
}

.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.game-title {
  font-size: clamp(1.2rem, 3vw, 2rem);
  font-weight: 800;
  background: linear-gradient(135deg, #ff9dc8, #ff3d7f, #ffd700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 倒计时圆环 */
.countdown-wrap {
  position: relative;
  width: clamp(70px, 9vw, 110px);
  height: clamp(70px, 9vw, 110px);
  flex-shrink: 0;
}
.countdown-ring {
  width: 100%;
  height: 100%;
}
.countdown-num {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(1.2rem, 3vw, 2rem);
  font-weight: 800;
  color: #fff;
}

.ended-badge {
  font-size: clamp(1.2rem, 3vw, 2rem);
  font-weight: 800;
  color: #ffd700;
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.7; transform: scale(1.04); }
}

.empty-board {
  text-align: center;
  color: #7c6a8a;
  font-size: clamp(1rem, 2vw, 1.4rem);
  margin-top: 5vh;
}

/* ─── 前三名 ─────────────────────────────────────────────────────────────── */
.top3-row {
  display: flex;
  gap: 1.5vw;
  flex-shrink: 0;
}
.top3-card {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 1.5vh 1.5vw;
  display: flex;
  flex-direction: column;
  gap: 0.5vh;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: transform 0.3s;
}
.top3-card.rank1 { border-color: rgba(255, 215, 0, 0.4); background: rgba(255, 215, 0, 0.07); }
.top3-card.rank2 { border-color: rgba(192, 192, 192, 0.4); background: rgba(192, 192, 192, 0.05); }
.top3-card.rank3 { border-color: rgba(205, 127, 50, 0.4); background: rgba(205, 127, 50, 0.05); }

.medal {
  font-size: clamp(1.5rem, 3vw, 2.5rem);
}
.top3-name {
  font-size: clamp(1rem, 2.2vw, 1.7rem);
  font-weight: 700;
  color: #f0e6ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.top3-count {
  font-size: clamp(1.5rem, 3.5vw, 2.8rem);
  font-weight: 800;
  color: #ffd700;
  line-height: 1;
}
.top3-count span {
  font-size: 0.45em;
  color: #c4b5fd;
  font-weight: 400;
  margin-left: 2px;
}
.bar-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 0.5vh;
}
.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff3d7f, #ffd700);
  border-radius: 4px;
  transition: width 0.6s ease;
  min-width: 4px;
}

/* ─── 4~10 名 ──────────────────────────────────────────────────────────────── */
.rest-list {
  display: flex;
  flex-direction: column;
  gap: 0.6vh;
  overflow: hidden;
}
.rest-row {
  display: flex;
  align-items: center;
  gap: 1vw;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  padding: 0.5vh 1vw;
}
.rest-rank {
  width: 2em;
  text-align: center;
  color: #9d7abf;
  font-size: clamp(0.85rem, 1.5vw, 1.1rem);
  font-weight: 600;
  flex-shrink: 0;
}
.rest-name {
  width: 8em;
  font-size: clamp(0.85rem, 1.5vw, 1.1rem);
  color: #e2d4ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}
.rest-bar-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}
.rest-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #c084fc, #ff3d7f);
  border-radius: 3px;
  transition: width 0.6s ease;
  min-width: 3px;
}
.rest-count {
  width: 5em;
  text-align: right;
  font-size: clamp(0.85rem, 1.4vw, 1rem);
  color: #c4b5fd;
  flex-shrink: 0;
}

/* TransitionGroup 动画 */
.board-move {
  transition: transform 0.5s ease;
}

/* 重置按钮 */
.reset-area {
  display: flex;
  justify-content: center;
  padding-top: 0.5vh;
}
.btn-reset {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #c4b5fd;
  border-radius: 999px;
  padding: 0.5em 2.5em;
  font-size: clamp(0.85rem, 1.4vw, 1rem);
  cursor: pointer;
  transition: all 0.2s;
}
.btn-reset:hover {
  background: rgba(255, 61, 127, 0.2);
  border-color: #ff3d7f;
  color: #fff;
}
</style>
