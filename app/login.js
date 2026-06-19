// meat-management-fe/app/login.js
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import { api } from '../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../src/theme';

export default function LoginScreen() {
  const auth = useAuthStore();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1); // 1: Nhập Số Điện Thoại, 2: Nhập mã OTP
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Hàm kiểm tra định dạng SĐT di động Việt Nam
  const validatePhoneFormat = (value) => {
    const phoneRegex = /^(0|84|\+84)[35789][0-9]{8}$/;
    return phoneRegex.test(value);
  };

  // Hàm kiểm tra và trả về thông báo lỗi SĐT (Xác thực trực tiếp)
  const getPhoneValidationError = (value) => {
    const trimmed = value.trim();
    if (trimmed === '') {
      return 'Số điện thoại không được để trống.';
    }
    if (!/^\+?[0-9]*$/.test(trimmed)) {
      return 'Số điện thoại chỉ được chứa chữ số và dấu + ở đầu.';
    }
    const expectedLength = trimmed.startsWith('+84') ? 12 : (trimmed.startsWith('84') ? 11 : 10);
    if (trimmed.length < expectedLength) {
      return `Số điện thoại chưa đủ chữ số (yêu cầu ${expectedLength} chữ số).`;
    }
    if (trimmed.length > expectedLength) {
      return `Số điện thoại thừa chữ số (yêu cầu ${expectedLength} chữ số).`;
    }
    if (!validatePhoneFormat(trimmed)) {
      return 'Số điện thoại không đúng định dạng (Ví dụ: 0912345678).';
    }
    return '';
  };

  // Hàm kiểm tra và trả về thông báo lỗi OTP (Xác thực trực tiếp)
  const getOtpValidationError = (value) => {
    const trimmed = value.trim();
    if (trimmed === '') {
      return 'Mã OTP không được để trống.';
    }
    if (!/^[0-9]*$/.test(trimmed)) {
      return 'Mã OTP chỉ bao gồm chữ số.';
    }
    if (trimmed.length !== 4) {
      return 'Mã xác thực OTP phải có đúng 4 chữ số.';
    }
    return '';
  };

  // Hàm xử lý khi thay đổi SĐT (Xác thực trực tiếp khi đang gõ)
  const handlePhoneChange = (text) => {
    setPhone(text);
    const errorMsg = getPhoneValidationError(text);
    setError(errorMsg);
  };

  // Hàm xử lý khi thay đổi OTP (Xác thực trực tiếp khi đang gõ)
  const handleOtpChange = (text) => {
    setOtp(text);
    const errorMsg = getOtpValidationError(text);
    setError(errorMsg);
  };

  // 1. Hàm xử lý đăng nhập trực tiếp bằng SĐT (Tạm thời bỏ qua xác thực OTP)
  const handleRequestOtp = async () => {
    const trimmedPhone = phone.trim();
    const errorMsg = getPhoneValidationError(trimmedPhone);
    if (errorMsg) {
      setError(errorMsg);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/request-otp', { phone: trimmedPhone });
      if (response.data.success) {
        const { user, tokens } = response.data;
        if (user && tokens) {
          // Đăng nhập trực tiếp nếu Backend trả về thông tin người dùng và tokens
          await auth.login(user, tokens);
        } else {
          // Trường hợp dự phòng nếu API cũ vẫn yêu cầu mã OTP
          setStep(2);
        }
      } else {
        setError(response.data.message || 'Không thể đăng nhập. Vui lòng kiểm tra lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng. Bạn hãy kiểm tra cục Wifi hoặc 3G/4G.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Hàm xác thực OTP và Đăng nhập (Tạm thời không dùng đến)
  const handleVerifyOtp = async () => {
    const trimmedOtp = otp.trim();
    const errorMsg = getOtpValidationError(trimmedOtp);
    if (errorMsg) {
      setError(errorMsg);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/verify-otp', {
        phone: phone.trim(),
        code: trimmedOtp,
        name: 'Chủ buôn mới',
      });
      if (response.data.success) {
        const { user, tokens } = response.data;
        await auth.login(user, tokens);
      } else {
        setError(response.data.message || 'Mã OTP không chính xác hoặc đã hết hiệu lực.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi xác thực. Vui lòng nhập lại mã OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {/* Logo ứng dụng cách điệu như một icon app cao cấp */}
          <View style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>🥩</Text>
          </View>

          <Text style={styles.appName}>Quản Lý bán hàng</Text>

          {/* Hộp thông báo trạng thái/lỗi luôn hiển thị cố định để tránh co rút giao diện */}
          <View style={[
            styles.statusContainer,
            !error && phone.trim() === ''
              ? styles.statusNeutral
              : error
                ? styles.statusError
                : styles.statusSuccess
          ]}>
            <Text style={[
              styles.statusText,
              !error && phone.trim() === ''
                ? styles.statusTextNeutral
                : error
                  ? styles.statusTextError
                  : styles.statusTextSuccess
            ]}>
              {!error && phone.trim() === '' ? (
                'ℹ️ Nhập số điện thoại để đăng nhập.'
              ) : error ? (
                `⚠️ ${error}`
              ) : (
                '✅ Số điện thoại hợp lệ!'
              )}
            </Text>
          </View>

          {step === 1 ? (
            // BƯỚC 1: NHẬP SỐ ĐIỆN THOẠI ĐỂ ĐĂNG NHẬP TRỰC TIẾP
            <View style={styles.formGroup}>
              <Text style={styles.label}>Nhập số điện thoại của bạn:</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: 0912345678"
                placeholderTextColor={COLORS.textLight}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={handlePhoneChange}
              />
              <TouchableOpacity
                style={styles.button}
                onPress={handleRequestOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>ĐĂNG NHẬP</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            // BƯỚC 2: NHẬP MÃ OTP ĐỂ ĐĂNG NHẬP (TẠM THỜI ẨN / COMMENT)
            /* 
            <View style={styles.formGroup}>
              <Text style={[styles.phoneInfo, { marginBottom: 24 }]}>
                Đang gửi mã về số: <Text style={{ fontWeight: 'bold', color: COLORS.text }}>{phone}</Text>
              </Text>

              <Text style={styles.label}>Nhập mã gồm 4 số được gửi tới máy:</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="Nhập 4 số"
                placeholderTextColor={COLORS.textLight}
                keyboardType="number-pad"
                maxLength={4}
                value={otp}
                onChangeText={handleOtpChange}
              />
              <TouchableOpacity
                style={[styles.button, styles.submitButton]}
                onPress={handleVerifyOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>ĐĂNG NHẬP NGAY</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.backButton]}
                onPress={() => { setStep(1); setError(''); setOtp(''); }}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.backButtonText}>QUAY LẠI NHẬP SĐT</Text>
              </TouchableOpacity>
            </View>
            */
            null
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F6', // Nền màu kem lanh nhẹ nhàng, cao cấp
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 480, // Tăng nhẹ chiều rộng để chữ không bị rớt dòng
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#F1EFEA', // Viền nhạt cao cấp hợp màu nền
    ...SHADOWS.card,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2', // Nền đỏ hồng nhạt cho icon
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FCA5A5',
  },
  logoEmoji: {
    fontSize: 40,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#7F1D1D', // Màu đỏ đun Bordeaux sang trọng
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  appDesc: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 35,
    lineHeight: 20,
  },
  statusContainer: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54, // Chiều cao tối thiểu cố định để tránh bị co rút giao diện
  },
  statusNeutral: {
    backgroundColor: '#F1F5F9', // Màu xám nhẹ nhàng tinh tế (Slate 100)
    borderColor: '#E2E8F0',     // Viền xám nhẹ (Slate 200)
  },
  statusError: {
    backgroundColor: COLORS.dangerLight, // Nền đỏ hồng nhạt
    borderColor: '#FECACA',              // Viền đỏ nhạt
  },
  statusSuccess: {
    backgroundColor: '#D1FAE5', // Nền xanh lá nhạt dịu mát
    borderColor: '#A7F3D0',     // Viền xanh lá nhạt
  },
  statusText: {
    fontSize: FONTS.body,
    fontWeight: '600',
    lineHeight: 22,
  },
  statusTextNeutral: {
    color: COLORS.textSecondary,
  },
  statusTextError: {
    color: COLORS.dangerDark,
  },
  statusTextSuccess: {
    color: '#065F46', // Chữ xanh lục đậm sang trọng
  },
  formGroup: {
    width: '100%',
  },
  label: {
    fontSize: FONTS.body,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#FBFBFB',
    height: 60,
    borderRadius: 14,
    paddingHorizontal: 18,
    fontSize: 18,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: '#E4E2DD',
    marginBottom: 24,
  },
  otpInput: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 10,
  },
  button: {
    backgroundColor: COLORS.primaryDark,
    height: 60,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  phoneInfo: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 6,
  },
  changePhoneButton: {
    alignSelf: 'center',
    padding: 8,
    marginBottom: 24,
  },
  changePhoneText: {
    color: COLORS.primaryDark,
    fontSize: FONTS.body,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  backButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.primaryDark,
    marginTop: 12,
  },
  backButtonText: {
    color: COLORS.primaryDark,
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
