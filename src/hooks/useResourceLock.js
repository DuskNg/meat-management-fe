// meat-management-fe/src/hooks/useResourceLock.js
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useLockStore } from '../store/lockStore';
import { lockResource, unlockResource } from '../utils/socket';

/**
 * Hook tự động khóa một đối tượng khi component mount và giải phóng khi unmount.
 * Dùng trong các modal component để báo hiệu người dùng đang thao tác với đối tượng đó.
 *
 * @param {string} type - Loại đối tượng: 'INVENTORY_PRODUCT' | 'TABLE' | 'CUSTOMER'
 * @param {string|null} resourceId - ID của đối tượng đang được thao tác (null = chưa có đối tượng)
 * @param {boolean} active - true = đang mở (lock), false = đã đóng (không lock)
 * @returns {{ activeLock: object|null }} - Thông tin lock hiện tại của đối tượng (nếu do người KHÁC giữ)
 */
export const useResourceLock = (type, resourceId, active = true) => {
  const user = useAuthStore((s) => s.user);
  const getLock = useLockStore((s) => s.getLock);

  useEffect(() => {
    // Chỉ lock khi có đủ thông tin và đang ở trạng thái active
    if (!active || !type || !resourceId) return;

    // Gửi sự kiện lock lên server
    lockResource(type, resourceId);

    // Cleanup: unlock khi modal đóng hoặc component unmount
    return () => {
      unlockResource(type, resourceId);
    };
  }, [type, resourceId, active]);

  // Trả về thông tin lock hiện tại — null nếu không bị ai khóa hoặc chính mình đang khóa
  const currentLock = getLock(type, resourceId);
  const isLockedByOther = currentLock && currentLock.userId !== user?.id;

  return {
    activeLock: isLockedByOther ? currentLock : null,
  };
};
