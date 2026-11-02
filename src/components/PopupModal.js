// meat-management-fe/src/components/PopupModal.js
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { COLORS, FONTS, SHADOWS } from '../theme';
import AnimatedPressable from './AnimatedPressable';

const { width: screenWidth } = Dimensions.get('window');

/**
 * Component PopupModal dùng chung thay thế cho alert, Alert.alert và window.confirm.
 * Hỗ trợ các kiểu thông báo: 'success', 'error', 'warning', 'confirm'.
 * Sử dụng forwardRef để phơi bày hàm show() và close() ra bên ngoài.
 */
const PopupModal = forwardRef(({ zIndex: zIndexProp } = {}, ref) => {
  // Mặc định luôn ở tầng zIndex cao nhất tuyệt đối (9999999) theo quy chuẩn bảo mật và popup xác nhận
  const resolvedZIndex = zIndexProp || 9999999;
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
    neutralText: null,
    onConfirm: null,
    onCancel: null,
    onNeutral: null,
    neutralButtonStyle: null,
    neutralButtonTextStyle: null,
    showTextInput: false,
    textInputPlaceholder: 'Nhập nội dung...',
    textInputDefaultValue: '',
    zIndex: resolvedZIndex,
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
        neutralText: config.neutralText || null,
        onConfirm: config.onConfirm || null,
        onCancel: config.onCancel || null,
        onNeutral: config.onNeutral || null,
        neutralButtonStyle: config.neutralButtonStyle || null,
        neutralButtonTextStyle: config.neutralButtonTextStyle || null,
        showTextInput: config.showTextInput || false,
        textInputPlaceholder: config.textInputPlaceholder || 'Nhập nội dung...',
        textInputDefaultValue: config.textInputDefaultValue || '',
        zIndex: config.zIndex || resolvedZIndex,
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
        }, 3000); // Thành công: ẩn sau 3 giây
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

  const handleNeutral = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    if (options.onNeutral) {
      options.onNeutral();
    }
  };

  // Xác định màu sắc chủ đạo và icon tương ứng với từng kiểu popup
  let icon = 'ℹ️';
  let primaryColor = COLORS.primary;

  const isWarningTitle =
    options.title &&
    (options.title.includes('⚠️') ||
      options.title.toLowerCase().includes('cảnh báo') ||
      options.title.toLowerCase().includes('lưu ý'));

  switch (options.type) {
    case 'success':
      icon = '✅';
      primaryColor = '#10B981';
      break;
    case 'error':
      icon = '❌';
      primaryColor = '#EF4444';
      break;
    case 'warning':
      icon = '⚠️';
      primaryColor = '#F59E0B';
      break;
    case 'confirm':
      if (isWarningTitle) {
        icon = '⚠️';
        primaryColor = '#F59E0B'; // Nếu là xác nhận cảnh báo thì dùng tone vàng cam cảnh báo chuyên nghiệp
      } else {
        icon = '❓';
        primaryColor = '#3B82F6'; // Màu xanh dương chuyên nghiệp cho câu hỏi xác nhận thông thường
      }
      break;
    default:
      icon = 'ℹ️';
      primaryColor = COLORS.primary;
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

  // Hiển thị nội dung thông báo có nhiều đoạn / danh sách một cách thanh lịch, hiện đại
  const renderStructuredMessage = (msg) => {
    if (!msg) return null;
    if (typeof msg !== 'string') return renderMessage(msg);

    const parts = msg.split('\n\n');
    let footerQuestion = null;
    let bodyParts = parts;

    // Nếu đoạn cuối là câu hỏi xác nhận thì tách riêng để hiển thị nổi bật phía dưới card
    if (
      parts.length > 1 &&
      (parts[parts.length - 1].toLowerCase().includes('bạn có muốn') ||
        parts[parts.length - 1].toLowerCase().includes('bạn có chắc') ||
        parts[parts.length - 1].trim().endsWith('?'))
    ) {
      footerQuestion = parts[parts.length - 1];
      bodyParts = parts.slice(0, parts.length - 1);
    }

    return (
      <View style={styles.structuredMessageWrap}>
        <ScrollView
          style={styles.structuredScroll}
          contentContainerStyle={styles.structuredScrollContent}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={true}
        >
          {bodyParts.map((section, sIdx) => {
            const lines = section.split('\n');
            const isCustomerSection = lines.some((l) => l.trim().startsWith('📌'));
            const isHintSection = lines.some((l) => l.trim().startsWith('💡'));

            // Card gợi ý/hướng dẫn tinh tế màu xanh
            if (isHintSection) {
              return (
                <View key={sIdx} style={styles.hintCardBox}>
                  {lines.map((line, lIdx) => (
                    <Text key={lIdx} style={styles.hintCardText}>
                      {renderMessage(line)}
                    </Text>
                  ))}
                </View>
              );
            }

            // Card riêng biệt cho khách hàng bị trùng
            if (isCustomerSection) {
              return (
                <View key={sIdx} style={styles.customerCard}>
                  {lines.map((line, lIdx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return null;

                    const isHeader = trimmed.startsWith('📌');
                    const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-');

                    if (isHeader) {
                      return (
                        <View key={lIdx} style={styles.customerHeaderRow}>
                          <Text style={styles.customerHeaderText}>{renderMessage(trimmed)}</Text>
                        </View>
                      );
                    }

                    if (isBullet) {
                      return (
                        <View key={lIdx} style={styles.duplicateItemBadge}>
                          <Text style={styles.duplicateItemIcon}>🥩</Text>
                          <Text style={styles.duplicateItemText}>
                            {renderMessage(trimmed.replace(/^[•\-]\s*/, ''))}
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <Text key={lIdx} style={styles.normalLine}>
                        {renderMessage(line)}
                      </Text>
                    );
                  })}
                </View>
              );
            }

            return (
              <View key={sIdx} style={[styles.sectionBlock, sIdx > 0 && styles.sectionBlockMargin]}>
                {lines.map((line, lIdx) => {
                  const trimmed = line.trim();
                  if (!trimmed) return null;

                  // Ẩn tiêu đề lặp lại nếu tiêu đề modal đã nêu rõ
                  if (trimmed.startsWith('⚠️') && options.title && options.title.includes('TRÙNG ĐƠN')) {
                    return null;
                  }

                  const isHeader =
                    trimmed.startsWith('⚠️') ||
                    trimmed.startsWith('💾') ||
                    trimmed.startsWith('📝') ||
                    trimmed.endsWith(':');

                  const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-');

                  if (isHeader) {
                    return (
                      <Text key={lIdx} style={styles.sectionHeaderLine}>
                        {trimmed}
                      </Text>
                    );
                  }

                  if (isBullet) {
                    return (
                      <View key={lIdx} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>
                          {renderMessage(trimmed.replace(/^[•\-]\s*/, ''))}
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <Text key={lIdx} style={styles.introSummaryLine}>
                      {renderMessage(line)}
                    </Text>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>

        {footerQuestion ? (
          <Text style={styles.footerQuestionText}>{footerQuestion}</Text>
        ) : null}
      </View>
    );
  };

  const isConfirm = options.type === 'confirm';
  const isToast = options.type === 'success' || options.type === 'error';
  const toastBgColor = options.type === 'success' ? '#10B981' : '#EF4444';
  const hasBulletsOrMultiLine =
    typeof options.message === 'string' &&
    (options.message.includes('\n') || options.message.includes('•'));

  return (
    <>
      {/* SmoothModal cho dạng Toast (success/error) */}
      <SmoothModal visible={visible && isToast} onClose={handleCancel} isToast={true} zIndex={resolvedZIndex}>
        <View style={styles.toastWrapper}>
          <View style={[styles.toastContent, { backgroundColor: toastBgColor }]}>
            <Text style={styles.toastIcon}>{icon}</Text>
            <View style={styles.toastTextContainer}>
              {options.title && options.title !== 'Thông báo' && options.title !== 'Thành công' && options.title !== 'Lỗi' && options.title !== 'Thất bại' ? (
                <Text style={styles.toastTitleText}>{options.title}</Text>
              ) : null}
              <Text style={styles.toastMessageText}>{renderMessage(options.message)}</Text>
            </View>
          </View>
        </View>
      </SmoothModal>

      {/* SmoothModal cho dạng Dialog (confirm/warning/info/error) */}
      <SmoothModal visible={visible && !isToast} onClose={handleCancel} isToast={false} zIndex={options.zIndex || resolvedZIndex}>
        <View style={styles.modalWrapper}>
          <View style={[styles.modalContent, options.maxWidth ? { maxWidth: options.maxWidth } : null]}>
            {/* Vùng hiển thị Icon trang nhã, hiện đại */}
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: primaryColor + '18',
                  borderColor: primaryColor + '40',
                },
              ]}
            >
              <Text style={styles.iconText}>{icon}</Text>
            </View>

            {/* Nội dung thông điệp */}
            <View style={styles.textContainer}>
              <Text style={styles.titleText}>{options.title}</Text>
              {options.message ? (
                hasBulletsOrMultiLine ? (
                  renderStructuredMessage(options.message)
                ) : (
                  <Text style={styles.messageText}>{renderMessage(options.message)}</Text>
                )
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

            {/* Vùng nút bấm hành động được bố trí gọn gàng, tinh tế */}
            <View style={styles.actionButtonsWrapper}>
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
                  style={[styles.button, styles.confirmButton, { backgroundColor: primaryColor }]}
                  onPress={handleConfirm}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmButtonText}>{options.confirmText}</Text>
                </AnimatedPressable>
              </View>

              {Boolean(options.neutralText) && (
                <AnimatedPressable
                  style={[styles.button, styles.neutralButton, options.neutralButtonStyle]}
                  onPress={handleNeutral}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.neutralButtonText, options.neutralButtonTextStyle]}>
                    {options.neutralText}
                  </Text>
                </AnimatedPressable>
              )}
            </View>
          </View>
        </View>
      </SmoothModal>
    </>
  );
});

const styles = StyleSheet.create({
  modalWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  modalContent: {
    width: '100%',
    maxWidth: 460, // Kích thước gọn gàng, chuẩn mobile-first
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1.5,
  },
  iconText: {
    fontSize: 26,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  titleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  messageText: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 21,
  },
  structuredMessageWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  structuredScroll: {
    width: '100%',
    maxHeight: 340,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  structuredScrollContent: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sectionBlock: {
    width: '100%',
  },
  sectionBlockMargin: {
    marginTop: 8,
  },
  introSummaryLine: {
    fontSize: 13.5,
    color: '#475569',
    lineHeight: 20,
    textAlign: 'left',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  // Thẻ Card riêng biệt cho từng khách hàng bị trùng
  customerCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  customerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  customerHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  duplicateItemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  duplicateItemIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  duplicateItemText: {
    flex: 1,
    fontSize: 13.5,
    color: '#92400E',
    fontWeight: '600',
    lineHeight: 18,
  },
  // Khung gợi ý hướng dẫn màu xanh nhẹ nhàng
  hintCardBox: {
    width: '100%',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  hintCardText: {
    fontSize: 12.5,
    color: '#0369A1',
    lineHeight: 18,
    textAlign: 'left',
  },
  sectionHeaderLine: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
    paddingLeft: 2,
  },
  bulletDot: {
    fontSize: 15,
    color: '#475569',
    marginRight: 6,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: 13.5,
    color: '#1E293B',
    lineHeight: 20,
    textAlign: 'left',
  },
  normalLine: {
    fontSize: 13.5,
    color: '#334155',
    lineHeight: 20,
    textAlign: 'left',
    marginBottom: 3,
  },
  footerQuestionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 4,
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
    marginTop: 14,
    textAlignVertical: 'top',
  },
  actionButtonsWrapper: {
    width: '100%',
    alignItems: 'center',
    marginTop: 6,
  },
  buttonContainer: {
    width: '100%',
  },
  rowButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  singleButton: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    flex: 0.9,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  confirmButton: {
    flex: 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  confirmButtonText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  neutralButton: {
    width: '100%',
    height: 44,
    marginTop: 9,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  neutralButtonText: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '700',
  },
  toastWrapper: {
    width: '100%',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    marginTop: Platform.OS === 'ios' ? 60 : 30,
  },
  toastContent: {
    alignSelf: 'flex-end',
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
    color: '#FFFFFF',
    lineHeight: 16,
  },
});

export default PopupModal;
