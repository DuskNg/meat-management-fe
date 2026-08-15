// meat-management-fe/app/set-name.js
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { api } from '../src/api/client';
import { COLORS, FONTS } from '../src/theme';
import AnimatedPressable from '../src/components/AnimatedPressable';

export default function SetNameScreen() {
  const router = useRouter();
  const auth = useAuthStore();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Xử lý lưu tên người dùng
  const handleSaveName = async () => {
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setError('Bạn chưa nhập tên của mình.');
      return;
    }
    if (trimmedName.length < 2) {
      setError('Tên phải có độ dài tối thiểu 2 ký tự.');
      return;
    }
    if (trimmedName === 'Chủ buôn mới') {
      setError('Vui lòng chọn tên thật của bạn.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.put('/auth/profile', {
        name: trimmedName,
        phone: auth.user?.phone,
      });

      if (response.data.success && response.data.user) {
        // Cập nhật thông tin user mới nhất
        await auth.updateUser(response.data.user);
        
        // Chủ động chuyển hướng về trang chủ
        router.replace('/');
      } else {
        setError(response.data.message || 'Không thể lưu tên. Bạn vui lòng thử lại.');
      }
    } catch (err) {
      console.error('[SET_NAME] Lỗi khi lưu tên:', err);
      setError(err.response?.data?.message || 'Có lỗi xảy ra. Hãy kiểm tra kết nối mạng.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.innerContainer}
      >
        <View style={styles.content}>
          {/* Câu hỏi thân mật chào đón người dùng */}
          <Text style={styles.emoji}>👋</Text>
          <Text style={styles.title}>Tên của bạn là...</Text>
          <Text style={styles.subtitle}>
            Nhập tên thật để mọi người trong cửa hàng dễ dàng nhận biết bạn nhé.
          </Text>

          {/* Trường nhập tên tối giản, thân thiện */}
          <View style={[
            styles.inputContainer,
            isFocused && styles.inputContainerFocused
          ]}>
            <TextInput
              style={styles.input}
              placeholder="Nhập tên của bạn tại đây"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (text.trim() !== '') setError('');
              }}
              autoFocus={true}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!loading}
              onSubmitEditing={handleSaveName}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
          </View>

          {/* Dòng báo lỗi nhẹ nhàng nếu có */}
          {error ? (
            <Text style={styles.errorText}>⚠️ {error}</Text>
          ) : null}

          {/* Nút tiếp tục đơn giản */}
          <AnimatedPressable
            style={[styles.button, name.trim().length >= 2 ? styles.buttonActive : styles.buttonDisabled]}
            onPress={handleSaveName}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>Tiếp tục ➔</Text>
            )}
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 54,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
    paddingHorizontal: 10,
  },
  inputContainer: {
    width: '100%',
    borderBottomWidth: 2,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 8,
    marginBottom: 20,
  },
  inputContainerFocused: {
    borderBottomColor: COLORS.primary,
  },
  input: {
    fontSize: 22,
    color: '#0F172A',
    textAlign: 'center',
    fontWeight: '600',
    paddingVertical: 8,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
    }),
  },
  errorText: {
    fontSize: 14,
    color: COLORS.dangerDark,
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 24,
  },
  button: {
    height: 56,
    width: '100%',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  buttonActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
  },
  buttonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowColor: 'transparent',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
