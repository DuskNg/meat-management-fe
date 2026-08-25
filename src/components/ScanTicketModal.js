// meat-management-fe/src/components/ScanTicketModal.js
import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image, // Import thêm Image để hiển thị ảnh đối chiếu
} from 'react-native';
import SmoothModal from './SmoothModal';
import DatePickerInput from './DatePickerInput'; // Import DatePickerInput để chọn ngày cho từng tích kê
import ImagePreviewModal from './ImagePreviewModal'; // Import ImagePreviewModal để hiển thị ảnh đối chiếu phóng to
import PopupModal from './PopupModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { matchSearch, removeDiacritics } from '../utils/searchHelper';

// --- Helper: định dạng hàng nghìn dấu chấm ---
const formatNumberString = (value) => {
  const clean = String(value).replace(/[^0-9]/g, '');
  if (clean === '') return '';
  return new Intl.NumberFormat('vi-VN').format(parseInt(clean, 10));
};

const parseNumberString = (formatted) => {
  const clean = String(formatted).replace(/[^0-9]/g, '');
  return clean ? parseInt(clean, 10) : 0;
};

// --- Helper: định dạng tiền VNĐ ---
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount)
    .replace('₫', 'đ');

const convertIsoToDisplay = (isoStr) => {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const convertDisplayToIso = (displayStr) => {
  if (!displayStr) return '';
  const parts = displayStr.split('/');
  if (parts.length !== 3) return displayStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

import CustomSelect from './CustomSelect';

// --- Component một mặt hàng trong đơn nợ ---
const DebtItem = ({ item, products, onUpdate, onRemove }) => {
  const selectedProduct = products.find((p) => p.id === item.selectedProductId) ||
    (item.product?.name ? { id: '__manual__', name: item.product.name, unit: item.product?.unit || 'kg' } : null);

  // Thành tiền
  const subtotal = item.amount !== undefined ? item.amount : (item.quantity * item.price);

  return (
    <View style={styles.debtItemRowCompact}>
      {/* Tên thịt */}
      <View style={{ flex: 2.2, marginRight: 4 }}>
        <SelectDropdown
          value={selectedProduct}
          placeholder="Loại thịt..."
          options={products}
          onSelect={(opt) => {
            const defaultPrice = opt.defaultPrice || item.price;
            const newAmt = Math.round(item.quantity * defaultPrice);
            onUpdate({ 
              selectedProductId: opt.id, 
              product: opt, 
              price: defaultPrice, 
              displayPrice: formatNumberString(defaultPrice.toString()),
              amount: newAmt,
              displayAmount: formatNumberString(newAmt.toString())
            });
          }}
          onInputChange={(text) => onUpdate({ product: { ...item.product, name: text }, selectedProductId: null })}
          renderSelected={(p) => p.name}
          renderOption={(p) => (
            <View style={styles.productOptionRow}>
              <Text style={styles.selectOptionText}>{p.name}</Text>
              <Text style={styles.productOptionPrice}>{formatCurrency(p.defaultPrice)}/{p.unit}</Text>
            </View>
          )}
          style={styles.compactDropdown}
          compact={true}
        />
        {/* Ô nhập tên thịt thủ công nếu chưa chọn hoặc muốn override */}
      </View>

      {/* Số lượng */}
      <View style={{ flex: 1.0, marginRight: 4 }}>
        <TextInput
          style={styles.numInputCompact}
          keyboardType="decimal-pad"
          value={item.displayQuantity}
          onChangeText={(text) => {
            const cleanQty = text.trim().replace(',', '.');
            const q = parseFloat(cleanQty) || 0;
            const newAmt = Math.round(q * item.price);
            onUpdate({ 
              quantity: q, 
              displayQuantity: text,
              amount: newAmt,
              displayAmount: formatNumberString(newAmt.toString())
            });
          }}
          placeholder="SL"
          placeholderTextColor={COLORS.textLight}
        />
      </View>

      {/* Đơn giá */}
      <View style={{ flex: 1.5, marginRight: 4 }}>
        <TextInput
          style={styles.numInputCompact}
          keyboardType="number-pad"
          value={item.displayPrice}
          onChangeText={(text) => {
            const p = parseNumberString(text);
            const newAmt = Math.round(item.quantity * p);
            onUpdate({ 
              price: p, 
              displayPrice: formatNumberString(text),
              amount: newAmt,
              displayAmount: formatNumberString(newAmt.toString())
            });
          }}
          placeholder="Giá"
          placeholderTextColor={COLORS.textLight}
        />
      </View>

      {/* Thành tiền (Cho phép chỉnh sửa trực tiếp) */}
      <View style={{ flex: 1.5, marginRight: 4 }}>
        <TextInput
          style={[styles.numInputCompact, { textAlign: 'right', color: COLORS.danger }]}
          keyboardType="number-pad"
          value={item.displayAmount}
          onChangeText={(text) => {
            const amt = parseNumberString(text);
            const newPrice = item.quantity > 0 ? Math.round(amt / item.quantity) : amt;
            onUpdate({
              amount: amt,
              displayAmount: formatNumberString(text),
              price: newPrice,
              displayPrice: formatNumberString(newPrice.toString())
            });
          }}
          placeholder="T.Tiền"
          placeholderTextColor={COLORS.textLight}
        />
      </View>

      {/* Nút xóa */}
      <TouchableOpacity style={styles.removeItemBtnCompact} onPress={onRemove}>
        <Text style={styles.removeItemTextCompact}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

// --- Component một đơn nợ (nhóm cùng khách trong cùng ngày) ---
const DebtOrder = ({ order, customers, products, onUpdateOrder, onUpdateItem, onRemoveItem, onAddItem, onAddQuickDebtItem, onPressImage }) => {
  const [expanded, setExpanded] = useState(true);
  const selectedCustomer = customers.find((c) => c.id === order.selectedCustomerId) || null;
  const displayedCustomer = selectedCustomer || (order.customerName ? { name: order.customerName } : null);
  const orderTotal = order.items.reduce((sum, item) => sum + (item.amount !== undefined ? item.amount : item.quantity * item.price), 0);

  return (
    <View style={styles.debtOrderCard}>
      {/* Header đơn: Tên tích kê & Tổng tiền & Thu gọn/Mở rộng */}
      <View style={styles.debtOrderHeaderCompact}>
        <View style={styles.headerLeft}>
          <Text style={styles.customerIcon}>📄</Text>
          {order.ticketLabel ? (
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1E40AF', marginRight: 6 }}>
              [{order.ticketLabel}]
            </Text>
          ) : (
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.text }}>
              Tích kê nợ
            </Text>
          )}
        </View>

        <TouchableOpacity 
          style={styles.headerRightClickable} 
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <Text style={styles.orderTotalCompact}>{formatCurrency(orderTotal)}</Text>
          <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>

      {/* Danh sách mặt hàng (Chỉ hiển thị khi expanded) */}
      {expanded && (
        <View style={styles.orderContent}>
          {/* Ảnh tích kê để đối chiếu */}
          {order.ticketImage ? (
            <TouchableOpacity 
              style={styles.orderImageWrapperInline}
              onPress={() => onPressImage && onPressImage(order.ticketImage)}
              activeOpacity={0.9}
            >
              <Image 
                source={{ uri: order.ticketImage }} 
                style={styles.orderMainImageInline} 
                resizeMode="contain" 
              />
            </TouchableOpacity>
          ) : null}

          {/* Chọn khách hàng & Chọn ngày giao dịch (cùng hàng) */}
          <View style={styles.ticketMetadataRow}>
            {/* Chọn khách */}
            <View style={{ flex: 1.3, marginRight: 8, zIndex: 20, elevation: 20 }}>
              <CustomSelect
                value={displayedCustomer}
                placeholder="Chọn khách..."
                options={customers}
                onSelect={(c) => onUpdateOrder({ selectedCustomerId: c.id, customerName: c.name })}
                onInputChange={(text) => onUpdateOrder({ selectedCustomerId: null, customerName: text })}
                renderSelected={(c) => c.name}
                renderOption={(c) => (
                  <View style={styles.customerOptionRow}>
                    <Text style={styles.selectOptionText}>{c.name}</Text>
                    {c.phone ? <Text style={styles.customerOptionPhone}>{c.phone}</Text> : null}
                  </View>
                )}
                style={styles.customerSelectCompact}
                compact={true}
              />
            </View>

            {/* Chọn ngày */}
            <View style={{ flex: 0.8, zIndex: 10, elevation: 10 }}>
              <DatePickerInput
                value={convertIsoToDisplay(order.voiceDate)}
                onChange={(newDisplayDate) => {
                  const newIsoDate = convertDisplayToIso(newDisplayDate);
                  onUpdateOrder({ voiceDate: newIsoDate });
                }}
                compact={true}
              />
            </View>
          </View>

          {/* Table Header */}
          {order.items.length > 0 && (
            <View style={styles.itemsHeaderRow}>
              <Text style={[styles.headerCol, { flex: 2.2 }]}>🥩 Tên thịt</Text>
              <Text style={[styles.headerCol, { flex: 1.0, textAlign: 'center' }]}>SL(kg)</Text>
              <Text style={[styles.headerCol, { flex: 1.5, textAlign: 'center' }]}>Đơn giá</Text>
              <Text style={[styles.headerCol, { flex: 1.5, textAlign: 'right' }]}>Thành tiền</Text>
              <View style={{ width: 24 }} />
            </View>
          )}

          <View style={styles.debtItemsList}>
            {order.items.map((item, idx) => (
              <View key={item.tempId} style={{ zIndex: order.items.length - idx, elevation: order.items.length - idx }}>
                <DebtItem
                  item={item}
                  products={products}
                  onUpdate={(updates) => onUpdateItem(item.tempId, updates)}
                  onRemove={() => onRemoveItem(item.tempId)}
                />
              </View>
            ))}
          </View>

          {/* Nút bấm thêm dòng ghi nợ nhanh hoặc thêm mặt hàng */}
          <View style={styles.addOrderButtonsRow}>
            <TouchableOpacity
              style={styles.btnQuickDebtCompact}
              onPress={() => onAddQuickDebtItem && onAddQuickDebtItem(order.orderKey)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnQuickDebtCompactText}>⚡ + Ghi nợ nhanh</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnAddItemCompact}
              onPress={() => onAddItem && onAddItem(order.orderKey)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnAddItemCompactText}>🥩 + Thêm mặt hàng</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const ScanTicketModal = forwardRef(({ customerId: propCustomerId, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [modalTitleText, setModalTitleText] = useState('🎤 KẾT QUẢ GHI NỢ GIỌNG NÓI');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSubmittingRef = useRef(false);
  const mainScrollRef = useRef(null);
  const popupModalRef = useRef(null);
  const orderPositionsRef = useRef({});
  const imagePreviewModalRef = useRef(null); // Khai báo ref để điều khiển modal phóng to ảnh

  // Dữ liệu khách hàng và sản phẩm để chọn
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // Dữ liệu đơn nợ phẳng (danh sách các tích kê trực tiếp)
  const [orders, setOrders] = useState([]);

  // Tải danh sách khách hàng
  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers?isBadDebt=false');
      if (response.data.success) setCustomers(response.data.data || []);
    } catch (err) {
      console.error('Không thể tải danh sách khách hàng:', err);
    }
  };

  // Tải danh sách sản phẩm (thịt)
  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      if (response.data.success) {
        setProducts((response.data.data || []).filter(
          (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
        ));
      }
    } catch (err) {
      console.error('Không thể tải danh sách sản phẩm:', err);
    }
  };

  // --- Phơi bày open/close ra ngoài qua forwardRef ---
  useImperativeHandle(ref, () => ({
    open: (items, title, defaultNote, initialDate, detectedCustomerName, targetCustomerId) => {
      setVisible(true);
      setModalTitleText(title || '🎤 KẾT QUẢ GHI NỢ GIỌNG NÓI');
      setNote(defaultNote || '');
      setError('');
      fetchCustomers();
      fetchProducts();

      if (!items || !Array.isArray(items) || items.length === 0) {
        setOrders([]);
        return;
      }

      // Ánh xạ từng item về cấu trúc có thể chỉnh sửa
      const mappedItems = items.map((item, idx) => {
        const qty = parseFloat(item.quantity) || 0;
        const prc = parseInt(item.price, 10) || 0;
        const amt = parseInt(item.amount, 10) || Math.round(qty * prc);
        
        let finalPrc = prc;
        if (finalPrc === 0 && amt > 0 && qty > 0) {
          finalPrc = Math.round(amt / qty);
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const itemDate = item.voiceDate || initialDate || todayStr;

        return {
          tempId: `${Date.now()}-${idx}-${Math.random()}`,
          orderKey: item.orderKey || `${itemDate}-${(item.voiceCustomerName || detectedCustomerName || 'manual').toLowerCase().trim()}`,
          voiceDate: itemDate,
          voiceCustomerName: item.voiceCustomerName || detectedCustomerName || '',
          ticketLabel: item.ticketLabel,
          ticketImage: item.ticketImage,
          product: item.product || { name: 'Thịt lẻ', unit: 'kg' },
          selectedProductId: item.selectedProductId || null,
          quantity: qty,
          price: finalPrc,
          amount: amt,
          displayQuantity: qty.toString(),
          displayPrice: formatNumberString(finalPrc.toString()),
          displayAmount: formatNumberString(amt.toString()),
        };
      });

      // Nhóm items → orders (cùng orderKey = cùng đơn)
      const orderMap = {};
      mappedItems.forEach((item) => {
        const key = item.orderKey;
        if (!orderMap[key]) {
          orderMap[key] = {
            orderKey: key,
            voiceDate: item.voiceDate,
            selectedCustomerId: targetCustomerId || null,
            customerName: item.voiceCustomerName,
            ticketLabel: item.ticketLabel,
            ticketImage: item.ticketImage,
            items: [],
          };
        }
        orderMap[key].items.push(item);
      });

      setOrders(Object.values(orderMap));
    },
    close: () => setVisible(false),
  }));

  // Match sản phẩm AI nhận diện với danh sách thực tế
  useEffect(() => {
    if (!products.length || !orders.length) return;
    setOrders((prev) =>
      prev.map((order) => ({
        ...order,
        items: order.items.map((item) => {
          if (item.selectedProductId) return item;
          const voiceName = removeDiacritics((item.product?.name || '').toLowerCase().trim());
          const match = products.find((p) =>
            removeDiacritics(p.name.toLowerCase().trim()) === voiceName
          );
          return match
            ? { ...item, selectedProductId: match.id, product: match }
            : item;
        }),
      }))
    );
  }, [products]);

  // Match khách hàng AI nhận diện với danh sách thực tế
  useEffect(() => {
    if (!customers.length || !orders.length) return;
    setOrders((prev) =>
      prev.map((order) => {
        if (order.selectedCustomerId) return order;
        const voiceName = removeDiacritics((order.customerName || '').toLowerCase().trim());
        const match = customers.find((c) =>
          removeDiacritics(c.name.toLowerCase().trim()) === voiceName
        );
        return match
          ? { ...order, selectedCustomerId: match.id, customerName: match.name }
          : order;
      })
    );
  }, [customers]);

  // --- Cập nhật order (khách hàng hoặc ngày) ---
  const handleUpdateOrder = (orderKey, updates) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.orderKey === orderKey ? { ...order, ...updates } : order
      )
    );
  };

  // --- Cập nhật item trong order ---
  const handleUpdateItem = (orderKey, tempId, updates) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.orderKey !== orderKey) return order;
        return {
          ...order,
          items: order.items.map((item) =>
            item.tempId === tempId ? { ...item, ...updates } : item
          ),
        };
      })
    );
  };

  // --- Xóa item khỏi order ---
  const handleRemoveItem = (orderKey, tempId) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.orderKey !== orderKey) return order;
        return {
          ...order,
          items: order.items.filter((item) => item.tempId !== tempId),
        };
      }).filter((order) => order.items.length > 0)
    );
  };

  // --- Thêm mặt hàng thịt mới vào đơn ---
  const handleAddItem = (orderKey) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.orderKey !== orderKey) return order;
        const newItem = {
          tempId: `${Date.now()}-${Math.random()}`,
          orderKey,
          voiceDate: order.voiceDate,
          voiceCustomerName: order.customerName,
          ticketLabel: order.ticketLabel,
          ticketImage: order.ticketImage,
          product: { name: 'Thịt lẻ', unit: 'kg' },
          selectedProductId: null,
          quantity: 1,
          price: 0,
          amount: 0,
          displayQuantity: '1',
          displayPrice: '0',
          displayAmount: '0',
        };
        return {
          ...order,
          items: [...order.items, newItem],
        };
      })
    );
  };

  // --- Thêm dòng ghi nợ nhanh vào đơn ---
  const handleAddQuickDebtItem = (orderKey) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.orderKey !== orderKey) return order;
        const newItem = {
          tempId: `${Date.now()}-${Math.random()}`,
          orderKey,
          voiceDate: order.voiceDate,
          voiceCustomerName: order.customerName,
          ticketLabel: order.ticketLabel,
          ticketImage: order.ticketImage,
          product: { name: 'Tiền hàng', unit: 'phần' },
          selectedProductId: null,
          quantity: 1,
          price: 0,
          amount: 0,
          displayQuantity: '1',
          displayPrice: '0',
          displayAmount: '0',
          isQuickDebt: true,
        };
        return {
          ...order,
          items: [...order.items, newItem],
        };
      })
    );
  };

  // --- Gửi dữ liệu nợ lên server ---
  const getNameKey = (name) => removeDiacritics((name || '').trim().toLowerCase());

  const findUnknownEntries = () => {
    const customerKeys = new Set(customers.map((customer) => getNameKey(customer.name)));
    const productKeys = new Set(products.map((product) => getNameKey(product.name)));
    const unknownCustomers = [];
    const unknownProducts = [];
    const seenCustomers = new Set();
    const seenProducts = new Set();

    orders.forEach((order) => {
      const customerName = (order.customerName || '').trim();
      const customerKey = getNameKey(customerName);
      const hasCustomerId = order.selectedCustomerId && customers.some((customer) => customer.id === order.selectedCustomerId);
      if (customerName && !hasCustomerId && !customerKeys.has(customerKey) && !seenCustomers.has(customerKey)) {
        seenCustomers.add(customerKey);
        unknownCustomers.push({ name: customerName, orderKey: order.orderKey });
      }

      order.items.forEach((item) => {
        const productName = (item.product?.name || '').trim();
        const productKey = getNameKey(productName);
        const hasProductId = item.selectedProductId && item.selectedProductId !== '__manual__' && products.some((product) => product.id === item.selectedProductId);
        if (productName && !hasProductId && !productKeys.has(productKey) && !seenProducts.has(productKey)) {
          seenProducts.add(productKey);
          unknownProducts.push({ name: productName, orderKey: order.orderKey, price: item.price, unit: item.product?.unit || 'kg' });
        }
      });
    });

    return { unknownCustomers, unknownProducts };
  };

  const scrollToOrder = (orderKey) => {
    const y = orderPositionsRef.current[orderKey];
    if (typeof y !== 'number') return;
    requestAnimationFrame(() => mainScrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true }));
  };

  const handleSubmit = async (allowNewEntries = false, confirmedWarning = false) => {
    if (!allowNewEntries && (loading || isSubmittingRef.current)) return;

    // Kiểm tra tính hợp lệ
    for (const order of orders) {
      if (!order.selectedCustomerId) {
        if (!order.customerName || !order.customerName.trim()) {
          setError(`Vui lòng chọn khách hàng cho tích kê [${order.ticketLabel || 'Chưa đặt tên'}].`);
          return;
        }
      }
      for (const item of order.items) {
        if (item.quantity <= 0) {
          setError(`Số lượng của ${item.product?.name || 'mặt hàng'} phải lớn hơn 0.`);
          return;
        }
        if (item.price <= 0) {
          setError(`Đơn giá của ${item.product?.name || 'mặt hàng'} trong tích kê [${order.ticketLabel || 'Chưa đặt tên'}] phải lớn hơn 0.`);
          return;
        }
      }
    }

    // Hiển thị cảnh báo kiểm tra kỹ thông tin ở chế độ chụp tích kê
    const isScanTicketMode = orders.some(order => order.ticketImage || order.ticketLabel);
    if (isScanTicketMode && !confirmedWarning) {
      popupModalRef.current?.show({
        type: 'confirm',
        title: 'Kiểm tra thông tin',
        message: 'Bạn nên kiểm tra kỹ thông tin (khách hàng, loại thịt, số lượng, đơn giá) trước khi ghi nợ ở chế độ chụp tích kê.',
        confirmText: 'Đã kiểm tra, lưu nợ',
        cancelText: 'Kiểm tra lại',
        onConfirm: () => handleSubmit(allowNewEntries, true),
      });
      return;
    }

    const { unknownCustomers, unknownProducts } = findUnknownEntries();
    if ((unknownCustomers.length || unknownProducts.length) && !allowNewEntries) {
      const customerText = unknownCustomers.length
        ? `Khách hàng chưa có trong danh sách:\n- ${unknownCustomers.map((entry) => entry.name).join('\n- ')}`
        : '';
      const productText = unknownProducts.length
        ? `Loại thịt chưa có trong danh sách:\n- ${unknownProducts.map((entry) => entry.name).join('\n- ')}`
        : '';

      isSubmittingRef.current = true;
      setLoading(true);
      popupModalRef.current?.show({
        type: 'confirm',
        title: 'Phát hiện dữ liệu mới',
        message: `${customerText}${customerText && productText ? '\n\n' : ''}${productText}\n\nBạn có muốn tạo mới và tiếp tục ghi nợ không?`,
        confirmText: 'Tạo mới và ghi nợ',
        cancelText: 'Kiểm tra lại',
        onConfirm: () => handleSubmit(true, true),
        onCancel: () => {
          setLoading(false);
          isSubmittingRef.current = false;
          scrollToOrder(unknownCustomers[0]?.orderKey || unknownProducts[0]?.orderKey);
        },
      });
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;

    try {
      const autoCreatedCustomers = new Map();
      const createdProducts = new Map();
      const customerByName = new Map(customers.map((customer) => [getNameKey(customer.name), customer.id]));
      const productByName = new Map(products.map((product) => [getNameKey(product.name), product]));

      if (allowNewEntries) {
        const { unknownCustomers, unknownProducts } = findUnknownEntries();
        for (const entry of unknownCustomers) {
          const customerResponse = await api.post('/customers', {
            name: entry.name,
            isBadDebt: false,
          });
          const newCustomer = customerResponse.data?.data;
          if (!newCustomer?.id) throw new Error(`Không thể tạo khách hàng "${entry.name}".`);
          customerByName.set(getNameKey(entry.name), newCustomer.id);
          setCustomers((prev) => [...prev, newCustomer]);
        }

        for (const entry of unknownProducts) {
          const productResponse = await api.post('/products', {
            name: entry.name,
            defaultPrice: entry.price,
            unit: entry.unit || 'kg',
          });
          const newProduct = productResponse.data?.data;
          if (!newProduct?.id) throw new Error(`Không thể tạo loại thịt "${entry.name}".`);
          createdProducts.set(getNameKey(entry.name), newProduct);
          productByName.set(getNameKey(entry.name), newProduct);
          setProducts((prev) => [...prev, newProduct]);
        }
      }

      // Gửi từng đơn hàng (tích kê)
      for (const order of orders) {
        let customerId = order.selectedCustomerId || customerByName.get(getNameKey(order.customerName));
        if (!customerId) {
          const customerName = order.customerName.trim();
          const customerKey = removeDiacritics(customerName.toLowerCase());
          customerId = autoCreatedCustomers.get(customerKey);

          if (!customerId) {
            const customerResponse = await api.post('/customers', {
              name: customerName,
              isBadDebt: false,
            });
            customerId = customerResponse.data?.data?.id;
            if (!customerId) {
              throw new Error(`Không thể tạo khách hàng "${customerName}".`);
            }
            autoCreatedCustomers.set(customerKey, customerId);
          }
        }

        const rawDate = order.voiceDate;
        let isoDate = null;
        if (rawDate) {
          try {
            const d = new Date(rawDate);
            if (!isNaN(d.getTime())) isoDate = d.toISOString();
          } catch (_) {}
        }

        const response = await api.post('/transactions', {
          customerId,
          date: isoDate,
          note: note.trim() || null,
          items: order.items.map((item) => {
            const selectedProduct = item.selectedProductId && item.selectedProductId !== '__manual__'
              ? products.find((product) => product.id === item.selectedProductId)
              : null;
            const product = selectedProduct || productByName.get(getNameKey(item.product?.name));
            return {
            productId: product?.id || createdProducts.get(getNameKey(item.product?.name))?.id,
            productName: item.product?.name,
            quantity: item.quantity,
            price: item.price,
            };
          }),
        });

        if (!response.data.success) {
          setError(response.data.message || 'Lỗi lưu ghi nợ. Vui lòng thử lại.');
          return;
        }
      }

      setVisible(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // Tổng tiền tất cả đơn
  const grandTotal = orders.reduce(
    (sum, order) =>
      sum + order.items.reduce((ss, item) => ss + (item.amount !== undefined ? item.amount : item.quantity * item.price), 0),
    0
  );

  const totalItemCount = orders.reduce(
    (sum, order) => sum + order.items.length,
    0
  );

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{modalTitleText}</Text>
          <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Cảnh báo AI */}
        <View style={styles.voiceWarningBox}>
          <Text style={styles.voiceWarningText}>
            💡 AI đã tự động phân tích giọng nói. Hãy kiểm tra lại tên khách, tên thịt, số lượng và giá tiền trước khi bấm lưu nợ!
          </Text>
        </View>

        {/* Lỗi */}
        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        {/* Nội dung chính - cuộn được */}
        <ScrollView
          ref={mainScrollRef}
          style={styles.mainScroll}
          nestedScrollEnabled={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {orders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Không có dữ liệu để hiển thị</Text>
            </View>
          ) : (
            <View style={{ zIndex: 10, elevation: 10 }}>
              {orders.map((order, idx) => (
                <View
                  key={order.orderKey}
                  onLayout={(event) => {
                    orderPositionsRef.current[order.orderKey] = event.nativeEvent.layout.y;
                  }}
                  style={{ zIndex: orders.length - idx, elevation: orders.length - idx }}
                >
                  <DebtOrder
                    order={order}
                    customers={customers}
                    products={products}
                    onUpdateOrder={(updates) => handleUpdateOrder(order.orderKey, updates)}
                    onUpdateItem={(tempId, updates) => handleUpdateItem(order.orderKey, tempId, updates)}
                    onRemoveItem={(tempId) => handleRemoveItem(order.orderKey, tempId)}
                    onAddItem={(orderKey) => handleAddItem(orderKey)}
                    onAddQuickDebtItem={(orderKey) => handleAddQuickDebtItem(orderKey)}
                    onPressImage={(url) => imagePreviewModalRef.current?.open(url)}
                  />
                </View>
              ))}
            </View>
          )}

          {/* Ghi chú chung */}
          <View style={styles.noteSection}>
            <Text style={styles.noteLabel}>📝 Ghi chú chung (có thể bỏ qua):</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Ví dụ: Ghi nợ từ giọng nói ngày hôm nay"
              placeholderTextColor={COLORS.textLight}
              value={note}
              onChangeText={setNote}
            />
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* Tổng tiền + Nút bấm */}
        <View style={styles.bottomBar}>
          <View style={styles.grandTotalContainer}>
            <Text style={styles.grandTotalLabel}>💰 TỔNG CỘNG ({totalItemCount} mặt hàng):</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(grandTotal)}</Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => setVisible(false)}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>HỦY BỎ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.submitButton, (loading || orders.length === 0) && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={loading || orders.length === 0}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>XÁC NHẬN GHI NỢ</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        {/* Modal xem ảnh phóng to toàn màn hình */}
        <ImagePreviewModal ref={imagePreviewModalRef} />
      </View>
      </SmoothModal>
      <PopupModal ref={popupModalRef} />
    </>
  );
});

export default ScanTicketModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    height: '100%',
    paddingHorizontal: 16,
    paddingBottom: 0,
    paddingTop: Platform.OS === 'ios' ? 44 : 18,
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  closeHeaderButton: {
    padding: 6,
  },
  closeHeaderText: {
    fontSize: 20,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  voiceWarningBox: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  voiceWarningText: {
    fontSize: 13,
    color: '#B45309',
    lineHeight: 18,
    fontWeight: '500',
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 8,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  mainScroll: {
    flex: 1,
  },

  // =====================================================================
  // PHẦN NGÀY (DaySection)
  // =====================================================================
  daySectionWrapper: {
    marginBottom: 16,
    overflow: 'visible', // Cho phép dropdown tràn ra ngoài
  },
  daySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
    ...SHADOWS.card,
  },
  daySectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  daySectionEmoji: {
    fontSize: 20,
    marginRight: 6,
  },
  daySectionDateText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  daySectionOrderCount: {
    fontSize: 11,
    color: '#93C5FD',
    marginTop: 1,
  },
  daySectionHeaderRight: {
    alignItems: 'flex-end',
  },
  daySectionTotalLabel: {
    fontSize: 11,
    color: '#93C5FD',
  },
  daySectionTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FCD34D',
  },

  // =====================================================================
  // PHẦN ĐƠN NỢ (DebtOrder)
  // =====================================================================
  debtOrderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 8,
    overflow: 'visible', // Cho phép dropdown tràn ra ngoài card
    ...SHADOWS.card,
  },
  debtOrderHeader: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
  },
  debtOrderCustomerLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 6,
  },
  customerSelectFull: {
    width: '100%',
  },
  orderTotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0F2FE',
    gap: 8,
  },
  orderTotalLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  orderTotalValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  debtItemsList: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  // =====================================================================
  // PHẦN MẶT HÀNG (DebtItem)
  // =====================================================================
  debtItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
    padding: 10,
    overflow: 'visible', // Cho phép dropdown tràn ra ngoài card
    zIndex: 1,
  },
  debtItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  debtItemFieldLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginTop: 10,
    width: 60,
    flexShrink: 0,
  },
  manualInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 14,
    color: COLORS.text,
    marginTop: 4,
    outlineStyle: 'none',
  },
  debtItemNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  qtyBlock: {
    flex: 1.2,
    alignItems: 'center',
  },
  priceBlock: {
    flex: 2,
    alignItems: 'center',
  },
  subtotalBlock: {
    flex: 2,
    alignItems: 'flex-end',
  },
  numLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    marginBottom: 3,
    fontWeight: '600',
  },
  numInput: {
    width: '100%',
    backgroundColor: COLORS.inputBg,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    height: 36,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    color: COLORS.text,
    outlineStyle: 'none',
    padding: 0,
  },
  operatorText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textLight,
    alignSelf: 'flex-end',
    paddingBottom: 8,
  },
  subtotalValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.danger,
    textAlign: 'right',
    paddingBottom: 8,
  },
  removeItemBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  removeItemText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },

  // =====================================================================
  // SELECT DROPDOWN
  // =====================================================================
  selectWrapper: {
    position: 'relative',
    zIndex: 1000,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
  },
  selectTriggerOpen: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  selectTriggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectTriggerInput: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    outlineStyle: 'none',
  },
  selectPlaceholder: {
    color: COLORS.textLight,
    fontWeight: '400',
  },
  selectArrow: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginLeft: 6,
  },
  selectDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3B82F6',
    zIndex: 9999,
    marginTop: 2,
    ...SHADOWS.card,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  selectSearchInput: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.text,
    outlineStyle: 'none',
  },
  selectDropdownScroll: {
    maxHeight: 160,
  },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectEmptyText: {
    padding: 12,
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  customerOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerOptionPhone: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  productOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productOptionPrice: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },

  // =====================================================================
  // BOTTOM BAR
  // =====================================================================
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: COLORS.card,
  },
  grandTotalContainer: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  grandTotalLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E3A8A',
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    height: 48,
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
    fontWeight: 'bold',
    fontSize: 15,
  },
  submitButton: {
    backgroundColor: '#2563EB',
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },

  // =====================================================================
  // GHI CHÚ & EMPTY
  // =====================================================================
  noteSection: {
    marginTop: 6,
    marginBottom: 4,
    zIndex: 1,
    elevation: 1,
  },
  noteLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  noteInput: {
    backgroundColor: COLORS.inputBg,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    outlineStyle: 'none',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textLight,
  },
  // Compact Styles
  selectTriggerCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 32,
    borderRadius: 6,
  },
  selectTriggerTextCompact: {
    fontSize: 13,
  },
  selectOptionCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  debtItemRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    overflow: 'visible',
    zIndex: 1,
  },
  compactDropdown: {
    width: '100%',
  },
  manualInputCompact: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    height: 30,
    fontSize: 12,
    color: COLORS.text,
    marginTop: 3,
    outlineStyle: 'none',
  },
  numInputCompact: {
    width: '100%',
    backgroundColor: COLORS.inputBg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    height: 34,
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    color: COLORS.text,
    outlineStyle: 'none',
    padding: 0,
  },
  subtotalValueCompact: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.danger,
    textAlign: 'right',
  },
  removeItemBtnCompact: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeItemTextCompact: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  debtOrderHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
    justifyContent: 'space-between',
    minHeight: 46,
    zIndex: 10, // Đảm bảo dropdown chọn khách không bị đè bởi bảng hàng hóa bên dưới
    elevation: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  customerIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  customerSelectCompact: {
    width: '100%',
  },
  headerRightClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 6,
    paddingLeft: 8,
  },
  orderTotalCompact: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2563EB',
    marginRight: 6,
  },
  expandIcon: {
    fontSize: 12,
    color: '#1E40AF',
    width: 14,
    textAlign: 'center',
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  headerCol: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  orderContent: {
    overflow: 'visible',
    zIndex: 1,
  },

  // =====================================================================
  // INLINE IMAGE & DATEPICKER FOR EACH TICKET CARD
  // =====================================================================
  orderImageWrapperInline: {
    width: '100%',
    height: 280,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 8,
  },
  orderMainImageInline: {
    width: '100%',
    height: '100%',
  },
  ticketMetadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
    elevation: 10,
  },
  addOrderButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  btnQuickDebtCompact: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  btnQuickDebtCompactText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#D97706',
  },
  btnAddItemCompact: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  btnAddItemCompactText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563EB',
  },
});
