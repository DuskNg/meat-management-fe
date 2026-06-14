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

  // 1. Hàm yêu cầu gửi mã OTP về máy khách
  const handleRequestOtp = async () => {
    const trimmedPhone = phone.trim();
    // Biểu thức chính quy kiểm tra SĐT di động Việt Nam
    const phoneRegex = /^(0|84|\+84)[35789][0-9]{8}$/;

    if (!trimmedPhone) {
      setError('Số điện thoại không được để trống.');
      return;
    }

    if (!phoneRegex.test(trimmedPhone)) {
      setError('Số điện thoại không đúng định dạng (Ví dụ: 0912345678).');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/request-otp', { phone: trimmedPhone });
      if (response.data.success) {
        setStep(2);
      } else {
        setError(response.data.message || 'Không thể gửi mã OTP. Vui lòng kiểm tra lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng. Bạn hãy kiểm tra cục Wifi hoặc 3G/4G.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Hàm xác thực OTP và Đăng nhập
  const handleVerifyOtp = async () => {
    if (!otp || otp.trim().length !== 4) {
      setError('Mã xác thực OTP phải có đúng 4 chữ số.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/verify-otp', {
        phone: phone.trim(),
        code: otp.trim(),
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
          
          <Text style={styles.appName}>Quản Lý Đơn Thịt</Text>
          <Text style={styles.appDesc}>Ghi nợ sạp thịt siêu nhanh - Không lo quên sổ</Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            // BƯỚC 1: NHẬP SỐ ĐIỆN THOẠI ĐỂ GỬI OTP
            <View style={styles.formGroup}>
              <Text style={styles.label}>Số điện thoại của bạn:</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: 0912345678"
                placeholderTextColor={COLORS.textLight}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  setError('');
                }}
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
                  <Text style={styles.buttonText}>NHẬN MÃ OTP XÁC THỰC</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            // BƯỚC 2: NHẬP MÃ OTP ĐỂ ĐĂNG NHẬP
            <View style={styles.formGroup}>
              <Text style={styles.phoneInfo}>
                Đang gửi mã về số: <Text style={{ fontWeight: 'bold', color: COLORS.text }}>{phone}</Text>
              </Text>
              
              <TouchableOpacity 
                style={styles.changePhoneButton} 
                onPress={() => { setStep(1); setError(''); setOtp(''); }}
              >
                <Text style={styles.changePhoneText}>⬅ Nhập lại số điện thoại khác</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Nhập mã gồm 4 số được gửi tới máy:</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="Nhập 4 số"
                placeholderTextColor={COLORS.textLight}
                keyboardType="number-pad"
                maxLength={4}
                value={otp}
                onChangeText={(text) => {
                  setOtp(text);
                  setError('');
                }}
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
            </View>
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
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingVertical: 40,
    paddingHorizontal: 32,
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
  errorContainer: {
    backgroundColor: COLORS.dangerLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: COLORS.dangerDark,
    fontSize: FONTS.body,
    fontWeight: '600',
    lineHeight: 22,
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
});
