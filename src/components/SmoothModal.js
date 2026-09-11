// meat-management-fe/src/components/SmoothModal.js
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Animated,
} from 'react-native';

/**
 * Component SmoothModal:
 * - Tách riêng lớp nền (Overlay) và nội dung Modal:
 *   + Overlay: Sử dụng Modal riêng với animationType="fade" để tự động đen màn hình lại tại chỗ,
 *     tuyệt đối KHÔNG di chuyển từ dưới lên.
 *   + Modal: Giữ nguyên 100% giao diện và animation gốc (slide / fade) của nội dung modal.
 * - Quản lý z-index lũy kế cho từng modal mở ra trên Web:
 *   + Lớp nền (Overlay) luôn có z-index = targetZ - 1.
 *   + Giao diện nội dung modal luôn có z-index = targetZ (cao hơn lớp nền để không bị đè).
 *   + Khi có nhiều modal chồng lên nhau, modal sau có z-index lũy kế cao hơn modal trước.
 */
let currentGlobalTopZ = 10000;
let activeModalStack = [];
let modalIdCounter = 0;

// Helper lấy phần tử DOM thực tế từ ref hoặc component
const getDomElement = (target) => {
  if (!target) return null;
  if (typeof target.nodeType === 'number') return target;
  if (target._reactInternals?.stateNode && typeof target._reactInternals.stateNode.nodeType === 'number') {
    return target._reactInternals.stateNode;
  }
  return null;
};

const SmoothModal = ({ visible, onClose, children, isToast, centered, animationType, zIndex }) => {
  // Animation trượt từ phải vào / ra cho Toast (translateX: 400 → 0 → 400)
  const slideX = useRef(new Animated.Value(400)).current;

  // State nội bộ để giữ Modal hiển thị trong suốt exit animation
  const [toastInternalVisible, setToastInternalVisible] = useState(false);

  const backdropModalRef = useRef(null);
  const backdropNodeRef = useRef(null);
  const contentModalRef = useRef(null);
  const contentBackdropClickRef = useRef(null);
  const toastAnimRef = useRef(null);

  // Định danh duy nhất cho từng instance của Modal để quản lý stack z-index
  const modalIdRef = useRef(null);
  if (modalIdRef.current === null) {
    modalIdRef.current = ++modalIdCounter;
  }
  const modalId = modalIdRef.current;
  const assignedZRef = useRef(null);

  const isVisible = isToast ? toastInternalVisible : visible;

  // Cấp phát z-index lũy kế tăng dần mỗi khi modal mở ra
  if (isVisible && assignedZRef.current === null) {
    const baseZ = Math.max(currentGlobalTopZ, (zIndex || 0));
    currentGlobalTopZ = baseZ + 100;
    assignedZRef.current = currentGlobalTopZ;
  } else if (!isVisible && assignedZRef.current !== null) {
    assignedZRef.current = null;
  }

  // Đồng bộ tầng hiển thị zIndex cho Modal trên Web (lớp nền targetZ - 1, nội dung targetZ)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    if (isVisible) {
      if (!activeModalStack.includes(modalId)) {
        activeModalStack.push(modalId);
      }
    } else {
      activeModalStack = activeModalStack.filter((id) => id !== modalId);
      if (activeModalStack.length === 0) {
        currentGlobalTopZ = 10000; // Reset khi đóng hết toàn bộ modals
      }
      return;
    }

    // Thiết lập zIndex cho portal container của Modal trên Web
    const applyPortalZ = (target, zVal) => {
      const elNode = getDomElement(target);
      if (!elNode) return;
      let el = elNode;
      // Đi ngược lên cho đến khi gặp phần tử con trực tiếp của document.body (chính là portal container của modal)
      while (el && el.parentElement && el.parentElement !== document.body) {
        el = el.parentElement;
      }
      if (el && el.parentElement === document.body) {
        el.style.zIndex = String(zVal);
        if (el.firstElementChild) {
          el.firstElementChild.style.zIndex = String(zVal);
        }
      }
    };

    const targetZ = assignedZRef.current || (zIndex ? zIndex + 100 : (10000 + activeModalStack.indexOf(modalId) * 100));

    const updateZ = () => {
      // 1. Áp dụng z-index cho lớp nền Overlay (targetZ - 1)
      const backdropEl = backdropNodeRef.current || backdropModalRef.current;
      applyPortalZ(backdropEl, targetZ - 1);

      // 2. Áp dụng z-index cho nội dung Modal (targetZ, cao hơn lớp nền để không bị đè)
      const contentEl = contentBackdropClickRef.current || contentModalRef.current || toastAnimRef.current;
      applyPortalZ(contentEl, targetZ);
    };

    updateZ();
    const t1 = setTimeout(updateZ, 0);
    const t2 = setTimeout(updateZ, 30);
    const t3 = setTimeout(updateZ, 100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      activeModalStack = activeModalStack.filter((id) => id !== modalId);
      if (activeModalStack.length === 0) {
        currentGlobalTopZ = 10000;
      }
    };
  }, [isVisible, modalId, zIndex]);

  // Xử lý animation cho Toast
  useEffect(() => {
    if (!isToast) return;

    if (visible) {
      setToastInternalVisible(true);
      slideX.setValue(400);
      Animated.spring(slideX, {
        toValue: 0,
        useNativeDriver: Platform.OS !== 'web',
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideX, {
        toValue: 400,
        duration: 280,
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => {
        setToastInternalVisible(false);
      });
    }
  }, [visible, isToast]);

  const resolvedAnimationType = animationType || (isToast ? 'none' : centered ? 'fade' : 'slide');

  return (
    <>
      {/* MODAL 1: LỚP NỀN OVERLAY - Tự động đen màn hình lại tại chỗ (fade), TUYỆT ĐỐI KHÔNG DI CHUYỂN TỪ DƯỚI LÊN */}
      {!isToast && (
        <Modal
          ref={backdropModalRef}
          transparent={true}
          visible={visible}
          animationType="fade"
          onRequestClose={onClose}
        >
          <TouchableOpacity
            ref={backdropNodeRef}
            style={styles.backdropFill}
            activeOpacity={1}
            onPress={onClose}
          />
        </Modal>
      )}

      {/* MODAL 2: NỘI DUNG MODAL - Giữ nguyên 100% giao diện và animation gốc */}
      <Modal
        ref={contentModalRef}
        transparent={true}
        visible={isToast ? toastInternalVisible : visible}
        animationType={resolvedAnimationType}
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[
            styles.centeredView,
            centered && styles.centeredViewCenter,
            isToast && styles.centeredViewToast,
          ]}
          pointerEvents="box-none"
        >
          {/* Lớp nền trong suốt click ngoài để đóng */}
          {!isToast && (
            <TouchableOpacity
              ref={contentBackdropClickRef}
              style={styles.backdropClick}
              activeOpacity={1}
              onPress={onClose}
            />
          )}

          {/* Nội dung modal giữ nguyên nguyên bản 100%, không can thiệp giao diện */}
          {isToast ? (
            <Animated.View ref={toastAnimRef} style={{ transform: [{ translateX: slideX }] }}>
              {children}
            </Animated.View>
          ) : (
            children
          )}
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // Nền tối phủ kín màn hình - tự động mờ đen màn hình lại tại chỗ, không di chuyển
  backdropFill: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  // Vùng chứa nội dung modal giữ nguyên 100% như gốc
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  // Căn giữa màn hình cho Popup/Dialog
  centeredViewCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  // Toast ở góc trên bên phải
  centeredViewToast: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    pointerEvents: 'box-none',
  },
  // Lớp trong suốt hứng click ngoài của Modal 2
  backdropClick: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});

export default SmoothModal;
