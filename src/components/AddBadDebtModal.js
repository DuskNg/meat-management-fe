// meat-management-fe/src/components/AddBadDebtModal.js
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
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';

// Modal thêm khách hàng nợ xấu mới — dành riêng cho kho lưu trữ nợ xấu
const AddBadDebtModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Phơi bày hàm open/close ra ngoài component cha qua ref
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setName('');
      setAmount('');
      setPhone('');
      setAddress('');
      setNote('');
      setError('');
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Định dạng số tiền khi hiển thị (tách nghìn bằng dấu chấm)
  const formatAmountDisplay = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return parseInt(digits, 10).toLocaleString('vi-VN');
  };

  // Xử lý nhập số tiền: chỉ lấy ký tự số và định dạng lại
  const handleAmountChange = (text) => {
    const digits = text.replace(/\D/g, '');
    setAmount(digits);
    if (error) setError('');
  };

  // Xử lý tạo mới bản ghi nợ xấu
  const handleSubmit = async () => {
    if (loading) return;

    // Validate bắt buộc: Tên
    if (!name || name.trim() === '') {
      setError('Tên khách hàng là thông tin bắt buộc.');
      return;
    }

    // Validate bắt buộc: Số tiền nợ
    if (!amount || amount.trim() === '') {
      setError('Số tiền nợ là thông tin bắt buộc.');
      return;
    }
    const debtAmount = parseFloat(amount);
    if (isNaN(debtAmount) || debtAmount <= 0) {
      setError('Số tiền nợ phải là số dương hợp lệ.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/customers', {
        name: name.trim(),
        phone: phone.replace(/\s+/g, '') || null,
        address: address.trim() || null,
        note: note.trim() || null,
        isBadDebt: true,          // Tạo thẳng vào kho nợ xấu
        manualDebt: debtAmount,   // Số tiền nợ ban đầu được nhập thủ công
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Có lỗi xảy ra khi thêm bản ghi nợ xấu.');
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
        {/* Tiêu đề modal */}
        <View style={styles.titleRow}>
          <Text style={styles.titleIcon}>⚠️</Text>
          <Text style={styles.modalTitle}>THÊM NỢ XẤU MỚI</Text>
        </View>
        <Text style={styles.modalSubtitle}>Ghi lại thông tin khách hàng khó đòi nợ</Text>

        {/* Hiển thị lỗi nếu có */}
        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          {/* Trường bắt buộc: Tên */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Tên người nợ</Text>
              <View style={styles.requiredBadge}>
                <Text style={styles.requiredText}>Bắt buộc</Text>
              </View>
            </View>
            <TextInput
              style={[styles.input, styles.inputHighlight]}
              placeholder="Ví dụ: Anh Tuấn chợ Bình Điền"
              placeholderTextColor={COLORS.textLight}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError('');
              }}
            />
          </View>

          {/* Trường bắt buộc: Số tiền nợ */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Số tiền nợ (VNĐ)</Text>
              <View style={styles.requiredBadge}>
                <Text style={styles.requiredText}>Bắt buộc</Text>
              </View>
            </View>
            <View style={styles.amountInputWrapper}>
              <TextInput
                style={[styles.input, styles.inputHighlight, styles.amountInput]}
                placeholder="Ví dụ: 5.000.000"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                value={amount ? parseInt(amount, 10).toLocaleString('vi-VN') : ''}
                onChangeText={handleAmountChange}
              />
              <Text style={styles.currencyLabel}>đ</Text>
            </View>
          </View>

          {/* Đường phân cách: Trường không bắt buộc */}
          <View style={styles.optionalDivider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Thông tin thêm (có thể bỏ qua)</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Trường không bắt buộc: SĐT */}
          <View style={styles.fieldGroup}>
            <Text style={styles.labelOptional}>Số điện thoại liên hệ</Text>
            <TextInput
              style={styles.input}
              placeholder="Ví dụ: 0912345678"
              placeholderTextColor={COLORS.textLight}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(text) => setPhone(text.replace(/\s+/g, ''))}
            />
          </View>

          {/* Trường không bắt buộc: Nơi ở */}
          <View style={styles.fieldGroup}>
            <Text style={styles.labelOptional}>Địa chỉ / Nơi ở</Text>
            <TextInput
              style={styles.input}
              placeholder="Ví dụ: 12 Nguyễn Trãi, Quận 5"
              placeholderTextColor={COLORS.textLight}
              value={address}
              onChangeText={setAddress}
            />
          </View>

          {/* Trường không bắt buộc: Ghi chú */}
          <View style={styles.fieldGroup}>
            <Text style={styles.labelOptional}>Ghi chú</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ví dụ: Đã liên hệ nhiều lần, không bắt máy. Số nợ tính đến tháng 6/2025."
              placeholderTextColor={COLORS.textLight}
              multiline={true}
              numberOfLines={3}
              value={note}
              onChangeText={setNote}
            />
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
              <Text style={styles.submitButtonText}>⚠️ LƯU NỢ XẤU</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => setVisible(false)}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Hủy bỏ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default AddBadDebtModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '92%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  titleIcon: {
    fontSize: 20,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: FONTS.weightBold,
    color: '#92400E', // Màu nâu cam cảnh báo
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 14,
  },
  formScroll: {
    marginBottom: 10,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
  },
  labelOptional: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  requiredBadge: {
    backgroundColor: '#FEF3C7', // Vàng nhạt
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  requiredText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#92400E',
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
  },
  inputHighlight: {
    borderColor: '#F59E0B', // Viền vàng cam cho trường bắt buộc
    borderWidth: 1.5,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountInput: {
    flex: 1,
  },
  currencyLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
    paddingRight: 4,
  },
  textArea: {
    height: 72,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  optionalDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: 11,
    color: COLORS.textLight,
    fontStyle: 'italic',
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
    backgroundColor: '#D97706', // Màu cam vàng cảnh báo
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
