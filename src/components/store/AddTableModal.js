// meat-management-fe/src/components/store/AddTableModal.js
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
import { api } from '../../api/client';
import { COLORS, FONTS } from '../../theme';
import SmoothModal from '../SmoothModal';

/**
 * Component AddTableModal độc lập phục vụ tạo mới bàn ăn hàng loạt hoặc đơn lẻ.
 * Sử dụng forwardRef để phơi bày hàm open() và close() cho component cha.
 */
const AddTableModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [prefix, setPrefix] = useState('Bàn ');
  const [count, setCount] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSubmittingRef = useRef(false);

  // Phơi bày các phương thức ra bên ngoài qua ref
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setPrefix('Bàn ');
      setCount('10');
      setError('');
    },
    close: () => {
      setVisible(false);
    }
  }));

  // Xử lý gửi yêu cầu tạo hàng loạt bàn lên API
  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;
    
    if (!prefix || prefix.trim() === '') {
      setError('Tiền tố tên bàn không được để trống.');
      return;
    }

    const tableCount = parseInt(count, 10);
    if (isNaN(tableCount) || tableCount <= 0) {
      setError('Số lượng bàn muốn tạo phải là số lớn hơn 0.');
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;
    try {
      const response = await api.post('/store/tables/bulk', {
        prefix: prefix.trim(),
        count: tableCount,
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh(); // Gọi callback tải lại lưới danh sách bàn ăn
      } else {
        setError(response.data.message || 'Có lỗi xảy ra khi tạo danh sách bàn.');
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
        <Text style={styles.modalTitle}>🏪 THÊM BÀN ĂN HÀNG LOẠT</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Tiền tố tên bàn (Bắt buộc):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Bàn "
            placeholderTextColor={COLORS.textLight}
            value={prefix}
            onChangeText={(text) => {
              setPrefix(text);
              setError('');
            }}
          />

          <Text style={styles.label}>Số lượng bàn muốn tạo cùng lúc (Bắt buộc):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: 10"
            placeholderTextColor={COLORS.textLight}
            keyboardType="numeric"
            value={count}
            onChangeText={(text) => {
              setCount(text.replace(/[^0-9]/g, ''));
              setError('');
            }}
          />
          <Text style={styles.tipText}>
            💡 Hệ thống sẽ tự động tạo ra các bàn theo thứ tự ví dụ: {prefix.trim()} 1 ... {prefix.trim()} {count || 'N'}
          </Text>
        </ScrollView>

        {/* Nút hành động dưới chân modal */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>TẠO BÀN NGAY</Text>
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
    color: '#5B21B6',
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
  tipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: 12,
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
    backgroundColor: '#5B21B6', // Màu tím cửa hàng
    shadowColor: '#5B21B6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

export default AddTableModal;
