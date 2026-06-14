// meat-management-fe/src/components/PaymentModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Modal, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';

const PaymentModal = forwardRef(({ customerId, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Phơi bày các hàm điều khiển Modal ra ngoài component cha (Customer Detail)
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setAmount('');
      setNote('');
      setError('');
    },
    close: () => {
      setVisible(false);
    }
  }));

  // 2. Gợi ý điền nhanh số tiền (giúp người bán bấm nhanh các mốc chẵn)
  const handleQuickAmount = (value) => {
    setAmount(value.toString());
    setError('');
  };

  // 3. Xử lý ghi nhận thu tiền khách trả nợ
  const handleSubmit = async () => {
    const payAmount = parseFloat(amount);

    if (isNaN(payAmount) || payAmount <= 0) {
      setError('Số tiền trả nợ phải lớn hơn 0 (Ví dụ: 200000).');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/payments', {
        customerId,
        amount: payAmount,
        note: note.trim() || null,
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
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centeredView}
      >
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>🟢 THU TIỀN KHÁCH TRẢ NỢ</Text>

          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            {/* Nhập số tiền thu được */}
            <Text style={styles.label}>1. Số tiền thu được thực tế (VND):</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              placeholder="Ví dụ: 500000"
              placeholderTextColor={COLORS.textLight}
              keyboardType="numeric"
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
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
              style={[styles.button, styles.cancelButton]}
              onPress={() => setVisible(false)}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>HỦY</Text>
            </TouchableOpacity>

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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    ...SHADOWS.card,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.inputBg,
    marginRight: 12,
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
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
  },
});
