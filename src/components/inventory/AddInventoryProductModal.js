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

// Chỉ cho phép nhập ký tự số (hỗ trợ số thập phân có 1 dấu chấm)
const formatQuantityInput = (value) => {
  if (!value) return '';
  let clean = value.toString().replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = `${parts[0]}.${parts.slice(1).join('')}`;
  }
  return clean;
};

const AddInventoryProductModal = forwardRef(({ onSaveSuccess, onDeleteSuccess }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Trạng thái form nhập liệu
  const [productId, setProductId] = useState(null); // null nếu thêm mới, khác null nếu sửa
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('cái');

  // Phơi bày các phương thức điều khiển cho parent component
  useImperativeHandle(ref, () => ({
    open: (product = null) => {
      setErrorMsg('');
      if (product) {
        // Chế độ chỉnh sửa sản phẩm có sẵn
        setProductId(product.id);
        setName(product.name || '');
        setQuantity(product.quantity !== undefined ? product.quantity.toString() : '0');
        setMinQuantity(product.minQuantity !== undefined ? product.minQuantity.toString() : '');
        setPrice(formatNumberString((product.price || 0).toString()));
        setUnit(product.unit || 'cái');
      } else {
        // Chế độ thêm sản phẩm mới
        setProductId(null);
        setName('');
        setQuantity('');
        setMinQuantity('');
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

    const minQty = minQuantity.trim() ? parseFloat(minQuantity) : 0;
    if (isNaN(minQty) || minQty < 0) {
      setErrorMsg('Định mức tối thiểu phải lớn hơn hoặc bằng 0.');
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
        minQuantity: minQty,
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

  // Xử lý Xóa sản phẩm khỏi kho (khi đang ở chế độ sửa)
  const handleDelete = () => {
    if (!productId) return;
    Alert.alert(
      'Xác nhận xóa',
      `Bạn có chắc chắn muốn xóa sản phẩm "${name}" khỏi kho không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa ngay',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const res = await api.delete(`/inventory/products/${productId}`);
              if (res.data && res.data.success) {
                if (onDeleteSuccess) onDeleteSuccess();
                setVisible(false);
              } else {
                setErrorMsg(res.data.message || 'Không thể xóa sản phẩm.');
              }
            } catch (err) {
              console.error(err);
              setErrorMsg(err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
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
            {productId ? '✏️ Chỉnh Sửa Sản Phẩm Kho' : '📦 Thêm Sản Phẩm Vào Kho'}
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
            <Text style={styles.label}>Số lượng tồn *</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={(text) => setQuantity(formatQuantityInput(text))}
              placeholder="Ví dụ: 100"
              keyboardType="decimal-pad"
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
            <Text style={styles.label}>Giá vốn / Đơn giá (đ/{unit}) *</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={(text) => setPrice(formatNumberString(text))}
              placeholder={`Ví dụ: 75.000đ/${unit}`}
              keyboardType="numeric"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Nhập định mức tồn tối thiểu để cảnh báo */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tồn tối thiểu báo sắp hết (Tuỳ chọn)</Text>
            <TextInput
              style={styles.input}
              value={minQuantity}
              onChangeText={(text) => setMinQuantity(formatQuantityInput(text))}
              placeholder="Ví dụ: 5 (báo vàng/đỏ khi tồn <= 5)"
              keyboardType="decimal-pad"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Các nút hành động */}
          <View style={styles.actions}>
            {productId ? (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDelete}
                disabled={loading}
              >
                <Text style={styles.deleteBtnText}>🗑️ Xóa</Text>
              </TouchableOpacity>
            ) : null}

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setVisible(false)}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>Hủy bỏ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, productId && styles.submitBtnUpdate]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {productId ? '💾 Lưu Thay Đổi' : '➕ Thêm Vào Kho'}
                </Text>
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
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  deleteBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: 'bold',
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
  submitBtnUpdate: {
    backgroundColor: '#0F766E', // Màu xanh ngọc cho lưu cập nhật
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
