// meat-management-fe/src/components/EditDebtModal.js
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
import SmoothModal from './SmoothModal';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import ProductListModal from './ProductListModal';
import DatePickerInput from './DatePickerInput';

const EditDebtModal = forwardRef(({ onRefresh }, ref) => {
  // ─── Helper: Chuyển ISO date string/Date object sang DD/MM/YYYY ───────────
  const formatDateToDisplay = (dateInput) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
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
  const [transactionId, setTransactionId] = useState(null);

  // Giỏ hàng chứa danh sách mặt hàng đang sửa đổi
  const [cartItems, setCartItems] = useState([]);

  // Mặt hàng đang được nhập hiện tại
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentQuantity, setCurrentQuantity] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');

  // Thông tin chung của cả hóa đơn
  const [dateStr, setDateStr] = useState('');
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const productModalRef = useRef(null);

  // ─── Tải danh mục sản phẩm (chỉ khi modal hiển thị) ────────────────────
  const { data: productsResponse, refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/products');
      return res.data;
    },
    enabled: visible,
  });

  const products = productsResponse?.data || [];

  // ─── Phơi bày open/close ra ngoài cho component cha ───────────────────
  useImperativeHandle(ref, () => ({
    open: (transaction) => {
      if (!transaction) return;
      setTransactionId(transaction.id);
      
      // Nhóm và cộng dồn các mặt hàng cùng loại thịt từ lịch sử
      const mergedMap = {};
      (transaction.items || []).forEach((it) => {
        // Tìm sản phẩm tương ứng trong danh mục để lấy thông tin đầy đủ
        const prod = products.find((p) => p.id === it.productId) || {
          id: it.productId,
          name: it.product?.name || 'Sản phẩm đã bị xóa',
          unit: it.product?.unit || 'kg',
          defaultPrice: parseFloat(it.price),
        };
        const key = prod.id;
        const qty = parseFloat(it.quantity);
        const priceVal = parseFloat(it.price);
        if (mergedMap[key]) {
          // Nếu đã tồn tại loại thịt này, cộng dồn số lượng và cập nhật đơn giá mới nhất
          mergedMap[key].quantity += qty;
          mergedMap[key].amount = mergedMap[key].quantity * priceVal;
          mergedMap[key].displayQuantity = mergedMap[key].quantity.toString();
          mergedMap[key].price = priceVal;
          mergedMap[key].displayPrice = formatNumberString(priceVal.toString());
        } else {
          // Nếu chưa tồn tại, khởi tạo phần tử mới
          mergedMap[key] = {
            tempId: it.id || Math.random(),
            product: prod,
            quantity: qty,
            price: priceVal,
            displayQuantity: it.quantity.toString(),
            displayPrice: formatNumberString(priceVal.toString()),
            amount: qty * priceVal,
          };
        }
      });
      const initialCart = Object.values(mergedMap);

      setCartItems(initialCart);
      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setDateStr(formatDateToDisplay(transaction.date));
      setNote(transaction.note || '');
      setError('');
      setVisible(true);
    },
    close: () => setVisible(false),
  }));

  // ─── Chọn loại thịt (điền giá mặc định) ──────────────────────────────
  const handleSelectProduct = (product) => {
    setCurrentProduct(product);
    setCurrentPrice(formatNumberString(product.defaultPrice.toString()));
    setError('');
  };

  // ─── Thêm mặt hàng đang nhập vào giỏ hàng ────────────────────────────
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
    setCartItems((prev) => {
      // Kiểm tra xem loại thịt đã tồn tại trong giỏ hàng chưa
      const existingIndex = prev.findIndex((item) => item.product.id === currentProduct.id);
      if (existingIndex > -1) {
        // Nếu đã tồn tại, cộng dồn khối lượng và cập nhật đơn giá mới nhất
        const updated = [...prev];
        const existingItem = updated[existingIndex];
        const newQuantity = existingItem.quantity + q;
        updated[existingIndex] = {
          ...existingItem,
          quantity: newQuantity,
          price: p,
          displayQuantity: newQuantity.toString(),
          displayPrice: currentPrice,
          amount: newQuantity * p,
        };
        return updated;
      }
      // Nếu chưa có, thêm mặt hàng mới vào giỏ hàng
      return [
        ...prev,
        {
          tempId: Date.now(),
          product: currentProduct,
          quantity: q,
          price: p,
          displayQuantity: currentQuantity,
          displayPrice: currentPrice,
          amount: q * p,
        },
      ];
    });

    // Trở lại trạng thái chờ chọn sản phẩm mới
    setCurrentProduct(null);
    setCurrentQuantity('');
    setCurrentPrice('');
    setError('');
  };

  // ─── Xóa một mặt hàng khỏi giỏ ───────────────────────────────────────
  const handleRemoveFromCart = (tempId) => {
    setCartItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  // ─── Lưu cập nhật đơn hàng ───────────────────────────────────────────
  const handleSubmit = async () => {
    if (cartItems.length === 0) {
      setError('Đơn hàng không được để trống. Vui lòng thêm ít nhất 1 mặt hàng.');
      return;
    }
    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày ghi nợ không hợp lệ (Ví dụ: 14/06/2026).');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.put(`/transactions/${transactionId}`, {
        date: isoDate,
        note: note.trim() || null,
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
        setError(response.data.message || 'Lỗi cập nhật. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối, vui lòng kiểm tra lại.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Tổng số tiền giỏ hàng ───────────────────────────────────────────
  const cartTotal = cartItems.reduce((sum, item) => sum + item.amount, 0);

  // Xem trước thành tiền mặt hàng đang gõ
  const currentSubtotal =
    parseFloat(currentQuantity || 0) * parseNumberString(currentPrice || '0');
  const displayCurrentSubtotal = isNaN(currentSubtotal) ? 0 : currentSubtotal;

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
          <Text style={styles.modalTitle}>✏️ CẬP NHẬT ĐƠN GHI NỢ</Text>

          {/* Lỗi */}
          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          {/* ── GIỎ HÀNG GIAO DỊCH ── */}
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

          {/* ── CHỌN MẶT HÀNG MỚI ── */}
          <Text style={styles.label}>
            {cartItems.length > 0 ? '➕ Thêm mặt hàng tiếp theo:' : '1. Chọn loại thịt mua (lướt ngang để xem loại thịt):'}
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
                <TouchableOpacity
                  style={[styles.productBadge, styles.addProductBadge]}
                  onPress={() => productModalRef.current?.open()}
                >
                  <Text style={styles.addProductBadgeText}>➕ Thêm thịt</Text>
                  <Text style={styles.productBadgePrice}>Tạo mới</Text>
                </TouchableOpacity>
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
              </ScrollView>
            )}
          </View>

          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            {currentProduct ? (
              <View>
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

                <Text style={styles.label}>Giá bán thực tế (VND):</Text>
                <TextInput
                  style={[styles.input, { fontSize: 20, fontWeight: 'bold' }]}
                  placeholder="Ví dụ: 130.000"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="number-pad"
                  value={currentPrice}
                  onChangeText={(text) => setCurrentPrice(formatNumberString(text))}
                />

                {displayCurrentSubtotal > 0 && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Thành tiền mặt hàng này:</Text>
                    <Text style={styles.previewValue}>
                      {formatCurrency(displayCurrentSubtotal)}
                    </Text>
                  </View>
                )}

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

            {/* ── NGÀY VÀ GHI CHÚ CHUNG ── */}
            {(cartItems.length > 0 || currentProduct) && (
              <View style={styles.sharedFields}>
                <View style={styles.divider} />
                <Text style={styles.label}>📅 Ngày ghi nợ:</Text>
                <DatePickerInput value={dateStr} onChange={setDateStr} allowFuture={true} />

                <Text style={styles.label}>📝 Ghi chú đơn hàng (Có thể bỏ qua):</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: Thay đổi lại đơn hàng cũ"
                  placeholderTextColor={COLORS.textLight}
                  value={note}
                  onChangeText={setNote}
                />
              </View>
            )}
          </ScrollView>

          {/* ── TỔNG CỘNG ── */}
          {cartItems.length > 0 && (
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>💰 TỔNG ĐƠN HÀNG:</Text>
              <Text style={styles.totalValue}>{formatCurrency(cartTotal)}</Text>
            </View>
          )}

          {/* ── NÚT HÀNH ĐỘNG ── */}
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
                <Text style={styles.submitButtonText}>CẬP NHẬT ĐƠN</Text>
              )}
            </TouchableOpacity>
          </View>
      </View>

      <ProductListModal ref={productModalRef} onRefresh={refetchProducts} />
    </SmoothModal>
  );
});

export default EditDebtModal;

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
    height: '90%',
    maxHeight: '96%',
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
    borderTopColor: '#FEE2E2',
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  cartRemoveText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.danger,
  },

  label: {
    fontSize: FONTS.body,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 8,
  },
  productsContainer: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  productBadge: {
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBadgeSelected: {
    backgroundColor: '#FFF5F5',
    borderColor: COLORS.danger,
  },
  productBadgeText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productBadgeTextSelected: {
    color: COLORS.danger,
  },
  productBadgePrice: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addProductBadge: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  addProductBadgeText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: '#C2410C',
  },

  formScroll: {
    flex: 1,
    marginBottom: 10,
  },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingRight: 16,
    marginBottom: 16,
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
  unitText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginLeft: 10,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.dangerLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  previewLabel: {
    fontSize: FONTS.body,
    fontWeight: '600',
    color: COLORS.dangerDark,
  },
  previewValue: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  addToCartBtn: {
    height: 54,
    borderRadius: 10,
    backgroundColor: '#FFF5F5',
    borderWidth: 2,
    borderColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  addToCartText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  selectPrompt: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginVertical: 20,
    fontStyle: 'italic',
  },

  sharedFields: {
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },

  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.danger,
  },

  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 58,
    borderRadius: 14,
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
    fontSize: FONTS.subtitle,
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
  submitDisabled: {
    backgroundColor: COLORS.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
  },
});
