// meat-management-fe/src/components/PaymentModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
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
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, FONTS } from '../theme';
import PinInputModal from './PinInputModal';
import PinSetupModal from './PinSetupModal';
import { hasPin, isSessionValid } from '../store/pinStore';
import { useResourceLock } from '../hooks/useResourceLock';
import { showGlobalToast } from '../store/toastStore';

// Helper: lấy ngày hôm nay dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Helper: chuyển DD/MM/YYYY sang ISO string (đặt 12:00 trưa để tránh lệch múi giờ UTC)
const parseDateString = (str) => {
  if (!str) return null;
  const parts = str.trim().split(/[\/\-]/);
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const dateObj = new Date(year, month - 1, day, 12, 0, 0);
  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) return null;
  return dateObj.toISOString();
};

const PaymentModal = forwardRef(({ customerId, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);

  // Tự động khóa khách hàng khi mở modal thu tiền
  useResourceLock('CUSTOMER', customerId, visible, () => setVisible(false));
  const [amountVND, setAmountVND] = useState(0);
  const [dateStr, setDateStr] = useState(getTodayFormatted());
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Số nợ tối đa của tháng để giới hạn số tiền trả nợ
  const [maxAmount, setMaxAmount] = useState(null);
  const [targetMonthKey, setTargetMonthKey] = useState(null); // Lưu trữ tháng cụ thể được chọn trả nợ

  // Cấn trừ nợ 2 đầu (Khách chuyển thẳng vào tài khoản Nhà cung cấp)
  const [isOffsetSupplier, setIsOffsetSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [suppliersList, setSuppliersList] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Refs cho 2 modal PIN
  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const isSubmittingRef = useRef(false);

  // Định dạng hiển thị tiền VNĐ
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(value).replace('₫', 'đ');
  };

  // Tải danh sách nhà cung cấp để cấn trừ nợ
  const loadSuppliers = async () => {
    if (suppliersList.length > 0) return;
    setLoadingSuppliers(true);
    try {
      const res = await api.get('/suppliers');
      if (res.data.success && Array.isArray(res.data.data)) {
        setSuppliersList(res.data.data);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách nhà cung cấp:', err.message);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // 1. Phơi bày các hàm điều khiển Modal ra ngoài component cha (Customer Detail)
  useImperativeHandle(ref, () => ({
    open: (defaultAmount = '', monthKey = null, defaultNote = '', defaultDate = null) => {
      setVisible(true);
      // Làm tròn số nợ đề xuất để tránh lỗi phần thập phân (float) của tiền VNĐ
      const numericAmount = defaultAmount ? Math.round(parseFloat(defaultAmount)) : 0;
      setAmountVND(numericAmount);
      setMaxAmount((monthKey && defaultAmount) ? numericAmount : null);
      setTargetMonthKey(monthKey);
      setNote(defaultNote || '');
      setDateStr(defaultDate || getTodayFormatted());
      setIsOffsetSupplier(false);
      setSelectedSupplier(null);
      setError('');
    },
    close: () => {
      setVisible(false);
    },
  }));

  // 2. Gợi ý điền nhanh số tiền (giúp người bán bấm nhanh các mốc chẵn)
  const handleQuickAmount = (value) => {
    // Nếu số tiền chọn nhanh lớn hơn nợ tối đa của tháng, tự động gán bằng nợ tối đa và báo lỗi nhẹ
    if (maxAmount !== null && value > maxAmount) {
      setAmountVND(maxAmount);
      setError(`Số tiền đã tự động điều chỉnh về mức nợ tối đa của tháng: ${formatCurrency(maxAmount)}`);
      return;
    }
    setAmountVND(value);
    setError('');
  };

  // 3. Kiểm tra PIN trước khi thực hiện thao tác tài chính nhạy cảm (Chặn bấm đúp / spam nút bấm)
  const requirePin = async (action) => {
    if (loading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const pinExists = await hasPin();
      if (!pinExists) {
        isSubmittingRef.current = false;
        pinSetupRef.current?.open(action);
        return;
      }
      const sessionOk = await isSessionValid();
      if (sessionOk) {
        // Phiên còn hạn → thực hiện ngay không cần nhập lại PIN
        await action();
      } else {
        isSubmittingRef.current = false;
        pinInputRef.current?.open(action, 'xác nhận thu tiền');
      }
    } catch (err) {
      isSubmittingRef.current = false;
      throw err;
    }
  };

  // 4. Ghi nhận thu tiền khách trả nợ (gọi sau khi xác thực PIN thành công)
  const handleSubmit = async () => {
    const payAmount = amountVND;
    if (!payAmount || payAmount <= 0) {
      setError('Số tiền trả nợ phải lớn hơn 0 (Ví dụ: 200.000).');
      isSubmittingRef.current = false;
      return;
    }

    // Validate không cho phép vượt quá tổng nợ của tháng
    if (maxAmount !== null && payAmount > maxAmount) {
      setError(`Số tiền trả nợ không được vượt quá tổng nợ của tháng là ${formatCurrency(maxAmount)}.`);
      isSubmittingRef.current = false;
      return;
    }

    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày thanh toán không đúng định dạng (Ví dụ: 14/06/2026).');
      isSubmittingRef.current = false;
      return;
    }

    // Nếu chọn cấn trừ nhà cung cấp, bắt buộc phải chọn nhà cung cấp
    if (isOffsetSupplier && !selectedSupplier) {
      setError('Vui lòng chọn Nhà cung cấp nhận tiền để cấn trừ nợ.');
      isSubmittingRef.current = false;
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;
    try {
      // Nếu có chọn tháng cụ thể, tự động thêm tiền tố đặc thù để khấu trừ đúng tháng đó kèm ngày thanh toán cụ thể
      let finalNote = note.trim();
      let finalPaidAt = isoDate;
      if (targetMonthKey) {
        const prefix = `Thanh toán nợ Tháng ${targetMonthKey} (ngày ${dateStr})`;
        finalNote = finalNote ? `${prefix} - ${finalNote}` : prefix;
      }

      const response = await api.post('/payments', {
        customerId,
        amount: payAmount,
        paidAt: finalPaidAt,
        note: finalNote || null,
        supplierId: isOffsetSupplier && selectedSupplier ? selectedSupplier.id : undefined,
      });

      if (response.data.success) {
        setVisible(false);
        showGlobalToast(
          isOffsetSupplier
            ? `🎉 Đã cấn trừ nợ thành công cho khách và NCC ${selectedSupplier?.name || ''}!`
            : 'Đã ghi nhận thu tiền thành công!',
          'success'
        );
        if (onRefresh) onRefresh(); // Tải lại chi tiết khách hàng và lịch sử công nợ
      } else {
        setError(response.data.message || 'Lỗi ghi nhận tiền trả. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>🟢 THU TIỀN KHÁCH TRẢ NỢ</Text>

          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            {/* Nhập số tiền thu được */}
            <Text style={styles.label}>1. Số tiền khách đã trả (VND):</Text>
            <MoneyInput
              style={styles.amountInputContainer}
              inputStyle={styles.amountInput}
              value={amountVND}
              onChangeValue={(val) => {
                setAmountVND(val);
                setError('');
              }}
              placeholder="Ví dụ: 500"
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

            {/* Ô chọn ngày thanh toán */}
            <Text style={[styles.label, { marginTop: 6 }]}>2. Ngày thanh toán:</Text>
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

            {/* Ghi chú phương thức */}
            <Text style={[styles.label, { marginTop: 15 }]}>3. Cách thanh toán / Ghi chú (Có thể bỏ qua):</Text>
            <TextInput
              style={styles.input}
              placeholder="Ví dụ: Chuyển khoản Vietcombank / Tiền mặt"
              placeholderTextColor={COLORS.textLight}
              value={note}
              onChangeText={setNote}
            />

            {/* 4. Tùy chọn cấn trừ nợ: Khách chuyển thẳng cho NCC */}
            <View style={styles.offsetCard}>
              <TouchableOpacity
                style={styles.offsetToggleRow}
                activeOpacity={0.8}
                onPress={() => {
                  const nextVal = !isOffsetSupplier;
                  setIsOffsetSupplier(nextVal);
                  if (nextVal) {
                    loadSuppliers();
                  } else {
                    setSelectedSupplier(null);
                  }
                }}
              >
                <View style={[styles.checkbox, isOffsetSupplier && styles.checkboxActive]}>
                  {isOffsetSupplier ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.offsetTitle}>⚡ Khách chuyển thẳng cho Nhà cung cấp</Text>
                  <Text style={styles.offsetSubtitle}>
                    Tự động trừ nợ đồng thời cả Khách & Nhà cung cấp (tránh bị quên lệch nợ)
                  </Text>
                </View>
              </TouchableOpacity>

              {isOffsetSupplier ? (
                <View style={styles.supplierSelectBox}>
                  <Text style={styles.supplierSelectLabel}>
                    CHỌN NHÀ CUNG CẤP NHẬN TIỀN <Text style={{ color: COLORS.danger }}>*</Text>:
                  </Text>
                  {loadingSuppliers ? (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 8 }} />
                  ) : (
                    <CustomSelect
                      value={selectedSupplier}
                      options={suppliersList}
                      placeholder="-- Gõ tìm hoặc chọn nhà cung cấp --"
                      getOptionLabel={(s) => s ? `${s.name}${s.phone ? ` (${s.phone})` : ''}` : ''}
                      renderSelected={(s) => (s ? s.name : '')}
                      onSelect={(s) => {
                        setSelectedSupplier(s);
                        setError('');
                      }}
                      triggerStyle={styles.customSelectTrigger}
                    />
                  )}
                </View>
              ) : null}
            </View>
          </ScrollView>

          {/* Các nút hành động */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.submitButton, isOffsetSupplier && styles.submitButtonOffset]}
              onPress={() => requirePin(handleSubmit)}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isOffsetSupplier ? '⚡ XÁC NHẬN CẤN TRỪ 2 BÊN' : 'XÁC NHẬN THU TIỀN'}
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

      {/* Modal nhập PIN khi phiên hết hạn & Modal tạo PIN độc lập ở tầng cao nhất */}
      <PinInputModal ref={pinInputRef} />
      <PinSetupModal ref={pinSetupRef} />
    </>
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
  amountInputContainer: {
    height: 60,
    marginBottom: 16,
    borderColor: COLORS.primary,
  },
  amountInput: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  quickAmountContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  datePickerWrapper: {
    marginBottom: 8,
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
  offsetCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
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
  supplierSelectBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#DCFCE7',
  },
  supplierSelectLabel: {
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
  submitButtonOffset: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
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
