// meat-management-fe/src/components/ProfileModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView,
} from 'react-native';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';

const ProfileModal = forwardRef((props, ref) => {
  const auth = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 1. Phơi bày các hàm điều khiển Modal ra ngoài component cha qua ref
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setError('');
      setSuccess('');
      fetchProfile();
    },
    close: () => {
      setVisible(false);
    },
    submit: () => {
      handleSubmit();
    }
  }));

  // 2. Tải thông tin hồ sơ mới nhất từ backend
  const fetchProfile = async () => {
    setFetching(true);
    setError('');
    try {
      const response = await api.get('/auth/profile');
      if (response.data.success) {
        const { user } = response.data;
        setName(user.name);
        setPhone(user.phone);
        // Định dạng ngày tham gia (createdAt)
        if (user.createdAt) {
          const date = new Date(user.createdAt);
          const formattedDate = date.toLocaleDateString('vi-VN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          setCreatedAt(formattedDate);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải thông tin hồ sơ.');
    } finally {
      setFetching(false);
    }
  };

  // Kiểm tra định dạng số điện thoại di động Việt Nam
  const validatePhone = (value) => {
    const phoneRegex = /^(0|84|\+84)[35789][0-9]{8}$/;
    return phoneRegex.test(value.trim());
  };

  // 3. Xử lý cập nhật thông tin hồ sơ
  const handleSubmit = async () => {
    if (loading) return; // Ngăn chặn bấm đúp khi đang gửi yêu cầu
    if (!name || name.trim() === '') {
      setError('Tên chủ buôn không được để trống.');
      return;
    }
    if (!phone || phone.trim() === '') {
      setError('Số điện thoại không được để trống.');
      return;
    }
    if (!validatePhone(phone)) {
      setError('Số điện thoại không đúng định dạng Việt Nam (Ví dụ: 0912345678).');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await api.put('/auth/profile', {
        name: name.trim(),
        phone: phone.replace(/\s+/g, ''),
      });

      if (response.data.success) {
        const { user, tokens, message } = response.data;
        // Cập nhật lại thông tin trong Zustand authStore và bộ nhớ thiết bị
        await auth.login(user, tokens);
        setSuccess(message || 'Cập nhật hồ sơ thành công!');
        
        // Tự động đóng modal sau 1.5 giây để người dùng kịp đọc thông báo thành công
        setTimeout(() => {
          setVisible(false);
        }, 1500);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
          <Text style={styles.modalTitle}>👤 HỒ SƠ CHỦ TÀI KHOẢN</Text>

          {fetching ? (
            <View style={styles.loadingWrapper}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Đang tải thông tin hồ sơ...</Text>
            </View>
          ) : (
            <>
              {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}
              {success ? <Text style={styles.successText}>✅ {success}</Text> : null}

              <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
                {createdAt ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Ngày tham gia:</Text>
                    <Text style={styles.infoValue}>{createdAt}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>Tên chủ buôn / Tên hiển thị:</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: Cô Hoa sạp thịt"
                  placeholderTextColor={COLORS.textLight}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setError('');
                  }}
                />

                <Text style={styles.label}>Số điện thoại đăng nhập (OTP):</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: 0912345678"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text.replace(/\s+/g, ''));
                    setError('');
                  }}
                />

                {/* Hộp cảnh báo về việc đổi số điện thoại */}
                <View style={styles.warningBox}>
                  <Text style={styles.warningTitle}>⚠️ CẢNH BÁO ĐỔI SỐ ĐIỆN THOẠI:</Text>
                  <Text style={styles.warningText}>
                    Số điện thoại này dùng làm tài khoản đăng nhập chính. Nếu bạn đổi số điện thoại, bạn sẽ phải dùng số mới này để nhận mã OTP cho các lần đăng nhập tiếp theo.
                  </Text>
                </View>
              </ScrollView>

              {/* Các nút hành động */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.submitButton]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitButtonText}>LƯU THAY ĐỔI</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => setVisible(false)}
                  disabled={loading}
                >
                  <Text style={styles.cancelButtonText}>ĐÓNG</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
      </View>
    </SmoothModal>
  );
});

export default ProfileModal;

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: FONTS.title,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingWrapper: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 12,
    borderRadius: 8,
    fontSize: FONTS.body,
    fontWeight: '600',
    marginBottom: 15,
  },
  successText: {
    color: '#065F46',
    backgroundColor: '#D1FAE5',
    padding: 12,
    borderRadius: 8,
    fontSize: FONTS.body,
    fontWeight: '600',
    marginBottom: 15,
  },
  formScroll: {
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoLabel: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: FONTS.body,
    color: COLORS.text,
    fontWeight: 'bold',
  },
  label: {
    fontSize: FONTS.subtitle,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 56,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: FONTS.body,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  warningBox: {
    backgroundColor: COLORS.warningLight,
    borderColor: '#FDE68A',
    borderWidth: 1,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: FONTS.body,
    color: '#92400E',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  warningText: {
    fontSize: FONTS.caption,
    color: '#B45309',
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 10,
  },
  button: {
    width: '100%',
    height: 58,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});
