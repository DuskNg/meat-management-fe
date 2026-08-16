// meat-management-fe/src/store/lockStore.js
import { create } from 'zustand';

// Store lưu danh sách tất cả resource đang bị khóa trong workspace hiện tại
// Key của mỗi lock: `${type}_${resourceId}` (ví dụ: "INVENTORY_PRODUCT_abc123")
export const useLockStore = create((set, get) => ({
  // Map<lockKey, lockInfo>
  locks: {},

  // Thêm hoặc cập nhật một lock
  setLock: (type, resourceId, lockInfo) => {
    const key = `${type}_${resourceId}`;
    set((state) => ({
      locks: { ...state.locks, [key]: lockInfo },
    }));
  },

  // Xóa một lock khi được giải phóng
  removeLock: (type, resourceId) => {
    const key = `${type}_${resourceId}`;
    set((state) => {
      const newLocks = { ...state.locks };
      delete newLocks[key];
      return { locks: newLocks };
    });
  },

  // Lấy thông tin lock của một đối tượng cụ thể (null nếu không bị khóa)
  getLock: (type, resourceId) => {
    const key = `${type}_${resourceId}`;
    return get().locks[key] || null;
  },

  // Đồng bộ toàn bộ danh sách lock khi mới kết nối socket
  syncLocks: (locksList) => {
    const newLocks = {};
    for (const lockInfo of locksList) {
      const key = `${lockInfo.type}_${lockInfo.resourceId}`;
      newLocks[key] = lockInfo;
    }
    set({ locks: newLocks });
  },

  // Xóa tất cả locks (dùng khi đăng xuất hoặc rời workspace)
  clearAllLocks: () => set({ locks: {} }),
}));
