// meat-management-fe/src/hooks/useResourceLock.js
import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useLockStore } from '../store/lockStore';
import { lockResource, unlockResource, getSocket } from '../utils/socket';

// Lưu thời điểm tương tác cuối cùng của người dùng (dùng chung toàn app)
let lastActivityTime = Date.now();

// Hàm ghi nhận hoạt động của người dùng (được gọi từ Root Layout hoặc web event listener)
export const recordUserActivity = () => {
  lastActivityTime = Date.now();
};

// Đăng ký các sự kiện Web (chuột, bàn phím) để cập nhật lastActivityTime trên trình duyệt.
// onTouchStart trong React Native View không hoạt động trên Web.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach((event) => {
    document.addEventListener(event, recordUserActivity, { passive: true });
  });
}

/**
 * Hook tự động khóa một đối tượng khi component mount và giải phóng khi unmount.
 * Dùng trong các modal component để báo hiệu người dùng đang thao tác với đối tượng đó.
 *
 * @param {string} type - Loại đối tượng: 'INVENTORY_PRODUCT' | 'TABLE' | 'CUSTOMER'
 * @param {string|null} resourceId - ID của đối tượng đang được thao tác (null = chưa có đối tượng)
 * @param {boolean} active - true = đang mở (lock), false = đã đóng (không lock)
 * @param {function|null} onIdleTimeout - Callback gọi khi phiên làm việc bị hết hạn/rảnh để tự đóng modal/màn hình
 * @returns {{ activeLock: object|null }} - Thông tin lock hiện tại của đối tượng (nếu do người KHÁC giữ)
 */
export const useResourceLock = (type, resourceId, active = true, onIdleTimeout = null) => {
  const user = useAuthStore((s) => s.user);
  const getLock = useLockStore((s) => s.getLock);

  // Dùng ref để lưu callback mới nhất — tránh re-trigger useEffect khi function reference thay đổi mỗi lần render
  const onIdleTimeoutRef = useRef(onIdleTimeout);
  useEffect(() => {
    onIdleTimeoutRef.current = onIdleTimeout;
  }, [onIdleTimeout]);

  useEffect(() => {
    // Chỉ lock khi có đủ thông tin và đang ở trạng thái active
    if (!active || !type || !resourceId) return;

    // Reset lại thời gian hoạt động ngay khi mở/lock resource
    recordUserActivity();

    // Gửi sự kiện lock lên server
    lockResource(type, resourceId);

    const socket = getSocket();

    // Flag để track trạng thái: true = server đã thu hồi lock (timeout), không cần gọi unlockResource nữa
    let timedOutByServer = false;

    // Lắng nghe sự kiện timeout từ server
    const handleLockChanged = ({ action, lockInfo }) => {
      if (
        action === 'TIMEOUT_UNLOCKED' &&
        lockInfo.type === type &&
        lockInfo.resourceId?.toString() === resourceId?.toString() &&
        lockInfo.userId === user?.id
      ) {
        console.log(`[SOCKET_TIMEOUT] Khóa tài nguyên ${type}:${resourceId} bị thu hồi do hết hạn.`);
        // Đánh dấu server đã tự giải phóng — cleanup không cần gọi unlockResource thêm
        timedOutByServer = true;

        if (onIdleTimeoutRef.current) {
          onIdleTimeoutRef.current();
          Alert.alert(
            'Hết thời gian chờ',
            'Hệ thống đã tự động mở khóa tài nguyên do bạn đã giữ khóa quá thời gian tối đa (3 phút).'
          );
        }
      }
    };

    if (socket) {
      socket.on('RESOURCE_LOCK_CHANGED', handleLockChanged);
    }

    // Kiểm tra trạng thái rảnh ở client (mỗi 5 giây, ngưỡng 30 giây không tương tác)
    const checkInterval = setInterval(() => {
      const idleTime = Date.now() - lastActivityTime;
      if (idleTime >= 30000) {
        console.log(`[CLIENT_IDLE] Người dùng không tương tác trong 30 giây.`);
        clearInterval(checkInterval);

        if (onIdleTimeoutRef.current) {
          onIdleTimeoutRef.current();
          Alert.alert(
            'Hết thời gian chờ',
            'Phiên chỉnh sửa tự động đóng do bạn không tương tác trong 30 giây.'
          );
        }
      }
    }, 5000); // Kiểm tra mỗi 5 giây (giảm từ 2 giây để nhẹ hơn)

    // Cleanup: unlock khi modal đóng hoặc component unmount
    return () => {
      clearInterval(checkInterval);
      if (socket) {
        socket.off('RESOURCE_LOCK_CHANGED', handleLockChanged);
      }
      // Chỉ gọi unlockResource nếu server chưa tự thu hồi lock
      if (!timedOutByServer) {
        unlockResource(type, resourceId);
      }
    };
  // Loại bỏ onIdleTimeout khỏi dependency array — dùng ref thay thế để tránh spam lock/unlock
  }, [type, resourceId, active, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trả về thông tin lock hiện tại — null nếu không bị ai khóa hoặc chính mình đang khóa
  const currentLock = getLock(type, resourceId);
  const isLockedByOther = currentLock && currentLock.userId !== user?.id;

  return {
    activeLock: isLockedByOther ? currentLock : null,
  };
};
