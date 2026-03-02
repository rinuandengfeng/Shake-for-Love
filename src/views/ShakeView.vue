<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { socket } from '../socket'

interface LeaderboardEntry {
  rank: number
  name: string
  count: number
}

type GameState = 'waiting' | 'playing' | 'ended'
type Phase = 'nameInput' | 'waiting' | 'playing' | 'ended'

// ─── 状态 ─────────────────────────────────────────────────────────────────────
const phase = ref<Phase>('nameInput')
const currentGameState = ref<GameState>('waiting')
const nameInput = ref('')
const myName = ref('')
const myCount = ref(0)
const countdown = ref(60)
const countdownTotal = ref(60)
const myRank = ref(0)
const shaking = ref(false)
const needPermission = ref(false)

// ─── 摇一摇检测 ───────────────────────────────────────────────────────────────
let lastShakeTime = 0
let lastX = 0
let lastY = 0
let lastZ = 0

function handleMotion(e: DeviceMotionEvent) {
  const acc = e.accelerationIncludingGravity
  if (!acc || acc.x == null || acc.y == null || acc.z == null) return

  const now = Date.now()
  if (now - lastShakeTime < 300) return // 每次摇之间至少 300ms

  const dx = Math.abs(acc.x - lastX)
  const dy = Math.abs(acc.y - lastY)
  const dz = Math.abs(acc.z - lastZ)

  lastX = acc.x
  lastY = acc.y
  lastZ = acc.z

  if (dx + dy + dz > 15) {
    lastShakeTime = now
    doShake()
  }
}

function doShake() {
  if (phase.value !== 'playing') return
  shaking.value = true
  setTimeout(() => { shaking.value = false }, 250)
  socket.emit('shake')
}

function startListening() {
  window.addEventListener('devicemotion', handleMotion)
}

async function requestPermission() {
  try {
    // iOS 13+ 需要用户手势授权
    const perm = await (DeviceMotionEvent as unknown as {
      requestPermission: () => Promise<string>
    }).requestPermission()
    if (perm === 'granted') {
      needPermission.value = false
      startListening()
    }
  } catch (e) {
    console.error('Permission error:', e)
  }
}

function setupMotion() {
  if (
    typeof DeviceMotionEvent !== 'undefined' &&
    typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission === 'function'
  ) {
    needPermission.value = true
  } else {
    startListening()
  }
}

// ─── 游戏逻辑 ─────────────────────────────────────────────────────────────────
function join() {
  const name = nameInput.value.trim()
  if (!name) return
  socket.emit('join', { name })
}

function applyGameState(state: GameState) {
  currentGameState.value = state
  if (phase.value === 'nameInput') return // 未加入，不切换

  if (state === 'playing') {
    phase.value = 'playing'
  } else if (state === 'ended') {
    phase.value = 'ended'
  } else if (state === 'waiting') {
    // 游戏重置，重新加入
    myName.value = ''
    myCount.value = 0
    myRank.value = 0
    nameInput.value = ''
    phase.value = 'nameInput'
  }
}

// ─── 计算属性 ─────────────────────────────────────────────────────────────────
const countdownPct = computed(() =>
  countdownTotal.value > 0 ? countdown.value / countdownTotal.value : 0,
)
const barWidth = computed(() => `${countdownPct.value * 100}%`)

const rankText = computed(() => {
  if (myRank.value === 1) return '🥇 第一名！'
  if (myRank.value === 2) return '🥈 第二名！'
  if (myRank.value === 3) return '🥉 第三名！'
  if (myRank.value > 0) return `第 ${myRank.value} 名`
  return ''
})

const CONFETTI_CHARS = ['❤️', '🎊', '🎉', '✨', '💕', '🌸']
function confettiChar(i: number) {
  return CONFETTI_CHARS[i % CONFETTI_CHARS.length]
}
function confettiStyle(i: number) {
  return {
    left: `${(i * 5.3) % 100}%`,
    fontSize: `${0.8 + ((i * 0.2) % 1)}rem`,
    animationDuration: `${3 + ((i * 0.7) % 4)}s`,
    animationDelay: `${((i * 0.4) % 3)}s`,
  }
}

// ─── Socket 事件 ─────────────────────────────────────────────────────────────
onMounted(() => {
  socket.on('sync', (data: { state: GameState; countdown: number; countdownTotal: number }) => {
    countdown.value = data.countdown
    countdownTotal.value = data.countdownTotal
    applyGameState(data.state)
  })

  socket.on('tick', (value: number) => {
    countdown.value = value
  })

  socket.on('joined', ({ name }: { name: string }) => {
    myName.value = name
    setupMotion()
    // 根据当前游戏状态决定进入哪个 phase
    if (currentGameState.value === 'playing') {
      phase.value = 'playing'
    } else if (currentGameState.value === 'ended') {
      phase.value = 'ended'
    } else {
      phase.value = 'waiting'
    }
  })

  socket.on('myCount', (count: number) => {
    myCount.value = count
  })

  socket.on('leaderboard', (data: { entries: LeaderboardEntry[]; total: number }) => {
    const me = data.entries.find((e) => e.name === myName.value)
    myRank.value = me?.rank ?? 0
  })
})

onUnmounted(() => {
  window.removeEventListener('devicemotion', handleMotion)
  socket.off('sync')
  socket.off('tick')
  socket.off('joined')
  socket.off('myCount')
  socket.off('leaderboard')
})
</script>

<template>
  <div class="shake-page">
    <!-- ══════════ 输入名字 ══════════ -->
    <div v-if="phase === 'nameInput'" class="phase name-phase">
      <div class="logo">❤️</div>
      <h1 class="page-title">婚礼摇一摇</h1>
      <p class="page-sub">摇出幸福 · 分享喜悦</p>

      <div class="input-wrap">
        <input
          v-model="nameInput"
          class="name-input"
          placeholder="请输入您的名字"
          maxlength="12"
          @keyup.enter="join"
          autofocus
        />
        <button
          class="btn-join"
          :disabled="!nameInput.trim()"
          @click="join"
        >
          开始摇一摇 →
        </button>
      </div>

      <p class="tip">输入姓名后开始摇手机参与比赛</p>
    </div>

    <!-- ══════════ 等待游戏开始 ══════════ -->
    <div v-else-if="phase === 'waiting'" class="phase wait-phase">
      <div class="logo">❤️</div>
      <h2 class="greeting">{{ myName }}，准备好了！</h2>
      <p class="hint">等待游戏开始...</p>
      <div class="spinner"></div>

      <div v-if="needPermission" class="perm-wrap">
        <p class="perm-tip">iOS 需要授权才能感知摇一摇</p>
        <button class="btn-perm" @click="requestPermission">🔑 授权摇一摇</button>
      </div>
    </div>

    <!-- ══════════ 游戏进行中 ══════════ -->
    <div v-else-if="phase === 'playing'" class="phase play-phase">
      <!-- 倒计时条 -->
      <div class="bar-wrap">
        <div class="bar-inner" :style="{ width: barWidth }"></div>
        <span class="bar-label">{{ countdown }}s</span>
      </div>

      <h2 class="greeting">{{ myName }}，加油！</h2>

      <!-- 摇一摇球 -->
      <div
        :class="['shake-ball', { shaking }]"
        @click="doShake"
        role="button"
        aria-label="点击或摇手机"
      >
        <div class="count-num">{{ myCount }}</div>
        <div class="count-unit">次</div>
      </div>

      <p class="shake-tip">使劲摇手机！也可点击圆球</p>

      <div class="rank-badge" v-if="myRank > 0">{{ rankText }}</div>

      <div v-if="needPermission" class="perm-wrap">
        <button class="btn-perm" @click="requestPermission">🔑 授权摇一摇</button>
      </div>
    </div>

    <!-- ══════════ 游戏结束 ══════════ -->
    <div v-else-if="phase === 'ended'" class="phase end-phase">
      <div class="confetti" aria-hidden="true">
        <span v-for="i in 20" :key="i" :style="confettiStyle(i)">{{ confettiChar(i) }}</span>
      </div>

      <div class="logo big">🎉</div>
      <h1 class="end-title">游戏结束！</h1>
      <p class="end-name">{{ myName }}</p>

      <div class="result-box">
        <div class="result-count">{{ myCount }}<span>次</span></div>
        <div class="result-rank" v-if="myRank > 0">{{ rankText }}</div>
      </div>

      <p class="thanks">感谢参与，祝新人百年好合 ❤️</p>
    </div>
  </div>
</template>

<style scoped>
/* ─── 整体 ──────────────────────────────────────────────────────────────────── */
.shake-page {
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at 50% 20%, #2d0a3a 0%, #0d0a15 70%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

/* ─── 通用 phase ──────────────────────────────────────────────────────────── */
.phase {
  width: 100%;
  max-width: 420px;
  padding: 0 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
}

.logo {
  font-size: 3.5rem;
  animation: beat 1.4s ease-in-out infinite;
}
.logo.big { font-size: 5rem; }
@keyframes beat {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.12); }
}

.page-title {
  font-size: 2rem;
  font-weight: 800;
  background: linear-gradient(135deg, #ff9dc8, #ff3d7f, #ffd700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
}
.page-sub, .hint, .tip {
  color: #a78bfa;
  font-size: 0.95rem;
  text-align: center;
  letter-spacing: 0.1em;
}

/* ─── 名字输入 ────────────────────────────────────────────────────────────── */
.input-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 0.8rem;
}
.name-input {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 107, 157, 0.4);
  border-radius: 12px;
  padding: 0.9em 1.2em;
  color: #fff;
  font-size: 1.1rem;
  text-align: center;
  outline: none;
  width: 100%;
  transition: border-color 0.2s;
}
.name-input::placeholder { color: #7c6a8a; }
.name-input:focus { border-color: #ff3d7f; }

.btn-join {
  background: linear-gradient(135deg, #ff3d7f, #c71f7e);
  border: none;
  color: #fff;
  font-size: 1.15rem;
  font-weight: 700;
  padding: 0.8em 0;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(255, 61, 127, 0.45);
  transition: transform 0.15s, box-shadow 0.15s;
  width: 100%;
}
.btn-join:hover:not(:disabled) {
  transform: scale(1.03);
  box-shadow: 0 6px 28px rgba(255, 61, 127, 0.65);
}
.btn-join:disabled { opacity: 0.4; cursor: not-allowed; }

/* ─── 等待 ────────────────────────────────────────────────────────────────── */
.greeting {
  font-size: 1.4rem;
  font-weight: 700;
  color: #f0e6ff;
  text-align: center;
}
.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 61, 127, 0.2);
  border-top-color: #ff3d7f;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.perm-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.perm-tip { color: #9d7abf; font-size: 0.85rem; }
.btn-perm {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #e2d4ff;
  border-radius: 999px;
  padding: 0.55em 1.8em;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-perm:hover {
  background: rgba(255, 61, 127, 0.2);
  border-color: #ff3d7f;
}

/* ─── 游戏进行中 ──────────────────────────────────────────────────────────── */
.play-phase {
  gap: 1rem;
}

/* 倒计时条 */
.bar-wrap {
  width: 100%;
  height: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  overflow: hidden;
  position: relative;
}
.bar-inner {
  height: 100%;
  background: linear-gradient(90deg, #ff3d7f, #ffd700);
  border-radius: 5px;
  transition: width 0.95s linear;
}
.bar-label {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%) translateX(calc(100% + 8px));
  font-size: 0.8rem;
  color: #c4b5fd;
  white-space: nowrap;
}

/* 摇一摇球 */
.shake-ball {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ff6b9d, #b5177a);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow:
    0 0 0 12px rgba(255, 61, 127, 0.12),
    0 0 40px rgba(255, 61, 127, 0.4);
  user-select: none;
  transition: transform 0.1s;
  -webkit-tap-highlight-color: transparent;
}
.shake-ball:active { transform: scale(0.95); }
.shake-ball.shaking {
  animation: shake-pop 0.25s ease-out;
}
@keyframes shake-pop {
  0%   { transform: scale(1)    rotate(0deg); }
  40%  { transform: scale(1.18) rotate(-6deg); }
  70%  { transform: scale(1.12) rotate(4deg); }
  100% { transform: scale(1)    rotate(0deg); }
}

.count-num {
  font-size: 3.5rem;
  font-weight: 800;
  color: #fff;
  line-height: 1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.count-unit {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
}

.shake-tip {
  color: #9d7abf;
  font-size: 0.9rem;
  text-align: center;
}
.rank-badge {
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.4);
  color: #ffd700;
  border-radius: 999px;
  padding: 0.35em 1.4em;
  font-size: 1rem;
  font-weight: 600;
}

/* ─── 游戏结束 ────────────────────────────────────────────────────────────── */
.end-phase { position: relative; }

.confetti {
  position: absolute;
  inset: -20% -10%;
  pointer-events: none;
}
.confetti span {
  position: absolute;
  animation: confetti-fall linear infinite;
  font-size: 1.2rem;
}
@keyframes confetti-fall {
  0%   { transform: translateY(-10%) rotate(0deg);   opacity: 1; }
  100% { transform: translateY(110%) rotate(360deg); opacity: 0; }
}

.end-title {
  font-size: 2.2rem;
  font-weight: 800;
  background: linear-gradient(135deg, #ffd700, #ff9dc8, #ff3d7f);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
}
.end-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: #f0e6ff;
  text-align: center;
}
.result-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 20px;
  padding: 1.2rem 2.5rem;
}
.result-count {
  font-size: 3rem;
  font-weight: 800;
  color: #ffd700;
  line-height: 1;
}
.result-count span {
  font-size: 0.45em;
  color: #c4b5fd;
  font-weight: 400;
}
.result-rank {
  font-size: 1.2rem;
  font-weight: 600;
  color: #ffd700;
}
.thanks {
  color: #ff9dc8;
  font-size: 0.95rem;
  text-align: center;
  letter-spacing: 0.05em;
}
</style>
