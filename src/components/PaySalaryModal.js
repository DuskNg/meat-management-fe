// meat-management-fe/src/components/PaySalaryModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect, useCallback, useMemo } from 'react';
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
import DatePickerInput from './DatePickerInput';
import MoneyInput from './MoneyInput';
import { api } from '../api/client';
import { COLORS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

// Định dạng tiền tệ VND
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0)) + ' đ';
};

// Định dạng ngày hiển thị DD/MM/YYYY
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

// Lấy tổng số ngày trong tháng
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

// Chuyển chuỗi ngày DD/MM/YYYY hoặc YYYY-MM-DD sang Date object
const parseDateStringToObj = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val !== 'string') return null;
  if (val.includes('/')) {
    const parts = val.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      return new Date(y, m - 1, d);
    }
  }
  if (val.includes('-')) {
    const parts = val.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      return new Date(y, m - 1, d);
    }
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// Chuyển chuỗi ngày sang chuẩn ISO YYYY-MM-DD gửi API backend
const convertToISODate = (val) => {
  if (!val) return '';
  if (val.includes('/')) {
    const parts = val.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return val;
};

// Tính toán ngày công và số tiền lương theo khoảng ngày (tức thì tại Client)
const getRangeCalculation = (fDateStr, tDateStr, baseSalary, startDateStr) => {
  const dFrom = parseDateStringToObj(fDateStr);
  const dTo = parseDateStringToObj(tDateStr);
  if (!dFrom || !dTo || dFrom > dTo || !baseSalary) {
    return { days: 0, dailySalary: 0, calculatedSalary: 0 };
  }

  const year = dFrom.getFullYear();
  const month = dFrom.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  const dailySalary = Math.round(baseSalary / daysInMonth);

  let effectiveFrom = new Date(dFrom.getTime());
  if (startDateStr) {
    const sDate = parseDateStringToObj(startDateStr);
    if (sDate && sDate > effectiveFrom) {
      effectiveFrom = sDate;
    }
  }

  if (effectiveFrom > dTo) {
    return { days: 0, dailySalary, calculatedSalary: 0 };
  }

  const days = Math.floor((dTo.getTime() - effectiveFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const calculatedSalary = Math.round(dailySalary * days);
  return { days, dailySalary, calculatedSalary };
};

const PaySalaryModal = forwardRef(({ onSuccess }, ref) => {
  const [visible, setVisible] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [salaryMonth, setSalaryMonth] = useState('');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [amount, setAmount] = useState(0);
  const [isManualAmount, setIsManualAmount] = useState(false);
  const [note, setNote] = useState('');

  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isSubmittingRef = useRef(false);

  // Tính toán số ngày và mức lương dự kiến tức thì tại Client
  const currentCalc = useMemo(() => {
    return getRangeCalculation(fromDate, toDate, employee?.baseSalary, employee?.startDate);
  }, [fromDate, toDate, employee?.baseSalary, employee?.startDate]);

  // Mở modal và khởi tạo khoảng ngày mặc định
  useImperativeHandle(ref, () => ({
    open: (emp, monthKeyStr) => {
      setEmployee(emp);
      setError('');
      setIsManualAmount(false);
      setNote('');
      setPreviewData(null);

      // Xác định tháng và năm từ monthKeyStr hoặc ngày hiện tại
      let y, m;
      if (monthKeyStr && monthKeyStr.includes('/')) {
        const parts = monthKeyStr.split('/');
        m = parseInt(parts[0], 10);
        y = parseInt(parts[1], 10);
      } else {
        const now = new Date();
        m = now.getMonth() + 1;
        y = now.getFullYear();
      }
      setSalaryMonth(`${m.toString().padStart(2, '0')}/${y}`);

      const daysInM = getDaysInMonth(y, m);
      const now = new Date();
      const isCurMonth = now.getFullYear() === y && (now.getMonth() + 1) === m;

      // Xác định ngày bắt đầu mặc định: Nếu vào làm giữa tháng này thì lấy startDate
      let defaultStartDay = 1;
      if (emp?.startDate) {
        const sDate = new Date(emp.startDate);
        if (sDate.getFullYear() === y && (sDate.getMonth() + 1) === m) {
          defaultStartDay = sDate.getDate();
        }
      }

      // Xác định ngày kết thúc mặc định: Nếu tháng hiện tại thì lấy đến hôm nay
      let defaultEndDay = daysInM;
      if (isCurMonth) {
        defaultEndDay = Math.min(now.getDate(), daysInM);
      }

      // Định dạng ngày khởi tạo chuẩn DD/MM/YYYY
      const initFrom = `${defaultStartDay.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;
      const initTo = `${defaultEndDay.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;

      setFromDate(initFrom);
      setToDate(initTo);

      // Tự động tính số tiền lương ngay lập tức cho khoảng ngày mặc định
      const initCalc = getRangeCalculation(initFrom, initTo, emp?.baseSalary, emp?.startDate);
      setAmount(initCalc.calculatedSalary);

      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Tải thông tin tính lương chi tiết từ Backend (tạm ứng, ngày nghỉ)
  const fetchSalaryPreview = useCallback(async (fDate, tDate, empId) => {
    if (!empId || !fDate || !tDate) return;
    setLoadingPreview(true);
    setError('');
    try {
      const res = await api.get(`/employees/salary/preview`, {
        params: {
          employeeId: empId,
          fromDate: convertToISODate(fDate),
          toDate: convertToISODate(tDate),
          monthKey: salaryMonth,
        },
      });
      if (res.data?.success) {
        setPreviewData(res.data.data);
      } else {
        setError(res.data?.message || 'Không thể tính trước tiền lương.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối khi tính lương.');
    } finally {
      setLoadingPreview(false);
    }
  }, [salaryMonth]);

  // Tự động gọi API xem trước khi đổi khoảng ngày
  useEffect(() => {
    if (visible && employee?.id && fromDate && toDate) {
      fetchSalaryPreview(fromDate, toDate, employee.id);
    }
  }, [visible, employee?.id, fromDate, toDate, fetchSalaryPreview]);

  // Khi có kết quả xem trước từ backend (có trừ tạm ứng hoặc ngày nghỉ), cập nhật số tiền nếu người dùng chưa sửa tay
  useEffect(() => {
    if (previewData && !isManualAmount) {
      if (previewData.suggestedFinalAmount !== undefined && previewData.suggestedFinalAmount !== null) {
        setAmount(previewData.suggestedFinalAmount);
      }
    }
  }, [previewData, isManualAmount]);

  // Xử lý khi người dùng đổi Từ ngày
  const handleFromDateChange = (newFrom) => {
    setFromDate(newFrom);
    setIsManualAmount(false); // Bật lại chế độ tự động tính theo khoảng ngày
    const calc = getRangeCalculation(newFrom, toDate, employee?.baseSalary, employee?.startDate);
    if (calc.calculatedSalary > 0) {
      setAmount(calc.calculatedSalary);
    }
  };

  // Xử lý khi người dùng đổi Đến ngày
  const handleToDateChange = (newTo) => {
    setToDate(newTo);
    setIsManualAmount(false); // Bật lại chế độ tự động tính theo khoảng ngày
    const calc = getRangeCalculation(fromDate, newTo, employee?.baseSalary, employee?.startDate);
    if (calc.calculatedSalary > 0) {
      setAmount(calc.calculatedSalary);
    }
  };

  // Phím tắt chọn nhanh khoảng ngày
  const handleQuickSelectRange = (type) => {
    if (!salaryMonth) return;
    const parts = salaryMonth.split('/');
    const m = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    const totalDays = getDaysInMonth(y, m);
    const now = new Date();

    let start = 1;
    let end = totalDays;

    if (type === 'ALL_MONTH') {
      start = 1;
      end = totalDays;
    } else if (type === 'UP_TO_TODAY') {
      start = 1;
      if (employee?.startDate) {
        const sD = new Date(employee.startDate);
        if (sD.getFullYear() === y && (sD.getMonth() + 1) === m) {
          start = sD.getDate();
        }
      }
      if (now.getFullYear() === y && (now.getMonth() + 1) === m) {
        end = Math.min(now.getDate(), totalDays);
      } else {
        end = totalDays;
      }
    } else if (type === 'FIRST_HALF') {
      start = 1;
      end = Math.min(15, totalDays);
    } else if (type === 'SECOND_HALF') {
      start = Math.min(16, totalDays);
      end = totalDays;
    }

    const newFrom = `${start.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;
    const newTo = `${end.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;

    setIsManualAmount(false);
    setFromDate(newFrom);
    setToDate(newTo);

    // Tự động tính số tiền lương ngay lập tức cho khoảng ngày vừa chọn
    const calc = getRangeCalculation(newFrom, newTo, employee?.baseSalary, employee?.startDate);
    if (calc.calculatedSalary > 0) {
      setAmount(calc.calculatedSalary);
    }
  };

  // Gửi yêu cầu chi trả lương
  const handleSubmitPay = async () => {
    if (submitting || isSubmittingRef.current) return;
    if (!fromDate || !toDate) {
      setError('Vui lòng chọn khoảng ngày chi trả hợp lệ.');
      return;
    }
    const payAmount = Number(amount) || 0;
    if (payAmount <= 0) {
      setError('Vui lòng nhập số tiền chi trả lương lớn hơn 0.');
      return;
    }
    if (previewData?.isOverlapped) {
      setError(`Khoảng ngày này bị trùng lặp với đợt lương đã trả (${previewData.overlappedPeriod}).`);
      return;
    }

    setSubmitting(true);
    isSubmittingRef.current = true;
    setError('');

    try {
      const res = await api.post('/employees/salary/pay', {
        employeeId: employee.id,
        fromDate: convertToISODate(fromDate),
        toDate: convertToISODate(toDate),
        monthKey: salaryMonth,
        amount: payAmount,
        note: note.trim() || null,
      });

      if (res.data?.success) {
        setVisible(false);
        showGlobalToast(`Đã chi trả lương cho nhân viên ${employee.name} (${formatDateDisplay(fromDate)} - ${formatDateDisplay(toDate)}) số tiền ${formatCurrency(payAmount)} thành công!`, 'success');
        if (onSuccess) onSuccess();
      } else {
        setError(res.data?.message || 'Lỗi khi thanh toán lương.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối máy chủ khi trả lương.');
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header chuẩn Bottom-Sheet */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.modalTitle}>💵 CHI TRẢ LƯƠNG NHÂN VIÊN</Text>
            <Text style={styles.employeeSub}>
              {employee?.name} {employee?.role ? `(${employee.role})` : ''} • Lương gốc: {formatCurrency(employee?.baseSalary)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Thông báo lỗi nếu có */}
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

          {/* Cảnh báo trùng lặp khoảng ngày */}
          {previewData?.isOverlapped ? (
            <View style={styles.overlapBanner}>
              <Text style={styles.overlapBannerTitle}>⚠️ Cảnh báo trùng đợt lương</Text>
              <Text style={styles.overlapBannerText}>
                Khoảng ngày bạn chọn bị trùng với đợt lương đã trả trước đó ({previewData.overlappedPeriod}). Vui lòng chọn lại khoảng ngày.
              </Text>
            </View>
          ) : null}

          {/* 1. Khối chọn khoảng ngày chi trả */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>📅 KHOẢNG NGÀY TRẢ LƯƠNG</Text>

            {/* Hàng 2 ô chọn ngày: Từ ngày ➜ Đến ngày */}
            <View style={styles.rangeRow}>
              <View style={styles.rangeCol}>
                <Text style={styles.rangeLabel}>Từ ngày:</Text>
                <DatePickerInput
                  value={fromDate}
                  onChange={handleFromDateChange}
                  compact={true}
                  showIcon={true}
                />
              </View>
              <Text style={styles.rangeArrow}>➜</Text>
              <View style={styles.rangeCol}>
                <Text style={styles.rangeLabel}>Đến ngày:</Text>
                <DatePickerInput
                  value={toDate}
                  onChange={handleToDateChange}
                  compact={true}
                  showIcon={true}
                />
              </View>
            </View>

            {/* Các phím chọn nhanh khoảng ngày */}
            <View style={styles.quickChipsContainer}>
              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => handleQuickSelectRange('ALL_MONTH')}
              >
                <Text style={styles.quickChipText}>Toàn tháng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => handleQuickSelectRange('UP_TO_TODAY')}
              >
                <Text style={styles.quickChipText}>Đến hôm nay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => handleQuickSelectRange('FIRST_HALF')}
              >
                <Text style={styles.quickChipText}>Nửa đầu (1-15)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => handleQuickSelectRange('SECOND_HALF')}
              >
                <Text style={styles.quickChipText}>Nửa cuối (16-hết)</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 2. Khối Số tiền chi trả (Tự động tính theo khoảng ngày) */}
          <View style={styles.amountCard}>
            <View style={styles.amountHeaderRow}>
              <Text style={styles.amountLabel}>💵 SỐ TIỀN CHI TRẢ (VND):</Text>
              {currentCalc.days > 0 ? (
                <Text style={styles.suggestText}>
                  ({currentCalc.days} ngày công • ~{formatCurrency(currentCalc.dailySalary)}/ngày{previewData?.totalAdvances > 0 ? ` • Trừ ứng -${formatCurrency(previewData.totalAdvances)}` : ''})
                </Text>
              ) : null}
            </View>
            <MoneyInput
              value={amount}
              onChangeValue={(val) => {
                setAmount(val);
                setIsManualAmount(true);
              }}
              placeholder="Nhập số tiền trả lương..."
              inputStyle={styles.amountInput}
            />
          </View>

          {/* 3. Ô Ghi chú thanh toán */}
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>📝 Ghi chú thanh toán (Nếu có):</Text>
            <TextInput
              style={styles.noteTextInput}
              placeholder="Ví dụ: Chuyển khoản Vietcombank, tiền mặt..."
              placeholderTextColor={COLORS.textLight}
              value={note}
              onChangeText={setNote}
            />
          </View>
        </ScrollView>

        {/* Footer nút hành động */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (submitting || previewData?.isOverlapped) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmitPay}
            disabled={submitting || previewData?.isOverlapped}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>XÁC NHẬN TRẢ LƯƠNG</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default PaySalaryModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  employeeSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },
  scrollContent: {
    marginBottom: 10,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
  overlapBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  overlapBannerTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#B45309',
  },
  overlapBannerText: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 8,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rangeCol: {
    flex: 1,
  },
  rangeLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: '500',
  },
  rangeArrow: {
    fontSize: 16,
    color: '#94A3B8',
    paddingHorizontal: 8,
    paddingTop: 16,
  },
  quickChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  quickChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  quickChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  amountCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  amountHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#166534',
  },
  suggestText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
  },
  amountInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#047857',
  },
  noteCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  noteLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 6,
  },
  noteTextInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  footer: {
    paddingTop: 8,
  },
  submitBtn: {
    backgroundColor: '#10B981',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
