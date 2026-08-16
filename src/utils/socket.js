// meat-management-fe/src/utils/socket.js
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const API_HOST = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3000';

// Phân biệt môi trường local và production để chọn transport phù hợp
const isLocal = API_HOST.includes('localhost') || API_HOST.includes('127.0.0.1');

let socket = null;
let currentRoomWorkspaceId = null;

// Khởi tạo và kết nối Socket.IO
export const getSocket = () => {
  if (!socket) {
    console.log('[SOCKET] Initializing Socket.IO connection to:', API_HOST);
    socket = io(API_HOST, {
      // Local: polling+websocket. Production: polling trước để HTTP handshake thành công, sau đó Socket.IO tự upgrade lên websocket
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      console.log('[SOCKET] Connected to server successfully, socket ID:', socket.id);
      
      // Tự động lấy workspaceId hiện tại từ authStore để tham gia lại room khi connect/reconnect
      const user = useAuthStore.getState().user;
      const workspaceId = user?.workspaceMember?.workspace?.ownerId || user?.id;
      
      if (workspaceId) {
        currentRoomWorkspaceId = workspaceId;
        socket.emit('join_workspace', workspaceId);
        console.log('[SOCKET] Auto-joined workspace room on connect/reconnect:', workspaceId);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[SOCKET] Connection error:', error.message || error);
    });

    socket.on('disconnect', (reason) => {
      console.log('[SOCKET] Disconnected from server, reason:', reason);
    });
  }
  return socket;
};

// Đăng ký tham gia room Workspace của cửa hàng
export const joinWorkspaceRoom = (workspaceId) => {
  const s = getSocket();
  if (s && workspaceId) {
    currentRoomWorkspaceId = workspaceId; // Lưu lại để dùng khi reconnect
    if (s.connected) {
      s.emit('join_workspace', workspaceId);
      console.log('[SOCKET] Joined workspace room:', workspaceId);
    }
  }
};

// Rời khỏi room Workspace
export const leaveWorkspaceRoom = (workspaceId) => {
  const s = getSocket();
  currentRoomWorkspaceId = null;
  if (s && workspaceId && s.connected) {
    s.emit('leave_workspace', workspaceId);
    console.log('[SOCKET] Left workspace room:', workspaceId);
  }
};
