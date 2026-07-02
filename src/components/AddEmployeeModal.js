// meat-management-fe/src/components/AddEmployeeModal.js
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

// Modal thêm nhân viên mới
const AddEmployeeModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [role, setRole] = useState('');
  const [salary, setSalary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setName('');
      setPhone('');
      setAddress('');
      setRole('');
      setSalary('');
      setError('');
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

  // Xác nhận tạo nhân viên
  const handleSubmit = async () => {
    if (loading) return;
    if (!name || name.trim() === '') {
      setError('Tên nhân viên là bắt buộc.');
      return;
    }
    if (!salary || salary.trim() === '') {
      setError('Mức lương tháng là bắt buộc.');
      return;
    }
    const salaryVal = parseNumberString(salary);
    if (salaryVal < 0) {
      setError('Mức lương không hợp lệ.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/employees', {
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
        setError(response.data.message || 'Lỗi thêm nhân viên.');
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
        <Text style={styles.modalTitle}>👥 THÊM NHÂN VIÊN MỚI</Text>

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
          <TextInput
            style={[styles.input, styles.salaryInput]}
            placeholder="Ví dụ: 9.000.000"
            placeholderTextColor={COLORS.textLight}
            keyboardType="number-pad"
            value={salary}
            onChangeText={(text) => {
              setSalary(formatNumberString(text));
              setError('');
            }}
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
              <Text style={styles.submitButtonText}>THÊM NHÂN VIÊN</Text>
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

export default AddEmployeeModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 19,
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
