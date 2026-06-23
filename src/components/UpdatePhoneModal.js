// meat-management-fe/src/components/UpdatePhoneModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';

const UpdatePhoneModal = forwardRef(({ onUpdateSuccess }, ref) => {
  const [visible, setVisible] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successCallback, setSuccessCallback] = useState(null);

  // 1. Cung cấp các hành động ra bên ngoài thông qua useImperativeHandler và forwardRef
  useImperativeHandle(ref, () => ({
    open: (customerData, callback) => {
      setCustomer(customerData);
      setPhone(customerData?.phone || '');
      setError('');
      setLoading(false);
      setSuccessCallback(() => callback);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    }
  }));

  // 2. Xử lý lưu số điện thoại mới lên máy chủ
  const handleSubmit = async () => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      setError('Số điện thoại không hợp lệ. Vui lòng nhập từ 9 đến 11 chữ số.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await api.put(`/customers/${customer.id}`, {
        name: customer.name,
        phone: cleanPhone,
        address: customer.address || null,
        note: customer.note || null,
      });

      if (response.data.success) {
        setVisible(false);
        // Kích hoạt callback để tiếp tục tiến trình tải ảnh và gửi Zalo
        if (successCallback) {
          successCallback(cleanPhone);
        }
        // Gọi callback chung thông báo cập nhật danh sách
        if (onUpdateSuccess) {
          onUpdateSuccess();
        }
      } else {
        setError(response.data.message || 'Không thể lưu số điện thoại.');
      }
    } catch (err) {
      console.error('[UPDATE PHONE ERROR]', err);
      setError(err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>📞 THIẾT LẬP SỐ ĐIỆN THOẠI ZALO</Text>
        
        <Text style={styles.description}>
          Khách hàng <Text style={styles.boldText}>{customer?.name}</Text> chưa có số điện thoại liên hệ. Vui lòng nhập số điện thoại để hệ thống tải ảnh và mở Zalo gửi công nợ.
        </Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Nhập số điện thoại Zalo (ví dụ: 0912345678)"
          placeholderTextColor={COLORS.textLight}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(text) => {
            setPhone(text);
            setError('');
          }}
          autoFocus={true}
        />

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>LƯU & TIẾP TỤC</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => setVisible(false)}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>HỦY BỎ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default UpdatePhoneModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 15,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  boldText: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
