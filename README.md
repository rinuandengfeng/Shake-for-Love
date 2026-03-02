# 💍 婚礼摇一摇 · Shake for Love

> 婚礼现场互动小游戏——宾客扫码摇手机，大屏实时显示排行榜，摇出幸福，分享喜悦。

---

## 功能特性

- **二维码入场**：大屏自动生成二维码，宾客微信扫码即可参与
- **实时排行榜**：基于 WebSocket，摇一次即时更新，大屏毫秒级刷新
- **倒计时模式**：支持 30 / 60 / 90 / 120 秒自定义时长，倒计时圆环动画
- **双端适配**：大屏（投影仪/电视）与手机端各自独立页面，布局分别优化
- **iOS 权限支持**：兼容 iOS 13+ DeviceMotionEvent 授权流程
- **点击备用**：无法使用传感器时可点击圆球替代摇动

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3 + TypeScript |
| 构建工具 | Vite 7 |
| 路由 | Vue Router 4 |
| 实时通信 | Socket.io 4（客户端 + 服务端） |
| 后端 | Node.js + Express 4 |
| 二维码 | qrcode |
| 运行服务端 TS | tsx |


---

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式

同时启动前端（Vite，端口 5173）与后端（Socket.io，端口 3000）：

```bash
npm run dev
```

- 大屏地址：`http://localhost:5173/`
- 手机地址：`http://<局域网 IP>:5173/shake`

> 开发模式下 Vite 自动将 `/socket.io` 请求代理到后端 3000 端口。

### 生产部署

```bash
# 1. 构建前端静态文件
npm run build

# 2. 启动服务（同时提供静态文件和 WebSocket）
npm run serve
```

服务启动后访问 `http://<服务器 IP>:3000`。

---

## 使用流程

```
主持人打开大屏页面
      │
      ▼
大屏显示二维码 + "开始游戏"按钮
      │
      ├─── 宾客微信扫码 ──► 输入姓名 ──► 等待开始
      │
主持人选择时长，点击「开始游戏」
      │
      ▼
倒计时开始，宾客疯狂摇手机
大屏实时展示 Top 10 排行榜
      │
      ▼
倒计时归零，游戏结束
大屏展示最终排名，手机显示个人成绩
      │
      ▼
主持人点击「重新开始」可再玩一轮
```

---

## 项目结构

```
shake-for-love/
├── server/
│   └── index.ts            # Express + Socket.io 后端
├── src/
│   ├── router/
│   │   └── index.ts        # Vue Router（/ 和 /shake）
│   ├── views/
│   │   ├── DisplayView.vue # 大屏展示页
│   │   └── ShakeView.vue   # 手机摇一摇页
│   ├── socket.ts           # Socket.io 客户端单例
│   ├── App.vue
│   ├── main.ts
│   └── style.css
├── index.html
├── vite.config.ts          # 开发代理配置
├── tsconfig.json
└── package.json
```

---

## 页面说明

### 大屏展示页 `/`

| 阶段 | 内容 |
|------|------|
| 等待 | 居中大二维码 + 已加入人数 + 倒计时选择 + 开始按钮 |
| 游戏中 | 全屏排行榜（🥇🥈🥉 前三名卡片 + 4~10 名列表）+ 倒计时圆环 |
| 结束 | 最终排名 + 「重新开始」按钮 |

### 手机端 `/shake`

| 阶段 | 内容 |
|------|------|
| 输入名字 | 姓名输入框 + 加入按钮 |
| 等待 | 提示等待 + iOS 授权按钮（如需要） |
| 游戏中 | 顶部倒计时进度条 + 大号计次圆球 + 当前排名 |
| 结束 | 个人总次数 + 最终排名 + 祝福语 |

---

## Socket 事件协议

### 服务端 → 客户端

| 事件 | 数据 | 说明 |
|------|------|------|
| `sync` | `{ state, countdown, countdownTotal }` | 连接时或状态变更时同步 |
| `tick` | `number` | 每秒倒计时值 |
| `leaderboard` | `{ entries, total }` | 排行榜更新 |
| `joined` | `{ name }` | 加入成功确认 |
| `myCount` | `number` | 个人摇一摇次数 |

### 客户端 → 服务端

| 事件 | 数据 | 说明 |
|------|------|------|
| `join` | `{ name }` | 加入游戏 |
| `shake` | — | 摇一次 |
| `startGame` | `{ duration }` | 管理员开始游戏 |
| `resetGame` | — | 管理员重置游戏 |

---

## 注意事项

- **局域网部署**：宾客手机与服务器须在同一网络，或服务器有公网 IP / 域名
- **iOS HTTPS**：若在 HTTPS 环境下部署，iOS 可自动获取传感器权限；HTTP 下需手动点击授权按钮
- **微信内置浏览器**：微信扫码后在内置浏览器打开，DeviceMotionEvent 无需额外权限（Android）

---

## npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动 Vite 开发服务器和 Node 后端 |
| `npm run dev:client` | 仅启动 Vite |
| `npm run dev:server` | 仅启动后端（tsx watch） |
| `npm run build` | 类型检查 + 构建前端到 dist/ |
| `npm run serve` | 生产模式启动服务端 |
