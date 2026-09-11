// meat-management-fe/src/components/EditReturnGoodsModal.js
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
 * Modal Sửa Đơn Trả Hàng (Dạng chi tiết từng loại thịt hoặc trả nhanh):
 * Phục vụ chỉnh sửa đơn trả lại hàng (tiền trừ công nợ có tiền tố [Trả lại hàng]).
 */
const EditReturnGoodsModal = forwardRef(({ onRefresh }, ref) => {
  // ─── State điều khiển Modal ─────────────────────────────────────────────
  const [visible, setVisible] = useState(false);
  const [paymentId, setPaymentId] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' (Trả chi tiết) hoặc 'quick' (Trả nhanh)
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Tự động khóa tài nguyên khách hàng khi mở modal sửa trả hàng
  useResourceLock('CUSTOMER', customerId, visible, () => setVisible(false));

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

  // ─── Tải thông tin khách hàng nếu cần ──────────────────────────────────
  const { data: customerData } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}`)).data?.data,
    enabled: visible && !!customerId,
  });

  // ─── Tải danh mục sản phẩm thịt của chủ buôn ──────────────────────────
  const { data: productsResponse, refetch: refetchProducts } = useQuery({
    queryKey: ['products', customerId],
    queryFn: async () => {
      const res = await api.get('/products', { params: { customerId } });
      return res.data;
    },
    enabled: visible && !!customerId,
  });

  const products = (productsResponse?.data || []).filter(
    (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
  );

  // ─── Hàm phân tích ghi chú trả hàng để tái hiện giỏ hàng chi tiết ───────
  const parseReturnNoteToCart = (noteStr, defaultAmount, availableProducts) => {
    if (!noteStr) return { items: [], extraNote: '', isQuick: true };

    // Bỏ tiền tố [Trả lại hàng] hoặc [Trả hàng nhanh]
    let cleanStr = noteStr.replace(/^\[(Trả lại hàng|Trả hàng nhanh)\]\s*/i, '').trim();

    // Kiểm tra ghi chú phụ (sau dấu gạch ngang cuối cùng)
    let extraNote = '';
    const lastParenIdx = cleanStr.lastIndexOf(')');
    let itemsPart = cleanStr;

    if (lastParenIdx !== -1) {
      const afterParen = cleanStr.substring(lastParenIdx + 1).trim();
      if (afterParen.startsWith('-')) {
        extraNote = afterParen.replace(/^-+\s*/, '').trim();
        itemsPart = cleanStr.substring(0, lastParenIdx + 1).trim();
      }
    }

    // Tách từng món dựa trên cấu trúc kết thúc bằng dấu đóng ngoặc tròn (ví dụ: 4kg Sườn (712.000 đ))
    const itemMatches = [];
    const itemRegex = /([^,()]+)\s*\(([^)]+)\)/g;
    let m;
    while ((m = itemRegex.exec(itemsPart)) !== null) {
      const desc = m[1].trim();
      const amtStr = m[2].trim();
      itemMatches.push({ desc, amtStr });
    }

    if (itemMatches.length === 0) {
      // Thử phân tích dạng: "tên_thịt số_lượng * đơn_giá" (ví dụ: "chín 4.1*145" hoặc "4.1*145 chín")
      const starMatch = cleanStr.match(/^([a-zA-ZÀ-ỹ\s]+?)\s+([\d.,]+)\s*(?:kg)?\s*[*xX]\s*([\d.,]+)(?:k)?(?:\s*đ)?(?:\s*-\s*(.*))?$/i) ||
                        cleanStr.match(/^([\d.,]+)\s*(?:kg)?\s*[*xX]\s*([\d.,]+)(?:k)?\s+([a-zA-ZÀ-ỹ\s]+?)(?:\s*-\s*(.*))?$/i);
      if (starMatch) {
        let prodName = '';
        let qty = 1;
        let price = 0;
        let customExtra = '';

        if (isNaN(parseFloat(starMatch[1].replace(',', '.')))) {
          // Format 1: [tên thịt] [số lượng] * [đơn giá]
          prodName = starMatch[1].trim();
          qty = parseFloat(starMatch[2].replace(',', '.')) || 1;
          price = parseFloat(starMatch[3].replace(/[,.]/g, '')) || 0;
          if (price < 1000) price *= 1000;
          customExtra = starMatch[4] ? starMatch[4].trim() : '';
        } else {
          // Format 2: [số lượng] * [đơn giá] [tên thịt]
          qty = parseFloat(starMatch[1].replace(',', '.')) || 1;
          price = parseFloat(starMatch[2].replace(/[,.]/g, '')) || 0;
          if (price < 1000) price *= 1000;
          prodName = starMatch[3].trim();
          customExtra = starMatch[4] ? starMatch[4].trim() : '';
        }

        const matchedProd = (availableProducts || []).find(
          (p) => p.name.trim().toLowerCase() === prodName.toLowerCase()
        );
        const product = matchedProd || {
          id: `custom_star_${Date.now()}`,
          name: prodName,
          unit: 'kg',
          defaultPrice: price,
        };

        const amt = Math.round(qty * price);
        return {
          items: [{
            tempId: Math.random(),
            product,
            quantity: qty,
            price,
            displayQuantity: String(qty),
            displayPrice: formatNumberString(price.toString()),
            amount: amt,
          }],
          extraNote: customExtra,
          isQuick: false,
        };
      }

      // Đơn trả hàng nhanh hoặc không có định dạng món chi tiết
      return {
        items: [],
        extraNote: cleanStr.replace(/^Trả hàng nhanh\s*/, ''),
        isQuick: true,
      };
    }

    // Phân tích từng món
    const parsedItems = itemMatches.map((im, index) => {
      const amt = parseNumberString(im.amtStr);
      // Tách số lượng, đơn vị và tên thịt từ chuỗi ví dụ: "4kg Sườn" hoặc "2.5kg Bắp hoa"
      const qtyMatch = im.desc.match(/^([\d.,]+)\s*([a-zA-ZÀ-ỹ]*)\s+(.+)$/);
      let qty = 1;
      let unit = 'kg';
      let prodName = im.desc;

      if (qtyMatch) {
        qty = parseFloat(qtyMatch[1].replace(',', '.')) || 1;
        unit = qtyMatch[2] || 'kg';
        prodName = qtyMatch[3].trim();
      }

      const price = qty > 0 ? Math.round(amt / qty) : amt;

      // Tìm sản phẩm trùng tên trong danh mục đã tải
      const matchedProd = (availableProducts || []).find(
        (p) => p.name.trim().toLowerCase() === prodName.toLowerCase()
      );

      const product = matchedProd || {
        id: `custom_${index}_${Date.now()}`,
        name: prodName,
        unit: unit || 'kg',
        defaultPrice: price,
      };

      return {
        tempId: Math.random(),
        product,
        quantity: qty,
        price,
        displayQuantity: String(qty),
        displayPrice: formatNumberString(price.toString()),
        amount: amt,
      };
    });

    return {
      items: parsedItems,
      extraNote,
      isQuick: false,
    };
  };

  // ─── Phơi bày các hàm điều khiển Modal ra ngoài component cha ─────────
  useImperativeHandle(ref, () => ({
    open: (paymentItem, customCustomer = null) => {
      if (!paymentItem) return;

      const targetCustomerId = paymentItem.customerId || customCustomer?.id;
      const targetCustomer = customCustomer || paymentItem.customer;
      const targetDate = formatDateToDisplay(paymentItem.paidAt || paymentItem.createdAt || new Date());

      setPaymentId(paymentItem.id);
      setCustomerId(targetCustomerId);
      setCustomer(targetCustomer);
      setSelectedDate(targetDate);
      setError('');

      // Phân tích note để nạp dữ liệu cũ
      const parsed = parseReturnNoteToCart(
        paymentItem.note,
        paymentItem.amount,
        products
      );

      if (parsed.isQuick || parsed.items.length === 0) {
        setActiveTab('quick');
        setQuickAmountVND(parseFloat(paymentItem.amount || 0));
        setQuickNote(parsed.extraNote || '');
        setCartItems([]);
        setManualNote('');
      } else {
        setActiveTab('manual');
        setCartItems(parsed.items);
        setManualNote(parsed.extraNote || '');
        setQuickAmountVND(parseFloat(paymentItem.amount || 0));
        setQuickNote('');
      }

      setCurrentProduct(null);
      setCurrentQuantity('');
      setCurrentPrice('');
      setEditingItemId(null);
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
        pinInputRef.current?.open(action, 'sửa đơn trả hàng');
      }
    } catch (err) {
      isSubmittingRef.current = false;
      throw err;
    }
  };

  // ─── Gửi yêu cầu cập nhật dữ liệu đơn Trả hàng ──────────────────────────
  const handleSubmit = async () => {
    const isoDate = parseDateString(selectedDate);
    if (!isoDate) {
      setError('Ngày trả hàng không hợp lệ.');
      isSubmittingRef.current = false;
      return;
    }

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

        const response = await api.put(`/payments/${paymentId}`, {
          amount,
          note: formattedNote,
          paidAt: isoDate,
        });

        if (response.data.success) {
          setVisible(false);
          showGlobalToast('Đã cập nhật đơn trả hàng thành công!', 'success');
          if (onRefresh) onRefresh();
        } else {
          setError(response.data.message || 'Có lỗi xảy ra khi cập nhật đơn trả hàng.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
      } finally {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    } else {
      // 2. Trả hàng chi tiết: Tính tổng tiền các mặt hàng thịt trả lại
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

        const response = await api.put(`/payments/${paymentId}`, {
          amount: totalRefundAmount,
          note: formattedNote,
          paidAt: isoDate,
        });

        if (response.data.success) {
          setVisible(false);
          showGlobalToast('Đã cập nhật đơn trả hàng thành công!', 'success');
          if (onRefresh) onRefresh();
        } else {
          setError(response.data.message || 'Có lỗi xảy ra khi cập nhật đơn trả hàng.');
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
  const displayCustomer = customer || customerData;

  return (
    <SmoothModal zIndex={25000} visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>↩️ SỬA ĐƠN TRẢ LẠI HÀNG</Text>
          <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Thông tin khách hàng & Dư nợ hiện tại nếu có */}
        {displayCustomer ? (
          <View style={styles.customerHeaderCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerNameText} numberOfLines={1}>
                Khách hàng: <Text style={styles.boldText}>{displayCustomer.name}</Text>
              </Text>
              {displayCustomer.phone ? (
                <Text style={styles.customerPhoneText}>📞 {displayCustomer.phone}</Text>
              ) : null}
            </View>
            {displayCustomer.debt !== undefined ? (
              <View style={styles.debtBadge}>
                <Text style={styles.debtBadgeLabel}>Đang nợ</Text>
                <Text style={styles.debtBadgeValue}>{formatCurrency(displayCustomer.debt || 0)}</Text>
              </View>
            ) : null}
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
            /* ── TAB TRẢ HÀNG CHI TIẾT ── */
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

              <Text style={styles.label}>2. Lý do / Ghi chú trả hàng (Có thể bỏ qua):</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: Trả lại hàng hỏng, trả bớt..."
                placeholderTextColor={COLORS.textLight}
                value={quickNote}
                onChangeText={setQuickNote}
              />
            </View>
          )}

          {/* Nút gửi dữ liệu Cập nhật Trả Hàng */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={() => requirePin(handleSubmit)}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>
                {activeTab === 'manual'
                  ? `XÁC NHẬN CẬP NHẬT (TRỪ NỢ: -${formatCurrency(cartTotal)})`
                  : `XÁC NHẬN CẬP NHẬT (TRỪ NỢ: -${formatCurrency(quickAmountVND)})`}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setVisible(false)}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>HỦY BỎ</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Sub-modals phụ trợ */}
      <ProductListModal ref={productModalRef} onRefresh={refetchProducts} />
      <PinInputModal ref={pinInputRef} />
      <PinSetupModal ref={pinSetupRef} />
    </SmoothModal>
  );
});

export default EditReturnGoodsModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  closeHeaderButton: {
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeHeaderText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  customerHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerNameText: {
    fontSize: 14,
    color: COLORS.text,
  },
  boldText: {
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },
  customerPhoneText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  debtBadge: {
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  debtBadgeLabel: {
    fontSize: 10,
    color: '#E11D48',
    fontWeight: '600',
  },
  debtBadgeValue: {
    fontSize: 13,
    color: '#E11D48',
    fontWeight: 'bold',
  },
  dateFilterContainer: {
    marginBottom: 12,
  },
  dateFilterLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 6,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    backgroundColor: '#FFF1F1',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  mainScroll: {
    maxHeight: 520,
  },
  mainScrollContent: {
    paddingBottom: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: '#DC2626',
    fontWeight: 'bold',
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 6,
  },
  subLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 10,
  },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  unitText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  addToCartBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  addToCartText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  cartSection: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cartTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  cartTotalText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  cartItemsScroll: {
    maxHeight: 160,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemText: {
    fontSize: 12,
  },
  cartItemName: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cartItemMeta: {
    color: COLORS.textSecondary,
  },
  cartEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    marginLeft: 6,
  },
  cartEditText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: 'bold',
  },
  cartRemoveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFF1F1',
    borderRadius: 6,
    marginLeft: 6,
  },
  cartRemoveText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  emptyCartHintBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyCartHintText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  amountInputContainer: {
    marginBottom: 12,
  },
  amountInput: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#DC2626',
    textAlign: 'center',
  },
  quickContainer: {
    paddingVertical: 6,
  },
  submitButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    ...SHADOWS.medium,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
