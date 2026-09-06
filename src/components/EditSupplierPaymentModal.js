// meat-management-fe/src/components/EditSupplierPaymentModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import MoneyInput from './MoneyInput';
import DatePickerInput from './DatePickerInput';
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
import { COLORS, FONTS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

// Helper: chuyển ISO date thành DD/MM/YYYY
const formatDateToDisplay = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

// Helper: chuyển DD/MM/YYYY sang ISO string
const parseDateString = (str) => {
  if (!str) return null;
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

// Modal chỉnh sửa giao dịch trả tiền cho nhà cung cấp
const EditSupplierPaymentModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [paymentId, setPaymentId] = useState(null);
  const [supplierName, setSupplierName] = useState('');
  const [amountVND, setAmountVND] = useState(0);
  const [dateStr, setDateStr] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSubmittingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    open: (payment, name = '') => {
      if (!payment) return;
      setPaymentId(payment.id);
      setSupplierName(name || payment.supplierName || '');
      setAmountVND(payment.amount || 0);
      setDateStr(formatDateToDisplay(payment.date || payment.paidAt || payment.createdAt));
      setNote(payment.note || '');
      setError('');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;
    const payAmount = amountVND;
    if (!payAmount || payAmount <= 0) {
      setError('Số tiền thanh toán không được để trống và phải lớn hơn 0.');
      return;
    }

    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày thanh toán không đúng định dạng (Ví dụ: 14/06/2026).');
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;
    try {
      const response = await api.put(`/suppliers/payments/${paymentId}`, {
        amount: payAmount,
        paidAt: isoDate,
        note: note.trim() || null,
      });

      if (response.data.success) {
        setVisible(false);
        showGlobalToast('Đã cập nhật lượt thanh toán thành công!', 'success');
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi cập nhật thanh toán. Vui lòng thử lại.');
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
        <Text style={styles.modalTitle}>✏️ SỬA LƯỢT TRẢ TIỀN</Text>
        {supplierName ? (
          <Text style={styles.supplierName}>Nhà cung cấp: {supplierName}</Text>
        ) : null}

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          {/* Ngày thanh toán */}
          <Text style={styles.label}>📅 Ngày thanh toán:</Text>
          <View style={styles.datePickerWrapper}>
            <DatePickerInput
              value={dateStr}
              onChange={(val) => {
                setDateStr(val);
                setError('');
              }}
              allowFuture={true}
            />
          </View>

          {/* Số tiền thanh toán */}
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

          {/* Ghi chú */}
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
              <Text style={styles.submitButtonText}>LƯU THAY ĐỔI</Text>
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

export default EditSupplierPaymentModal;

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
    color: '#059669',
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
  datePickerWrapper: {
    marginBottom: 8,
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
