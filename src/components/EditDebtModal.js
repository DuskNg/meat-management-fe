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
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import ProductListModal from './ProductListModal';
import DatePickerInput from './DatePickerInput';
import PinInputModal from './PinInputModal';
import PinSetupModal from './PinSetupModal';
import { hasPin, isSessionValid } from '../store/pinStore';
import { matchItemSearch } from '../utils/searchHelper';
import ProductSelector from './ProductSelector';

import MoneyInput from './MoneyInput';
import { showGlobalToast } from '../store/toastStore';

const EditDebtModal = forwardRef(({ onRefresh, customerId: ownerCustomerId }, ref) => {
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
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'number') return new Intl.NumberFormat('vi-VN').format(value);
    const clean = String(value).replace(/[^0-9]/g, '');
    if (clean === '') return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(clean, 10));
  };

  const parseNumberString = (formatted) => {
    if (formatted === undefined || formatted === null || formatted === '') return 0;
    if (typeof formatted === 'number') return isNaN(formatted) ? 0 : formatted;
    const clean = String(formatted).replace(/[^0-9]/g, '');
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
  const [customerId, setCustomerId] = useState(null); // Lưu ID khách hàng phục vụ lấy giá thịt tùy biến

  // Giỏ hàng chứa danh sách mặt hàng đang sửa đổi
  const [cartItems, setCartItems] = useState([]);

  // Mặt hàng đang được nhập hiện tại
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentQuantity, setCurrentQuantity] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);

  // Thông tin chung của cả hóa đơn
  const [dateStr, setDateStr] = useState('');
  const [note, setNote] = useState('');

  // State hỗ trợ sửa Đơn nợ nhanh vs Đơn nợ chi tiết
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' hoặc 'quick'
  const [quickProductName, setQuickProductName] = useState('Tiền hàng');
  const [quickAmountVND, setQuickAmountVND] = useState(0);
  const [quickProductId, setQuickProductId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const productModalRef = useRef(null);

  // Refs cho 2 modal PIN
  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const isSubmittingRef = useRef(false);

  // ─── Tải danh mục sản phẩm (chỉ khi modal hiển thị và có customerId) ────────────────────
  const { data: productsResponse, refetch: refetchProducts } = useQuery({
    queryKey: ['products', customerId],
    queryFn: async () => {
      const res = await api.get('/products', { params: { customerId } });
      return res.data;
    },
    enabled: visible && !!customerId,
  });

  // Lọc bỏ sản phẩm ảo của ghi nợ nhanh khỏi danh sách thịt đang bán
  const products = (productsResponse?.data || []).filter(
    (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
  );
  const filteredProducts = products.filter((product) =>
    matchItemSearch(product, productSearch, ['name', 'unit'])
  );

  // ─── Phơi bày open/close ra ngoài cho component cha ───────────────────
  useImperativeHandle(ref, () => ({
    open: (transaction) => {
      if (!transaction) return;
      setTransactionId(transaction.id);
      setCustomerId(transaction.customerId || ownerCustomerId); // Ưu tiên ID trong giao dịch, fallback sang khách hàng đang xem

      // Phân loại đơn là Ghi nợ nhanh hay Ghi nợ chi tiết
      const isQuick = (transaction.items || []).some(
        (it) => it.product?.name === 'Tiền hàng' || (it.product?.name && it.product.name.toLowerCase().startsWith('tiền'))
      ) || transaction.note === 'Ghi nợ nhanh';

      if (isQuick) {
        setActiveTab('quick');
        const firstItem = transaction.items?.[0];
        const itemAmount = firstItem ? parseFloat(firstItem.price) * parseFloat(firstItem.quantity || 1) : parseFloat(transaction.totalAmount || 0);
        setQuickAmountVND(itemAmount || parseFloat(transaction.totalAmount || 0));
        setQuickProductName(firstItem?.product?.name || 'Tiền hàng');
        setQuickProductId(firstItem?.productId || firstItem?.product?.id || null);
        setCartItems([]);
      } else {
        setActiveTab('manual');
        setQuickAmountVND(0);
        setQuickProductName('Tiền hàng');

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
      }

      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setProductSearch('');
      setEditingItemId(null);
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
    setEditingItemId(null);
    setError('');
  };

  const handleEditCartItem = (item) => {
    setCurrentProduct(item.product);
    setCurrentQuantity(item.displayQuantity);
    setCurrentPrice(item.displayPrice);
    setEditingItemId(item.tempId);
    setError('');
  };

  // ─── Thêm mặt hàng đang nhập vào giỏ hàng ────────────────────────────
  const handleAddToCart = () => {
    if (!currentProduct) {
      setError('Vui lòng chọn loại thịt trước.');
      return;
    }
    const cleanQty = currentQuantity.trim().replace(',', '.');
    const q = parseFloat(cleanQty);
    if (isNaN(q) || q <= 0) {
      setError('Khối lượng phải lớn hơn 0 (Ví dụ: 1.5 hoặc 1,5).');
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

    if (editingItemId !== null) {
      setCartItems((prev) => prev.map((item) => item.tempId === editingItemId
        ? { ...item, quantity: q, price: p, displayQuantity: currentQuantity, displayPrice: currentPrice, amount: q * p }
        : item
      ));
      setEditingItemId(null);
      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setError('');
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

  // ─── Kiểm tra PIN trước khi thực hiện thao tác tài chính nhạy cảm ──────────────
  const requirePin = async (action) => {
    const pinExists = await hasPin();
    if (!pinExists) {
      pinSetupRef.current?.open(action);
      return;
    }
    const sessionOk = await isSessionValid();
    if (sessionOk) {
      action();
    } else {
      pinInputRef.current?.open(action, 'cập nhật đơn ghi nợ');
    }
  };

  // ─── Lưu cập nhật đơn hàng ──────────────────────────────────
  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return; // Ngăn chặn bấm đúp khi đang gửi yêu cầu

    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày ghi nợ không hợp lệ (Ví dụ: 14/06/2026).');
      return;
    }

    let payloadItems = [];
    if (activeTab === 'quick') {
      const qAmt = parseNumberString(quickAmountVND);
      if (!qAmt || qAmt <= 0) {
        setError('Vui lòng nhập số tiền nợ hợp lệ lớn hơn 0 đ.');
        return;
      }
      payloadItems = [
        {
          productId: quickProductId || null,
          productName: (quickProductName || 'Tiền hàng').trim(),
          quantity: 1,
          price: qAmt,
        },
      ];
    } else {
      if (cartItems.length === 0) {
        setError('Vui lòng chọn ít nhất 1 loại thịt vào danh sách.');
        return;
      }
      payloadItems = cartItems.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        price: item.price,
      }));
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;
    try {
      const response = await api.put(`/transactions/${transactionId}`, {
        date: isoDate,
        note: note.trim() || null,
        items: payloadItems,
      });

      if (response.data.success) {
        setVisible(false);
        showGlobalToast('Đã cập nhật đơn ghi nợ thành công!', 'success');
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi cập nhật. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối, vui lòng kiểm tra lại.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // ─── Tổng số tiền giỏ hàng ───────────────────────────────────────────
  const cartTotal = cartItems.reduce((sum, item) => sum + item.amount, 0);

  // Xem trước thành tiền mặt hàng đang gõ
  const currentSubtotal =
    parseFloat((currentQuantity || '0').toString().replace(',', '.')) * parseNumberString(currentPrice || '0');
  const displayCurrentSubtotal = isNaN(currentSubtotal) ? 0 : currentSubtotal;

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>✏️ CẬP NHẬT ĐƠN GHI NỢ</Text>
          <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Cuộn toàn bộ nội dung form để tránh bị đè khi hiển thị bàn phím */}
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Thông báo lỗi chung */}
          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          {/* ── THANH CHUYỂN TAB CÔNG NỢ (Chi tiết / Nợ nhanh) ── */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'manual' && styles.tabButtonActive]}
              onPress={() => setActiveTab('manual')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'manual' && styles.tabButtonTextActive]}>
                🥩 Nợ chi tiết (Theo thịt)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'quick' && styles.tabButtonActive]}
              onPress={() => setActiveTab('quick')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'quick' && styles.tabButtonTextActive]}>
                ⚡ Nợ nhanh
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── NGÀY GHI NỢ ── */}
          <Text style={styles.label}>📅 Ngày ghi nợ:</Text>
          <DatePickerInput
            value={dateStr}
            onChange={setDateStr}
            allowFuture={true}
          />

          <View style={styles.divider} />

          {activeTab === 'quick' ? (
            /* ── GIAO DIỆN SỬA ĐƠN NỢ NHANH ── */
            <View style={styles.quickSection}>
              <Text style={styles.label}>📝 Tên tiền hàng / mặt hàng:</Text>
              <TextInput
                style={styles.input}
                value={quickProductName}
                onChangeText={setQuickProductName}
                placeholder="Tiền hàng"
                placeholderTextColor={COLORS.textLight}
              />

              <Text style={[styles.label, { marginTop: 12 }]}>💵 Số tiền nợ (đ):</Text>
              <MoneyInput
                value={quickAmountVND}
                onChangeValue={setQuickAmountVND}
                placeholder="0"
                textAlign="left"
              />

              <Text style={[styles.label, { marginTop: 12 }]}>📝 Ghi chú bổ sung (tuỳ chọn):</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: Nợ tiền thịt giao buổi sáng..."
                placeholderTextColor={COLORS.textLight}
                value={note}
                onChangeText={setNote}
              />
            </View>
          ) : (
            /* ── GIAO DIỆN SỬA ĐƠN NỢ CHI TIẾT ── */
            <View>
              {/* ── GIỎ HÀNG: Danh sách mặt hàng đã thêm ── */}
              {cartItems.length > 0 && (
                <View style={styles.cartSection}>
                  <View style={styles.cartHeader}>
                    <Text style={styles.cartTitle}>
                      🛒 Đơn hàng ({cartItems.length} mặt hàng)
                    </Text>
                    <Text style={styles.cartTotalText}>{formatCurrency(cartTotal)}</Text>
                  </View>
                  <ScrollView style={styles.cartItemsScroll} nestedScrollEnabled={true}>
                    {cartItems.map((item) => (
                      <View key={item.tempId} style={styles.cartItem}>
                        <TouchableOpacity style={styles.cartItemInfo} onPress={() => handleEditCartItem(item)}>
                          <Text style={styles.cartItemText}>
                            <Text style={styles.cartItemName}>{item.product.name}</Text>
                            <Text style={styles.cartItemMeta}>
                              {` - ${item.quantity} ${item.product.unit} × ${item.displayPrice}đ = `}
                              <Text style={{ color: COLORS.danger, fontWeight: 'bold' }}>
                                {formatCurrency(item.amount)}
                              </Text>
                            </Text>
                          </Text>
                        </TouchableOpacity>
                        {/* Nút xóa mặt hàng khỏi giỏ */}
                        <TouchableOpacity
                          style={styles.cartEditBtn}
                          onPress={() => handleEditCartItem(item)}
                        >
                          <Text style={styles.cartEditText}>✏️ Sửa</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cartRemoveBtn}
                          onPress={() => handleRemoveFromCart(item.tempId)}
                        >
                          <Text style={styles.cartRemoveText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── CHỌN LOẠI THỊT ── */}
              <Text style={styles.label}>
                {cartItems.length > 0 ? '➕ Thêm mặt hàng tiếp theo:' : '1. Chọn loại thịt mua:'}
              </Text>
              <ProductSelector
                products={products}
                currentProduct={currentProduct}
                onSelectProduct={handleSelectProduct}
                onClearProduct={() => {
                  setCurrentProduct(null);
                  setCurrentPrice('');
                  setProductSearch('');
                }}
                onAddProduct={() => productModalRef.current?.open()}
                formatCurrency={formatCurrency}
                hasError={error && error.toLowerCase().includes('thịt')}
                error={error}
              />

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
                        { flex: 1, minWidth: 0, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 0 }
                      ]}
                      placeholder="Ví dụ: 1.5"
                      placeholderTextColor={COLORS.textLight}
                      keyboardType="decimal-pad"
                      value={currentQuantity}
                      onChangeText={(text) => {
                        // Chỉ cho phép số, dấu chấm và dấu phẩy
                        const filtered = text.replace(/[^0-9.,]/g, '');
                        setCurrentQuantity(filtered);
                      }}
                    />
                    <Text style={styles.unitText}>{currentProduct.unit}</Text>
                  </View>

                  {/* Đơn giá */}
                  <Text style={styles.label}>Giá bán thực tế tại thời điểm này (VND):</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { fontSize: 16, fontWeight: 'bold' }
                    ]}
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
                    <Text style={styles.addToCartText}>{editingItemId !== null ? '💾 CẬP NHẬT MẶT HÀNG' : '➕ THÊM VÀO ĐƠN'}</Text>
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

              {/* ── GHI CHÚ CHUNG CHO CẢ ĐƠN ── */}
              {(cartItems.length > 0 || currentProduct) && (
                <View style={styles.sharedFields}>
                  <View style={styles.divider} />
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
            </View>
          )}
        </ScrollView>

        {/* ── TỔNG TIỀN CẢ ĐƠN (cố định ở bottom) ── */}
        {(activeTab === 'quick' ? quickAmountVND > 0 : cartItems.length > 0) && (
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>💰 TỔNG ĐƠN HÀNG:</Text>
            <Text style={styles.totalValue}>{formatCurrency(activeTab === 'quick' ? quickAmountVND : cartTotal)}</Text>
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
            style={[
              styles.button,
              styles.submitButton,
              (activeTab === 'quick' ? quickAmountVND <= 0 : cartItems.length === 0) && styles.submitDisabled
            ]}
            onPress={() => requirePin(handleSubmit)}
            disabled={loading || (activeTab === 'quick' ? quickAmountVND <= 0 : cartItems.length === 0)}
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

      {/* Modal nhập PIN khi phiên hết hạn */}
      <PinInputModal ref={pinInputRef} />
      {/* Modal tạo PIN lần đầu */}
      <PinSetupModal ref={pinSetupRef} />
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
    height: '100%', // Kéo full height giống DebtModal
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30, // Tránh tai thỏ và thanh trạng thái trên di động
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: COLORS.dangerDark,
    fontWeight: 'bold',
  },
  quickSection: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
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
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: FONTS.body,
    fontWeight: '600',
    marginBottom: 12,
  },

  // ── Giỏ hàng (đồng bộ DebtModal) ──────────────────────────────────
  cartSection: {
    backgroundColor: '#FFF8F0',
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#FED7AA',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  cartItemsScroll: {
    maxHeight: 115,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cartTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400E',
  },
  cartTotalText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderColor: '#FED7AA',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemText: {
    fontSize: 14,
    color: COLORS.text,
  },
  cartItemName: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cartItemMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cartRemoveBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  cartEditBtn: {
    minWidth: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 8,
  },
  cartEditText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#92400E',
  },
  cartRemoveText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },

  // ── Chọn sản phẩm (đồng bộ DebtModal) ──────────────────────────
  label: {
    fontSize: 14,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 4,
  },
  productsContainer: {
    marginBottom: 10,
  },
  productSearchInput: {
    backgroundColor: COLORS.inputBg,
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  noProductSearchText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    paddingVertical: 10,
    textAlign: 'center',
  },
  productBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 80,
  },
  productBadgeSelected: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.danger,
  },
  productBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productBadgeTextSelected: {
    color: COLORS.dangerDark,
  },
  productBadgePrice: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addProductBadge: {
    backgroundColor: '#FAF8F6',
    borderColor: '#7F1D1D',
    borderStyle: 'dashed',
  },
  addProductBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7F1D1D',
  },

  // ── Form scroll ─────────────────────────────────────────────────────────
  mainScroll: {
    flex: 1,
    marginBottom: 10,
  },
  mainScrollContent: {
    paddingBottom: 10,
  },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  unitText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: FONTS.body,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  inputError: {
    borderColor: COLORS.danger,
    backgroundColor: '#FFF5F5',
  },
  fieldErrorText: {
    color: COLORS.dangerDark,
    fontSize: 14,
    fontWeight: '600',
    marginTop: -4,
    marginBottom: 10,
    paddingLeft: 4,
  },

  // Xem trước thành tiền mặt hàng đang nhập (đồng bộ DebtModal)
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.dangerLight,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
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

  // Nút thêm vào giỏ (đồng bộ DebtModal)
  addToCartBtn: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1.5,
    borderColor: '#F97316',
    borderStyle: 'dashed',
    borderRadius: 10,
    height: 44,
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

  // Divider
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  sharedFields: {
    marginTop: 4,
  },

  // ── Tổng đơn hàng (đồng bộ DebtModal - màu xanh) ────────────────────
  totalContainer: {
    backgroundColor: '#E6F4EA',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: COLORS.primary,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#065F46',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },

  // ── Các nút hành động (đồng bộ DebtModal) ────────────────────────
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  button: {
    flex: 1,
    height: 44,
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
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: 'bold',
  },
});
