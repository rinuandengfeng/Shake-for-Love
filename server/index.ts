import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

// ─── 数据结构 ───────────────────────────────────────────────────────────────

interface User {
  id: string
  name: string
  count: number
}

type GameState = 'waiting' | 'playing' | 'ended'

const users = new Map<string, User>()
let gameState: GameState = 'waiting'
let countdown = 60
let countdownTotal = 60
let timer: ReturnType<typeof setInterval> | null = null

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function getLeaderboard() {
  return [...users.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((u, i) => ({ rank: i + 1, name: u.name, count: u.count }))
}

function broadcast() {
  io.emit('leaderboard', {
    entries: getLeaderboard(),
    total: users.size,
  })
}

// ─── Socket.io 事件 ──────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  // 新连接时同步当前状态
  socket.emit('sync', { state: gameState, countdown, countdownTotal })
  socket.emit('leaderboard', { entries: getLeaderboard(), total: users.size })

  // 用户加入
  socket.on('join', ({ name }: { name: string }) => {
    const trimmed = String(name).trim().slice(0, 12)
    const cleanName = trimmed || `访客${users.size + 1}`
    users.set(socket.id, { id: socket.id, name: cleanName, count: 0 })
    socket.emit('joined', { name: cleanName })
    broadcast()
  })

  // 用户摇一摇
  socket.on('shake', () => {
    const user = users.get(socket.id)
    if (user && gameState === 'playing') {
      user.count++
      socket.emit('myCount', user.count)
      broadcast()
    }
  })

  // 管理员：开始游戏
  socket.on('startGame', ({ duration }: { duration: number }) => {
    if (timer) clearInterval(timer)
    users.forEach((u) => { u.count = 0 })
    gameState = 'playing'
    countdown = duration
    countdownTotal = duration
    io.emit('sync', { state: gameState, countdown, countdownTotal })
    broadcast()

    timer = setInterval(() => {
      countdown--
      io.emit('tick', countdown)
      if (countdown <= 0) {
        clearInterval(timer!)
        timer = null
        gameState = 'ended'
        io.emit('sync', { state: gameState, countdown: 0, countdownTotal })
        broadcast()
      }
    }, 1000)
  })

  // 管理员：重置游戏
  socket.on('resetGame', () => {
    if (timer) { clearInterval(timer); timer = null }
    gameState = 'waiting'
    users.clear()
    countdown = 60
    countdownTotal = 60
    io.emit('sync', { state: gameState, countdown, countdownTotal })
    io.emit('leaderboard', { entries: [], total: 0 })
  })

  // 断开连接
  socket.on('disconnect', () => {
    if (gameState === 'waiting') {
      users.delete(socket.id)
      broadcast()
    }
    // 游戏进行中/结束后保留数据，维持排行榜稳定
  })
})

// ─── 生产环境静态文件 ─────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '../dist')))
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

// ─── 启动 ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 服务器已启动：http://0.0.0.0:${PORT}`)
  console.log(`   大屏地址：http://localhost:${PORT}/`)
  console.log(`   手机地址：http://<局域网IP>:${PORT}/shake`)
})
