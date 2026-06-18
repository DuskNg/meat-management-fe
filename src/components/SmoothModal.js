// meat-management-fe/src/components/SmoothModal.js
import React from 'react';
import {
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

/**
 * Component SmoothModal giải quyết vấn đề backdrop trượt theo popup:
 * - Sử dụng 2 Modals song song chạy đồng thời.
 * - Modal 1 (fade): Hiển thị lớp nền tối tĩnh, từ từ mờ dần/rõ dần (fade in/out).
 * - Modal 2 (slide): Chứa nội dung chính của pop-up trượt lên/xuống (slide up/down)
 *   và xử lý đẩy bàn phím (KeyboardAvoidingView) mà không làm lệch kích thước.
 */
const SmoothModal = ({ visible, onClose, children }) => {
  return (
    <>
      {/* Modal 1: Hiển thị lớp nền tối tĩnh mờ dần / rõ dần */}
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

      {/* Modal 2: Trượt nội dung chính lên/xuống và tránh bàn phím */}
      <Modal
        transparent={true}
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.centeredView}
        >
          {/* Lớp nền trong suốt click ngoài để đóng */}
          <TouchableOpacity
            style={styles.backdropClick}
            activeOpacity={1}
            onPress={onClose}
          />
          {children}
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
