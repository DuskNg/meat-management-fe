// meat-management-fe/src/components/EmployeeLeaveModal.js
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
import DatePickerInput from './DatePickerInput';
import { showGlobalToast } from '../store/toastStore';

// Modal ghi nhận nhân viên xin nghỉ và tự động trừ buổi lương
const EmployeeLeaveModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [leaveDate, setLeaveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [shift, setShift] = useState('FULL'); // 'FULL' (Cả ngày = 1 buổi), 'HALF' (Nửa ngày = 0.5 buổi)
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    open: (targetEmployee) => {
      setEmployee(targetEmployee || null);
      setLeaveDate(new Date().toISOString().split('T')[0]);
      setShift('FULL');
      setNote('');
      setError('');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount).replace('₫', 'đ');
  };

  // Tính số ngày của tháng được chọn để tính số tiền trừ chính xác
  const getDaysInMonth = (dateStr) => {
    try {
      const parts = dateStr.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      return new Date(y, m, 0).getDate();
    } catch {
      return 30;
    }
  };

  const totalDays = getDaysInMonth(leaveDate);
  const baseSalary = employee?.baseSalary ? parseFloat(employee.baseSalary) : 0;
  const dailySalary = totalDays > 0 ? Math.round(baseSalary / totalDays) : 0;
  const deductAmount = shift === 'HALF' ? Math.round(dailySalary * 0.5) : dailySalary;

  // Xác nhận ghi nhận xin nghỉ
  const handleSubmit = async () => {
    if (loading) return;
    if (!employee?.id) {
      setError('Không tìm thấy thông tin nhân viên.');
      return;
    }
    if (!leaveDate) {
      setError('Vui lòng chọn ngày xin nghỉ.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/employees/leave', {
        employeeId: employee.id,
        date: leaveDate,
        shift,
        note: note.trim() || null,
      });

      if (response.data.success) {
        showGlobalToast(`Đã ghi nhận xin nghỉ cho ${employee.name} và trừ ${formatCurrency(deductAmount)} lương!`, 'success');
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi ghi nhận xin nghỉ.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối máy chủ, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>📝 GHI NHẬN XIN NGHỈ</Text>
          <TouchableOpacity
            style={styles.closeCircleBtn}
            onPress={() => setVisible(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.closeCircleBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Thông tin nhân viên */}
          {employee && (
            <View style={styles.employeeInfoCard}>
              <View style={styles.empAvatar}>
                <Text style={styles.empAvatarText}>
                  {(employee.name || 'E').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.empMeta}>
                <Text style={styles.empName}>{employee.name}</Text>
                <Text style={styles.empRole}>
                  {employee.role ? `💼 ${employee.role}` : '💼 Nhân viên'} {employee.phone ? `• 📞 ${employee.phone}` : ''}
                </Text>
                <Text style={styles.empSalaryDesc}>
                  Lương tháng: <Text style={styles.empSalaryBold}>{formatCurrency(baseSalary)}</Text>
                  {' '}(~{formatCurrency(dailySalary)}/buổi)
                </Text>
              </View>
            </View>
          )}

          {/* Chọn ngày nghỉ */}
          <Text style={styles.label}>📅 Ngày xin nghỉ:</Text>
          <View style={styles.datePickerWrapper}>
            <DatePickerInput
              value={leaveDate}
              onChange={(val) => {
                setLeaveDate(val);
                setError('');
              }}
              allowFuture={true}
            />
          </View>

          {/* Chọn loại ca nghỉ */}
          <Text style={styles.label}>⏱️ Ca nghỉ (Thời gian vắng mặt):</Text>
          <View style={styles.shiftSelector}>
            <TouchableOpacity
              style={[styles.shiftOption, shift === 'FULL' && styles.shiftOptionActiveRed]}
              onPress={() => setShift('FULL')}
              activeOpacity={0.8}
            >
              <Text style={[styles.shiftOptionText, shift === 'FULL' && styles.shiftOptionTextActiveRed]}>
                🔴 Cả ngày (1 buổi)
              </Text>
              <Text style={[styles.shiftSubText, shift === 'FULL' && styles.shiftSubTextActiveRed]}>
                Trừ 1 ngày lương (-{formatCurrency(dailySalary)})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shiftOption, shift === 'HALF' && styles.shiftOptionActiveYellow]}
              onPress={() => setShift('HALF')}
              activeOpacity={0.8}
            >
              <Text style={[styles.shiftOptionText, shift === 'HALF' && styles.shiftOptionTextActiveYellow]}>
                🟡 Nửa ngày (nửa buổi)
              </Text>
              <Text style={[styles.shiftSubText, shift === 'HALF' && styles.shiftSubTextActiveYellow]}>
                Trừ 0.5 ngày lương (-{formatCurrency(Math.round(dailySalary * 0.5))})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Khối xem trước tiền trừ */}
          <View style={styles.previewDeductBox}>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Mức trừ lương dự kiến:</Text>
              <Text style={styles.previewAmount}>-{formatCurrency(deductAmount)}</Text>
            </View>
            <Text style={styles.previewNote}>
              💡 Số tiền này sẽ tự động khấu trừ vào bảng lương thực lĩnh tháng {leaveDate.slice(5, 7)}/{leaveDate.slice(0, 4)} của nhân viên.
            </Text>
          </View>

          {/* Lý do / Ghi chú */}
          <Text style={styles.label}>Lý do / Ghi chú (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Bận việc riêng, Ốm đau, Có việc đột xuất..."
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
              <Text style={styles.submitButtonText}>XÁC NHẬN NGHỈ (-{formatCurrency(deductAmount)})</Text>
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

export default EmployeeLeaveModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  closeCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeCircleBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  formScroll: {
    marginBottom: 8,
  },
  employeeInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 12,
  },
  empAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  empMeta: {
    flex: 1,
  },
  empName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  empRole: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  empSalaryDesc: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  empSalaryBold: {
    fontWeight: 'bold',
    color: '#0369A1',
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 6,
  },
  datePickerWrapper: {
    marginBottom: 14,
  },
  shiftSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  shiftOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  shiftOptionActiveRed: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  shiftOptionActiveYellow: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  shiftOptionText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
  shiftOptionTextActiveRed: {
    color: '#DC2626',
  },
  shiftOptionTextActiveYellow: {
    color: '#D97706',
  },
  shiftSubText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  shiftSubTextActiveRed: {
    color: '#EF4444',
    fontWeight: '600',
  },
  shiftSubTextActiveYellow: {
    color: '#B45309',
    fontWeight: '600',
  },
  previewDeductBox: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#9F1239',
  },
  previewAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E11D48',
  },
  previewNote: {
    fontSize: 11,
    color: '#BE123C',
    marginTop: 6,
    lineHeight: 16,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 6,
  },
  button: {
    width: '100%',
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: '#DC2626', // Màu đỏ cảnh báo trừ lương
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
});
