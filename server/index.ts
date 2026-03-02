// 引入 Express 框架，用于创建 HTTP 服务和处理路由
import express from 'express'
// 引入 Node.js 内置 http 模块，创建底层 HTTP 服务器（Socket.io 需要共用该实例）
import { createServer } from 'http'
// 引入 Socket.io 服务端类，实现 WebSocket 实时双向通信
import { Server } from 'socket.io'
// 引入 fileURLToPath，将 ESM 的 import.meta.url 转换为本地文件路径字符串
import { fileURLToPath } from 'url'
import path from 'path'

import type { User } from './model/types'
import type { GameState } from './const/cons'

// 获取当前文件所在目录的绝对路径（ESM 模块中没有 __dirname，需手动构造）
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 创建 Express 应用实例
const app = express()
// 基于 Express app 创建 HTTP 服务器，后续 Socket.io 挂载在同一端口上
const httpServer = createServer(app)

// 创建 Socket.io 服务实例，挂载到 HTTP 服务器，并开放跨域访问
const io = new Server(httpServer, {
  // 允许所有来源的 GET/POST 请求（局域网扫码场景无需限制来源）
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

// 用 Map 存储所有已加入的用户，key 为 socket.id，value 为用户对象
const users = new Map<string, User>()


let gameState: GameState = 'waiting' // 当前游戏状态，初始为等待阶段
let countdown = 60 // 当前剩余倒计时秒数
let countdownTotal = 60 // 本轮游戏设定的总秒数（供前端计算倒计时进度百分比）
let timer: ReturnType<typeof setInterval> | null = null // 倒计时定时器的引用，null 表示当前没有运行中的定时器


// 从 users Map 中提取排行榜：按摇次降序，取前 10 名，附加名次字段
function getLeaderboard() {
  return [...users.values()]                                          // Map 转数组
    .sort((a, b) => b.count - a.count)                              // 摇次从高到低排序
    .slice(0, 10)                                                    // 只保留前 10 名
    .map((u, i) => ({ rank: i + 1, name: u.name, count: u.count })) // 附加名次编号
}

// 向所有已连接的客户端广播最新排行榜数据和当前总参与人数
function broadcast() {
  io.emit('leaderboard', {
    entries: getLeaderboard(), // 前 10 名排行榜列表
    total: users.size,         // 当前已加入的总人数
  })
}


// 监听每个新客户端的 WebSocket 连接
io.on('connection', (socket) => {
  // 新客户端连接后立即同步当前游戏状态，避免页面刷新后状态丢失
  socket.emit('sync', { state: gameState, countdown, countdownTotal })
  // 同时推送当前排行榜，让新连接的客户端能立刻看到已有数据
  socket.emit('leaderboard', { entries: getLeaderboard(), total: users.size })

  // 监听用户加入事件（手机端输入姓名后触发）
  socket.on('join', ({ name }: { name: string }) => {
    // 去除首尾空格并限制最长 12 个字符，防止过长姓名撑破界面
    const trimmed = String(name).trim().slice(0, 12)
    // 若未填写姓名则自动分配"访客N"作为显示名
    const cleanName = trimmed || `访客${users.size + 1}`
    // 将用户注册到 Map 中，初始摇次为 0
    users.set(socket.id, { id: socket.id, name: cleanName, count: 0 })
    // 通知该客户端加入成功，并返回最终使用的姓名
    socket.emit('joined', { name: cleanName })
    // 广播更新后的排行榜和总人数给所有端
    broadcast()
  })

  // 监听摇一摇事件（手机端每摇动一次发送一次）
  socket.on('shake', () => {
    // 根据 socket.id 找到对应用户
    const user = users.get(socket.id)
    // 只有用户存在且游戏正在进行中才计数
    if (user && gameState === 'playing') {
      user.count++                        // 该用户摇次加一
      socket.emit('myCount', user.count)  // 将最新摇次单独推送给本人
      broadcast()                         // 广播排行榜变化给所有人
    }
  })

  // 监听开始游戏事件（由大屏管理员点击"开始游戏"触发）
  socket.on('startGame', ({ duration }: { duration: number }) => {
    // 若有残留定时器先清除，防止重复计时
    if (timer) clearInterval(timer)
    // 将所有用户摇次清零，开始新一轮计数
    users.forEach((u) => { u.count = 0 })
    // 切换游戏状态为进行中
    gameState = 'playing'
    // 设置本轮倒计时秒数（由前端传入，如 30/60/90/120）
    countdown = duration
    // 记录总秒数，供前端绘制进度环/进度条
    countdownTotal = duration
    // 向所有客户端广播游戏开始及倒计时信息
    io.emit('sync', { state: gameState, countdown, countdownTotal })
    // 广播清零后的排行榜
    broadcast()

    // 启动每秒执行一次的倒计时定时器
    timer = setInterval(() => {
      countdown--                          // 每秒减一
      io.emit('tick', countdown)           // 向所有客户端推送当前剩余秒数
      if (countdown <= 0) {               // 倒计时归零，游戏结束
        clearInterval(timer!)             // 停止定时器
        timer = null                      // 清空引用，标记无活跃定时器
        gameState = 'ended'               // 切换游戏状态为已结束
        // 广播游戏结束状态
        io.emit('sync', { state: gameState, countdown: 0, countdownTotal })
        // 广播最终排行榜
        broadcast()
      }
    }, 1000) // 间隔 1000ms = 1 秒
  })

  // 监听重置游戏事件（由大屏管理员点击"重新开始"触发）
  socket.on('resetGame', () => {
    // 停止并清除正在运行的倒计时定时器
    if (timer) { clearInterval(timer); timer = null }
    // 将游戏状态重置回等待阶段
    gameState = 'waiting'
    // 清空所有用户数据，下一轮需重新扫码加入
    users.clear()
    // 恢复默认倒计时秒数
    countdown = 60
    // 恢复默认总秒数
    countdownTotal = 60
    // 广播重置后的游戏状态
    io.emit('sync', { state: gameState, countdown, countdownTotal })
    // 广播空排行榜，清空所有端的显示
    io.emit('leaderboard', { entries: [], total: 0 })
  })

  // 监听客户端断开连接事件（关闭页面、网络中断等）
  socket.on('disconnect', () => {
    // 仅在等待阶段移除用户，保持人数统计准确
    if (gameState === 'waiting') {
      users.delete(socket.id) // 从 Map 中删除该用户
      broadcast()             // 广播更新后的人数
    }
    // 游戏进行中或结束后断开，保留其数据以维持排行榜稳定，不影响最终结果
  })
})

// ─── 生产环境静态文件 ─────────────────────────────────────────────────────────

// 将 Vue 构建产物 dist 目录作为静态资源目录对外提供
app.use(express.static(path.join(__dirname, '../dist')))
// 所有未匹配到静态文件的路径均返回 index.html，交由 Vue Router 处理前端路由
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

// ─── 启动 ────────────────────────────────────────────────────────────────────

// 读取环境变量中的端口号，未设置则默认使用 3000
const PORT = Number(process.env.PORT) || 3000
// 本机局域网 IP 地址，绑定后只监听该网卡的连接
const HOST = '192.168.0.103'
// 启动 HTTP 服务器，监听指定 IP 和端口
httpServer.listen(PORT, HOST, () => {
  console.log(`✅ 服务器已启动`)
  // 大屏（投影仪/电脑）打开此地址展示排行榜和二维码
  console.log(`   大屏地址：http://${HOST}:${PORT}/`)
  // 手机扫描大屏二维码后访问此地址参与摇一摇
  console.log(`   手机地址：http://${HOST}:${PORT}/shake`)
})
