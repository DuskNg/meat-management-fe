// meat-management-fe/src/components/SupplierPaymentModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import MoneyInput from './MoneyInput';
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

// Modal ghi nhận việc chủ sạp trả tiền hàng cho nhà cung cấp
const SupplierPaymentModal = forwardRef(({ supplier, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [amountVND, setAmountVND] = useState(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSubmittingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    open: (defaultAmount = '') => {
      setVisible(true);
      const numericAmount = defaultAmount ? Math.round(parseFloat(defaultAmount)) : 0;
      setAmountVND(numericAmount);
      setNote('');
      setError('');
    },
    close: () => {
      setVisible(false);
    },
  }));

  const formatNumberString = (value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    if (cleanValue === '') return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(cleanValue, 10));
  };

  const parseNumberString = (formattedValue) => {
    const cleanValue = formattedValue.replace(/[^0-9]/g, '');
    return cleanValue ? parseInt(cleanValue, 10) : 0;
  };

  // Xác nhận lưu giao dịch trả tiền
  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;
    const payAmount = amountVND;
    if (!payAmount || payAmount <= 0) {
      setError('Số tiền trả nợ không được để trống và phải lớn hơn 0.');
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;
    try {
      const response = await api.post('/suppliers/payments', {
        supplierId: supplier?.id,
        amount: payAmount,
        note: note.trim() || null,
        paidAt: new Date(),
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi ghi nhận thanh toán. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>💵 GHI NHẬN TRẢ TIỀN HÀNG</Text>
        <Text style={styles.supplierName}>Nhà cung cấp: {supplier?.name}</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Số tiền đã trả (VND):</Text>
          <MoneyInput
            style={styles.amountInputContainer}
            inputStyle={styles.amountInput}
            value={amountVND}
            onChangeValue={(val) => {
              setAmountVND(val);
              setError('');
            }}
            placeholder="Ví dụ: 5.000"
          />

          <Text style={styles.label}>Cách thức thanh toán / Ghi chú (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Chuyển khoản Vietcombank / Tiền mặt tại sạp"
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
              <Text style={styles.submitButtonText}>XÁC NHẬN TRẢ TIỀN</Text>
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

export default SupplierPaymentModal;

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
    color: '#059669', // Xanh lá thu tiền thanh toán
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
  amountInputContainer: {
    height: 48,
    marginBottom: 12,
    borderColor: COLORS.border,
  },
  amountInput: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#059669',
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
    backgroundColor: '#059669',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
