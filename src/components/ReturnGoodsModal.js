// meat-management-fe/src/components/ReturnGoodsModal.js
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
import MoneyInput from './MoneyInput';
import ProductSelector from './ProductSelector';
import { hasPin, isSessionValid } from '../store/pinStore';
import { useResourceLock } from '../hooks/useResourceLock';
import { showGlobalToast } from '../store/toastStore';

/**
 * Modal Trả Hàng Khách Hàng (Độc lập):
 * 1. Trả hàng nhanh: Nhập số tiền trả trực tiếp để trừ nợ.
 * 2. Trả hàng chi tiết: Chọn loại thịt khách trả lại (kg × đơn giá), tính tổng tiền và trừ trực tiếp vào công nợ của khách.
 */
const ReturnGoodsModal = forwardRef(({ onRefresh }, ref) => {
  // ─── State điều khiển Modal ─────────────────────────────────────────────
  const [visible, setVisible] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' (Trả chi tiết) hoặc 'quick' (Trả nhanh)
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Tự động khóa khách hàng khi mở modal trả hàng để tránh xung đột thao tác
  useResourceLock('CUSTOMER', customer?.id, visible, () => setVisible(false));

  // ─── State dành cho TAB TRẢ HÀNG NHANH ──────────────────────────────────
  const [quickAmountVND, setQuickAmountVND] = useState(0);
  const [quickNote, setQuickNote] = useState('');

  // ─── State dành cho TAB TRẢ HÀNG CHI TIẾT ──────────────────────────────
  const [cartItems, setCartItems] = useState([]);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentQuantity, setCurrentQuantity] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [manualNote, setManualNote] = useState('');

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

  // ─── Tải danh mục sản phẩm thịt của chủ buôn ──────────────────────────
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

  // ─── Phơi bày các hàm điều khiển Modal ra ngoài component cha ─────────
  useImperativeHandle(ref, () => ({
    open: (customerItem) => {
      if (!customerItem) return;
      const today = formatDateToDisplay(new Date());
      setCustomer(customerItem);
      setSelectedDate(today);
      setActiveTab('manual'); // Mặc định mở tab Trả hàng chi tiết
      setQuickAmountVND(0);
      setQuickNote('');
      setCartItems([]); // Giỏ hàng trả lại bắt đầu trống để người dùng nhập món trả
      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setEditingItemId(null);
      setManualNote('');
      setError('');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // ─── Thao tác giỏ hàng trong tab Trả hàng chi tiết ────────────────────
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
      setError('Vui lòng chọn loại thịt cần trả lại.');
      return;
    }
    const cleanQty = currentQuantity.trim().replace(',', '.');
    const q = parseFloat(cleanQty);
    if (isNaN(q) || q <= 0) {
      setError('Khối lượng thịt trả phải lớn hơn 0.');
      return;
    }
    const p = parseNumberString(currentPrice);
    if (p <= 0) {
      setError('Đơn giá phải lớn hơn 0đ.');
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
              amount: Math.round(q * p),
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

    // Thêm loại thịt mới vào giỏ hàng trả lại
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
          amount: Math.round(newQ * p),
        };
        return updated;
      }
      return [
        ...prev,
        {
          tempId: Math.random(),
          product: currentProduct,
          quantity: q,
          price: p,
          displayQuantity: currentQuantity,
          displayPrice: currentPrice,
          amount: Math.round(q * p),
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

  // ─── Gửi yêu cầu lưu dữ liệu Trả hàng (Trừ trực tiếp vào công nợ) ───────
  const handleSubmit = async () => {
    const isoDate = parseDateString(selectedDate) || new Date().toISOString();

    if (activeTab === 'quick') {
      // 1. Trả hàng nhanh: Nhập số tiền trả trực tiếp
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
          : `[Trả lại hàng] Trả hàng nhanh`;

        const response = await api.post('/payments', {
          customerId: customer.id,
          amount,
          note: formattedNote,
          paidAt: isoDate,
        });

        if (response.data.success) {
          setVisible(false);
          showGlobalToast(`Đã trừ ${formatCurrency(amount)} vào công nợ của khách!`, 'success');
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
      // 2. Trả hàng chi tiết: Tính tổng tiền các mặt hàng thịt trả lại và trừ vào nợ
      if (cartItems.length === 0) {
        setError('Vui lòng chọn loại thịt và bấm "Thêm vào danh sách trả" trước khi xác nhận.');
        isSubmittingRef.current = false;
        return;
      }

      const totalRefundAmount = cartItems.reduce((sum, item) => sum + item.amount, 0);
      if (totalRefundAmount <= 0) {
        setError('Tổng số tiền hàng trả lại phải lớn hơn 0đ.');
        isSubmittingRef.current = false;
        return;
      }

      setError('');
      setLoading(true);
      try {
        const itemsDesc = cartItems
          .map((it) => `${it.quantity}${it.product.unit || 'kg'} ${it.product.name} (${formatCurrency(it.amount)})`)
          .join(', ');
        const formattedNote = manualNote.trim()
          ? `[Trả lại hàng] ${itemsDesc} - ${manualNote.trim()}`
          : `[Trả lại hàng] ${itemsDesc}`;

        const response = await api.post('/payments', {
          customerId: customer.id,
          amount: totalRefundAmount,
          note: formattedNote,
          paidAt: isoDate,
        });

        if (response.data.success) {
          setVisible(false);
          showGlobalToast(`Đã trừ ${formatCurrency(totalRefundAmount)} vào công nợ của khách!`, 'success');
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
    }
  };

  // Tính tổng tiền giỏ hàng trả lại chi tiết
  const cartTotal = cartItems.reduce((sum, item) => sum + item.amount, 0);

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>↩️ TRẢ HÀNG KHÁCH HÀNG</Text>
          <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Thông tin khách hàng & Dư nợ hiện tại */}
        {customer ? (
          <View style={styles.customerBox}>
            <View style={styles.avatarIconWrapper}>
              <Text style={styles.avatarIconText}>👤</Text>
            </View>
            <View style={styles.customerInfoContainer}>
              <Text style={styles.customerLabelText}>Khách hàng</Text>
              <Text style={styles.customerNameText} numberOfLines={2}>
                {customer.name}
              </Text>
              {customer.phone ? (
                <Text style={styles.customerPhoneText}>📞 {customer.phone}</Text>
              ) : null}
            </View>
            <View style={styles.debtBadge}>
              <Text style={styles.debtBadgeLabel}>Đang nợ</Text>
              <Text style={styles.debtBadgeValue}>{formatCurrency(customer.debt || 0)}</Text>
            </View>
          </View>
        ) : null}

        {/* Bộ lọc chọn ngày trả hàng */}
        <View style={styles.dateFilterContainer}>
          <Text style={styles.dateFilterLabel}>📅 Ngày trả hàng:</Text>
          <DatePickerInput
            value={selectedDate}
            onChange={setSelectedDate}
            allowFuture={true}
          />
        </View>

        {/* Thông báo lỗi */}
        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Thanh chuyển đổi Tab dạng Segmented Control */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'manual' && styles.tabButtonActive,
              ]}
              activeOpacity={0.7}
              onPress={() => {
                setActiveTab('manual');
                setError('');
              }}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.tabButtonText,
                  activeTab === 'manual' && styles.tabButtonTextActive,
                ]}
              >
                🥩 Trả hàng chi tiết (theo kg)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'quick' && styles.tabButtonActive]}
              onPress={() => {
                setActiveTab('quick');
                setError('');
              }}
              activeOpacity={0.7}
            >
              <Text
                numberOfLines={1}
                style={[styles.tabButtonText, activeTab === 'quick' && styles.tabButtonTextActive]}
              >
                ⚡ Trả hàng nhanh (theo tiền)
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'manual' ? (
            /* ── TAB TRẢ HÀNG CHI TIẾT (ĐỘC LẬP) ── */
            <View style={styles.manualContainer}>
              {/* Giỏ hàng các mặt hàng thịt trả lại */}
              {cartItems.length > 0 ? (
                <View style={styles.cartSection}>
                  <View style={styles.cartHeader}>
                    <Text style={styles.cartTitle}>
                      🛒 Mặt hàng trả lại ({cartItems.length} món)
                    </Text>
                    <Text style={styles.cartTotalText}>- {formatCurrency(cartTotal)}</Text>
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
                              <Text style={{ color: '#DC2626', fontWeight: 'bold' }}>
                                -{formatCurrency(item.amount)}
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
              ) : (
                <View style={styles.emptyCartHintBox}>
                  <Text style={styles.emptyCartHintText}>
                    💡 Chọn loại thịt bên dưới, nhập số kg và đơn giá để thêm vào danh sách trả hàng.
                  </Text>
                </View>
              )}

              {/* Bộ chọn sản phẩm để thêm món trả */}
              <Text style={styles.label}>1. Chọn loại thịt khách trả lại:</Text>
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
                  <Text style={styles.label}>Khối lượng trả ({currentProduct.unit}):</Text>
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

                  <Text style={styles.label}>Đơn giá (VND/{currentProduct.unit}):</Text>
                  <TextInput
                    style={[styles.input, { fontSize: 16, fontWeight: 'bold' }]}
                    placeholder="Ví dụ: 130 hoặc 130.000"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="number-pad"
                    value={currentPrice}
                    onChangeText={(text) => setCurrentPrice(formatNumberString(text))}
                    onBlur={() => {
                      const pVal = parseNumberString(currentPrice);
                      if (pVal > 0 && pVal < 1000) {
                        setCurrentPrice(formatNumberString((pVal * 1000).toString()));
                      }
                    }}
                  />

                  <TouchableOpacity style={styles.addToCartBtn} onPress={handleAddToCart}>
                    <Text style={styles.addToCartText}>
                      {editingItemId !== null ? '💾 CẬP NHẬT MÓN TRẢ' : '➕ THÊM VÀO DANH SÁCH TRẢ'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Ghi chú trả hàng */}
              <View style={{ marginTop: 14 }}>
                <Text style={styles.label}>📝 Ghi chú lý do trả (Không bắt buộc):</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: Thịt bị mỡ, khách không lấy..."
                  placeholderTextColor={COLORS.textLight}
                  value={manualNote}
                  onChangeText={setManualNote}
                />
              </View>
            </View>
          ) : (
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
                {customer?.debt > 0 && (
                  <TouchableOpacity
                    style={[styles.quickAmountButton, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                    onPress={() => {
                      setQuickAmountVND(customer.debt);
                      setError('');
                    }}
                  >
                    <Text style={[styles.quickAmountText, { color: '#1D4ED8', fontWeight: 'bold' }]}>
                      Toàn bộ dư nợ ({formatCurrency(customer.debt)})
                    </Text>
                  </TouchableOpacity>
                )}
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
                      {val >= 1000000 ? `${val / 1000000}Tr` : `${val / 1000}k`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 15 }]}>2. Lý do / Ghi chú trả hàng (Không bắt buộc):</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: Khách trả lại thịt..."
                placeholderTextColor={COLORS.textLight}
                value={quickNote}
                onChangeText={setQuickNote}
              />
            </View>
          )}
        </ScrollView>

        {/* Nút Hủy & Xác nhận */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={() => requirePin(handleSubmit)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>
                {activeTab === 'quick'
                  ? `XÁC NHẬN TRẢ HÀNG (${formatCurrency(quickAmountVND)})`
                  : `XÁC NHẬN TRẢ HÀNG (${formatCurrency(cartTotal)})`}
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
    flex: 1,
    height: '100%',
    paddingHorizontal: 20,
    paddingBottom: 24,
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
  closeHeaderButton: {
    padding: 6,
  },
  closeHeaderText: {
    fontSize: 18,
    color: COLORS.textLight,
    fontWeight: 'bold',
  },
  customerBox: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...SHADOWS.small,
  },
  avatarIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarIconText: {
    fontSize: 18,
  },
  customerInfoContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  customerLabelText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 1,
  },
  customerNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerPhoneText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  debtBadge: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1.5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  debtBadgeLabel: {
    fontSize: 10,
    color: '#991B1B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  debtBadgeValue: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '900',
    marginTop: 1,
  },
  dateFilterContainer: {
    marginBottom: 12,
  },
  dateFilterLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  tabButtonTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 20,
  },
  label: {
    fontSize: FONTS.caption,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  subLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: FONTS.body,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    marginBottom: 8,
  },
  amountInputContainer: {
    marginBottom: 4,
  },
  amountInput: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#DC2626',
    textAlign: 'center',
  },
  quickAmountContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  quickAmountButton: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  quickAmountText: {
    fontSize: 12.5,
    color: COLORS.text,
    fontWeight: '600',
  },
  emptyCartHintBox: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  emptyCartHintText: {
    fontSize: 12.5,
    color: '#B45309',
    lineHeight: 18,
    fontWeight: '600',
  },
  cartSection: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    padding: 12,
    marginBottom: 14,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FEE2E2',
  },
  cartTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#991B1B',
  },
  cartTotalText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#DC2626',
  },
  cartItemsScroll: {
    maxHeight: 160,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemText: {
    fontSize: 13,
  },
  cartItemName: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cartItemMeta: {
    color: COLORS.textLight,
  },
  cartEditBtn: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginRight: 6,
  },
  cartEditText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '700',
  },
  cartRemoveBtn: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  cartRemoveText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '900',
  },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  addToCartBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 10,
    ...SHADOWS.small,
  },
  addToCartText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    marginBottom: 10,
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 8,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 8,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    backgroundColor: '#D97706',
    ...SHADOWS.medium,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
  },
  cancelButtonText: {
    color: COLORS.textLight,
    fontSize: 13.5,
    fontWeight: '700',
  },
});
