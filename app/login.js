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
    if (!phone || phone.trim().length < 9) {
      setError('Vui lòng nhập số điện thoại hợp lệ (từ 9-11 chữ số).');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/request-otp', { phone: phone.trim() });
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
        name: 'Chủ buôn mới', // Tên mặc định khi tạo mới
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
          <Text style={styles.appName}>🥩 Meat Manager</Text>
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
                placeholder="Nhập số điện thoại (Ví dụ: 0901234567)"
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

              <Text style={[styles.label, { marginTop: 15 }]}>Nhập mã gồm 4 số được gửi tới máy:</Text>
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
                style={[styles.button, { backgroundColor: COLORS.primary }]}
                onPress={handleVerifyOtp}
                disabled={loading}
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
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    ...SHADOWS.card,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  appDesc: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 30,
  },
  errorContainer: {
    backgroundColor: COLORS.dangerLight,
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FCA5A5',
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
    fontSize: FONTS.subtitle,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 10,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 60,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 20,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
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
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
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
    marginBottom: 20,
  },
  changePhoneText: {
    color: COLORS.primaryDark,
    fontSize: FONTS.body,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
