// meat-management-fe/src/components/PopupModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { COLORS, FONTS, SHADOWS } from '../theme';

const { width: screenWidth } = Dimensions.get('window');

/**
 * Component PopupModal dùng chung thay thế cho alert, Alert.alert và window.confirm.
 * Hỗ trợ các kiểu thông báo: 'success', 'error', 'warning', 'confirm'.
 * Sử dụng forwardRef để phơi bày hàm show() và close() ra bên ngoài.
 */
const PopupModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState({
    title: 'Thông báo',
    message: '',
    type: 'info', // 'info' | 'success' | 'error' | 'warning' | 'confirm'
    confirmText: 'Đồng ý',
    cancelText: 'Hủy',
    onConfirm: null,
    onCancel: null,
  });

  // Xuất các phương thức ra component cha qua ref
  useImperativeHandle(ref, () => ({
    show: (config) => {
      setOptions({
        title: config.title || 'Thông báo',
        message: config.message || '',
        type: config.type || 'info',
        confirmText: config.confirmText || 'Đồng ý',
        cancelText: config.cancelText || 'Hủy',
        onConfirm: config.onConfirm || null,
        onCancel: config.onCancel || null,
      });
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const handleConfirm = () => {
    setVisible(false);
    if (options.onConfirm) {
      options.onConfirm();
    }
  };

  const handleCancel = () => {
    setVisible(false);
    if (options.onCancel) {
      options.onCancel();
    }
  };

  // Xác định màu sắc chủ đạo và icon tương ứng với từng kiểu popup
  let icon = 'ℹ️';
  let primaryColor = COLORS.primary;

  switch (options.type) {
    case 'success':
      icon = '✅';
      primaryColor = COLORS.primary;
      break;
    case 'error':
      icon = '❌';
      primaryColor = COLORS.danger;
      break;
    case 'warning':
      icon = '⚠️';
      primaryColor = COLORS.warning;
      break;
    case 'confirm':
      icon = '❓';
      primaryColor = '#3B82F6'; // Màu xanh dương chuyên nghiệp cho hộp thoại xác nhận
      break;
    default:
      icon = 'ℹ️';
      primaryColor = COLORS.primary;
  }

  const isConfirm = options.type === 'confirm';

  return (
    <SmoothModal visible={visible} onClose={handleCancel}>
      <View style={styles.modalWrapper}>
        <View style={styles.modalContent}>
          {/* Vùng hiển thị Icon lớn, trực quan */}
          <View style={[styles.iconContainer, { backgroundColor: primaryColor + '15' }]}>
            <Text style={styles.iconText}>{icon}</Text>
          </View>

          {/* Nội dung thông điệp */}
          <View style={styles.textContainer}>
            <Text style={styles.titleText}>{options.title}</Text>
            {options.message ? (
              <Text style={styles.messageText}>{options.message}</Text>
            ) : null}
          </View>

          {/* Vùng nút bấm hành động */}
          <View style={[styles.buttonContainer, isConfirm ? styles.rowButtons : styles.singleButton]}>
            {isConfirm && (
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>{options.cancelText}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: primaryColor }]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmButtonText}>{options.confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  modalContent: {
    width: '100%',
    maxWidth: 420, // Giới hạn chiều rộng trên màn hình rộng như Web
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 36,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  titleText: {
    fontSize: FONTS.title,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  messageText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
  },
  rowButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  singleButton: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: FONTS.subtitle,
    fontWeight: FONTS.weightMedium,
    color: COLORS.textSecondary,
  },
  confirmButtonText: {
    fontSize: FONTS.subtitle,
    fontWeight: FONTS.weightBold,
    color: '#FFFFFF',
  },
});

export default PopupModal;
