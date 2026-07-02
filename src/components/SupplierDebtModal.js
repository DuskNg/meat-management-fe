// meat-management-fe/src/components/SupplierDebtModal.js
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

// Modal để ghi nợ mới (chủ sạp nợ nhà cung cấp khi nhập hàng)
const SupplierDebtModal = forwardRef(({ supplier, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setAmount('');
      setNote('');
      setError('');
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Hàm định dạng số tiền nhập vào
  const formatNumberString = (value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    if (cleanValue === '') return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(cleanValue, 10));
  };

  const parseNumberString = (formattedValue) => {
    const cleanValue = formattedValue.replace(/[^0-9]/g, '');
    return cleanValue ? parseInt(cleanValue, 10) : 0;
  };

  // Xác nhận lưu giao dịch nhập hàng
  const handleSubmit = async () => {
    if (loading) return;
    if (!amount || amount.trim() === '') {
      setError('Số tiền hàng nhập không được để trống.');
      return;
    }
    const debtAmount = parseNumberString(amount);
    if (debtAmount <= 0) {
      setError('Số tiền hàng nhập phải lớn hơn 0.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/suppliers/transactions', {
        supplierId: supplier?.id,
        totalAmount: debtAmount,
        note: note.trim() || null,
        date: new Date(),
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi ghi nhận tiền hàng. Vui lòng thử lại.');
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
        <Text style={styles.modalTitle}>📥 GHI NHẬN NHẬP HÀNG (GHI NỢ)</Text>
        <Text style={styles.supplierName}>Nhà cung cấp: {supplier?.name}</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Số tiền hàng nhập (VND):</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="Ví dụ: 10.000.000"
            placeholderTextColor={COLORS.textLight}
            keyboardType="number-pad"
            value={amount}
            onChangeText={(text) => {
              setAmount(formatNumberString(text));
              setError('');
            }}
          />

          <Text style={styles.label}>Ghi chú đơn hàng (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Nhập 150kg thịt mông sấn"
            placeholderTextColor={COLORS.textLight}
            value={note}
            onChangeText={setNote}
          />
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>GHI NỢ MỚI</Text>
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

export default SupplierDebtModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: '#7F1D1D', // Màu đỏ đun Bordeaux cảnh báo nợ
    textAlign: 'center',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
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
  amountInput: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#7F1D1D',
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
    backgroundColor: '#7F1D1D',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
