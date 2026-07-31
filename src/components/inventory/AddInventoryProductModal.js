// meat-management-fe/src/components/inventory/AddInventoryProductModal.js
import React, { useState, useImperativeHandle, forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';

// Định dạng chuỗi nhập số có dấu chấm phân cách hàng nghìn
const formatNumberString = (value) => {
  const cleanValue = value.replace(/[^0-9]/g, '');
  if (cleanValue === '') return '';
  return new Intl.NumberFormat('vi-VN').format(parseInt(cleanValue, 10));
};

// Đưa chuỗi đã định dạng về lại dạng số nguyên để gửi API
const parseNumberString = (formattedValue) => {
  const cleanValue = formattedValue.replace(/[^0-9]/g, '');
  return cleanValue ? parseInt(cleanValue, 10) : 0;
};

const AddInventoryProductModal = forwardRef(({ onSaveSuccess }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Trạng thái form nhập liệu
  const [productId, setProductId] = useState(null); // null nếu thêm mới, khác null nếu sửa
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('cái');

  // Phơi bày các phương thức điều khiển cho parent component
  useImperativeHandle(ref, () => ({
    open: (product = null) => {
      setErrorMsg('');
      if (product) {
        // Chế độ chỉnh sửa sản phẩm có sẵn
        setProductId(product.id);
        setName(product.name);
        setQuantity(product.quantity.toString());
        setPrice(formatNumberString(product.price.toString()));
        setUnit(product.unit || 'cái');
      } else {
        // Chế độ thêm sản phẩm mới
        setProductId(null);
        setName('');
        setQuantity('');
        setPrice('');
        setUnit('cái');
      }
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Xử lý lưu thông tin sản phẩm (gửi lên API backend)
  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMsg('Vui lòng nhập tên sản phẩm.');
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0) {
      setErrorMsg('Số lượng sản phẩm phải lớn hơn hoặc bằng 0.');
      return;
    }

    const prc = parseNumberString(price);
    if (prc < 0) {
      setErrorMsg('Giá nhập sản phẩm phải lớn hơn hoặc bằng 0.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      let response;
      const payload = {
        name: name.trim(),
        quantity: qty,
        price: prc,
        unit: unit.trim() || 'cái',
      };

      if (productId) {
        // Gọi API cập nhật sản phẩm
        response = await api.put(`/inventory/products/${productId}`, payload);
      } else {
        // Gọi API thêm mới sản phẩm
        response = await api.post('/inventory/products', payload);
      }

      if (response.data && response.data.success) {
        if (onSaveSuccess) {
          onSaveSuccess();
        }
        setVisible(false);
      } else {
        setErrorMsg(response.data.message || 'Có lỗi xảy ra khi lưu.');
      }
    } catch (error) {
      console.error('Lỗi lưu sản phẩm kho:', error);
      setErrorMsg(error.response?.data?.message || 'Không thể kết nối tới máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.overlay}>
        {/* Lớp nền phía sau: bấm vào để ẩn bàn phím hoặc đóng modal */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>

        <View style={styles.card}>
          <Text style={styles.title}>
            {productId ? 'Chỉnh sửa sản phẩm kho' : 'Thêm sản phẩm vào kho'}
          </Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Nhập tên sản phẩm */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tên sản phẩm *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ví dụ: thùng coca, thùng bia..."
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Nhập số lượng */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Số lượng *</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="Ví dụ: 100"
              keyboardType="numeric"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Chọn đơn vị tính bằng các button badge */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Đơn vị tính</Text>
            <View style={styles.unitContainer}>
              {['cái', 'thùng', 'kg', 'bao', 'chai', 'lon', 'gói', 'bịch'].map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[
                    styles.unitBadge,
                    unit === u && styles.unitBadgeSelected,
                  ]}
                  onPress={() => setUnit(u)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.unitBadgeText,
                      unit === u && styles.unitBadgeTextSelected,
                    ]}
                  >
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Nhập đơn giá nhập */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Giá nhập (đ/đơn vị) *</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={(text) => setPrice(formatNumberString(text))}
              placeholder="Ví dụ: 75.000"
              keyboardType="numeric"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Các nút hành động */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setVisible(false)}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>Hủy bỏ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Xác nhận</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)', // Lớp nền tối mờ
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...SHADOWS.card,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#FFF1F1',
    borderColor: '#FEE2E2',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
  },
  inputGroup: {
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
  },
  submitBtn: {
    backgroundColor: '#3B82F6', // Màu xanh dương cho kho
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  unitContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  unitBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  unitBadgeSelected: {
    backgroundColor: '#DBEAFE', // Xanh nhạt của kho khi active
    borderColor: '#3B82F6', // Xanh dương của kho
  },
  unitBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  unitBadgeTextSelected: {
    color: '#1D4ED8', // Xanh dương đậm
  },
});

export default AddInventoryProductModal;
