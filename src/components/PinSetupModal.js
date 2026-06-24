// meat-management-fe/src/components/PinSetupModal.js
// Modal thiết lập mã PIN lần đầu (hoặc đổi PIN cũ sang mới)
import React, { useState, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { COLORS, FONTS } from '../theme';
import { savePin, markSessionVerified } from '../store/pinStore';

// ─── Bước tạo PIN: nhập mới → xác nhận lại ───────────────────────────────────
const STEP_ENTER = 'enter';   // Bước 1: nhập PIN mới
const STEP_CONFIRM = 'confirm'; // Bước 2: xác nhận lại PIN

const PinSetupModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(STEP_ENTER);      // Bước hiện tại
  const [pin, setPin] = useState('');                // PIN đang nhập ở bước hiện tại
  const [firstPin, setFirstPin] = useState('');      // PIN đã nhập ở bước 1 (để so sánh)
  const [error, setError] = useState('');

  // Callback khi tạo PIN xong → thực hiện hành động ban đầu
  const onSuccessRef = useRef(null);

  // Animation rung khi xác nhận không khớp
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ─── Phơi bày open/close ra component cha ────────────────────────────────
  useImperativeHandle(ref, () => ({
    open: (onSuccess) => {
      onSuccessRef.current = onSuccess;
      setStep(STEP_ENTER);
      setPin('');
      setFirstPin('');
      setError('');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // ─── Animation rung khi xác nhận không khớp ──────────────────────────────
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== 'web') {
      Vibration.vibrate(200);
    }
  }, [shakeAnim]);

  // ─── Xử lý bấm phím số ───────────────────────────────────────────────────
  const handleDigit = useCallback(async (digit) => {
    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    // Khi đã nhập đủ 4 số
    if (newPin.length === 4) {
      if (step === STEP_ENTER) {
        // Bước 1 xong → chuyển sang bước xác nhận
        setFirstPin(newPin);
        setPin('');
        setStep(STEP_CONFIRM);
      } else {
        // Bước 2: so sánh hai lần nhập
        if (newPin === firstPin) {
          // Khớp → lưu PIN và ghi nhận phiên xác thực
          await savePin(newPin);
          await markSessionVerified();
          setVisible(false);
          if (onSuccessRef.current) {
            onSuccessRef.current();
          }
        } else {
          // Không khớp → rung + quay lại bước 1
          triggerShake();
          setPin('');
          setFirstPin('');
          setStep(STEP_ENTER);
          setError('Mã PIN không khớp. Vui lòng nhập lại từ đầu.');
        }
      }
    }
  }, [pin, step, firstPin, triggerShake]);

  // ─── Xóa ký tự cuối ──────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  }, []);

  // ─── Render các chấm tròn hiển thị tiến trình nhập ────────────────────────
  const renderDots = () => (
    <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < pin.length && styles.dotFilled,
            error && step === STEP_ENTER && styles.dotError,
          ]}
        />
      ))}
    </Animated.View>
  );

  // ─── Render bàn phím số 3×4 ──────────────────────────────────────────────
  const renderKeypad = () => {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    return (
      <View style={styles.keypad}>
        {keys.map((key, index) => {
          if (key === '') return <View key={index} style={styles.keyEmpty} />;
          const isDelete = key === '⌫';
          return (
            <TouchableOpacity
              key={index}
              style={styles.key}
              onPress={() => isDelete ? handleDelete() : handleDigit(key)}
            >
              <Text style={[styles.keyText, isDelete && styles.keyDeleteText]}>
                {key}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ─── Nội dung hiển thị tùy theo bước ─────────────────────────────────────
  const isEnterStep = step === STEP_ENTER;

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.container}>
        {/* Biểu tượng khiên bảo vệ */}
        <View style={[styles.iconWrapper, isEnterStep ? styles.iconWrapperPrimary : styles.iconWrapperConfirm]}>
          <Text style={styles.lockIcon}>{isEnterStep ? '🛡️' : '✔️'}</Text>
        </View>

        {/* Bước 1 hay 2 */}
        <View style={styles.stepBadge}>
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={[styles.stepDot, !isEnterStep && styles.stepDotActive]} />
        </View>

        {/* Tiêu đề */}
        <Text style={styles.title}>
          {isEnterStep ? 'Tạo mã PIN bảo vệ' : 'Xác nhận mã PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {isEnterStep
            ? 'Nhập mã PIN 4 số để bảo vệ dữ liệu công nợ của bạn'
            : 'Nhập lại mã PIN vừa tạo để xác nhận'}
        </Text>

        {/* Hiển thị tiến trình nhập 4 chấm */}
        {renderDots()}

        {/* Thông báo lỗi */}
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <Text style={styles.errorPlaceholder} />
        )}

        {/* Bàn phím số */}
        {renderKeypad()}

        {/* Nút hủy / quay lại */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            if (step === STEP_CONFIRM) {
              // Quay lại bước 1 thay vì đóng hẳn
              setStep(STEP_ENTER);
              setPin('');
              setFirstPin('');
              setError('');
            } else {
              setVisible(false);
            }
          }}
        >
          <Text style={styles.cancelText}>
            {step === STEP_CONFIRM ? '← Nhập lại' : 'Hủy bỏ'}
          </Text>
        </TouchableOpacity>
      </View>
    </SmoothModal>
  );
});

export default PinSetupModal;

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconWrapperPrimary: {
    backgroundColor: '#ECFDF5',
  },
  iconWrapperConfirm: {
    backgroundColor: '#EEF2FF',
  },
  lockIcon: {
    fontSize: 36,
  },
  // ─── Chỉ báo bước ─────────────────────────────────────────────────────
  stepBadge: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  stepDotActive: {
    backgroundColor: COLORS.primary,
  },
  // ─── Tiêu đề ────────────────────────────────────────────────────────────
  title: {
    fontSize: FONTS.title,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  // ─── Các chấm tròn hiển thị PIN ─────────────────────────────────────────
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dotError: {
    borderColor: COLORS.danger,
  },
  // ─── Thông báo lỗi ───────────────────────────────────────────────────────
  errorText: {
    color: COLORS.dangerDark,
    fontSize: FONTS.caption,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorPlaceholder: {
    height: 20,
    marginBottom: 8,
  },
  // ─── Bàn phím số ────────────────────────────────────────────────────────
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 280,
    justifyContent: 'center',
    marginTop: 12,
    gap: 12,
  },
  key: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  keyEmpty: {
    width: 80,
    height: 80,
  },
  keyText: {
    fontSize: FONTS.title,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
  },
  keyDeleteText: {
    fontSize: FONTS.subtitle,
    color: COLORS.textSecondary,
  },
  // ─── Nút hủy ────────────────────────────────────────────────────────────
  cancelButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
