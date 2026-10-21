// meat-management-fe/src/components/PaySalaryModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
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
import { COLORS, FONTS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

// Định dạng tiền tệ VND
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0)) + ' đ';
};

// Định dạng ngày thành chuỗi YYYY-MM-DD
const formatDateToISO = (date) => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
};

// Định dạng ngày hiển thị DD/MM/YYYY
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
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

const PaySalaryModal = forwardRef(({ onSuccess }, ref) => {
  const [visible, setVisible] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [salaryMonth, setSalaryMonth] = useState('');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [bonus, setBonus] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [note, setNote] = useState('');

  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isSubmittingRef = useRef(false);

  // Mở modal và khởi tạo khoảng ngày mặc định
  useImperativeHandle(ref, () => ({
    open: (emp, monthKeyStr) => {
      setEmployee(emp);
      setError('');
      setBonus(0);
      setDeductions(0);
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

      const initFrom = `${y}-${m.toString().padStart(2, '0')}-${defaultStartDay.toString().padStart(2, '0')}`;
      const initTo = `${y}-${m.toString().padStart(2, '0')}-${defaultEndDay.toString().padStart(2, '0')}`;

      setFromDate(initFrom);
      setToDate(initTo);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Tải thông tin tính lương xem trước từ Backend
  const fetchSalaryPreview = useCallback(async (fDate, tDate, empId) => {
    if (!empId || !fDate || !tDate) return;
    setLoadingPreview(true);
    setError('');
    try {
      const res = await api.get(`/employees/salary/preview`, {
        params: {
          employeeId: empId,
          fromDate: fDate,
          toDate: tDate,
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

    setFromDate(`${y}-${m.toString().padStart(2, '0')}-${start.toString().padStart(2, '0')}`);
    setToDate(`${y}-${m.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`);
  };

  // Tính số tiền thực lĩnh cuối cùng
  const calculatedSalary = previewData?.calculatedSalary || 0;
  const advancesDeducted = previewData?.totalAdvances || 0;
  const finalPayable = Math.max(0, calculatedSalary - advancesDeducted + (Number(bonus) || 0) - (Number(deductions) || 0));

  // Gửi yêu cầu chi trả lương
  const handleSubmitPay = async () => {
    if (submitting || isSubmittingRef.current) return;
    if (!fromDate || !toDate) {
      setError('Vui lòng chọn khoảng ngày chi trả hợp lệ.');
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
        fromDate,
        toDate,
        monthKey: salaryMonth,
        bonus: Number(bonus) || 0,
        deductions: Number(deductions) || 0,
        note: note.trim() || null,
      });

      if (res.data?.success) {
        setVisible(false);
        showGlobalToast(`Đã chi trả lương cho nhân viên ${employee.name} (${formatDateDisplay(fromDate)} - ${formatDateDisplay(toDate)}) thành công!`, 'success');
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

          {/* Khối chọn khoảng ngày chi trả */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>📅 KHOẢNG NGÀY TRẢ LƯƠNG</Text>

            {/* Hàng 2 ô chọn ngày: Từ ngày ➜ Đến ngày */}
            <View style={styles.rangeRow}>
              <View style={styles.rangeCol}>
                <Text style={styles.rangeLabel}>Từ ngày:</Text>
                <DatePickerInput
                  value={fromDate}
                  onChange={setFromDate}
                  compact={true}
                  showIcon={true}
                />
              </View>
              <Text style={styles.rangeArrow}>➜</Text>
              <View style={styles.rangeCol}>
                <Text style={styles.rangeLabel}>Đến ngày:</Text>
                <DatePickerInput
                  value={toDate}
                  onChange={setToDate}
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

          {/* Khối tóm tắt tính toán lương */}
          <View style={styles.calcSummaryCard}>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Số ngày trong kỳ:</Text>
              <Text style={styles.calcValueBold}>
                {previewData ? `${previewData.eligibleDays} ngày` : '...'}
              </Text>
            </View>

            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Số buổi xin nghỉ trừ lương:</Text>
              <Text style={[styles.calcValue, previewData?.leaveDays > 0 ? styles.textRed : null]}>
                {previewData ? `${previewData.leaveDays} buổi` : '...'}
              </Text>
            </View>

            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Số ngày công thực tế:</Text>
              <Text style={[styles.calcValueBold, { color: '#0284C7' }]}>
                {previewData ? `${previewData.workingDays} công` : '...'}
              </Text>
            </View>

            <View style={styles.calcDivider} />

            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>
                Lương theo công (~{formatCurrency(previewData?.dailySalary)}/ngày):
              </Text>
              <Text style={styles.calcValueBold}>{formatCurrency(calculatedSalary)}</Text>
            </View>

            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Khấu trừ tạm ứng trong kỳ:</Text>
              <Text style={[styles.calcValueBold, advancesDeducted > 0 ? styles.textAmber : null]}>
                -{formatCurrency(advancesDeducted)}
              </Text>
            </View>

            {/* Chi tiết các khoản ứng nếu có */}
            {previewData?.advancesList?.length > 0 ? (
              <View style={styles.advanceMiniList}>
                {previewData.advancesList.map((adv) => (
                  <Text key={adv.id} style={styles.advanceMiniItem}>
                    • Ứng ngày {formatDateDisplay(adv.date)}: -{formatCurrency(adv.amount)}
                    {adv.note ? ` (${adv.note})` : ''}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

          {/* Khối Thưởng thêm, Phạt trừ và Ghi chú */}
          <View style={styles.inputsCard}>
            <View style={styles.inputTwoColRow}>
              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>🎁 Thưởng thêm (VND):</Text>
                <MoneyInput
                  value={bonus}
                  onChangeValue={setBonus}
                  placeholder="Ví dụ: 200.000"
                  inputStyle={styles.moneyInputBox}
                />
              </View>
              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>⚠️ Phạt / Trừ thêm (VND):</Text>
                <MoneyInput
                  value={deductions}
                  onChangeValue={setDeductions}
                  placeholder="Ví dụ: 100.000"
                  inputStyle={styles.moneyInputBox}
                />
              </View>
            </View>

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>📝 Ghi chú thanh toán (Nếu có):</Text>
            <TextInput
              style={styles.noteTextInput}
              placeholder="Ví dụ: Thanh toán lương đợt 1 chuyển khoản Vietcombank"
              placeholderTextColor={COLORS.textLight}
              value={note}
              onChangeText={setNote}
            />
          </View>

          {/* Khối Tổng tiền thực lĩnh */}
          <View style={styles.totalBlock}>
            <View>
              <Text style={styles.totalBlockLabel}>TỔNG THỰC LĨNH:</Text>
              <Text style={styles.totalBlockSub}>
                Kỳ: {formatDateDisplay(fromDate)} ➜ {formatDateDisplay(toDate)}
              </Text>
            </View>
            <Text style={styles.totalBlockAmount}>{formatCurrency(finalPayable)}</Text>
          </View>
        </ScrollView>

        {/* Footer nút hành động */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (loadingPreview || submitting || previewData?.isOverlapped) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmitPay}
            disabled={loadingPreview || submitting || previewData?.isOverlapped}
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
  calcSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  calcLabel: {
    fontSize: 12,
    color: '#475569',
  },
  calcValue: {
    fontSize: 12,
    color: '#1E293B',
  },
  calcValueBold: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  textRed: {
    color: '#DC2626',
    fontWeight: 'bold',
  },
  textAmber: {
    color: '#D97706',
    fontWeight: 'bold',
  },
  calcDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 6,
  },
  advanceMiniList: {
    backgroundColor: '#FFFBEB',
    borderRadius: 6,
    padding: 6,
    marginTop: 6,
  },
  advanceMiniItem: {
    fontSize: 11,
    color: '#92400E',
    marginVertical: 1,
  },
  inputsCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  inputTwoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 4,
  },
  moneyInputBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  noteTextInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0F172A',
  },
  totalBlock: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  totalBlockLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#065F46',
  },
  totalBlockSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },
  totalBlockAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
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
