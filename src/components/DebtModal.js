// meat-management-fe/src/components/DebtModal.js
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
  const [disableDate, setDisableDate] = useState(false);
  const [minDate, setMinDate] = useState(null);
  const [maxDate, setMaxDate] = useState(null);
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState(''); // Lưu trường bị lỗi để đổi viền đỏ ('quantity', 'price', 'date')
  const productModalRef = useRef(null);

  // State phục vụ phân tách tab ghi nợ (Ghi nợ nhanh / Thủ công)
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' hoặc 'quick'
  const [quickAmount, setQuickAmount] = useState('');
  const [quickProductName, setQuickProductName] = useState('Tiền hàng');

  // Refs cho 2 modal PIN
  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);

  // ─── Tải danh mục sản phẩm (chỉ khi modal đang mở) ───────────────────
  const { data: productsResponse, refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/products');
      return res.data;
    },
    enabled: visible,
  });

  // Lọc bỏ sản phẩm ảo của ghi nợ nhanh khỏi danh sách thịt đang bán
  const products = (productsResponse?.data || []).filter(
    (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
  );

  // ─── Phơi bày open/close ra component cha ─────────────────────────────
  useImperativeHandle(ref, () => ({
    open: (scannedItemsOrOptions, options) => {
      setVisible(true);
      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setError('');
      setErrorField('');
      
      // Reset trạng thái của tab ghi nợ nhanh và mặc định chọn tab thủ công
      setActiveTab('manual');
      setQuickAmount('');
      setQuickProductName('Tiền hàng');

      let items = null;
      let initialDateStr = getTodayFormatted();
      let shouldDisableDate = false;
      let initialNote = '';
      let initialMinDate = null;
      let initialMaxDate = null;

      // Phân tích tham số để hỗ trợ cả cách gọi cũ (scannedItems) và cách gọi cấu hình mới (options)
      if (scannedItemsOrOptions && Array.isArray(scannedItemsOrOptions)) {
        items = scannedItemsOrOptions;
        if (options) {
          if (options.initialDate) initialDateStr = options.initialDate;
          if (options.disableDate !== undefined) shouldDisableDate = options.disableDate;
          if (options.note) initialNote = options.note;
          if (options.minDate) initialMinDate = options.minDate;
          if (options.maxDate) initialMaxDate = options.maxDate;
        }
      } else if (scannedItemsOrOptions && typeof scannedItemsOrOptions === 'object') {
        if (scannedItemsOrOptions.initialDate) initialDateStr = scannedItemsOrOptions.initialDate;
        if (scannedItemsOrOptions.disableDate !== undefined) shouldDisableDate = scannedItemsOrOptions.disableDate;
        if (scannedItemsOrOptions.note) initialNote = scannedItemsOrOptions.note;
        if (scannedItemsOrOptions.items) items = scannedItemsOrOptions.items;
        if (scannedItemsOrOptions.minDate) initialMinDate = scannedItemsOrOptions.minDate;
        if (scannedItemsOrOptions.maxDate) initialMaxDate = scannedItemsOrOptions.maxDate;
      }

      setDateStr(initialDateStr);
      setDisableDate(shouldDisableDate);
      setMinDate(initialMinDate);
      setMaxDate(initialMaxDate);
      setNote(initialNote || (items ? 'Đơn ghi nợ tự động tạo từ ảnh chụp tích kê' : ''));

      if (items && Array.isArray(items)) {
        const itemsForCart = items.map((item, idx) => {
          const qty = parseFloat(item.quantity) || 0;
          const prc = parseInt(item.price, 10) || 0;
          return {
            tempId: Date.now() + idx + Math.random(),
            product: item.product,
            quantity: qty,
            price: prc,
            displayQuantity: qty.toString(),
            displayPrice: formatNumberString(prc.toString()),
            amount: qty * prc,
          };
        });
        setCartItems(itemsForCart);
      } else {
        setCartItems([]);
      }
    },
    close: () => setVisible(false),
  }));

  // ─── Chọn loại thịt (điền giá mặc định) ──────────────────────────────
  const handleSelectProduct = (product) => {
    setCurrentProduct(product);
    setCurrentPrice(formatNumberString(product.defaultPrice.toString()));
    setError('');
    setErrorField('');
  };

  // ─── Thêm mặt hàng hiện tại vào giỏ hàng ─────────────────────────────
  const handleAddToCart = () => {
    if (!currentProduct) {
      setError('Vui lòng chọn loại thịt trước.');
      setErrorField('product');
      return;
    }
    const cleanQty = currentQuantity.trim().replace(',', '.');
    const q = parseFloat(cleanQty);
    if (isNaN(q) || q <= 0) {
      setError('Khối lượng phải lớn hơn 0 (Ví dụ: 1.5 hoặc 1,5).');
      setErrorField('quantity');
      return;
    }
    if (!currentPrice || currentPrice.trim() === '') {
      setError('Vui lòng nhập đơn giá.');
      setErrorField('price');
      return;
    }
    const p = parseNumberString(currentPrice);
    if (p <= 0) {
      setError('Đơn giá phải lớn hơn 0.');
      setErrorField('price');
      return;
    }

    // Thêm vào giỏ hàng
    setCartItems((prev) => {
      // Kiểm tra xem loại thịt đã tồn tại trong giỏ hàng hay chưa
      const existingIndex = prev.findIndex((item) => item.product.id === currentProduct.id);
      if (existingIndex > -1) {
        // Nếu đã tồn tại, cộng dồn khối lượng và cập nhật giá mới nhất
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
      // Nếu chưa có, thêm mới vào giỏ hàng
      return [
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
      ];
    });

    // Reset form về trạng thái chọn sản phẩm mới
    setCurrentProduct(null);
    setCurrentQuantity('');
    setCurrentPrice('');
    setError('');
    setErrorField('');
  };

  // ─── Xóa 1 mặt hàng ra khỏi giỏ hàng ─────────────────────────────────
  const handleRemoveFromCart = (tempId) => {
    setCartItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  // ─── Kiểm tra PIN trước khi thực hiện thao tác tài chính nhạy cảm ──────────────
  const requirePin = async (action) => {
    const pinExists = await hasPin();
    if (!pinExists) {
      // Chưa có PIN → yêu cầu tạo mới
      pinSetupRef.current?.open(action);
      return;
    }
    const sessionOk = await isSessionValid();
    if (sessionOk) {
      // Phiên còn hạn → thực hiện ngay không cần nhập lại PIN
      action();
    } else {
      // Phiên hết hạn → yêu cầu nhập PIN
      pinInputRef.current?.open(action, 'ghi nợ thịt mới');
    }
  };

  // ─── Xác nhận và gửi toàn bộ giỏ hàng lên API ──────────────────────────────────
  const handleSubmit = async () => {
    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày ghi nợ không đúng định dạng (Ví dụ: 14/06/2026).');
      setErrorField('date');
      return;
    }

    // So sánh ngày giới hạn nếu có
    if (minDate || maxDate) {
      const selectedTime = new Date(isoDate).getTime();
      if (minDate) {
        const minIso = parseDateString(minDate);
        if (minIso && selectedTime < new Date(minIso).getTime()) {
          setError(`Ngày ghi nợ phải từ ngày ${minDate}.`);
          setErrorField('date');
          return;
        }
      }
      if (maxDate) {
        const maxIso = parseDateString(maxDate);
        if (maxIso && selectedTime > new Date(maxIso).getTime()) {
          setError(`Ngày ghi nợ tối đa là ngày ${maxDate}.`);
          setErrorField('date');
          return;
        }
      }
    }

    // Xử lý gửi dữ liệu tùy theo tab đang chọn
    if (activeTab === 'manual') {
      if (cartItems.length === 0) {
        setError('Vui lòng thêm ít nhất 1 mặt hàng vào đơn trước khi xác nhận.');
        setErrorField('cart');
        return;
      }

      setError('');
      setErrorField('');
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
    } else {
      // Logic gửi ghi nợ nhanh
      if (!quickAmount.trim()) {
        setError('Vui lòng nhập số tiền nợ.');
        setErrorField('quickAmount');
        return;
      }
      const parsedAmt = parseNumberString(quickAmount);
      if (parsedAmt <= 0) {
        setError('Số tiền nợ phải lớn hơn 0.');
        setErrorField('quickAmount');
        return;
      }

      setError('');
      setErrorField('');
      setLoading(true);
      try {
        const response = await api.post('/transactions', {
          customerId,
          date: isoDate,
          note: note.trim() || 'Ghi nợ nhanh',
          // Ghi nợ nhanh chỉ gửi 1 mặt hàng giả lập sản phẩm tên "Tiền hàng"
          items: [
            {
              productName: quickProductName.trim() || 'Tiền hàng',
              quantity: 1,
              price: parsedAmt,
            }
          ],
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
    }
  };

  // ─── Tổng giỏ hàng ─────────────────────────────────────────────────────
  const cartTotal = cartItems.reduce((sum, item) => sum + item.amount, 0);

  // Thành tiền mặt hàng đang nhập (hiển thị trực tiếp)
  const currentSubtotal =
    parseFloat((currentQuantity || '0').toString().replace(',', '.')) * parseNumberString(currentPrice || '0');
  const displayCurrentSubtotal = isNaN(currentSubtotal) ? 0 : currentSubtotal;

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>🔴 GHI NỢ THỊT MỚI</Text>
          <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Thanh chọn giữa 2 hình thức ghi nợ */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'manual' && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab('manual');
              setError('');
              setErrorField('');
            }}
          >
            <Text style={[styles.tabButtonText, activeTab === 'manual' && styles.tabButtonTextActive]}>
              📝 Ghi nợ thủ công
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'quick' && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab('quick');
              setError('');
              setErrorField('');
            }}
          >
            <Text style={[styles.tabButtonText, activeTab === 'quick' && styles.tabButtonTextActive]}>
              ⚡ Ghi nợ nhanh
            </Text>
          </TouchableOpacity>
        </View>

        {/* Thông báo lỗi chung */}
        {error && !['date', 'product', 'quantity', 'price', 'quickAmount', 'quickProductName'].includes(errorField) ? (
          <Text style={styles.errorText}>⚠️ {error}</Text>
        ) : null}

        {/* ── NGÀY GHI NỢ ĐƯA LÊN TRÊN CÙNG ĐẦU TIÊN ── */}
        <Text style={styles.label}>📅 Ngày ghi nợ:</Text>
        <DatePickerInput
          value={dateStr}
          onChange={(val) => {
            setDateStr(val);
            if (errorField === 'date') {
              setError('');
              setErrorField('');
            }
          }}
          allowFuture={true}
          hasError={errorField === 'date'}
          disabled={disableDate}
          minDate={minDate}
          maxDate={maxDate}
        />
        {errorField === 'date' && <Text style={styles.fieldErrorText}>⚠️ {error}</Text>}

        <View style={styles.divider} />

        {activeTab === 'manual' ? (
          <>
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
                      <View style={styles.cartItemInfo}>
                        <Text style={styles.cartItemText}>
                          <Text style={styles.cartItemName}>{item.product.name}</Text>
                          <Text style={styles.cartItemMeta}>
                            {` - ${item.quantity} ${item.product.unit} × ${item.displayPrice}đ = `}
                            <Text style={{ color: COLORS.danger, fontWeight: 'bold' }}>
                              {formatCurrency(item.amount)}
                            </Text>
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
                </ScrollView>
              </View>
            )}

            {/* ── CHỌN LOẠI THỊT ── */}
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
                  {/* Nút thêm loại thịt mới nhanh */}
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
            {errorField === 'product' && <Text style={styles.fieldErrorText}>⚠️ {error}</Text>}

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
                        { flex: 1, minWidth: 0, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 0 },
                        errorField === 'quantity' && styles.inputError
                      ]}
                      placeholder="Ví dụ: 1.5"
                      placeholderTextColor={COLORS.textLight}
                      keyboardType="decimal-pad"
                      value={currentQuantity}
                      onChangeText={(text) => {
                        setCurrentQuantity(text);
                        if (errorField === 'quantity') {
                          setError('');
                          setErrorField('');
                        }
                      }}
                    />
                    <Text style={styles.unitText}>{currentProduct.unit}</Text>
                  </View>
                  {errorField === 'quantity' && <Text style={styles.fieldErrorText}>⚠️ {error}</Text>}

                  {/* Đơn giá */}
                  <Text style={styles.label}>Giá bán thực tế tại thời điểm này (VND):</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { fontSize: 16, fontWeight: 'bold' },
                      errorField === 'price' && styles.inputError
                    ]}
                    placeholder="Ví dụ: 130.000"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="number-pad"
                    value={currentPrice}
                    onChangeText={(text) => {
                      setCurrentPrice(formatNumberString(text));
                      if (errorField === 'price') {
                        setError('');
                        setErrorField('');
                      }
                    }}
                  />
                  {errorField === 'price' && <Text style={styles.fieldErrorText}>⚠️ {error}</Text>}

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
            </ScrollView>

            {/* ── TỔNG TIỀN CẢ ĐƠN (cố định ở bottom) ── */}
            {cartItems.length > 0 && (
              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>💰 TỔNG ĐƠN HÀNG:</Text>
                <Text style={styles.totalValue}>{formatCurrency(cartTotal)}</Text>
              </View>
            )}
          </>
        ) : (
          /* ── TAB GHI NỢ NHANH ── */
          <>
            <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              {/* Nội dung/Tên khoản nợ */}
              <Text style={styles.label}>📝 Nội dung ghi nợ:</Text>
              <TextInput
                style={[
                  styles.input,
                  { fontSize: 16, fontWeight: 'bold' },
                  errorField === 'quickProductName' && styles.inputError
                ]}
                placeholder="Ví dụ: Tiền hàng, Tiền túi bóng..."
                placeholderTextColor={COLORS.textLight}
                value={quickProductName}
                onChangeText={(text) => {
                  setQuickProductName(text);
                  if (errorField === 'quickProductName') {
                    setError('');
                    setErrorField('');
                  }
                }}
              />
              {errorField === 'quickProductName' && <Text style={styles.fieldErrorText}>⚠️ {error}</Text>}

              {/* Số tiền nợ */}
              <Text style={styles.label}>💰 Số tiền nợ (VND):</Text>
              <TextInput
                style={[
                  styles.input,
                  { fontSize: 20, fontWeight: 'bold', color: COLORS.danger },
                  errorField === 'quickAmount' && styles.inputError
                ]}
                placeholder="Nhập số tiền ghi nợ"
                placeholderTextColor={COLORS.textLight}
                keyboardType="number-pad"
                value={quickAmount}
                onChangeText={(text) => {
                  setQuickAmount(formatNumberString(text));
                  if (errorField === 'quickAmount') {
                    setError('');
                    setErrorField('');
                  }
                }}
              />
              {errorField === 'quickAmount' && <Text style={styles.fieldErrorText}>⚠️ {error}</Text>}

              {/* Ghi chú thêm cho nợ nhanh */}
              <Text style={styles.label}>📝 Ghi chú đơn hàng (Có thể bỏ qua):</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: Tiền hàng sáng nay"
                placeholderTextColor={COLORS.textLight}
                value={note}
                onChangeText={setNote}
              />
            </ScrollView>
          </>
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
              ((activeTab === 'manual' ? cartItems.length === 0 : !quickAmount.trim()) || loading) && styles.submitDisabled
            ]}
            onPress={() => requirePin(handleSubmit)}
            disabled={
              loading ||
              (activeTab === 'manual' ? cartItems.length === 0 : !quickAmount.trim())
            }
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>
                {activeTab === 'manual'
                  ? (cartItems.length > 0 ? `GHI NỢ (${cartItems.length})` : 'XÁC NHẬN')
                  : 'GHI NỢ NHANH'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal quản lý danh mục thịt */}
      <ProductListModal ref={productModalRef} onRefresh={refetchProducts} />

      {/* Modal nhập PIN khi phiên hết hạn */}
      <PinInputModal ref={pinInputRef} />
      {/* Modal tạo PIN lần đầu */}
      <PinSetupModal ref={pinSetupRef} />
    </SmoothModal>
  );
});

export default DebtModal;

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    padding: 4,
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
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: COLORS.dangerDark,
    fontWeight: 'bold',
  },
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
    height: '100%', // Kéo full height
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

  // ── Giỏ hàng (đã thu gọn padding/margin) ──────────────────────────────────
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
    maxHeight: 115, // Hiển thị tối đa khoảng 3 dòng, nhiều hơn sẽ cuộn dọc
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
  cartRemoveText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },

  // ── Chọn sản phẩm (thu gọn chiều cao và margin) ──────────────────────────
  label: {
    fontSize: 14,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 4,
  },
  productsContainer: {
    marginBottom: 10,
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
  formScroll: {
    flex: 1,
    marginBottom: 10,
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

  // Xem trước thành tiền mặt hàng đang nhập (thu gọn padding/margin)
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

  // Nút thêm vào giỏ (giảm height từ 52 xuống 44)
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

  // Divider ngăn cách form nhập và phần ngày/ghi chú
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  sharedFields: {
    marginTop: 4,
  },

  // ── Tổng đơn hàng (đã thu gọn kích thước và padding) ────────────────────
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

  // ── Các nút hành động (đã giảm height và margin) ────────────────────────
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
