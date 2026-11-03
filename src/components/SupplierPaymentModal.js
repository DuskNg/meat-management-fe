// meat-management-fe/src/components/SupplierPaymentModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import MoneyInput from './MoneyInput';
import DatePickerInput from './DatePickerInput';
import CustomSelect from './CustomSelect';
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
import { showGlobalToast } from '../store/toastStore';

// Helper: lấy ngày hôm nay dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
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

// Modal ghi nhận việc chủ sạp trả tiền hàng cho nhà cung cấp
const SupplierPaymentModal = forwardRef(({ supplier, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState(supplier);
  const [dateStr, setDateStr] = useState(getTodayFormatted());
  const [amountVND, setAmountVND] = useState(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSubmittingRef = useRef(false);

  // Cấn trừ nợ 2 đầu (Khách hàng chuyển khoản thẳng vào tài khoản Nhà cung cấp)
  const [isOffsetCustomer, setIsOffsetCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customersList, setCustomersList] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Đồng bộ nhà cung cấp khi prop supplier thay đổi
  useEffect(() => {
    if (supplier) {
      setCurrentSupplier(supplier);
    }
  }, [supplier]);

  // Tải danh sách khách hàng để cấn trừ nợ
  const loadCustomers = async () => {
    if (customersList.length > 0) return;
    setLoadingCustomers(true);
    try {
      const res = await api.get('/customers?isBadDebt=false');
      if (res.data.success && Array.isArray(res.data.data)) {
        setCustomersList(res.data.data);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách khách hàng:', err.message);
    } finally {
      setLoadingCustomers(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (defaultAmount = '', targetSupplier) => {
      if (targetSupplier) {
        setCurrentSupplier(targetSupplier);
      }
      setVisible(true);
      setDateStr(getTodayFormatted());
      const numericAmount = defaultAmount ? Math.round(parseFloat(defaultAmount)) : 0;
      setAmountVND(numericAmount);
      setNote('');
      setIsOffsetCustomer(false);
      setSelectedCustomer(null);
      setError('');
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Xác nhận lưu giao dịch trả tiền
  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;
    const payAmount = amountVND;
    if (!payAmount || payAmount <= 0) {
      setError('Số tiền trả nợ không được để trống và phải lớn hơn 0.');
      return;
    }

    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày thanh toán không đúng định dạng (Ví dụ: 14/06/2026).');
      return;
    }

    const activeSupplier = currentSupplier || supplier;
    if (!activeSupplier?.id) {
      setError('Không tìm thấy thông tin nhà cung cấp.');
      return;
    }

    // Nếu chọn cấn trừ khách hàng, bắt buộc phải chọn khách hàng
    if (isOffsetCustomer && !selectedCustomer) {
      setError('Vui lòng chọn Khách hàng chuyển tiền để cấn trừ nợ.');
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;
    try {
      const response = await api.post('/suppliers/payments', {
        supplierId: activeSupplier.id,
        amount: payAmount,
        note: note.trim() || null,
        paidAt: isoDate,
        customerId: isOffsetCustomer && selectedCustomer ? selectedCustomer.id : undefined,
      });

      if (response.data.success) {
        setVisible(false);
        showGlobalToast(
          isOffsetCustomer
            ? `🎉 Đã cấn trừ nợ thành công cho NCC và khách ${selectedCustomer?.name || ''}!`
            : 'Đã ghi nhận thanh toán thành công!',
          'success'
        );
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
        <Text style={styles.supplierName}>
          Nhà cung cấp: {currentSupplier?.name || supplier?.name || ''}
        </Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          {/* Ô chọn ngày thanh toán */}
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

          {/* Tùy chọn cấn trừ nợ: Khách chuyển thẳng cho NCC */}
          <View style={styles.offsetCard}>
            <TouchableOpacity
              style={styles.offsetToggleRow}
              activeOpacity={0.8}
              onPress={() => {
                const nextVal = !isOffsetCustomer;
                setIsOffsetCustomer(nextVal);
                if (nextVal) {
                  loadCustomers();
                } else {
                  setSelectedCustomer(null);
                }
              }}
            >
              <View style={[styles.checkbox, isOffsetCustomer && styles.checkboxActive]}>
                {isOffsetCustomer ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.offsetTitle}>⚡ Khách hàng chuyển khoản thẳng vào TK này</Text>
                <Text style={styles.offsetSubtitle}>
                  Tự động trừ nợ đồng thời cả Khách & Nhà cung cấp (tránh bị quên lệch nợ)
                </Text>
              </View>
            </TouchableOpacity>

            {isOffsetCustomer ? (
              <View style={styles.customerSelectBox}>
                <Text style={styles.customerSelectLabel}>
                  CHỌN KHÁCH HÀNG CHUYỂN TIỀN <Text style={{ color: COLORS.danger }}>*</Text>:
                </Text>
                {loadingCustomers ? (
                  <ActivityIndicator size="small" color="#059669" style={{ marginVertical: 8 }} />
                ) : (
                  <CustomSelect
                    value={selectedCustomer}
                    options={customersList}
                    placeholder="-- Gõ tìm hoặc chọn khách hàng --"
                    getOptionLabel={(c) => c ? `${c.name}${c.phone ? ` (${c.phone})` : ''}` : ''}
                    renderSelected={(c) => (c ? c.name : '')}
                    onSelect={(c) => {
                      setSelectedCustomer(c);
                      setError('');
                    }}
                    triggerStyle={styles.customSelectTrigger}
                  />
                )}
              </View>
            ) : null}
          </View>
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
              <Text style={styles.submitButtonText}>
                {isOffsetCustomer ? '⚡ XÁC NHẬN CẤN TRỪ 2 BÊN' : 'XÁC NHẬN TRẢ TIỀN'}
              </Text>
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
  offsetCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  offsetToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  offsetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },
  offsetSubtitle: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  customerSelectBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#DCFCE7',
  },
  customerSelectLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  customSelectTrigger: {
    borderWidth: 0,
    borderColor: 'transparent',
    outlineStyle: 'none',
    outlineWidth: 0,
    boxShadow: 'none',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
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
