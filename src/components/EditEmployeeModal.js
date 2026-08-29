// meat-management-fe/src/components/EditEmployeeModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
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

// Modal chỉnh sửa thông tin nhân viên
const EditEmployeeModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [employeeId, setEmployeeId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [role, setRole] = useState('');
  const [salaryVND, setSalaryVND] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    open: (emp) => {
      if (!emp) return;
      setEmployeeId(emp.id);
      setName(emp.name || '');
      setPhone(emp.phone || '');
      setAddress(emp.address || '');
      setRole(emp.role || '');
      setSalaryVND(emp.baseSalary || 0);
      setError('');
      setVisible(true);
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

  // Xác nhận lưu thông tin thay đổi
  const handleSubmit = async () => {
    if (loading) return;
    if (!name || name.trim() === '') {
      setError('Tên nhân viên là bắt buộc.');
      return;
    }
    if (!salaryVND || salaryVND <= 0) {
      setError('Lương tháng cơ bản là bắt buộc.');
      return;
    }
    const salaryVal = salaryVND;
    if (salaryVal < 0) {
      setError('Mức lương không hợp lệ.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.put(`/employees/${employeeId}`, {
        name: name.trim(),
        phone: phone.replace(/\s+/g, '') || null,
        address: address.trim() || null,
        role: role.trim() || null,
        baseSalary: salaryVal,
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi cập nhật nhân viên.');
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
        <Text style={styles.modalTitle}>✏️ CẬP NHẬT THÔNG TIN NHÂN VIÊN</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Tên nhân viên (Bắt buộc):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Nguyễn Văn A"
            placeholderTextColor={COLORS.textLight}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError('');
            }}
          />

          <Text style={styles.label}>Lương tháng cơ bản (Bắt buộc, VND):</Text>
          <MoneyInput
            style={styles.salaryInputContainer}
            inputStyle={styles.salaryInput}
            value={salaryVND}
            onChangeValue={(val) => {
              setSalaryVND(val);
              setError('');
            }}
            placeholder="Ví dụ: 9.000"
          />

          <Text style={styles.label}>Số điện thoại (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: 0987654321"
            placeholderTextColor={COLORS.textLight}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(text) => setPhone(text.replace(/\s+/g, ''))}
          />

          <Text style={styles.label}>Vai trò/Công việc (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Giao hàng, Lọc thịt, Bán sạp"
            placeholderTextColor={COLORS.textLight}
            value={role}
            onChangeText={setRole}
          />

          <Text style={styles.label}>Địa chỉ nhà ở (Có thể bỏ qua):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: 123 Hùng Vương, Quận 5"
            placeholderTextColor={COLORS.textLight}
            value={address}
            onChangeText={setAddress}
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

export default EditEmployeeModal;

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
    color: COLORS.text,
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
  salaryInput: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
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
    backgroundColor: COLORS.primary,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
