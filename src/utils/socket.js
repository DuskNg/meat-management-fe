// meat-management-fe/src/utils/socket.js
import { io } from 'socket.io-client';

const API_HOST = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3000';

let socket = null;

// Khởi tạo và kết nối Socket.IO
export const getSocket = () => {
  if (!socket) {
    socket = io(API_HOST, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
  }
  return socket;
};

// Đăng ký tham gia room Workspace của cửa hàng
export const joinWorkspaceRoom = (workspaceId) => {
  const s = getSocket();
  if (s && workspaceId) {
    if (s.connected) {
      s.emit('join_workspace', workspaceId);
    } else {
      s.once('connect', () => {
        s.emit('join_workspace', workspaceId);
      });
    }
  }
};

// Rời khỏi room Workspace
export const leaveWorkspaceRoom = (workspaceId) => {
  const s = getSocket();
  if (s && workspaceId && s.connected) {
    s.emit('leave_workspace', workspaceId);
  }
};
