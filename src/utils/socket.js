// meat-management-fe/src/utils/socket.js
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { Alert } from 'react-native';

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

    // Lắng nghe sự kiện cập nhật quyền realtime từ chủ Workspace
    socket.on('MEMBER_PERMISSIONS_UPDATED', ({ memberId, permissions, kicked }) => {
      const currentUser = useAuthStore.getState().user;
      if (currentUser && currentUser.id === memberId) {
        console.log('[SOCKET] Nhận thông báo cập nhật quyền từ server:', permissions);

        if (kicked) {
          // Reset toàn bộ quyền và trạng thái thành viên workspace
          const resetPermissions = {
            canManageCustomers: false,
            canManageDebt: false,
            canManageBadDebt: false,
            canManageEmployees: false,
            canManageStore: false,
            canManageInventory: false,
            canManageShop: false,
          };
          useAuthStore.getState().updateUser({
            ...resetPermissions,
            permissions: resetPermissions,
            workspaceMember: null,
          });
          Alert.alert('Workspace', 'Tài khoản của bạn đã bị loại khỏi Workspace.');
          return;
        }

        const newPermissions = {
          canManageCustomers: permissions.canManageCustomers,
          canManageDebt: permissions.canManageDebt,
          canManageBadDebt: permissions.canManageBadDebt,
          canManageEmployees: permissions.canManageEmployees,
          canManageStore: permissions.canManageStore,
          canManageInventory: permissions.canManageInventory,
          canManageShop: permissions.canManageShop,
        };

        const updatedWorkspaceMember = currentUser.workspaceMember ? {
          ...currentUser.workspaceMember,
          canManageCustomers: permissions.canManageCustomers,
          canManageDebt: permissions.canManageDebt,
          canManageBadDebt: permissions.canManageBadDebt,
          canManageEmployees: permissions.canManageEmployees,
          canManageStore: permissions.canManageStore,
          canManageInventory: permissions.canManageInventory,
          canManageShop: permissions.canManageShop,
        } : null;

        useAuthStore.getState().updateUser({
          ...newPermissions,
          permissions: newPermissions,
          workspaceMember: updatedWorkspaceMember,
        });

        Alert.alert('Cập nhật quyền', 'Quyền hạn tài khoản của bạn đã được chủ Workspace thay đổi.');
      }
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

// Gửi yêu cầu khóa đối tượng khi người dùng bắt đầu thao tác (mở modal)
export const lockResource = (type, resourceId) => {
  const s = getSocket();
  const user = useAuthStore.getState().user;
  const workspaceId = user?.workspaceMember?.workspace?.ownerId || user?.id;

  if (s && s.connected && type && resourceId && workspaceId && user) {
    const userName = user.name || user.fullName || user.phone || 'Người dùng';
    s.emit('lock_resource', {
      type,
      resourceId,
      workspaceId,
      userId: user.id,
      userName,
    });
    console.log(`[SOCKET] Locked resource: ${type}:${resourceId}`);
  }
};

// Gửi yêu cầu giải phóng khóa khi người dùng kết thúc thao tác (đóng modal)
export const unlockResource = (type, resourceId) => {
  const s = getSocket();
  const user = useAuthStore.getState().user;
  const workspaceId = user?.workspaceMember?.workspace?.ownerId || user?.id;

  if (s && type && resourceId && workspaceId) {
    s.emit('unlock_resource', {
      type,
      resourceId,
      workspaceId,
    });
    console.log(`[SOCKET] Unlocked resource: ${type}:${resourceId}`);
  }
};
