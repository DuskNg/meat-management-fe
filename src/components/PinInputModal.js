// meat-management-fe/src/components/PinInputModal.js
// Modal nhập mã PIN 4 số khi phiên xác thực đã hết hạn
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
import { verifyPin, markSessionVerified } from '../store/pinStore';

// ─── Số lần nhập sai tối đa trước khi bị khóa tạm ───────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

const PinInputModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null); // Thời điểm hết bị khóa
  const [actionLabel, setActionLabel] = useState('');   // Tên hành động yêu cầu PIN

  // Callback khi PIN đúng → thực hiện hành động thực sự
  const onSuccessRef = useRef(null);

  // Animation rung khi nhập sai
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ─── Phơi bày open/close ra component cha ────────────────────────────────
  useImperativeHandle(ref, () => ({
    open: (onSuccess, label = 'thực hiện thao tác') => {
      onSuccessRef.current = onSuccess;
      setActionLabel(label);
      setPin('');
      setError('');
      setAttempts(0);
      setLockedUntil(null);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // ─── Animation rung khi sai PIN ──────────────────────────────────────────
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
    // Rung thiết bị (chỉ hỗ trợ native)
    if (Platform.OS !== 'web') {
      Vibration.vibrate(200);
    }
  }, [shakeAnim]);

  // ─── Kiểm tra xem có đang bị khóa tạm thời không ─────────────────────────
  const isLocked = () => {
    if (!lockedUntil) return false;
    return Date.now() < lockedUntil;
  };

  const getRemainingLockSeconds = () => {
    if (!lockedUntil) return 0;
    return Math.ceil((lockedUntil - Date.now()) / 1000);
  };

  // ─── Xử lý bấm phím số trên bàn phím PIN ────────────────────────────────
  const handleDigit = useCallback(async (digit) => {
    if (isLocked()) return;

    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    // Tự động xác minh khi đã nhập đủ 4 số
    if (newPin.length === 4) {
      const isCorrect = await verifyPin(newPin);
      if (isCorrect) {
        // PIN đúng → ghi nhận phiên và gọi callback thành công
        await markSessionVerified();
        setVisible(false);
        if (onSuccessRef.current) {
          onSuccessRef.current();
        }
      } else {
        // PIN sai → rung + xóa
        triggerShake();
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');

        if (newAttempts >= MAX_ATTEMPTS) {
          // Khóa tạm 30 giây sau khi sai quá MAX_ATTEMPTS lần
          setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
          setError(`Sai quá ${MAX_ATTEMPTS} lần. Vui lòng chờ ${LOCKOUT_SECONDS} giây.`);
        } else {
          setError(`Sai mã PIN. Còn ${MAX_ATTEMPTS - newAttempts} lần thử.`);
        }
      }
    }
  }, [pin, attempts, triggerShake]);

  // ─── Xóa ký tự cuối ──────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    if (isLocked()) return;
    setPin((prev) => prev.slice(0, -1));
    setError('');
  }, []);

  // ─── Render các chấm tròn hiển thị tiến trình nhập PIN ────────────────────
  const renderDots = () => (
    <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < pin.length && styles.dotFilled,
            error && styles.dotError,
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
              style={[styles.key, isLocked() && styles.keyDisabled]}
              onPress={() => isDelete ? handleDelete() : handleDigit(key)}
              disabled={isLocked()}
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

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.container}>
        {/* Biểu tượng khóa */}
        <View style={styles.iconWrapper}>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>

        {/* Tiêu đề */}
        <Text style={styles.title}>Nhập mã PIN</Text>
        <Text style={styles.subtitle}>
          Xác nhận danh tính để {actionLabel}
        </Text>

        {/* Hiển thị tiến trình nhập 4 chấm */}
        {renderDots()}

        {/* Thông báo lỗi */}
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : isLocked() ? (
          <Text style={styles.errorText}>
            🔒 Tạm khóa, còn {getRemainingLockSeconds()} giây
          </Text>
        ) : null}

        {/* Bàn phím số */}
        {renderKeypad()}

        {/* Nút hủy */}
        <TouchableOpacity style={styles.cancelButton} onPress={() => setVisible(false)}>
          <Text style={styles.cancelText}>Hủy bỏ</Text>
        </TouchableOpacity>
      </View>
    </SmoothModal>
  );
});

export default PinInputModal;

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
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockIcon: {
    fontSize: 36,
  },
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
    borderColor: '#C7D2FE',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
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
    minHeight: 20,
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
  keyDisabled: {
    opacity: 0.4,
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
