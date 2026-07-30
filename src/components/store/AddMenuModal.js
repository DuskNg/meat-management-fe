// meat-management-fe/src/components/store/AddMenuModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Platform,
} from 'react-native';
import SmoothModal from '../SmoothModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';
import StorePopupModal from './StorePopupModal';

/**
 * Component AddMenuModal độc lập phục vụ việc thêm, sửa, ẩn danh mục món ăn thực đơn.
 * Sử dụng forwardRef để phơi bày hàm open() và close() cho component cha.
 */
const AddMenuModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('phần'); // Đơn vị tính mặc định của quán ăn
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const [editingProduct, setEditingProduct] = useState(null);
  const popupModalRef = useRef(null);

  // 1. Tải danh mục thực đơn từ Backend thông qua API store riêng
  const { data: productsResponse, refetch, isLoading } = useQuery({
    queryKey: ['store_products'],
    queryFn: async () => {
      const response = await api.get('/store/products');
      return response.data;
    },
    enabled: visible,
  });

  const products = (productsResponse?.data || []).filter(
    (p) => p.name !== 'Món lẻ' && !p.name.toLowerCase().startsWith('tiền')
  );

  // 2. Expose các hàm điều khiển ra bên ngoài qua ref
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setName('');
      setPrice('');
      setUnit('phần');
      setError('');
      setEditingProduct(null);
    },
    close: () => {
      setVisible(false);
    }
  }));

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');
  };

  const formatNumberString = (value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    if (cleanValue === '') return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(cleanValue, 10));
  };

  const parseNumberString = (formattedValue) => {
    const cleanValue = formattedValue.replace(/[^0-9]/g, '');
    return cleanValue ? parseInt(cleanValue, 10) : 0;
  };

  const handleStartEdit = (product) => {
    setEditingProduct(product);
    setName(product.name);
    setPrice(formatNumberString(String(product.defaultPrice)));
    setUnit(product.unit);
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
    setName('');
    setPrice('');
    setUnit('phần');
    setError('');
  };

  // Cập nhật thông tin món ăn lên API
  const handleUpdateProduct = async () => {
    if (loading || !editingProduct) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Tên món ăn thực đơn không được để trống.');
      return;
    }
    if (!price || price.trim() === '') {
      setError('Đơn giá không được để trống.');
      return;
    }

    const defaultPrice = parseNumberString(price);
    if (defaultPrice < 0) {
      setError('Đơn giá phải từ 0 trở lên.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.put(`/store/products/${editingProduct.id}`, {
        name: trimmedName,
        defaultPrice,
        unit,
      });

      if (response.data.success) {
        handleCancelEdit();
        queryClient.invalidateQueries({ queryKey: ['store_products'] });
        if (onRefresh) onRefresh();
        setError('✅ Đã cập nhật thực đơn thành công!');
        setTimeout(() => setError(''), 3000);
      } else {
        setError(response.data.message || 'Lỗi cập nhật món ăn.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // Thêm món ăn mới vào thực đơn
  const handleAddProduct = async () => {
    if (loading) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Tên món ăn thực đơn không được để trống.');
      return;
    }
    if (!price || price.trim() === '') {
      setError('Đơn giá không được để trống.');
      return;
    }

    const defaultPrice = parseNumberString(price);
    if (defaultPrice < 0) {
      setError('Đơn giá phải từ 0 trở lên.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/store/products', {
        name: trimmedName,
        defaultPrice,
        unit,
      });

      if (response.data.success) {
        setName('');
        setPrice('');
        setUnit('phần');
        queryClient.invalidateQueries({ queryKey: ['store_products'] });
        if (onRefresh) onRefresh();
        setError('✅ Đã thêm món ăn vào thực đơn thành công!');
        setTimeout(() => setError(''), 3000);
      } else {
        setError(response.data.message || 'Lỗi thêm món ăn.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // Ẩn/Xóa mềm món ăn khỏi danh mục hoạt động
  const handleDeleteProduct = async (productId, productName) => {
    popupModalRef.current?.show({
      title: 'Xác nhận xóa món',
      message: `Bạn có chắc chắn muốn ẩn món ăn "${productName}" khỏi danh mục thực đơn cửa hàng?`,
      type: 'confirm',
      confirmText: 'Ẩn đi',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          const response = await api.delete(`/store/products/${productId}`);
          if (response.data.success) {
            queryClient.invalidateQueries({ queryKey: ['store_products'] });
            if (onRefresh) onRefresh();
          } else {
            popupModalRef.current?.show({
              title: 'Lỗi',
              message: response.data.message || 'Không thể ẩn món ăn.',
              type: 'error',
            });
          }
        } catch (err) {
          popupModalRef.current?.show({
            title: 'Lỗi',
            message: 'Lỗi kết nối mạng, vui lòng thử lại.',
            type: 'error',
          });
        }
      }
    });
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🏪 QUẢN LÝ THỰC ĐƠN CỬA HÀNG</Text>
            <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
              <Text style={styles.closeHeaderText}>✕</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={[styles.alertBox, error.startsWith('✅') ? styles.alertSuccess : styles.alertError]}>
              <Text style={error.startsWith('✅') ? styles.alertTextSuccess : styles.alertTextError}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* Form nhập thông tin thực đơn */}
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>
              {editingProduct ? '✏️ CẬP NHẬT MÓN THỰC ĐƠN' : '➕ THÊM MÓN MỚI VÀO THỰC ĐƠN'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
              <View style={{ flex: 1.2 }}>
                <Text style={styles.label}>Tên món ăn/Uống:</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 0 }]}
                  placeholder="Ví dụ: Bún chả..."
                  placeholderTextColor={COLORS.textLight}
                  value={name}
                  onChangeText={setName}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Đơn giá (VND):</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 0 }]}
                  placeholder="Ví dụ: 35.000"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="number-pad"
                  value={price}
                  onChangeText={(text) => setPrice(formatNumberString(text))}
                />
              </View>
            </View>

            {/* Nút lưu/thêm */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {editingProduct ? (
                  <>
                    <TouchableOpacity
                      style={[styles.saveButton, { height: 36, paddingHorizontal: 12, backgroundColor: '#5B21B6' }]}
                      onPress={handleUpdateProduct}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={[styles.saveButtonText, { fontSize: 13 }]}>LƯU 💾</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.closeButton, { height: 36, paddingHorizontal: 12, marginTop: 0, backgroundColor: COLORS.inputBg }]}
                      onPress={handleCancelEdit}
                    >
                      <Text style={[styles.closeButtonText, { fontSize: 13 }]}>HỦY</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.saveButton, { height: 36, paddingHorizontal: 12, backgroundColor: '#5B21B6' }]}
                    onPress={handleAddProduct}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={[styles.saveButtonText, { fontSize: 13 }]}>THÊM 💾</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Danh sách thực đơn hiện có */}
          <Text style={styles.sectionTitle}>📋 THỰC ĐƠN ĐANG BÁN ({products.length})</Text>
          {isLoading ? (
            <ActivityIndicator color="#5B21B6" style={{ margin: 20 }} />
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.productItem}>
                  <View style={styles.productDetails}>
                    <Text style={styles.productNameText}>{item.name}</Text>
                    <Text style={styles.productPriceText}>
                      {formatCurrency(item.defaultPrice)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => handleStartEdit(item)}
                    >
                      <Text style={styles.editButtonText}>✏️ Sửa</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteProduct(item.id, item.name)}
                    >
                      <Text style={styles.deleteButtonText}>🗑️ Xóa</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Chưa có món ăn nào trong thực đơn. Hãy thêm ở form trên!</Text>
              }
            />
          )}

          <TouchableOpacity
            style={[styles.closeButton, { height: 38, marginTop: 8 }]}
            onPress={() => setVisible(false)}
          >
            <Text style={[styles.closeButtonText, { fontSize: 14 }]}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>
      <StorePopupModal ref={popupModalRef} />
    </>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    height: '100%',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    color: '#5B21B6',
  },
  closeHeaderButton: {
    padding: 6,
  },
  closeHeaderText: {
    fontSize: 20,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  alertBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
  },
  alertError: {
    backgroundColor: COLORS.dangerLight,
    borderColor: '#FECACA',
  },
  alertSuccess: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  alertTextError: {
    color: COLORS.dangerDark,
    fontWeight: '600',
    fontSize: FONTS.body,
  },
  alertTextSuccess: {
    color: '#5B21B6',
    fontWeight: '600',
    fontSize: FONTS.body,
  },
  formContainer: {
    backgroundColor: '#F9F5FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#FFFFFF',
    height: 42,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  unitContainer: {
    flexDirection: 'row',
  },
  unitBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    marginRight: 4,
  },
  unitBadgeSelected: {
    backgroundColor: '#EDE9FE',
    borderColor: '#5B21B6',
  },
  unitBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  unitBadgeTextSelected: {
    color: '#5B21B6',
  },
  saveButton: {
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  listContent: {
    paddingBottom: 20,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  productDetails: {
    flex: 1,
  },
  productNameText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productPriceText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  editButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  editButtonText: {
    color: '#5B21B6',
    fontSize: 12,
    fontWeight: 'bold',
  },
  deleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteButtonText: {
    color: COLORS.dangerDark,
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    marginVertical: 14,
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default AddMenuModal;
