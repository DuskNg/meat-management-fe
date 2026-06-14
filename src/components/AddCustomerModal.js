// meat-management-fe/src/components/AddCustomerModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Modal, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';

const AddCustomerModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Phơi bày các hàm điều khiển Modal ra ngoài component cha (App Index)
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
    }
  }));

  // 2. Xử lý tạo mới khách hàng
  const handleSubmit = async () => {
    if (!name || name.trim() === '') {
      setError('Tên khách hàng bắt buộc phải nhập.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/customers', {
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        note: note.trim() || null,
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh(); // Tải lại danh sách khách hàng ở trang chủ
      } else {
        setError(response.data.message || 'Có lỗi xảy ra khi thêm khách hàng.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centeredView}
      >
        {/* Lớp nền trong suốt click ngoài để tắt modal */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        />
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>➕ THÊM KHÁCH QUEN MỚI</Text>

          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Tên khách hàng (Bắt buộc):</Text>
            <TextInput
              style={styles.input}
              placeholder="Ví dụ: Chị Lan bán phở"
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
              placeholder="Ví dụ: 0912345678"
              placeholderTextColor={COLORS.textLight}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.label}>Địa chỉ / Số sạp hàng (Có thể bỏ qua):</Text>
            <TextInput
              style={styles.input}
              placeholder="Ví dụ: Sạp 12, Chợ Đầu Mối"
              placeholderTextColor={COLORS.textLight}
              value={address}
              onChangeText={setAddress}
            />

            <Text style={styles.label}>Ghi chú thói quen mua hàng (Có thể bỏ qua):</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ví dụ: Chỉ lấy sườn non buổi sáng, thanh toán cuối tuần"
              placeholderTextColor={COLORS.textLight}
              multiline={true}
              numberOfLines={3}
              value={note}
              onChangeText={setNote}
            />
          </ScrollView>

          {/* Các nút hành động to bản dưới chân modal */}
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
      </KeyboardAvoidingView>
    </Modal>
  );
});

export default AddCustomerModal;

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)', // Nền tối làm mờ màn hình sau
  },
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
    ...SHADOWS.card,
  },
  modalTitle: {
    fontSize: FONTS.title,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: FONTS.body,
    fontWeight: '600',
    marginBottom: 15,
  },
  formScroll: {
    marginBottom: 10,
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
  textArea: {
    height: 90,
    paddingTop: 12,
    textAlignVertical: 'top', // Dành cho Android
  },
  buttonContainer: {
    flexDirection: 'column', // Xếp chồng dọc để không bị tràn chữ
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
