// meat-management-fe/src/components/ReturnGoodsModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
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
import MoneyInput from './MoneyInput';
import ProductSelector from './ProductSelector';
import { hasPin, isSessionValid } from '../store/pinStore';
import { useResourceLock } from '../hooks/useResourceLock';
import { showGlobalToast } from '../store/toastStore';

const ReturnGoodsModal = forwardRef(({ onRefresh }, ref) => {
  // ─── State điều khiển Modal ─────────────────────────────────────────────
  const [visible, setVisible] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [activeTab, setActiveTab] = useState('quick'); // 'quick' (Trả hàng nhanh) hoặc 'manual' (Trả hàng thủ công)
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Tự động khóa khách hàng khi mở modal trả hàng để tránh xung đột thao tác
  useResourceLock('CUSTOMER', customer?.id, visible, () => setVisible(false));

  // ─── State dành cho TAB TRẢ HÀNG NHANH ──────────────────────────────────
  const [quickAmountVND, setQuickAmountVND] = useState(0);
  const [quickNote, setQuickNote] = useState('');

  // ─── State dành cho TAB TRẢ HÀNG THỦ CÔNG ──────────────────────────────
  const [todayTransactions, setTodayTransactions] = useState([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentQuantity, setCurrentQuantity] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [dateStr, setDateStr] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [loadingTodayOrders, setLoadingTodayOrders] = useState(false);

  // Refs điều khiển modal PIN & chọn sản phẩm
  const productModalRef = useRef(null);
  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const isSubmittingRef = useRef(false);

  // ─── Helper định dạng & parse ──────────────────────────────────────────
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount || 0)
      .replace('₫', 'đ');

  const formatDateToDisplay = (dateInput) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const parseDateString = (str) => {
    if (!str) return null;
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

  // ─── Tải danh mục sản phẩm của chủ buôn ────────────────────────────────
  const { data: productsResponse, refetch: refetchProducts } = useQuery({
    queryKey: ['products', customer?.id],
    queryFn: async () => {
      const res = await api.get('/products', { params: { customerId: customer?.id } });
      return res.data;
    },
    enabled: visible && !!customer?.id,
  });

  const products = (productsResponse?.data || []).filter(
    (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
  );

  // Helper kiểm tra một đơn hàng có phải là Ghi nợ nhanh hay không
  const isQuickTransaction = (tx) => {
    if (!tx) return false;
    const items = tx.items || [];
    const hasQuickItem = items.some(
      (it) => it.product?.name === 'Tiền hàng' || (it.product?.name && it.product.name.toLowerCase().startsWith('tiền'))
    );
    return hasQuickItem || tx.note === 'Ghi nợ nhanh';
  };

  // Xác định đơn hàng hiện tại trong ngày và kiểm tra xem đơn đó là nợ nhanh hay nợ thủ công
  const selectedTx = todayTransactions.find((t) => t.id === selectedTransactionId) || todayTransactions[0];
  const isSelectedTxQuick = isQuickTransaction(selectedTx);
  const isManualTabDisabled = todayTransactions.length === 0 || isSelectedTxQuick;

  // ─── Tải danh sách đơn hàng trong ngày của khách hàng ──────────────────
  const fetchTodayOrders = async (cust) => {
    if (!cust?.id) return;
    setLoadingTodayOrders(true);
    try {
      const res = await api.get('/transactions', {
        params: { customerId: cust.id, todayOnly: 'true' },
      });
      const txs = res.data?.data || [];
      setTodayTransactions(txs);
      if (txs.length > 0) {
        // Mặc định chọn đơn đầu tiên (mới nhất trong ngày)
        loadTransactionToEdit(txs[0]);
      } else {
        setSelectedTransactionId(null);
        setCartItems([]);
      }
    } catch (err) {
      console.error('[RETURN GOODS] Lỗi tải đơn hàng trong ngày:', err);
      setError('Không thể tải danh sách đơn hàng trong ngày.');
    } finally {
      setLoadingTodayOrders(false);
    }
  };

  // Nạp giao dịch được chọn vào giỏ hàng sửa thủ công
  const loadTransactionToEdit = (transaction) => {
    if (!transaction) return;
    setSelectedTransactionId(transaction.id);
    setDateStr(formatDateToDisplay(transaction.date));
    setManualNote(transaction.note || '');

    // Nếu đơn nợ trong ngày là Ghi nợ nhanh, tự động đưa tab active về Trả hàng nhanh
    if (isQuickTransaction(transaction)) {
      setActiveTab('quick');
    }

    const initialCart = (transaction.items || []).map((it) => {
      const qty = parseFloat(it.quantity);
      const priceVal = parseFloat(it.price);
      return {
        tempId: it.id || Math.random(),
        product: {
          id: it.productId,
          name: it.product?.name || 'Thịt',
          unit: it.product?.unit || 'kg',
          defaultPrice: priceVal,
        },
        quantity: qty,
        price: priceVal,
        displayQuantity: it.quantity.toString(),
        displayPrice: formatNumberString(priceVal.toString()),
        amount: qty * priceVal,
      };
    });

    setCartItems(initialCart);
  };

  // ─── Phơi bày các hàm điều khiển Modal ra ngoài component cha ─────────
  useImperativeHandle(ref, () => ({
    open: (customerItem) => {
      if (!customerItem) return;
      setCustomer(customerItem);
      setActiveTab('quick');
      setQuickAmountVND(0);
      setQuickNote('');
      setError('');
      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setEditingItemId(null);
      setVisible(true);

      // Tải danh sách đơn hàng trong ngày cho tab Trả hàng thủ công
      fetchTodayOrders(customerItem);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // ─── Thao tác quản lý giỏ hàng trong tab Trả hàng thủ công ────────────
  const handleSelectProduct = (prod) => {
    setCurrentProduct(prod);
    setCurrentPrice(formatNumberString((prod.defaultPrice || 0).toString()));
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

  const handleAddToCart = () => {
    if (!currentProduct) {
      setError('Vui lòng chọn loại thịt.');
      return;
    }
    const cleanQty = currentQuantity.trim().replace(',', '.');
    const q = parseFloat(cleanQty);
    if (isNaN(q) || q <= 0) {
      setError('Khối lượng phải lớn hơn 0.');
      return;
    }
    const p = parseNumberString(currentPrice);
    if (p <= 0) {
      setError('Đơn giá phải lớn hơn 0.');
      return;
    }

    if (editingItemId !== null) {
      setCartItems((prev) =>
        prev.map((item) =>
          item.tempId === editingItemId
            ? {
                ...item,
                quantity: q,
                price: p,
                displayQuantity: currentQuantity,
                displayPrice: currentPrice,
                amount: q * p,
              }
            : item
        )
      );
      setEditingItemId(null);
      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setError('');
      return;
    }

    // Thêm loại thịt mới vào giỏ hàng
    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === currentProduct.id);
      if (idx > -1) {
        const updated = [...prev];
        const existing = updated[idx];
        const newQ = existing.quantity + q;
        updated[idx] = {
          ...existing,
          quantity: newQ,
          price: p,
          displayQuantity: newQ.toString(),
          displayPrice: currentPrice,
          amount: newQ * p,
        };
        return updated;
      }
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

    setCurrentProduct(null);
    setCurrentQuantity('');
    setCurrentPrice('');
    setError('');
  };

  const handleRemoveFromCart = (tempId) => {
    setCartItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  // ─── Kiểm tra PIN bảo mật trước khi submit ─────────────────────────────
  const requirePin = async (action) => {
    if (loading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const pinExists = await hasPin();
      if (!pinExists) {
        isSubmittingRef.current = false;
        pinSetupRef.current?.open(action);
        return;
      }
      const sessionOk = await isSessionValid();
      if (sessionOk) {
        await action();
      } else {
        isSubmittingRef.current = false;
        pinInputRef.current?.open(action, 'xác nhận trả hàng');
      }
    } catch (err) {
      isSubmittingRef.current = false;
      throw err;
    }
  };

  // ─── Gửi yêu cầu lưu dữ liệu Trả hàng ──────────────────────────────────
  const handleSubmit = async () => {
    if (activeTab === 'quick') {
      // 1. Trả hàng nhanh: Tạo lượt thanh toán trừ bớt số nợ
      const amount = quickAmountVND;
      if (!amount || amount <= 0) {
        setError('Vui lòng nhập số tiền trả hàng hợp lệ lớn hơn 0đ.');
        isSubmittingRef.current = false;
        return;
      }

      setError('');
      setLoading(true);
      try {
        const formattedNote = quickNote.trim()
          ? `[Trả lại hàng] ${quickNote.trim()}`
          : 'Trả lại hàng';

        const response = await api.post('/payments', {
          customerId: customer.id,
          amount,
          note: formattedNote,
        });

        if (response.data.success) {
          setVisible(false);
          showGlobalToast('Đã lưu lượt trả hàng nhanh thành công!', 'success');
          if (onRefresh) onRefresh();
        } else {
          setError(response.data.message || 'Có lỗi xảy ra khi lưu trả hàng.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
      } finally {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    } else {
      // 2. Trả hàng thủ công: Cập nhật lại đơn hàng trong ngày
      if (!selectedTransactionId) {
        setError('Khách hàng không có đơn hàng nào trong ngày để chỉnh sửa.');
        isSubmittingRef.current = false;
        return;
      }

      if (cartItems.length === 0) {
        setError('Danh sách mặt hàng sau khi trả không được để trống.');
        isSubmittingRef.current = false;
        return;
      }

      const isoDate = parseDateString(dateStr);
      if (!isoDate) {
        setError('Ngày giao dịch không hợp lệ.');
        isSubmittingRef.current = false;
        return;
      }

      const payloadItems = cartItems.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        price: item.price,
      }));

      setError('');
      setLoading(true);
      try {
        const formattedNote = manualNote.trim()
          ? manualNote.trim()
          : '[Trả hàng thủ công] Đã cập nhật đơn hàng';

        const response = await api.put(`/transactions/${selectedTransactionId}`, {
          date: isoDate,
          note: formattedNote,
          items: payloadItems,
        });

        if (response.data.success) {
          setVisible(false);
          showGlobalToast('Đã cập nhật đơn hàng và trừ công nợ thành công!', 'success');
          if (onRefresh) onRefresh();
        } else {
          setError(response.data.message || 'Có lỗi xảy ra khi cập nhật đơn hàng.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
      } finally {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    }
  };

  // Tính tổng tiền giỏ hàng thủ công
  const cartTotal = cartItems.reduce((sum, item) => sum + item.amount, 0);

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>↩️ TRẢ HÀNG KHÁCH HÀNG</Text>
            <Text style={styles.customerSubTitle}>{customer?.name || 'Khách hàng'}</Text>
          </View>
          <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Thanh chuyển đổi Tab */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'quick' && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab('quick');
              setError('');
            }}
          >
            <Text style={[styles.tabButtonText, activeTab === 'quick' && styles.tabButtonTextActive]}>
              ⚡ Trả hàng nhanh
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'manual' && styles.tabButtonActive,
              isManualTabDisabled && styles.tabButtonDisabled,
            ]}
            disabled={isManualTabDisabled}
            activeOpacity={isManualTabDisabled ? 1 : 0.6}
            onPress={() => {
              if (isManualTabDisabled) return;
              setActiveTab('manual');
              setError('');
            }}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'manual' && styles.tabButtonTextActive,
                isManualTabDisabled && styles.tabButtonTextDisabled,
              ]}
            >
              🥩 Trả hàng thủ công {isSelectedTxQuick ? '(Không khả dụng)' : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Thông báo lỗi */}
        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'quick' ? (
            /* ── TAB TRẢ HÀNG NHANH ── */
            <View style={styles.quickContainer}>
              <Text style={styles.label}>1. Số tiền trả hàng / Trừ nợ trực tiếp (VND):</Text>
              <MoneyInput
                style={styles.amountInputContainer}
                inputStyle={styles.amountInput}
                value={quickAmountVND}
                onChangeValue={(val) => {
                  setQuickAmountVND(val);
                  setError('');
                }}
                placeholder="Ví dụ: 150.000"
              />

              <Text style={styles.subLabel}>Gợi ý số tiền nhanh:</Text>
              <View style={styles.quickAmountContainer}>
                {[50000, 100000, 200000, 500000, 1000000].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={styles.quickAmountButton}
                    onPress={() => {
                      setQuickAmountVND(val);
                      setError('');
                    }}
                  >
                    <Text style={styles.quickAmountText}>
                      {val >= 1000000 ? `${val / 1000000} Triệu` : `${val / 1000}k`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 15 }]}>2. Lý do / Ghi chú trả hàng (Không bắt buộc):</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: Khách trả lại 2kg sườn mỡ..."
                placeholderTextColor={COLORS.textLight}
                value={quickNote}
                onChangeText={setQuickNote}
              />
            </View>
          ) : (
            /* ── TAB TRẢ HÀNG THỦ CÔNG ── */
            <View style={styles.manualContainer}>
              {loadingTodayOrders ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingText}>Đang tải đơn hàng trong ngày...</Text>
                </View>
              ) : todayTransactions.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>⚠️ Khách hàng này không có đơn hàng nào phát sinh trong ngày hôm nay.</Text>
                </View>
              ) : (
                <>
                  {/* Chọn đơn hàng nếu có nhiều đơn trong ngày */}
                  {todayTransactions.length > 1 && (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={styles.label}>📋 Chọn đơn hàng cần trả trong ngày:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                        {todayTransactions.map((tx, idx) => (
                          <TouchableOpacity
                            key={tx.id}
                            style={[
                              styles.orderChip,
                              selectedTransactionId === tx.id && styles.orderChipActive,
                            ]}
                            onPress={() => loadTransactionToEdit(tx)}
                          >
                            <Text
                              style={[
                                styles.orderChipText,
                                selectedTransactionId === tx.id && styles.orderChipTextActive,
                              ]}
                            >
                              Đơn #{idx + 1} ({formatCurrency(tx.totalAmount)})
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Giỏ hàng các mặt hàng của đơn hàng */}
                  {cartItems.length > 0 && (
                    <View style={styles.cartSection}>
                      <View style={styles.cartHeader}>
                        <Text style={styles.cartTitle}>
                          🛒 Danh sách mặt hàng ({cartItems.length} sản phẩm)
                        </Text>
                        <Text style={styles.cartTotalText}>{formatCurrency(cartTotal)}</Text>
                      </View>
                      <ScrollView style={styles.cartItemsScroll} nestedScrollEnabled={true}>
                        {cartItems.map((item) => (
                          <View key={item.tempId} style={styles.cartItem}>
                            <TouchableOpacity
                              style={styles.cartItemInfo}
                              onPress={() => handleEditCartItem(item)}
                            >
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

                  {/* Bộ chọn sản phẩm để sửa hoặc thêm mặt hàng */}
                  <Text style={styles.label}>1. Chọn loại thịt cần điều chỉnh/thêm:</Text>
                  <ProductSelector
                    products={products}
                    currentProduct={currentProduct}
                    onSelectProduct={handleSelectProduct}
                    onClearProduct={() => {
                      setCurrentProduct(null);
                      setCurrentPrice('');
                    }}
                    onAddProduct={() => productModalRef.current?.open()}
                    formatCurrency={formatCurrency}
                  />

                  {currentProduct ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.label}>Khối lượng ({currentProduct.unit}):</Text>
                      <View style={styles.numericRow}>
                        <TextInput
                          style={[
                            styles.input,
                            { flex: 1, minWidth: 0, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 0 },
                          ]}
                          placeholder="Ví dụ: 1.5"
                          placeholderTextColor={COLORS.textLight}
                          keyboardType="decimal-pad"
                          value={currentQuantity}
                          onChangeText={(text) => setCurrentQuantity(text.replace(/[^0-9.,]/g, ''))}
                        />
                        <Text style={styles.unitText}>{currentProduct.unit}</Text>
                      </View>

                      <Text style={styles.label}>Đơn giá (VND):</Text>
                      <TextInput
                        style={[styles.input, { fontSize: 16, fontWeight: 'bold' }]}
                        placeholder="Ví dụ: 130.000"
                        placeholderTextColor={COLORS.textLight}
                        keyboardType="number-pad"
                        value={currentPrice}
                        onChangeText={(text) => setCurrentPrice(formatNumberString(text))}
                      />

                      <TouchableOpacity style={styles.addToCartBtn} onPress={handleAddToCart}>
                        <Text style={styles.addToCartText}>
                          {editingItemId !== null ? '💾 CẬP NHẬT MẶT HÀNG' : '➕ THÊM VÀO ĐƠN'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {/* Ngày & Ghi chú đơn hàng */}
                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.label}>📅 Ngày đơn hàng:</Text>
                    <DatePickerInput value={dateStr} onChange={setDateStr} allowFuture={true} />

                    <Text style={[styles.label, { marginTop: 10 }]}>📝 Ghi chú cập nhật đơn:</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ghi chú điều chỉnh trả hàng..."
                      placeholderTextColor={COLORS.textLight}
                      value={manualNote}
                      onChangeText={setManualNote}
                    />
                  </View>
                </>
              )}
            </View>
          )}
        </ScrollView>

        {/* Nút Hủy & Xác nhận */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={() => requirePin(handleSubmit)}
            disabled={loading || (activeTab === 'manual' && todayTransactions.length === 0)}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>
                {activeTab === 'quick' ? 'XÁC NHẬN TRẢ HÀNG NHANH' : 'LƯU CẬP NHẬT ĐƠN HÀNG'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => setVisible(false)}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>HỦY BỎ</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ProductListModal ref={productModalRef} onRefresh={refetchProducts} />
      <PinInputModal ref={pinInputRef} />
      <PinSetupModal ref={pinSetupRef} />
    </SmoothModal>
  );
});

export default ReturnGoodsModal;

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
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    color: '#B45309',
  },
  customerSubTitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  closeHeaderButton: {
    padding: 6,
  },
  closeHeaderText: {
    fontSize: 20,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
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
    paddingVertical: 10,
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
    color: '#D97706',
    fontWeight: 'bold',
  },
  tabButtonDisabled: {
    backgroundColor: '#F1F5F9',
    opacity: 0.5,
  },
  tabButtonTextDisabled: {
    color: '#94A3B8',
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
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 20,
  },
  quickContainer: {
    paddingVertical: 6,
  },
  label: {
    fontSize: FONTS.body,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 6,
  },
  subLabel: {
    fontSize: FONTS.caption,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  amountInputContainer: {
    height: 60,
    marginBottom: 12,
    borderColor: '#F59E0B',
  },
  amountInput: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D97706',
  },
  quickAmountContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  quickAmountButton: {
    backgroundColor: COLORS.inputBg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickAmountText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: FONTS.body,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  manualContainer: {
    paddingVertical: 6,
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 20,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    marginBottom: 12,
  },
  emptyText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  orderChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  orderChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  orderChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  orderChipTextActive: {
    color: '#B45309',
    fontWeight: 'bold',
  },
  cartSection: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#FDE68A',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  cartItemsScroll: {
    maxHeight: 120,
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
    color: '#B45309',
  },
  cartTotalText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: '#FDE68A',
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
  cartEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    marginRight: 6,
  },
  cartEditText: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
  },
  cartRemoveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  cartRemoveText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  unitText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    minWidth: 30,
  },
  addToCartBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  addToCartText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 10,
  },
  button: {
    width: '100%',
    height: 52,
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
    backgroundColor: '#D97706',
    elevation: 2,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
