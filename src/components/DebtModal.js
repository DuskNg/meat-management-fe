import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
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
  FlatList
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import ProductListModal from './ProductListModal';
import DatePickerInput from './DatePickerInput';

const DebtModal = forwardRef(({ customerId, onRefresh }, ref) => {
  // Lấy chuỗi ngày hôm nay định dạng DD/MM/YYYY
  const getTodayFormatted = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  };

  // Chuyển chuỗi định dạng ngày thành đối tượng Date ISO String để gửi lên API
  const parseDateString = (str) => {
    const parts = str.trim().split(/[\/\-]/);
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const dateObj = new Date(year, month - 1, day);
    if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
      return null;
    }
    return dateObj.toISOString();
  };

  const [visible, setVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [dateStr, setDateStr] = useState(getTodayFormatted());
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const productModalRef = useRef(null);

  // 1. Tải danh mục sản phẩm từ Backend
  const { data: productsResponse, refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await api.get('/products');
      return response.data;
    },
    enabled: visible, // Chỉ gọi API khi modal được mở ra
  });

  const products = productsResponse?.data || [];

  // 2. Phơi bày các hàm điều khiển Modal ra ngoài component cha (Customer Detail)
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setSelectedProduct(null);
      setQuantity('');
      setPrice('');
      setDateStr(getTodayFormatted());
      setNote('');
      setError('');
    },
    close: () => {
      setVisible(false);
    }
  }));

  // 3. Khi người dùng chọn một sản phẩm thịt
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    // Tự động điền giá mặc định của sản phẩm đó làm giá bán gợi ý
    setPrice(formatNumberString(product.defaultPrice.toString()));
    setError('');
  };

  // 4. Định dạng tiền tệ cho đơn giá hiển thị
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount).replace('₫', 'đ');
  };

  // Tự động thêm phân tách hàng nghìn bằng dấu chấm khi gõ phím
  const formatNumberString = (value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    if (cleanValue === '') return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(cleanValue, 10));
  };

  // Chuyển chuỗi định dạng trở lại số nguyên để lưu
  const parseNumberString = (formattedValue) => {
    const cleanValue = formattedValue.replace(/[^0-9]/g, '');
    return cleanValue ? parseInt(cleanValue, 10) : 0;
  };

  // 5. Xử lý ghi nợ thịt mới
  const handleSubmit = async () => {
    if (!selectedProduct) {
      setError('Vui lòng chọn một loại thịt.');
      return;
    }
    const q = parseFloat(quantity);
    if (isNaN(q) || q <= 0) {
      setError('Khối lượng thịt phải lớn hơn 0 (Ví dụ: 1.5).');
      return;
    }
    if (!price || price.trim() === '') {
      setError('Đơn giá không được để trống.');
      return;
    }
    const p = parseNumberString(price);
    if (p < 0) {
      setError('Đơn giá không được là số âm.');
      return;
    }

    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày ghi nợ không đúng định dạng ngày/tháng/năm (Ví dụ: 14/06/2026).');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/transactions', {
        customerId,
        date: isoDate,
        note: note.trim() || null,
        items: [
          {
            productId: selectedProduct.id,
            quantity: q,
            price: p,
          }
        ]
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh(); // Tải lại chi tiết khách hàng và lịch sử nợ
      } else {
        setError(response.data.message || 'Lỗi ghi nợ. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // Tính toán thành tiền tự động từ khối lượng và đơn giá thực tế
  const calculatedTotal = parseFloat(quantity) * parseNumberString(price);
  const displayTotal = isNaN(calculatedTotal) ? 0 : calculatedTotal;

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
          <Text style={styles.modalTitle}>🔴 GHI NỢ THỊT MỚI</Text>

          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          {/* Chọn loại thịt mua */}
          <Text style={styles.label}>1. Chọn loại thịt mua:</Text>
          <View style={styles.productsContainer}>
            {products.length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  style={[styles.productBadge, styles.addProductBadge]}
                  onPress={() => productModalRef.current?.open()}
                >
                  <Text style={styles.addProductBadgeText}>➕ Thêm thịt</Text>
                  <Text style={styles.productBadgePrice}>Tạo mới</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.productScroll}>
                {products.map((p) => {
                  const isSelected = selectedProduct?.id === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.productBadge,
                        isSelected && styles.productBadgeSelected
                      ]}
                      onPress={() => handleSelectProduct(p)}
                    >
                      <Text style={[
                        styles.productBadgeText,
                        isSelected && styles.productBadgeTextSelected
                      ]}>
                        {p.name}
                      </Text>
                      <Text style={styles.productBadgePrice}>
                        {formatCurrency(p.defaultPrice)}/{p.unit}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Nút thêm thịt mới nhanh ngay trong danh sách chọn */}
                <TouchableOpacity
                  style={[styles.productBadge, styles.addProductBadge]}
                  onPress={() => productModalRef.current?.open()}
                >
                  <Text style={styles.addProductBadgeText}>➕ Thêm thịt</Text>
                  <Text style={styles.productBadgePrice}>Tạo mới</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>

          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            {selectedProduct ? (
              <View>
                {/* Nhập khối lượng */}
                <Text style={styles.label}>2. Khối lượng thịt mua (kg):</Text>
                <View style={styles.numericRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, minWidth: 0, fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 0 }]}
                    placeholder="Ví dụ: 1.5"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="numeric"
                    value={quantity}
                    onChangeText={setQuantity}
                  />
                  <Text style={styles.unitText}>{selectedProduct.unit}</Text>
                </View>

                {/* Nhập đơn giá bán thực tế */}
                <Text style={styles.label}>3. Giá bán thực tế lúc cân (VND/kg):</Text>
                <TextInput
                  style={[styles.input, { fontSize: 20, fontWeight: 'bold' }]}
                  placeholder="Ví dụ: 130.000"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="number-pad" // Chỉ hiển thị phím số trên di động
                  value={price}
                  onChangeText={(text) => setPrice(formatNumberString(text))}
                />

                {/* Chọn ngày ghi nợ bằng date picker native */}
                <Text style={styles.label}>4. Ngày ghi nợ:</Text>
                <DatePickerInput
                  value={dateStr}
                  onChange={(newDate) => setDateStr(newDate)}
                />

                {/* Ghi chú thêm */}
                <Text style={styles.label}>5. Ghi chú đơn hàng này (Có thể bỏ qua):</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: Lấy nạc vai làm phở chiều"
                  placeholderTextColor={COLORS.textLight}
                  value={note}
                  onChangeText={setNote}
                />
              </View>
            ) : products.length === 0 ? (
              <Text style={[styles.selectPrompt, { color: COLORS.dangerDark, fontWeight: '600' }]}>
                Hiện tại chưa có loại thịt, vui lòng thêm loại thịt.
              </Text>
            ) : (
              <Text style={styles.selectPrompt}>Vui lòng chạm chọn một loại thịt ở danh sách phía trên trước.</Text>
            )}
          </ScrollView>

          {/* Hiển thị thành tiền tự động tính toán - Đặt cố định ở phần bottom */}
          {selectedProduct ? (
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>💰 THÀNH TIỀN:</Text>
              <Text style={styles.totalValue}>{formatCurrency(displayTotal)}</Text>
            </View>
          ) : null}

          {/* Các nút hành động */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => setVisible(false)}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>HỦY BỎ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={handleSubmit}
              disabled={loading || !selectedProduct}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>XÁC NHẬN</Text>
              )}
            </TouchableOpacity>
          </View>

        </View>
      </KeyboardAvoidingView>
      {/* Modal Quản lý / Thêm thịt mới ngay khi đang ghi nợ */}
      <ProductListModal ref={productModalRef} onRefresh={refetchProducts} />
    </Modal>
  );
});

export default DebtModal;

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
    color: COLORS.danger,
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
  label: {
    fontSize: FONTS.body,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 8,
  },
  productsContainer: {
    marginBottom: 20,
  },
  productScroll: {
    flexDirection: 'row',
  },
  productBadge: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    marginRight: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 100,
  },
  productBadgeSelected: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.danger,
  },
  productBadgeText: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productBadgeTextSelected: {
    color: COLORS.dangerDark,
  },
  productBadgePrice: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  addProductBadge: {
    backgroundColor: '#FAF8F6',
    borderColor: '#7F1D1D',
    borderStyle: 'dashed', // Viền đứt nét để thể hiện hành động thêm
  },
  addProductBadgeText: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    color: '#7F1D1D',
  },
  selectPrompt: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginVertical: 40,
  },
  formScroll: {
    maxHeight: 250,
    marginBottom: 15,
  },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  unitText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginLeft: 12,
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
    flexDirection: 'row', // Chia đôi cùng một hàng
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 15,
  },
  button: {
    flex: 1, // Chia đôi 50/50
    height: 56,
    borderRadius: 12,
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
    fontSize: 16, // Giảm nhẹ kích thước để không rớt dòng
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16, // Giảm nhẹ kích thước để không rớt dòng
    fontWeight: 'bold',
  },
  totalContainer: {
    backgroundColor: '#E6F4EA', // Màu nền xanh lá dịu nhẹ
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary, // Viền xanh lá
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: '#065F46', // Chữ xanh lục sẫm
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
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
