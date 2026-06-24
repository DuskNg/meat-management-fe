// meat-management-fe/src/components/ProductListModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import PopupModal from './PopupModal';

const ProductListModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('kg'); // Đơn vị mặc định là kg
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const [editingProduct, setEditingProduct] = useState(null); // Quản lý trạng thái đang sửa mặt hàng thịt
  const popupModalRef = useRef(null);

  // 1. Tải danh mục thịt từ Backend bằng React Query
  const { data: productsResponse, refetch, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await api.get('/products');
      return response.data;
    },
    enabled: visible,
  });

  // Lọc bỏ sản phẩm ảo của ghi nợ nhanh khỏi danh sách quản lý thịt đang bán
  const products = (productsResponse?.data || []).filter(
    (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
  );

  // 2. Expose các hàm mở/đóng modal ra ngoài
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setName('');
      setPrice('');
      setUnit('kg');
      setError('');
      setEditingProduct(null);
    },
    close: () => {
      setVisible(false);
    }
  }));

  // Định dạng hiển thị tiền VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');
  };

  // Định dạng chuỗi số nhập vào tự động thêm dấu chấm phân tách hàng nghìn
  const formatNumberString = (value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    if (cleanValue === '') return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(cleanValue, 10));
  };

  // Chuyển chuỗi định dạng trở lại số nguyên để gửi đi
  const parseNumberString = (formattedValue) => {
    const cleanValue = formattedValue.replace(/[^0-9]/g, '');
    return cleanValue ? parseInt(cleanValue, 10) : 0;
  };

  // Kích hoạt trạng thái chỉnh sửa thịt
  const handleStartEdit = (product) => {
    setEditingProduct(product);
    setName(product.name);
    setPrice(formatNumberString(String(product.defaultPrice)));
    setUnit(product.unit);
    setError('');
  };

  // Hủy bỏ trạng thái chỉnh sửa
  const handleCancelEdit = () => {
    setEditingProduct(null);
    setName('');
    setPrice('');
    setUnit('kg');
    setError('');
  };

  // Gửi yêu cầu cập nhật thông tin sản phẩm thịt lên backend
  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Tên loại thịt không được để trống.');
      return;
    }
    if (!price || price.trim() === '') {
      setError('Đơn giá không được để trống.');
      return;
    }

    const defaultPrice = parseNumberString(price);
    if (defaultPrice < 0) {
      setError('Đơn giá mặc định phải từ 0 trở lên.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.put(`/products/${editingProduct.id}`, {
        name: trimmedName,
        defaultPrice,
        unit,
      });

      if (response.data.success) {
        handleCancelEdit();
        // Làm mới cache React Query
        queryClient.invalidateQueries({ queryKey: ['products'] });
        if (onRefresh) onRefresh();
        setError('✅ Đã cập nhật thịt thành công!');
        setTimeout(() => setError(''), 3000);
      } else {
        setError(response.data.message || 'Lỗi cập nhật sản phẩm.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Xử lý thêm loại thịt mới
  const handleAddProduct = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Tên loại thịt không được để trống.');
      return;
    }
    if (!price || price.trim() === '') {
      setError('Đơn giá không được để trống.');
      return;
    }

    const defaultPrice = parseNumberString(price);
    if (defaultPrice < 0) {
      setError('Đơn giá mặc định phải từ 0 trở lên.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/products', {
        name: trimmedName,
        defaultPrice,
        unit,
      });

      if (response.data.success) {
        setName('');
        setPrice('');
        setUnit('kg');
        // Làm mới cache React Query
        queryClient.invalidateQueries({ queryKey: ['products'] });
        if (onRefresh) onRefresh();
        // Thông báo thành công nhỏ
        setError('✅ Đã thêm thịt mới thành công!');
        setTimeout(() => setError(''), 3000);
      } else {
        setError(response.data.message || 'Lỗi thêm sản phẩm.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Xóa mềm (Deactivate) loại thịt qua PopupModal
  const handleDeleteProduct = async (productId, productName) => {
    popupModalRef.current?.show({
      title: 'Xác nhận ẩn',
      message: `Bạn có chắc chắn muốn ẩn loại thịt "${productName}" khỏi danh mục bán hàng?`,
      type: 'confirm',
      confirmText: 'Ẩn đi',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          const response = await api.delete(`/products/${productId}`);
          if (response.data.success) {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            if (onRefresh) onRefresh();
          } else {
            popupModalRef.current?.show({
              title: 'Lỗi',
              message: response.data.message || 'Không thể ẩn thịt.',
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
          <Text style={styles.modalTitle}>🥩 QUẢN LÝ DANH SÁCH THỊT</Text>
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

        {/* Form thêm hoặc cập nhật thịt mới */}
        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>
            {editingProduct ? '✏️ CẬP NHẬT THÔNG TIN THỊT' : '➕ THÊM THỊT MỚI'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
            <View style={{ flex: 1.2 }}>
              <Text style={styles.label}>Tên loại thịt:</Text>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                placeholder="Ví dụ: Bắp bò..."
                placeholderTextColor={COLORS.textLight}
                value={name}
                onChangeText={setName}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Đơn giá (VND):</Text>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                placeholder="Ví dụ: 130.000"
                placeholderTextColor={COLORS.textLight}
                keyboardType="number-pad"
                value={price}
                onChangeText={(text) => setPrice(formatNumberString(text))}
              />
            </View>
          </View>

          {/* Chọn đơn vị tính và các nút bấm hành động */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.label, { marginBottom: 0 }]}>ĐVT:</Text>
              <View style={[styles.unitContainer, { marginBottom: 0, gap: 4 }]}>
                {['kg', 'lạng', 'cái'].map((u) => {
                  const isSelected = unit === u;
                  return (
                    <TouchableOpacity
                      key={u}
                      style={[styles.unitBadge, isSelected && styles.unitBadgeSelected]}
                      onPress={() => setUnit(u)}
                    >
                      <Text style={[styles.unitBadgeText, isSelected && styles.unitBadgeTextSelected]}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 6 }}>
              {editingProduct ? (
                <>
                  <TouchableOpacity
                    style={[styles.saveButton, { height: 36, paddingHorizontal: 12, backgroundColor: COLORS.primary }]}
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
                  style={[styles.saveButton, { height: 36, paddingHorizontal: 12 }]}
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

        {/* Danh sách thịt hiện có */}
        <Text style={styles.sectionTitle}>📋 DANH SÁCH THỊT ĐANG BÁN ({products.length})</Text>
        {isLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ margin: 20 }} />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }} // Cho phép danh sách co giãn chiếm trọn không gian trống còn lại
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.productItem}>
                <View style={styles.productDetails}>
                  <Text style={styles.productNameText}>{item.name}</Text>
                  <Text style={styles.productPriceText}>
                    {formatCurrency(item.defaultPrice)} / {item.unit}
                  </Text>
                </View>

                {/* Cụm nút hành động bên cạnh mặt hàng: Sửa và Ẩn */}
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
              <Text style={styles.emptyText}>Chưa có loại thịt nào. Hãy thêm ở form trên!</Text>
            }
          />
        )}

        {/* Nút đóng chân modal (được thu nhỏ lại) */}
        <TouchableOpacity
          style={[styles.closeButton, { height: 38, marginTop: 8 }]}
          onPress={() => setVisible(false)}
        >
          <Text style={[styles.closeButtonText, { fontSize: 14 }]}>ĐÓNG LẠI</Text>
        </TouchableOpacity>
      </View>
      </SmoothModal>
      <PopupModal ref={popupModalRef} />
    </>
  );
});

export default ProductListModal;

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  modalView: {
    backgroundColor: COLORS.card,
    height: '100%', // Chiều cao chiếm trọn màn hình (full height)
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30, // Tránh tai thỏ và thanh trạng thái trên di động
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
    color: '#7F1D1D',
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
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  alertTextError: {
    color: COLORS.dangerDark,
    fontWeight: '600',
    fontSize: FONTS.body,
  },
  alertTextSuccess: {
    color: '#065F46',
    fontWeight: '600',
    fontSize: FONTS.body,
  },
  formContainer: {
    backgroundColor: '#FAF8F6',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1EFEA',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  inputGroup: {
    flexDirection: 'row',
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
    borderColor: '#E4E2DD',
    marginBottom: 10,
  },
  label: {
    fontSize: 12, // Giảm từ 14 xuống 12
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 4, // Giảm từ 6 xuống 4
  },
  unitContainer: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  unitBadge: {
    paddingVertical: 3, // Giảm từ 5 xuống 3
    paddingHorizontal: 8, // Giảm từ 12 xuống 8
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E2DD',
    marginRight: 4, // Giảm từ 8 xuống 4
  },
  unitBadgeSelected: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  unitBadgeText: {
    fontSize: 12, // Giảm từ 14 xuống 12
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  unitBadgeTextSelected: {
    color: COLORS.primaryDark,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
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
    paddingVertical: 6, // Giảm từ 8 xuống 6
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
    backgroundColor: '#ECFDF5', // Màu xanh lá nhẹ
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  editButtonText: {
    color: '#047857', // Chữ màu xanh lục đậm
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
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});
