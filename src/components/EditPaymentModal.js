// meat-management-fe/src/components/EditPaymentModal.js
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
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import DatePickerInput from './DatePickerInput';
import PinInputModal from './PinInputModal';
import PinSetupModal from './PinSetupModal';
import { hasPin, isSessionValid } from '../store/pinStore';

const EditPaymentModal = forwardRef(({ onRefresh }, ref) => {
  // ─── Helper: Chuyển ISO date sang DD/MM/YYYY ─────────────────────────────
  const formatDateToDisplay = (dateInput) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  // ─── Helper: chuỗi DD/MM/YYYY → ISO string để gửi API ──────────────────
  const parseDateString = (str) => {
    const parts = str.trim().split(/[\/\-]/);
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const dateObj = new Date(year, month - 1, day);
    if (
      dateObj.getFullYear() !== year ||
      dateObj.getMonth() !== month - 1 ||
      dateObj.getDate() !== day
    ) return null;
    return dateObj.toISOString();
  };

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

  // ─── State ──────────────────────────────────────────────────────────────
  const [visible, setVisible] = useState(false);
  const [paymentId, setPaymentId] = useState(null);
  const [amount, setAmount] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Refs cho 2 modal PIN
  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);

  // 1. Phơi bày các hàm điều khiển Modal ra ngoài component cha (Customer Detail)
  useImperativeHandle(ref, () => ({
    open: (payment) => {
      if (!payment) return;
      setPaymentId(payment.id);
      setAmount(formatNumberString(payment.amount.toString()));
      setDateStr(formatDateToDisplay(payment.date));
      setNote(payment.note || '');
      setError('');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Gợi ý điền nhanh số tiền (giúp người bán bấm nhanh các mốc chẵn)
  const handleQuickAmount = (value) => {
    setAmount(formatNumberString(value.toString()));
    setError('');
  };

  // Kiểm tra PIN trước khi thực hiện thao tác tài chính nhạy cảm
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
      pinInputRef.current?.open(action, 'sửa lượt thu tiền');
    }
  };

  // Xử lý gửi cập nhật lượt thu tiền
  const handleSubmit = async () => {
    if (loading) return; // Ngăn chặn bấm đúp khi đang gửi yêu cầu
    if (!amount || amount.trim() === '') {
      setError('Số tiền trả nợ không được để trống.');
      return;
    }
    const payAmount = parseNumberString(amount);
    if (payAmount <= 0) {
      setError('Số tiền trả nợ phải lớn hơn 0.');
      return;
    }

    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày thu tiền không đúng định dạng (Ví dụ: 14/06/2026).');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.put(`/payments/${paymentId}`, {
        amount: payAmount,
        paidAt: isoDate,
        note: note.trim() || null,
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi cập nhật. Vui lòng thử lại.');
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
        <Text style={styles.modalTitle}>✏️ SỬA LƯỢT THU TIỀN</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          {/* Nhập số tiền thu được */}
          <Text style={styles.label}>1. Số tiền khách đã trả (VND):</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="Ví dụ: 500.000"
            placeholderTextColor={COLORS.textLight}
            keyboardType="number-pad"
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

          {/* Ngày thu tiền */}
          <Text style={[styles.label, { marginTop: 10 }]}>2. Ngày thu tiền:</Text>
          <DatePickerInput value={dateStr} onChange={setDateStr} />

          {/* Ghi chú phương thức */}
          <Text style={[styles.label, { marginTop: 5 }]}>3. Cách thanh toán / Ghi chú (Có thể bỏ qua):</Text>
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
            onPress={() => requirePin(handleSubmit)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>XÁC NHẬN CẬP NHẬT</Text>
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

      {/* Modal nhập PIN khi phiên hết hạn */}
      <PinInputModal ref={pinInputRef} />
      {/* Modal tạo PIN lần đầu */}
      <PinSetupModal ref={pinSetupRef} />
    </SmoothModal>
  );
});

export default EditPaymentModal;

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
