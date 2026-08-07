// meat-management-fe/src/components/store/StorePopupModal.js
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  TextInput,
  Platform,
} from 'react-native';
import SmoothModal from '../SmoothModal';
import { COLORS, FONTS, SHADOWS } from '../../theme';
import AnimatedPressable from '../AnimatedPressable';

/**
 * Component StorePopupModal độc lập thay thế cho alert và confirm trong phân hệ cửa hàng.
 * Hỗ trợ các kiểu thông báo: 'success', 'error', 'warning', 'confirm'.
 * Sử dụng forwardRef để phơi bày hàm show() và close() ra bên ngoài.
 */
const StorePopupModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [textValue, setTextValue] = useState('');
  const timerRef = useRef(null);
  const [options, setOptions] = useState({
    title: 'Thông báo',
    message: '',
    type: 'info', // 'info' | 'success' | 'error' | 'warning' | 'confirm'
    icon: null,
    confirmText: 'Đồng ý',
    cancelText: 'Hủy',
    onConfirm: null,
    onCancel: null,
    showTextInput: false,
    textInputPlaceholder: 'Nhập nội dung...',
    textInputDefaultValue: '',
  });

  // Xuất các phương thức ra component cha qua ref
  useImperativeHandle(ref, () => ({
    show: (config) => {
      // Dọn dẹp timer cũ nếu có
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const typeVal = config.type || 'info';

      setOptions({
        title: config.title || 'Thông báo',
        message: config.message || '',
        type: typeVal,
        icon: config.icon || null,
        confirmText: config.confirmText || 'Đồng ý',
        cancelText: config.cancelText || 'Hủy',
        onConfirm: config.onConfirm || null,
        onCancel: config.onCancel || null,
        showTextInput: config.showTextInput || false,
        textInputPlaceholder: config.textInputPlaceholder || 'Nhập nội dung...',
        textInputDefaultValue: config.textInputDefaultValue || '',
      });
      setTextValue(config.textInputDefaultValue || '');
      setVisible(true);

      // Nếu là Toast (success hoặc error), tự động đóng sau vài giây
      if (typeVal === 'success') {
        timerRef.current = setTimeout(() => {
          setVisible(false);
          if (config.onConfirm) {
            config.onConfirm();
          }
          timerRef.current = null;
        }, 2000); // Thành công: ẩn sau 2 giây
      } else if (typeVal === 'error') {
        timerRef.current = setTimeout(() => {
          setVisible(false);
          timerRef.current = null;
        }, 3000); // Lỗi: ẩn sau 3 giây để người dùng có thời gian đọc
      }
    },
    close: () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setVisible(false);
    },
  }));

  const handleConfirm = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    if (options.onConfirm) {
      options.onConfirm(options.showTextInput ? textValue : undefined);
    }
  };

  const handleCancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    if (options.onCancel) {
      options.onCancel();
    }
  };

  // Xác định màu sắc chủ đạo và icon tương ứng với từng kiểu popup
  let icon = '🏪';
  let primaryColor = '#5B21B6'; // Tông màu tím cửa hàng

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
      primaryColor = '#5B21B6'; // Tông màu tím của hàng cho hộp thoại xác nhận
      break;
    default:
      icon = '🏪';
      primaryColor = '#5B21B6';
  }

  if (options.icon) {
    icon = options.icon;
  }

  const renderMessage = (msg) => {
    if (!msg) return null;
    const parts = msg.split('**');
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return (
          <Text key={index} style={{ fontWeight: 'bold', color: isToast ? '#FFFFFF' : COLORS.text }}>
            {part}
          </Text>
        );
      }
      return part;
    });
  };

  const isConfirm = options.type === 'confirm';
  const isToast = options.type === 'success' || options.type === 'error';
  const toastBgColor = options.type === 'success' ? '#10B981' : '#EF4444';

  return (
    <SmoothModal visible={visible} onClose={handleCancel} isToast={isToast}>
      <View style={isToast ? styles.toastWrapper : styles.modalWrapper}>
        {isToast ? (
          <View style={[styles.toastContent, { backgroundColor: toastBgColor }]}>
            <Text style={styles.toastIcon}>{icon}</Text>
            <View style={styles.toastTextContainer}>
              {options.title && options.title !== 'Thông báo' && options.title !== 'Thành công' && options.title !== 'Lỗi' && options.title !== 'Thất bại' ? (
                <Text style={styles.toastTitleText}>{options.title}</Text>
              ) : null}
              <Text style={styles.toastMessageText}>{renderMessage(options.message)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.modalContent}>
            {/* Vùng hiển thị Icon lớn */}
            <View style={[styles.iconContainer, { backgroundColor: primaryColor + '15' }]}>
              <Text style={styles.iconText}>{icon}</Text>
            </View>

            {/* Nội dung thông điệp */}
            <View style={styles.textContainer}>
              <Text style={styles.titleText}>{options.title}</Text>
              {options.message ? (
                <Text style={styles.messageText}>{renderMessage(options.message)}</Text>
              ) : null}
              {options.showTextInput && (
                <TextInput
                  style={styles.textInput}
                  placeholder={options.textInputPlaceholder}
                  placeholderTextColor={COLORS.textLight}
                  value={textValue}
                  onChangeText={setTextValue}
                  multiline={true}
                  numberOfLines={3}
                  autoFocus={true}
                />
              )}
            </View>

            {/* Vùng nút bấm hành động */}
            <View style={[styles.buttonContainer, isConfirm ? styles.rowButtons : styles.singleButton]}>
              {isConfirm && (
                <AnimatedPressable
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleCancel}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelButtonText}>{options.cancelText}</Text>
                </AnimatedPressable>
              )}

              <AnimatedPressable
                style={[styles.button, { backgroundColor: primaryColor }]}
                onPress={handleConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmButtonText}>{options.confirmText}</Text>
              </AnimatedPressable>
            </View>
          </View>
        )}
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
    maxWidth: 420,
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
  textInput: {
    width: '100%',
    minHeight: 80,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FONTS.body,
    color: COLORS.text,
    marginTop: 16,
    textAlignVertical: 'top',
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
  // Các styles dành riêng cho Toast
  toastWrapper: {
    width: '100%',
    alignItems: 'flex-end', // Đẩy toast sang góc trên bên phải
    paddingHorizontal: 20,
    marginTop: Platform.OS === 'ios' ? 60 : 30, // Tránh status bar/tai thỏ
  },
  toastContent: {
    alignSelf: 'flex-end', // Tự co giãn theo độ dài tin nhắn
    maxWidth: 320,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  toastIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  toastTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  toastTitleText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  toastMessageText: {
    fontSize: 12,
    color: '#FFFFFF', // Đảm bảo chữ trắng trên nền xanh/đỏ
    lineHeight: 16,
  },
});

export default StorePopupModal;
