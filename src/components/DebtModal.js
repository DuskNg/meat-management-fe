// meat-management-fe/src/components/DebtModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
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
import PopupModal from './PopupModal';
import { hasPin, isSessionValid } from '../store/pinStore';
import { showGlobalToast } from '../store/toastStore';
import ProductSelector from './ProductSelector';
import { useResourceLock } from '../hooks/useResourceLock';
import { matchItemSearch } from '../utils/searchHelper';
import MoneyInput from './MoneyInput';

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

  const [visible, setVisible] = useState(false);

  // Khóa khách hàng khi mở modal ghi nợ
  useResourceLock('CUSTOMER', customerId, visible, () => setVisible(false));

  // Giỏ hàng: danh sách mặt hàng đã thêm vào đơn
  const [cartItems, setCartItems] = useState([]);

  // Mặt hàng đang được nhập hiện tại
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentQuantity, setCurrentQuantity] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [currentCostPrice, setCurrentCostPrice] = useState('');
  const [productSearch, setProductSearch] = useState('');
  // Trạng thái mở/đóng dropdown chọn thịt
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Thông tin chung cho cả đơn hàng
  const [dateStr, setDateStr] = useState(getTodayFormatted());
  const [disableDate, setDisableDate] = useState(false);
  const [minDate, setMinDate] = useState(null);
  const [maxDate, setMaxDate] = useState(null);
  const [quickProductName, setQuickProductName] = useState('');
  const [quickAmountVND, setQuickAmountVND] = useState(0);
  const [quickProfitPercent, setQuickProfitPercent] = useState('');
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState(''); // Lưu trường bị lỗi để đổi viền đỏ ('quantity', 'price', 'date')
  const productModalRef = useRef(null);

  // State phục vụ phân tách tab ghi nợ (Ghi nợ nhanh / Thủ công)
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' hoặc 'quick'

  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const popupRef = useRef(null);
  const isSubmittingRef = useRef(false);

  // ─── Tải danh mục sản phẩm (chỉ khi modal đang mở, có kèm theo customerId để lấy giá riêng) ───
  const { data: productsResponse, refetch: refetchProducts } = useQuery({
    queryKey: ['products', customerId],
    queryFn: async () => {
      const res = await api.get('/products', { params: { customerId } });
      return res.data;
    },
    enabled: visible,
  });

  // Lọc bỏ sản phẩm ảo của ghi nợ nhanh khỏi danh sách thịt đang bán
  const products = (productsResponse?.data || []).filter(
    (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
  );
  const filteredProducts = products.filter((product) =>
    matchItemSearch(product, productSearch, ['name', 'unit'])
  );

  // ─── Phơi bày open/close ra component cha ─────────────────────────────
  useImperativeHandle(ref, () => ({
    open: (options = {}) => {
      setVisible(true);
      setCartItems([]);
      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setCurrentCostPrice('');
      setProductSearch('');
      setQuickProductName('');
      setQuickAmountVND(0);
      setQuickProfitPercent('');
      setNote('');
      setError('');
      setErrorField('');
      
      // Reset trạng thái của tab ghi nợ nhanh và mặc định chọn tab thủ công
      setActiveTab('manual');
      setQuickProductName('Tiền hàng');
      setQuickAmountVND(0);

      let items = null;
      let initialDateStr = getTodayFormatted();
      let shouldDisableDate = false;
      let initialNote = '';
      let initialMinDate = null;
      let initialMaxDate = null;

      // Phân tích tham số để hỗ trợ cả cách gọi cũ (scannedItems) và cách gọi cấu hình mới (options)
      if (options && Array.isArray(options)) {
        items = options;
      } else if (options && typeof options === 'object') {
        if (options.initialDate) initialDateStr = options.initialDate;
        if (options.disableDate !== undefined) shouldDisableDate = options.disableDate;
        if (options.note) initialNote = options.note;
        if (options.items) items = options.items;
        if (options.minDate) initialMinDate = options.minDate;
        if (options.maxDate) initialMaxDate = options.maxDate;
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
    setProductSearch(product.name);
    setCurrentPrice(formatNumberString(product.defaultPrice.toString()));
    setCurrentCostPrice(product.costPrice ? formatNumberString(product.costPrice.toString()) : '');
    setDropdownOpen(false);
    setError('');
    setErrorField('');
  };

  // ─── Thêm mặt hàng hiện tại vào giỏ hàng ─────────────────────────────
  const handleAddToCart = () => {
    if (!currentProduct) {
      setError('Vui lòng chọn loại thịt.');
      setErrorField('product');
      return;
    }
    const cleanQty = (currentQuantity || '').trim().replace(',', '.');
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
      const cp = currentCostPrice !== '' ? parseNumberString(currentCostPrice) : (currentProduct.costPrice || 0);

      if (existingIndex > -1) {
        // Nếu đã tồn tại, cộng dồn khối lượng và cập nhật giá mới nhất
        const updated = [...prev];
        const existingItem = updated[existingIndex];
        const newQuantity = existingItem.quantity + q;
        updated[existingIndex] = {
          ...existingItem,
          quantity: newQuantity,
          price: p,
          costPrice: cp,
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
          costPrice: cp,
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
    setCurrentCostPrice('');
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
    if (loading || isSubmittingRef.current) return; // Ngăn chặn bấm đúp khi đang gửi yêu cầu
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
      isSubmittingRef.current = true;
      try {
        const response = await api.post('/transactions', {
          customerId,
          date: isoDate,
          note: note.trim() || null,
          source: 'MANUAL_SINGLE',
          // Gửi toàn bộ mặt hàng trong giỏ hàng lên cùng 1 lần
          items: cartItems.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            price: item.price,
            costPrice: item.costPrice !== undefined ? item.costPrice : (item.product?.costPrice || 0),
          })),
        });

        if (response.data.success) {
          if (onRefresh) onRefresh();
          setVisible(false);
          showGlobalToast('Đã ghi nợ thành công.', 'success');
        } else {
          setError(response.data.message || 'Lỗi ghi nợ. Vui lòng thử lại.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
      } finally {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    } else {
      // Logic gửi ghi nợ nhanh
      const qAmt = quickAmountVND;
      if (!qAmt || qAmt <= 0) {
        setError('Số tiền nợ phải lớn hơn 0.');
        setErrorField('quickAmount');
        return;
      }

      setError('');
      setErrorField('');
      setLoading(true);
      isSubmittingRef.current = true;
      try {
        const response = await api.post('/transactions', {
          customerId,
          date: isoDate,
          note: note.trim() || 'Ghi nợ nhanh',
          source: 'MANUAL_SINGLE',
          profitPercent: quickProfitPercent ? parseFloat(quickProfitPercent) : undefined,
          // Ghi nợ nhanh chỉ gửi 1 mặt hàng giả lập sản phẩm tên "Tiền hàng"
          items: [
            {
              productName: quickProductName.trim() || 'Tiền hàng',
              quantity: 1,
              price: qAmt,
            }
          ],
        });

        if (response.data.success) {
          if (onRefresh) onRefresh();
          setVisible(false);
          showGlobalToast('Đã ghi nợ nhanh thành công.', 'success');
        } else {
          setError(response.data.message || 'Lỗi ghi nợ. Vui lòng thử lại.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
      } finally {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    }
  };

  // ─── Tổng giỏ hàng & Lợi nhuận ước tính ──────────────────────────────────
  const cartTotal = cartItems.reduce((sum, item) => sum + item.amount, 0);
  const cartTotalCost = cartItems.reduce((sum, item) => {
    const itemCostNum = parseFloat(item.costPrice || 0);
    const prodCostNum = parseFloat(item.product?.costPrice || 0);
    const cp = itemCostNum > 0 ? itemCostNum : prodCostNum;
    return sum + (item.quantity * cp);
  }, 0);
  const cartTotalProfit = cartTotal - cartTotalCost;
  const cartProfitMargin = cartTotal > 0 && cartTotalProfit > 0 ? Math.round((cartTotalProfit / cartTotal) * 100) : 0;

  // Thành tiền mặt hàng đang nhập (hiển thị trực tiếp)
  const currentSubtotal =
    parseFloat((currentQuantity || '0').toString().replace(',', '.')) * parseNumberString(currentPrice || '0');
  const displayCurrentSubtotal = isNaN(currentSubtotal) ? 0 : currentSubtotal;

  const currentCost =
    parseFloat((currentQuantity || '0').toString().replace(',', '.')) *
    (currentCostPrice !== '' ? parseNumberString(currentCostPrice) : (currentProduct?.costPrice || 0));
  const displayCurrentCost = isNaN(currentCost) ? 0 : currentCost;
  const displayCurrentProfit = displayCurrentSubtotal - displayCurrentCost;
  const displayCurrentMargin =
    displayCurrentSubtotal > 0 && displayCurrentProfit > 0
      ? Math.round((displayCurrentProfit / displayCurrentSubtotal) * 100)
      : 0;

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>🔴 GHI NỢ THỊT MỚI</Text>
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

            {/* ── CHỌN LOẠI THỊT (dạng Select Dropdown) ── */}
            <Text style={styles.label}>
              {cartItems.length > 0 ? '➕ Thêm mặt hàng tiếp theo:' : '1. Chọn loại thịt:'}
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
              hasError={errorField === 'product'}
              error={error}
            />

            <>
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
                        // Chỉ cho phép số, dấu chấm và dấu phẩy
                        const filtered = text.replace(/[^0-9.,]/g, '');
                        setCurrentQuantity(filtered);
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
                    onBlur={() => {
                      const pVal = parseNumberString(currentPrice);
                      if (pVal > 0 && pVal < 1000) {
                        setCurrentPrice(formatNumberString((pVal * 1000).toString()));
                      }
                    }}
                  />
                  {errorField === 'price' && <Text style={styles.fieldErrorText}>⚠️ {error}</Text>}

                  {/* Xem trước thành tiền & lãi mặt hàng đang nhập */}
                  {displayCurrentSubtotal > 0 && (
                    <View style={styles.previewRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.previewLabel}>Thành tiền:</Text>
                        <Text style={styles.previewValue}>
                          {formatCurrency(displayCurrentSubtotal)}
                        </Text>
                      </View>
                      {displayCurrentCost > 0 && displayCurrentProfit > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.previewLabel, { color: '#0369A1' }]}>Lãi dự tính:</Text>
                          <Text style={[styles.previewValue, { color: '#0369A1', fontWeight: 'bold' }]}>
                            +{formatCurrency(displayCurrentProfit)} ({displayCurrentMargin}%)
                          </Text>
                        </View>
                      )}
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
            </>
          </>
        ) : (
          /* ── TAB GHI NỢ NHANH ── */
          <>
            <>
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

              {/* Số tiền nợ và % Lợi nhuận */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1.5 }}>
                  <Text style={styles.label}>💰 Số tiền nợ (VND):</Text>
                  <MoneyInput
                    style={[
                      styles.quickAmountContainer,
                      errorField === 'quickAmount' && styles.inputError
                    ]}
                    inputStyle={{ fontSize: 18, fontWeight: 'bold', color: COLORS.danger }}
                    value={quickAmountVND}
                    onChangeValue={(val) => {
                      setQuickAmountVND(val);
                      if (errorField === 'quickAmount') {
                        setError('');
                        setErrorField('');
                      }
                    }}
                    placeholder="Ví dụ: 500"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>📈 % Lợi nhuận:</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        height: 48,
                        borderColor: '#7DD3FC',
                        backgroundColor: '#F0F9FF',
                        color: '#0369A1',
                        fontWeight: 'bold',
                        fontSize: 16,
                        textAlign: 'center',
                        marginBottom: 0
                      }
                    ]}
                    placeholder="Ví dụ: 15"
                    placeholderTextColor="#0284C7"
                    value={quickProfitPercent}
                    onChangeText={(txt) => setQuickProfitPercent(txt.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              {errorField === 'quickAmount' && <Text style={styles.fieldErrorText}>⚠️ {error}</Text>}

              {quickAmountVND > 0 && quickProfitPercent ? (
                <View style={{ backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#0369A1', fontWeight: '600' }}>💵 Tiền lãi ước tính ({quickProfitPercent}%):</Text>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#0369A1' }}>
                    +{formatCurrency(Math.round(quickAmountVND * (parseFloat(quickProfitPercent) / 100)))}
                  </Text>
                </View>
              ) : null}

              {/* Ghi chú thêm cho nợ nhanh */}
              <Text style={styles.label}>📝 Ghi chú đơn hàng (Có thể bỏ qua):</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: Tiền hàng sáng nay"
                placeholderTextColor={COLORS.textLight}
                value={note}
                onChangeText={setNote}
              />
            </>
          </>
        )}
        </ScrollView>

        {/* ── TỔNG TIỀN CẢ ĐƠN (cố định ở bottom) ── */}
        {activeTab === 'manual' && cartItems.length > 0 && (
          <View style={styles.totalContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <Text style={styles.totalLabel}>💰 TỔNG ĐƠN HÀNG:</Text>
              <Text style={styles.totalValue}>{formatCurrency(cartTotal)}</Text>
            </View>
            {cartTotalCost > 0 && cartTotalProfit > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: '#0369A1', fontWeight: '600' }}>💰 Lợi nhuận ước tính ({cartProfitMargin}%):</Text>
                <Text style={{ fontSize: 13, color: '#0369A1', fontWeight: 'bold' }}>+{formatCurrency(cartTotalProfit)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── NÚT HỦY / XÁC NHẬN (đã giảm size) ── */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => setVisible(false)}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Hủy bỏ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.submitButton,
              ((activeTab === 'manual' ? cartItems.length === 0 : quickAmountVND <= 0) || loading) && styles.submitDisabled
            ]}
            onPress={() => requirePin(handleSubmit)}
            disabled={
              loading ||
              (activeTab === 'manual' ? cartItems.length === 0 : quickAmountVND <= 0)
            }
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>
                {activeTab === 'manual'
                  ? (cartItems.length > 0 ? `Ghi nợ (${cartItems.length})` : 'Xác nhận')
                  : 'Ghi nợ nhanh'}
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
      {/* Toast thông báo ghi nợ thành công */}
      <PopupModal ref={popupRef} />
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

  // ── Chọn sản phẩm dạng Select Dropdown ────────────────────────────────
  label: {
    fontSize: 14,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 4,
  },
  productsContainer: {
    marginBottom: 10,
    // Cho phép dropdown nổi lên trên các phần tử khác
    zIndex: 100,
  },
  // Hàng chứa ô select + nút thêm thịt
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
  },
  // Ô Select chính (giống input nhưng có chevron)
  selectTrigger: {
    flex: 1,
    height: 42,
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectTriggerActive: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  selectTriggerSelected: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerLight,
  },
  selectTriggerText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  selectTriggerPlaceholder: {
    color: COLORS.textLight,
    fontWeight: '400',
  },
  selectChevron: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  // Nút X trong ô select để xóa lựa chọn
  selectClearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  selectClearText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 11,
  },
  // Nút + thêm thịt nằm cạnh ô select
  addProductBtn: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FAF8F6',
    borderWidth: 1.5,
    borderColor: '#7F1D1D',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  addProductBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#7F1D1D',
  },
  // Dropdown container nổi lên
  dropdownContainer: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 50, // Chừa chỗ cho nút + bên phải
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 200,
    overflow: 'hidden',
  },
  // Hàng tìm kiếm bên trong dropdown
  dropdownSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dropdownSearchInput: {
    flex: 1,
    height: 36,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
    paddingHorizontal: 10,
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // Nút X xóa text tìm kiếm trong dropdown
  dropdownClearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.textLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  dropdownClearText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 11,
  },
  // Danh sách item trong dropdown
  dropdownList: {
    maxHeight: 180,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dropdownItemSelected: {
    backgroundColor: COLORS.dangerLight,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  dropdownItemTextSelected: {
    color: COLORS.dangerDark,
  },
  dropdownItemPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  noProductSearchText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    paddingVertical: 10,
    textAlign: 'center',
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
  quickAmountContainer: {
    height: 48,
    marginBottom: 8,
    borderColor: COLORS.border,
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
    flexWrap: 'wrap',
    gap: 8,
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

  // ── Các nút hành động (thu gọn, tối ưu height) ──────────────────────────
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  button: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    flex: 0.65, // Nút hủy nhỏ hơn nút ghi nợ
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1.35, // Nút ghi nợ lớn hơn nút hủy
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  submitDisabled: {
    backgroundColor: COLORS.textLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
