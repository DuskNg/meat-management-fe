// meat-management-fe/src/components/SmoothModal.js
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  View,
} from 'react-native';

/**
 * Component SmoothModal giải quyết vấn đề backdrop trượt theo popup:
 * - Sử dụng 2 Modals song song chạy đồng thời.
 * - Modal 1 (fade): Hiển thị lớp nền tối tĩnh, từ từ mờ dần/rõ dần (fade in/out).
 * - Modal 2 (slide): Chứa nội dung chính của pop-up.
 *   + Với dialog (isToast=false): trượt lên từ dưới (animationType="slide" mặc định).
 *   + Với toast (isToast=true): trượt vào từ phải và trượt ra phải bằng Animated.translateX.
 */
const SmoothModal = ({ visible, onClose, children, isToast }) => {
  // Animation trượt từ phải vào / ra cho Toast (translateX: 400 → 0 → 400)
  const slideX = useRef(new Animated.Value(400)).current;

  // State nội bộ để giữ Modal hiển thị trong suốt exit animation
  const [toastInternalVisible, setToastInternalVisible] = useState(false);

  useEffect(() => {
    if (!isToast) return;

    if (visible) {
      // Hiển thị Modal ngay, sau đó chạy animation trượt vào từ phải
      setToastInternalVisible(true);
      slideX.setValue(400);
      Animated.spring(slideX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      // Chạy animation trượt ra sang phải, sau đó ẩn Modal
      Animated.timing(slideX, {
        toValue: 400,
        duration: 280,
        useNativeDriver: true,
      }).start(() => {
        setToastInternalVisible(false);
      });
    }
  }, [visible, isToast]);

  return (
    <>
      {/* Modal 1: Hiển thị lớp nền tối tĩnh mờ dần / rõ dần (chỉ hiển thị nếu KHÔNG phải dạng Toast) */}
      {!isToast && (
        <Modal
          transparent={true}
          visible={visible}
          animationType="fade"
          onRequestClose={onClose}
        >
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={styles.backdropFill} />
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Modal 2: Hiển thị nội dung chính */}
      <Modal
        transparent={true}
        // Toast dùng internalVisible để giữ Modal sống trong suốt exit animation
        visible={isToast ? toastInternalVisible : visible}
        // Toast dùng animationType="none" để tự kiểm soát animation translateX
        // Dialog dùng animationType="slide" để trượt từ dưới lên như cũ
        animationType={isToast ? 'none' : 'slide'}
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.centeredView, isToast && styles.centeredViewToast]}
          pointerEvents="box-none"
        >
          {/* Lớp nền trong suốt click ngoài để đóng (chỉ cho dialog) */}
          {!isToast && (
            <TouchableOpacity
              style={styles.backdropClick}
              activeOpacity={1}
              onPress={onClose}
              pointerEvents="box-only"
            />
          )}

          {/* Toast: bọc trong Animated.View trượt từ phải vào và ra phải */}
          {isToast ? (
            <Animated.View style={{ transform: [{ translateX: slideX }] }}>
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
  backdropFill: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)', // Nền tối làm mờ màn hình sau
  },
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent', // Nền trong suốt để không trượt theo popup
  },
  // Toast hiển thị ở góc trên bên phải màn hình
  centeredViewToast: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    pointerEvents: 'box-none',
  },
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
