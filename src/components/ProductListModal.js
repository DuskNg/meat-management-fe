// meat-management-fe/src/components/ProductListModal.js
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
  Platform,
  FlatList,
  Alert
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';

const ProductListModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('kg'); // Đơn vị mặc định là kg
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  // 1. Tải danh mục thịt từ Backend bằng React Query
  const { data: productsResponse, refetch, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await api.get('/products');
      return response.data;
    },
    enabled: visible,
  });

  const products = productsResponse?.data || [];

  // 2. Expose các hàm mở/đóng modal ra ngoài
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setName('');
      setPrice('');
      setUnit('kg');
      setError('');
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

  // 4. Xóa mềm (Deactivate) loại thịt
  const handleDeleteProduct = async (productId, productName) => {
    const confirmDelete = () => {
      Alert.alert(
        'Xác nhận ẩn',
        `Bạn có chắc chắn muốn ẩn loại thịt "${productName}" khỏi danh mục bán hàng?`,
        [
          { text: 'HỦY', style: 'cancel' },
          {
            text: 'ẨN ĐI',
            style: 'destructive',
            onPress: async () => {
              try {
                const response = await api.delete(`/products/${productId}`);
                if (response.data.success) {
                  queryClient.invalidateQueries({ queryKey: ['products'] });
                  if (onRefresh) onRefresh();
                } else {
                  Alert.alert('Lỗi', response.data.message || 'Không thể ẩn thịt.');
                }
              } catch (err) {
                Alert.alert('Lỗi', 'Lỗi kết nối mạng, vui lòng thử lại.');
              }
            }
          }
        ]
      );
    };

    // Trên Web, Alert.alert có thể không có nút bấm đầy đủ trên một số trình duyệt, sử dụng confirm gốc
    if (Platform.OS === 'web') {
      if (window.confirm(`Bạn có chắc chắn muốn ẩn loại thịt "${productName}" khỏi danh mục bán hàng?`)) {
        try {
          const response = await api.delete(`/products/${productId}`);
          if (response.data.success) {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            if (onRefresh) onRefresh();
          } else {
            alert(response.data.message || 'Không thể ẩn thịt.');
          }
        } catch (err) {
          alert('Lỗi kết nối mạng, vui lòng thử lại.');
        }
      }
    } else {
      confirmDelete();
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
        {/* Lớp nền trong suốt click ngoài để tắt modal */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        />
        <View style={styles.modalView}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🥩 QUẢN LÝ DANH MỤC THỊT</Text>
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

          {/* Form thêm thịt mới */}
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>➕ THÊM THỊT MỚI VÀO SỔ</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="Tên thịt (Ví dụ: Bắp bò...)"
                placeholderTextColor={COLORS.textLight}
                value={name}
                onChangeText={setName}
              />
               <TextInput
                style={styles.input}
                placeholder="Giá tiền (Ví dụ: 130.000)"
                placeholderTextColor={COLORS.textLight}
                keyboardType="number-pad" // Hiển thị bàn phím số nguyên trên di động
                value={price}
                onChangeText={(text) => setPrice(formatNumberString(text))}
              />
            </View>

            {/* Chọn đơn vị tính */}
            <Text style={styles.label}>Đơn vị tính:</Text>
            <View style={styles.unitContainer}>
              {['kg', 'lạng', 'cái', 'gói'].map((u) => {
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

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleAddProduct}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>THÊM VÀO DANH MỤC 💾</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Danh sách thịt hiện có */}
          <Text style={styles.sectionTitle}>📋 DANH SÁCH THỊT ĐANG BÁN ({products.length})</Text>
          {isLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ margin: 20 }} />
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.productItem}>
                  <View style={styles.productDetails}>
                    <Text style={styles.productNameText}>{item.name}</Text>
                    <Text style={styles.productPriceText}>
                      {formatCurrency(item.defaultPrice)} / {item.unit}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteProduct(item.id, item.name)}
                  >
                    <Text style={styles.deleteButtonText}>🗑️ Ẩn đi</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Chưa có loại thịt nào. Hãy thêm ở form trên!</Text>
              }
            />
          )}

          {/* Nút đóng chân modal */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setVisible(false)}
          >
            <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    ...SHADOWS.card,
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
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#FFFFFF',
    height: 50,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: FONTS.body,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: '#E4E2DD',
    marginBottom: 10,
  },
  label: {
    fontSize: FONTS.caption,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  unitContainer: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  unitBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E2DD',
    marginRight: 8,
  },
  unitBadgeSelected: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  unitBadgeText: {
    fontSize: FONTS.body,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  unitBadgeTextSelected: {
    color: COLORS.primaryDark,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: FONTS.body,
    fontWeight: 'bold',
  },
  listContent: {
    paddingBottom: 20,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  productDetails: {
    flex: 1,
  },
  productNameText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productPriceText: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  deleteButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteButtonText: {
    color: COLORS.dangerDark,
    fontSize: FONTS.caption,
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
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.body,
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
