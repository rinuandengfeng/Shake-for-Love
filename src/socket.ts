import { io } from 'socket.io-client'

// 连接当前 origin（开发时 Vite 代理 /socket.io → localhost:3000）
export const socket = io()
