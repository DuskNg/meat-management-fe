// meat-management-fe/src/components/AddSupplierModal.js
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
import { COLORS, FONTS } from '../theme';
import SmoothModal from './SmoothModal';

// Modal thêm nhà cung cấp mới của chủ sạp
const AddSupplierModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Phơi bày các hàm điều khiển modal ra component cha qua ref
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setName('');
      setPhone('');
      setAddress('');
      setNote('');
      setError('');
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Xử lý tạo mới nhà cung cấp
  const handleSubmit = async () => {
    if (loading) return; // Tránh click đúp
    if (!name || name.trim() === '') {
      setError('Tên nhà cung cấp bắt buộc phải nhập.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/suppliers', {
        name: name.trim(),
        phone: phone.replace(/\s+/g, '') || null,
        address: address.trim() || null,
        note: note.trim() || null,
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh(); // Làm mới danh sách nhà cung cấp
      } else {
        setError(response.data.message || 'Có lỗi xảy ra khi thêm nhà cung cấp.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>📦 THÊM NHÀ CUNG CẤP MỚI</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Tên nhà cung cấp (Bắt buộc):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Lò mổ Hùng Vương, Cơ sở sỉ Anh Ba"
            placeholderTextColor={COLORS.textLight}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError('');
            }}
          />

          <Text style={styles.label}>Số điện thoại liên hệ (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: 0987654321"
            placeholderTextColor={COLORS.textLight}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(text) => setPhone(text.replace(/\s+/g, ''))}
          />

          <Text style={styles.label}>Địa chỉ cơ sở (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Sạp 40, Chợ Đầu Mối Bình Điền"
            placeholderTextColor={COLORS.textLight}
            value={address}
            onChangeText={setAddress}
          />

          <Text style={styles.label}>Ghi chú thêm (Có thể bỏ qua):</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Ví dụ: Giao hàng vào 4h sáng hàng ngày, thanh toán chuyển khoản cuối tháng"
            placeholderTextColor={COLORS.textLight}
            multiline={true}
            numberOfLines={3}
            value={note}
            onChangeText={setNote}
          />
        </ScrollView>

        {/* Cụm nút hành động */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>THÊM NGAY</Text>
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

export default AddSupplierModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 15,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 15,
  },
  formScroll: {
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  textArea: {
    height: 68,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 10,
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
    fontSize: 15,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
