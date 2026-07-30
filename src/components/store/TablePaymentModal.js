// meat-management-fe/src/components/store/TablePaymentModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import SmoothModal from '../SmoothModal';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';
import PinInputModal from '../PinInputModal';
import PinSetupModal from '../PinSetupModal';
import { hasPin, isSessionValid } from '../../store/pinStore';

/**
 * Component TablePaymentModal độc lập phục vụ việc ghi nhận thanh toán hóa đơn của từng bàn ăn.
 * Sử dụng forwardRef để phơi bày hàm open() và close() cho component cha.
 */
const TablePaymentModal = forwardRef(({ customerId, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maxAmount, setMaxAmount] = useState(null);
  const [targetMonthKey, setTargetMonthKey] = useState(null);

  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const isSubmittingRef = useRef(false);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value).replace('₫', 'đ');
  };

  useImperativeHandle(ref, () => ({
    open: (defaultAmount = '', monthKey = null) => {
      setVisible(true);
      const numericAmount = defaultAmount ? Math.round(parseFloat(defaultAmount)) : 0;
      setAmount(defaultAmount ? formatNumberString(numericAmount.toString()) : '');
      setMaxAmount(defaultAmount ? numericAmount : null);
      setTargetMonthKey(monthKey);
      setNote('');
      setError('');
    },
    close: () => {
      setVisible(false);
    }
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

  const handleQuickAmount = (value) => {
    if (maxAmount !== null && value > maxAmount) {
      setAmount(formatNumberString(maxAmount.toString()));
      setError(`Số tiền đã tự động điều chỉnh về mức nợ tối đa: ${formatCurrency(maxAmount)}`);
      return;
    }
    setAmount(formatNumberString(value.toString()));
    setError('');
  };

  // Yêu cầu xác thực mã PIN bảo mật
  const requirePin = async (action) => {
    const pinExists = await hasPin();
    if (!pinExists) {
      pinSetupRef.current?.open(action);
      return;
    }
    const sessionOk = await isSessionValid();
    if (sessionOk) {
      action();
    } else {
      pinInputRef.current?.open(action, 'xác nhận thanh toán bàn');
    }
  };

  // Ghi nhận thanh toán lên API store
  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;
    if (!amount || amount.trim() === '') {
      setError('Số tiền thanh toán không được để trống.');
      return;
    }
    const payAmount = parseNumberString(amount);

    if (payAmount <= 0) {
      setError('Số tiền thanh toán phải lớn hơn 0.');
      return;
    }

    if (maxAmount !== null && payAmount > maxAmount) {
      setError(`Số tiền thanh toán không vượt quá số tiền chưa thanh toán của bàn là ${formatCurrency(maxAmount)}.`);
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;
    try {
      let finalNote = note.trim();
      if (targetMonthKey) {
        const d = new Date();
        const dd = d.getDate().toString().padStart(2, '0');
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        const dateStr = `${dd}/${mm}/${yyyy}`;
        
        const prefix = `Thanh toán hóa đơn tháng ${targetMonthKey} (ngày ${dateStr})`;
        finalNote = finalNote ? `${prefix} - ${finalNote}` : prefix;
      }

      const response = await api.post('/store/payments', {
        customerId,
        amount: payAmount,
        note: finalNote || null,
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
        <Text style={styles.modalTitle}>🟢 THANH TOÁN HÓA ĐƠN BÀN</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>1. Số tiền đã thanh toán (VND):</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="Ví dụ: 200.000"
            placeholderTextColor={COLORS.textLight}
            keyboardType="number-pad"
            value={amount}
            onChangeText={(text) => {
              setAmount(formatNumberString(text));
              setError('');
            }}
          />

          <Text style={styles.subLabel}>Bấm chọn nhanh số tiền:</Text>
          <View style={styles.quickAmountContainer}>
            {[50000, 100000, 200000, 500000, 1000000].map((val) => (
              <TouchableOpacity
                key={val}
                style={styles.quickAmountButton}
                onPress={() => handleQuickAmount(val)}
              >
                <Text style={styles.quickAmountText}>
                  {val >= 1000000 ? `${val / 1000000} Triệu` : `${val / 1000}k`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 15 }]}>2. Phương thức / Ghi chú (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Tiền mặt / Chuyển khoản"
            placeholderTextColor={COLORS.textLight}
            value={note}
            onChangeText={setNote}
          />
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={() => requirePin(handleSubmit)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>XÁC NHẬN THANH TOÁN</Text>
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

      <PinInputModal ref={pinInputRef} />
      <PinSetupModal ref={pinSetupRef} />
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
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
    color: '#5B21B6',
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
    marginBottom: 15,
  },
  label: {
    fontSize: FONTS.body,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 8,
  },
  subLabel: {
    fontSize: FONTS.caption,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  amountInput: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    height: 60,
    color: '#5B21B6',
    borderColor: '#5B21B6',
  },
  quickAmountContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  quickAmountButton: {
    backgroundColor: COLORS.inputBg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickAmountText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
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
    backgroundColor: '#5B21B6',
    shadowColor: '#5B21B6',
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
});

export default TablePaymentModal;
