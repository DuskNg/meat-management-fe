// meat-management-fe/src/components/DebtModal.js
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
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import ProductListModal from './ProductListModal';
import DatePickerInput from './DatePickerInput';

const DebtModal = forwardRef(({ customerId, onRefresh }, ref) => {
  // ─── Helper: lấy ngày hôm nay dạng DD/MM/YYYY ──────────────────────────
  const getTodayFormatted = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  };

  // ─── Helper: chuỗi DD/MM/YYYY → ISO string để gửi API ──────────────────
  const parseDateString = (str) => {
    const parts = str.trim().split(/[\/\-]/);
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const dateObj = new Date(year, month - 1, day);
    if (
      dateObj.getFullYear() !== year ||
      dateObj.getMonth() !== month - 1 ||
      dateObj.getDate() !== day
    ) return null;
    return dateObj.toISOString();
  };

  // ─── Helper: định dạng hàng nghìn dấu chấm ─────────────────────────────
  const formatNumberString = (value) => {
    const clean = value.replace(/[^0-9]/g, '');
    if (clean === '') return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(clean, 10));
  };

  const parseNumberString = (formatted) => {
    const clean = formatted.replace(/[^0-9]/g, '');
    return clean ? parseInt(clean, 10) : 0;
  };

  // ─── Helper: định dạng tiền VNĐ đầy đủ ────────────────────────────────
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');

  // ─── State ──────────────────────────────────────────────────────────────
  const [visible, setVisible] = useState(false);

  // Giỏ hàng: danh sách mặt hàng đã thêm vào đơn
  const [cartItems, setCartItems] = useState([]);

  // Mặt hàng đang được nhập hiện tại
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentQuantity, setCurrentQuantity] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');

  // Thông tin chung cho cả đơn hàng
  const [dateStr, setDateStr] = useState(getTodayFormatted());
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const productModalRef = useRef(null);

  // ─── Tải danh mục sản phẩm (chỉ khi modal đang mở) ───────────────────
  const { data: productsResponse, refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/products');
      return res.data;
    },
    enabled: visible,
  });

  const products = productsResponse?.data || [];

  // ─── Phơi bày open/close ra component cha ─────────────────────────────
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setCartItems([]);
      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setDateStr(getTodayFormatted());
      setNote('');
      setError('');
    },
    close: () => setVisible(false),
  }));

  // ─── Chọn loại thịt (điền giá mặc định) ──────────────────────────────
  const handleSelectProduct = (product) => {
    setCurrentProduct(product);
    setCurrentPrice(formatNumberString(product.defaultPrice.toString()));
    setError('');
  };

  // ─── Thêm mặt hàng hiện tại vào giỏ hàng ─────────────────────────────
  const handleAddToCart = () => {
    if (!currentProduct) {
      setError('Vui lòng chọn loại thịt trước.');
      return;
    }
    const q = parseFloat(currentQuantity);
    if (isNaN(q) || q <= 0) {
      setError('Khối lượng phải lớn hơn 0 (Ví dụ: 1.5).');
      return;
    }
    if (!currentPrice || currentPrice.trim() === '') {
      setError('Vui lòng nhập đơn giá.');
      return;
    }
    const p = parseNumberString(currentPrice);
    if (p <= 0) {
      setError('Đơn giá phải lớn hơn 0.');
      return;
    }

    // Thêm vào giỏ hàng
    setCartItems((prev) => [
      ...prev,
      {
        tempId: Date.now(),        // ID tạm thời để xóa item
        product: currentProduct,
        quantity: q,
        price: p,
        displayQuantity: currentQuantity,
        displayPrice: currentPrice,
        amount: q * p,
      },
    ]);

    // Reset form về trạng thái chọn sản phẩm mới
    setCurrentProduct(null);
    setCurrentQuantity('');
    setCurrentPrice('');
    setError('');
  };

  // ─── Xóa 1 mặt hàng ra khỏi giỏ hàng ─────────────────────────────────
  const handleRemoveFromCart = (tempId) => {
    setCartItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  // ─── Xác nhận và gửi toàn bộ giỏ hàng lên API ───────────────────────
  const handleSubmit = async () => {
    if (cartItems.length === 0) {
      setError('Vui lòng thêm ít nhất 1 mặt hàng vào đơn trước khi xác nhận.');
      return;
    }
    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày ghi nợ không đúng định dạng (Ví dụ: 14/06/2026).');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/transactions', {
        customerId,
        date: isoDate,
        note: note.trim() || null,
        // Gửi toàn bộ mặt hàng trong giỏ hàng lên cùng 1 lần
        items: cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.price,
        })),
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi ghi nợ. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Tổng giỏ hàng ─────────────────────────────────────────────────────
  const cartTotal = cartItems.reduce((sum, item) => sum + item.amount, 0);

  // Thành tiền mặt hàng đang nhập (hiển thị trực tiếp)
  const currentSubtotal =
    parseFloat(currentQuantity || 0) * parseNumberString(currentPrice || '0');
  const displayCurrentSubtotal = isNaN(currentSubtotal) ? 0 : currentSubtotal;

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centeredView}
      >
        {/* Lớp nền trong suốt bấm ngoài để đóng modal */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        />

        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>🔴 GHI NỢ THỊT MỚI</Text>

          {/* Thông báo lỗi */}
          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          {/* ── GIỎ HÀNG: Danh sách mặt hàng đã thêm ── */}
          {cartItems.length > 0 && (
            <View style={styles.cartSection}>
              <View style={styles.cartHeader}>
                <Text style={styles.cartTitle}>
                  🛒 Đơn hàng ({cartItems.length} mặt hàng)
                </Text>
                <Text style={styles.cartTotalText}>{formatCurrency(cartTotal)}</Text>
              </View>
              {cartItems.map((item) => (
                <View key={item.tempId} style={styles.cartItem}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName}>{item.product.name}</Text>
                    <Text style={styles.cartItemMeta}>
                      {item.quantity} {item.product.unit} × {item.displayPrice}đ
                      {'  =  '}
                      <Text style={{ color: COLORS.danger, fontWeight: 'bold' }}>
                        {formatCurrency(item.amount)}
                      </Text>
                    </Text>
                  </View>
                  {/* Nút xóa mặt hàng khỏi giỏ */}
                  <TouchableOpacity
                    style={styles.cartRemoveBtn}
                    onPress={() => handleRemoveFromCart(item.tempId)}
                  >
                    <Text style={styles.cartRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* ── CHỌN LOẠI THỊT ── */}
          <Text style={styles.label}>
            {cartItems.length > 0 ? '➕ Thêm mặt hàng tiếp theo:' : '1. Chọn loại thịt mua:'}
          </Text>
          <View style={styles.productsContainer}>
            {products.length === 0 ? (
              <TouchableOpacity
                style={[styles.productBadge, styles.addProductBadge]}
                onPress={() => productModalRef.current?.open()}
              >
                <Text style={styles.addProductBadgeText}>➕ Thêm thịt</Text>
                <Text style={styles.productBadgePrice}>Tạo mới</Text>
              </TouchableOpacity>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {products.map((p) => {
                  const isSelected = currentProduct?.id === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.productBadge, isSelected && styles.productBadgeSelected]}
                      onPress={() => handleSelectProduct(p)}
                    >
                      <Text style={[styles.productBadgeText, isSelected && styles.productBadgeTextSelected]}>
                        {p.name}
                      </Text>
                      <Text style={styles.productBadgePrice}>
                        {formatCurrency(p.defaultPrice)}/{p.unit}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Nút thêm loại thịt mới nhanh */}
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
            {/* ── FORM NHẬP MẶT HÀNG ĐANG CHỌN ── */}
            {currentProduct ? (
              <View>
                {/* Khối lượng */}
                <Text style={styles.label}>
                  Khối lượng ({currentProduct.unit}):
                </Text>
                <View style={styles.numericRow}>
                  <TextInput
                    style={[
                      styles.input,
                      { flex: 1, minWidth: 0, fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 0 },
                    ]}
                    placeholder="Ví dụ: 1.5"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="numeric"
                    value={currentQuantity}
                    onChangeText={setCurrentQuantity}
                  />
                  <Text style={styles.unitText}>{currentProduct.unit}</Text>
                </View>

                {/* Đơn giá */}
                <Text style={styles.label}>Giá bán thực tế (VND):</Text>
                <TextInput
                  style={[styles.input, { fontSize: 20, fontWeight: 'bold' }]}
                  placeholder="Ví dụ: 130.000"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="number-pad"
                  value={currentPrice}
                  onChangeText={(text) => setCurrentPrice(formatNumberString(text))}
                />

                {/* Xem trước thành tiền mặt hàng đang nhập */}
                {displayCurrentSubtotal > 0 && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Thành tiền mặt hàng này:</Text>
                    <Text style={styles.previewValue}>
                      {formatCurrency(displayCurrentSubtotal)}
                    </Text>
                  </View>
                )}

                {/* Nút thêm vào giỏ hàng */}
                <TouchableOpacity style={styles.addToCartBtn} onPress={handleAddToCart}>
                  <Text style={styles.addToCartText}>➕ THÊM VÀO ĐƠN</Text>
                </TouchableOpacity>
              </View>
            ) : products.length === 0 ? (
              <Text style={[styles.selectPrompt, { color: COLORS.dangerDark, fontWeight: '600' }]}>
                Hiện tại chưa có loại thịt, vui lòng thêm loại thịt.
              </Text>
            ) : cartItems.length === 0 ? (
              <Text style={styles.selectPrompt}>
                Vui lòng chạm chọn loại thịt ở danh sách phía trên.
              </Text>
            ) : null}

            {/* ── NGÀY VÀ GHI CHÚ CHUNG CHO CẢ ĐƠN ── */}
            {(cartItems.length > 0 || currentProduct) && (
              <View style={styles.sharedFields}>
                <View style={styles.divider} />
                <Text style={styles.label}>📅 Ngày ghi nợ:</Text>
                <DatePickerInput value={dateStr} onChange={setDateStr} />

                <Text style={styles.label}>📝 Ghi chú đơn hàng (Có thể bỏ qua):</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: Lấy nạc vai làm phở chiều"
                  placeholderTextColor={COLORS.textLight}
                  value={note}
                  onChangeText={setNote}
                />
              </View>
            )}
          </ScrollView>

          {/* ── TỔNG TIỀN CẢ ĐƠN (cố định ở bottom) ── */}
          {cartItems.length > 0 && (
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>💰 TỔNG ĐƠN HÀNG:</Text>
              <Text style={styles.totalValue}>{formatCurrency(cartTotal)}</Text>
            </View>
          )}

          {/* ── NÚT HỦY / XÁC NHẬN ── */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => setVisible(false)}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>HỦY BỎ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.submitButton, cartItems.length === 0 && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={loading || cartItems.length === 0}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {cartItems.length > 0 ? `GHI NỢ (${cartItems.length})` : 'XÁC NHẬN'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Modal quản lý danh mục thịt */}
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
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
  },
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '96%', // Tăng chiều cao tối đa để hiển thị nhiều nội dung hơn
    ...SHADOWS.card,
  },
  modalTitle: {
    fontSize: FONTS.title,
    fontWeight: FONTS.weightBold,
    color: COLORS.danger,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: FONTS.body,
    fontWeight: '600',
    marginBottom: 12,
  },

  // ── Giỏ hàng ────────────────────────────────────────────────────────────
  cartSection: {
    backgroundColor: '#FFF8F0',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    padding: 12,
    marginBottom: 14,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cartTitle: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: '#92400E',
  },
  cartTotalText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: '#FED7AA',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cartItemMeta: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cartRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  cartRemoveText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },

  // ── Chọn sản phẩm ───────────────────────────────────────────────────────
  label: {
    fontSize: FONTS.body,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 8,
  },
  productsContainer: {
    marginBottom: 14,
  },
  productBadge: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    marginRight: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 90,
  },
  productBadgeSelected: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.danger,
  },
  productBadgeText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productBadgeTextSelected: {
    color: COLORS.dangerDark,
  },
  productBadgePrice: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  addProductBadge: {
    backgroundColor: '#FAF8F6',
    borderColor: '#7F1D1D',
    borderStyle: 'dashed',
  },
  addProductBadgeText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: '#7F1D1D',
  },

  // ── Form scroll ─────────────────────────────────────────────────────────
  formScroll: {
    maxHeight: 420, // Tăng vùng cuộn form để hiển thị đủ các trường nhập liệu
    marginBottom: 10,
  },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  unitText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginLeft: 12,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 52,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: FONTS.body,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },

  // Xem trước thành tiền mặt hàng đang nhập
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.dangerLight,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  previewLabel: {
    fontSize: FONTS.caption,
    fontWeight: '600',
    color: COLORS.dangerDark,
  },
  previewValue: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.danger,
  },

  // Nút thêm vào giỏ
  addToCartBtn: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1.5,
    borderColor: '#F97316',
    borderStyle: 'dashed',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  addToCartText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: '#C2410C',
  },

  selectPrompt: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginVertical: 20,
  },

  // Divider ngăn cách form nhập và phần ngày/ghi chú
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  sharedFields: {
    marginTop: 4,
  },

  // ── Tổng đơn hàng (bottom fixed) ────────────────────────────────────────
  totalContainer: {
    backgroundColor: '#E6F4EA',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: '#065F46',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },

  // ── Buttons ─────────────────────────────────────────────────────────────
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  button: {
    flex: 1,
    height: 54,
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
    fontSize: 15,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitDisabled: {
    backgroundColor: COLORS.textLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
