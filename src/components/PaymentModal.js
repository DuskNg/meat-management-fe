// meat-management-fe/src/components/PaymentModal.js
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
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';

const PaymentModal = forwardRef(({ customerId, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Số nợ tối đa của tháng để giới hạn số tiền trả nợ
  const [maxAmount, setMaxAmount] = useState(null);
  const [targetMonthKey, setTargetMonthKey] = useState(null); // Lưu trữ tháng cụ thể được chọn trả nợ

  // Định dạng hiển thị tiền VNĐ
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value).replace('₫', 'đ');
  };

  // 1. Phơi bày các hàm điều khiển Modal ra ngoài component cha (Customer Detail)
  useImperativeHandle(ref, () => ({
    open: (defaultAmount = '', monthKey = null) => {
      setVisible(true);
      setAmount(defaultAmount ? formatNumberString(defaultAmount.toString()) : '');
      setMaxAmount(defaultAmount ? parseFloat(defaultAmount) : null); // Thiết lập giới hạn thanh toán tối đa theo nợ tháng
      setTargetMonthKey(monthKey); // Lưu lại khóa tháng cụ thể (ví dụ: "07/2026")
      setNote('');
      setError('');
    },
    close: () => {
      setVisible(false);
    }
  }));

  // Tự động thêm phân tách hàng nghìn bằng dấu chấm khi gõ phím
  const formatNumberString = (value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    if (cleanValue === '') return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(cleanValue, 10));
  };

  // Chuyển chuỗi định dạng trở lại số nguyên để lưu
  const parseNumberString = (formattedValue) => {
    const cleanValue = formattedValue.replace(/[^0-9]/g, '');
    return cleanValue ? parseInt(cleanValue, 10) : 0;
  };

  // 2. Gợi ý điền nhanh số tiền (giúp người bán bấm nhanh các mốc chẵn)
  const handleQuickAmount = (value) => {
    // Nếu số tiền chọn nhanh lớn hơn nợ tối đa của tháng, tự động gán bằng nợ tối đa và báo lỗi nhẹ
    if (maxAmount !== null && value > maxAmount) {
      setAmount(formatNumberString(maxAmount.toString()));
      setError(`Số tiền đã tự động điều chỉnh về mức nợ tối đa của tháng: ${formatCurrency(maxAmount)}`);
      return;
    }
    setAmount(formatNumberString(value.toString()));
    setError('');
  };

  // 3. Xử lý ghi nhận thu tiền khách trả nợ
  const handleSubmit = async () => {
    if (!amount || amount.trim() === '') {
      setError('Số tiền trả nợ không được để trống.');
      return;
    }
    const payAmount = parseNumberString(amount);

    if (payAmount <= 0) {
      setError('Số tiền trả nợ phải lớn hơn 0 (Ví dụ: 200.000).');
      return;
    }

    // Validate không cho phép vượt quá tổng nợ của tháng
    if (maxAmount !== null && payAmount > maxAmount) {
      setError(`Số tiền trả nợ không được vượt quá tổng nợ của tháng là ${formatCurrency(maxAmount)}.`);
      return;
    }

    setError('');
    setLoading(true);
    try {
      // Nếu có chọn tháng cụ thể, tự động thêm tiền tố đặc thù để khấu trừ đúng tháng đó
      let finalNote = note.trim();
      if (targetMonthKey) {
        const prefix = `Thanh toán nợ Tháng ${targetMonthKey}`;
        finalNote = finalNote ? `${prefix} - ${finalNote}` : prefix;
      }

      const response = await api.post('/payments', {
        customerId,
        amount: payAmount,
        note: finalNote || null,
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh(); // Tải lại chi tiết khách hàng và lịch sử công nợ
      } else {
        setError(response.data.message || 'Lỗi ghi nhận tiền trả. Vui lòng thử lại.');
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
        <Text style={styles.modalTitle}>🟢 THU TIỀN KHÁCH TRẢ NỢ</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          {/* Nhập số tiền thu được */}
          <Text style={styles.label}>1. Số tiền khách đã trả (VND):</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="Ví dụ: 500.000"
            placeholderTextColor={COLORS.textLight}
            keyboardType="number-pad" // Hiển thị bàn phím số nguyên trên di động
            value={amount}
            onChangeText={(text) => {
              setAmount(formatNumberString(text));
              setError('');
            }}
          />

          {/* Các nút bấm điền nhanh số tiền chẵn */}
          <Text style={styles.subLabel}>Bấm chọn nhanh số tiền chẵn:</Text>
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

          {/* Ghi chú phương thức */}
          <Text style={[styles.label, { marginTop: 15 }]}>2. Cách thanh toán / Ghi chú (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Chuyển khoản Vietcombank / Tiền mặt"
            placeholderTextColor={COLORS.textLight}
            value={note}
            onChangeText={setNote}
          />
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
              <Text style={styles.submitButtonText}>XÁC NHẬN THU TIỀN</Text>
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

export default PaymentModal;

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
    color: COLORS.primary,
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
    color: COLORS.primary,
    borderColor: COLORS.primary,
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
