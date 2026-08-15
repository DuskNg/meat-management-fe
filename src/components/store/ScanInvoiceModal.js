// meat-management-fe/src/components/store/ScanInvoiceModal.js
import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import SmoothModal from '../SmoothModal';
import DatePickerInput from '../DatePickerInput';
import StorePopupModal from './StorePopupModal';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';
import { matchSearch, removeDiacritics } from '../../utils/searchHelper';

const formatNumberString = (value) => {
  const clean = String(value).replace(/[^0-9]/g, '');
  if (clean === '') return '';
  return new Intl.NumberFormat('vi-VN').format(parseInt(clean, 10));
};

const parseNumberString = (formatted) => {
  const clean = String(formatted).replace(/[^0-9]/g, '');
  return clean ? parseInt(clean, 10) : 0;
};

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

// Select Dropdown dùng chung cho Bàn ăn và Món ăn
const SelectDropdown = ({ value, placeholder, options, onSelect, onInputChange, renderOption, renderSelected, style, compact }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const valueLabel = value ? (renderSelected ? renderSelected(value) : (value.name || value)) : '';

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;

    const closeOnOutsideClick = (event) => {
      if (!dropdownRef.current?.contains(event.target)) {
        setOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  const filtered = options.filter((opt) => {
    const label = typeof opt === 'string' ? opt : (opt.name || '');
    return matchSearch(label, search);
  });

  return (
    <View ref={dropdownRef} style={[styles.selectWrapper, style]}>
      <View style={[styles.selectTrigger, compact && styles.selectTriggerCompact, open && styles.selectTriggerOpen]}>
        <TextInput
          style={[styles.selectTriggerInput, compact && styles.selectTriggerTextCompact, !valueLabel && styles.selectPlaceholder]}
          value={open ? search : valueLabel}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textLight}
          onFocus={() => { setOpen(true); setSearch(valueLabel); }}
          onChangeText={(text) => {
            setSearch(text);
            onInputChange && onInputChange(text);
          }}
          onSubmitEditing={() => setOpen(false)}
          blurOnSubmit={false}
          numberOfLines={1}
        />
        <TouchableOpacity
          onPress={() => { setOpen(!open); setSearch(''); }}
          activeOpacity={0.8}
        >
          <Text style={styles.selectArrow}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>

      {open && (
        <View style={styles.selectDropdown}>
          <ScrollView style={styles.selectDropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <Text style={styles.selectEmptyText}>Không tìm thấy</Text>
            ) : (
              filtered.map((opt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.selectOption, compact && styles.selectOptionCompact]}
                  onPress={() => {
                    onSelect(opt);
                    setOpen(false);
                    setSearch(typeof opt === 'string' ? opt : opt.name);
                  }}
                >
                  {renderOption ? renderOption(opt) : (
                    <Text style={[styles.selectOptionText, compact && styles.selectTriggerTextCompact]}>{typeof opt === 'string' ? opt : opt.name}</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

// Component chi tiết một món ăn trong hóa đơn
const BillItem = ({ item, products, onUpdate, onRemove }) => {
  const selectedProduct = products.find((p) => p.id === item.selectedProductId) ||
    (item.product?.name ? { id: '__manual__', name: item.product.name, unit: item.product?.unit || 'phần' } : null);

  return (
    <View style={styles.debtItemRowCompact}>
      {/* Tên món */}
      <View style={{ flex: 2.2, marginRight: 4 }}>
        <SelectDropdown
          value={selectedProduct}
          placeholder="Món ăn..."
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

      {/* Thành tiền */}
      <View style={{ flex: 1.5, marginRight: 4 }}>
        <TextInput
          style={[styles.numInputCompact, { textAlign: 'right', color: '#5B21B6' }]}
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

// Component chứa chi tiết hóa đơn (cho 1 bàn cụ thể)
const BillOrder = ({ order, customers, products, onUpdateOrder, onUpdateItem, onRemoveItem, onAddItem, onAddQuickDebtItem }) => {
  const [expanded, setExpanded] = useState(true);
  const selectedCustomer = customers.find((c) => c.id === order.selectedCustomerId) || null;
  const displayedCustomer = selectedCustomer || (order.customerName ? { name: order.customerName } : null);
  const orderTotal = order.items.reduce((sum, item) => sum + (item.amount !== undefined ? item.amount : item.quantity * item.price), 0);

  return (
    <View style={styles.debtOrderCard}>
      <View style={styles.debtOrderHeaderCompact}>
        <View style={styles.headerLeft}>
          <Text style={styles.customerIcon}>📋</Text>
          <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#5B21B6', marginRight: 6 }}>
            {order.ticketLabel ? `[${order.ticketLabel}]` : 'Hóa đơn món ăn'}
          </Text>
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

      {expanded && (
        <View style={styles.orderContent}>
          {order.ticketImage ? (
            <View style={styles.orderImageWrapperInline}>
              <Image source={{ uri: order.ticketImage }} style={styles.orderMainImageInline} resizeMode="contain" />
            </View>
          ) : null}

          {/* Chọn bàn ăn & Chọn ngày hóa đơn */}
          <View style={styles.ticketMetadataRow}>
            <View style={{ flex: 1.3, marginRight: 8, zIndex: 20, elevation: 20 }}>
              <SelectDropdown
                value={displayedCustomer}
                placeholder="Chọn bàn ăn..."
                options={customers}
                onSelect={(c) => onUpdateOrder({ selectedCustomerId: c.id, customerName: c.name })}
                onInputChange={(text) => onUpdateOrder({ selectedCustomerId: null, customerName: text })}
                renderSelected={(c) => c.name}
                renderOption={(c) => (
                  <View style={styles.customerOptionRow}>
                    <Text style={styles.selectOptionText}>{c.name}</Text>
                  </View>
                )}
                style={styles.customerSelectCompact}
                compact={true}
              />
            </View>

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
              <Text style={[styles.headerCol, { flex: 2.2 }]}>🍔 Tên món</Text>
              <Text style={[styles.headerCol, { flex: 1.0, textAlign: 'center' }]}>SL</Text>
              <Text style={[styles.headerCol, { flex: 1.5, textAlign: 'center' }]}>Đơn giá</Text>
              <Text style={[styles.headerCol, { flex: 1.5, textAlign: 'right' }]}>Thành tiền</Text>
              <View style={{ width: 24 }} />
            </View>
          )}

          <View style={styles.debtItemsList}>
            {order.items.map((item, idx) => (
              <View key={item.tempId} style={{ zIndex: order.items.length - idx, elevation: order.items.length - idx }}>
                <BillItem
                  item={item}
                  products={products}
                  onUpdate={(updates) => onUpdateItem(item.tempId, updates)}
                  onRemove={() => onRemoveItem(item.tempId)}
                />
              </View>
            ))}
          </View>

          <View style={styles.addOrderButtonsRow}>
            <TouchableOpacity
              style={styles.btnQuickDebtCompact}
              onPress={() => onAddQuickDebtItem(order.orderKey)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnQuickDebtCompactText}>⚡ + Ghi nhanh</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnAddItemCompact}
              onPress={() => onAddItem(order.orderKey)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnAddItemCompactText}>🍔 + Thêm món</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const ScanInvoiceModal = forwardRef(({ customerId: propCustomerId, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [modalTitleText, setModalTitleText] = useState('🎤 KẾT QUẢ GHI NỢ GIỌNG NÓI');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSubmittingRef = useRef(false);
  const mainScrollRef = useRef(null);
  const popupModalRef = useRef(null);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);

  // Tải danh sách bàn ăn
  const fetchCustomers = async () => {
    try {
      const response = await api.get('/store/customers');
      if (response.data.success) setCustomers(response.data.data || []);
    } catch (err) {
      console.error('Không thể tải danh sách bàn:', err);
    }
  };

  // Tải danh sách thực đơn món ăn
  const fetchProducts = async () => {
    try {
      const response = await api.get('/store/products');
      if (response.data.success) {
        setProducts((response.data.data || []).filter(
          (p) => p.name !== 'Món lẻ' && !p.name.toLowerCase().startsWith('tiền')
        ));
      }
    } catch (err) {
      console.error('Không thể tải danh sách món ăn:', err);
    }
  };

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
          product: item.product || { name: 'Món lẻ', unit: 'phần' },
          selectedProductId: item.selectedProductId || null,
          quantity: qty,
          price: finalPrc,
          amount: amt,
          displayQuantity: qty.toString(),
          displayPrice: formatNumberString(finalPrc.toString()),
          displayAmount: formatNumberString(amt.toString()),
        };
      });

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

  // Match sản phẩm
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

  // Match bàn ăn
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

  const handleUpdateOrder = (orderKey, updates) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.orderKey === orderKey ? { ...order, ...updates } : order
      )
    );
  };

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
          product: { name: 'Món lẻ', unit: 'phần' },
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
          product: { name: 'Món lẻ', unit: 'phần' },
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

  const getNameKey = (name) => removeDiacritics((name || '').trim().toLowerCase());

  const findUnknownEntries = () => {
    const customerKeys = new Set(customers.map((c) => getNameKey(c.name)));
    const productKeys = new Set(products.map((p) => getNameKey(p.name)));
    const unknownCustomers = [];
    const unknownProducts = [];
    const seenCustomers = new Set();
    const seenProducts = new Set();

    orders.forEach((order) => {
      const customerName = (order.customerName || '').trim();
      const customerKey = getNameKey(customerName);
      const hasCustomerId = order.selectedCustomerId && customers.some((c) => c.id === order.selectedCustomerId);
      if (customerName && !hasCustomerId && !customerKeys.has(customerKey) && !seenCustomers.has(customerKey)) {
        seenCustomers.add(customerKey);
        unknownCustomers.push({ name: customerName, orderKey: order.orderKey });
      }

      order.items.forEach((item) => {
        const productName = (item.product?.name || '').trim();
        const productKey = getNameKey(productName);
        const hasProductId = item.selectedProductId && item.selectedProductId !== '__manual__' && products.some((p) => p.id === item.selectedProductId);
        if (productName && !hasProductId && !productKeys.has(productKey) && !seenProducts.has(productKey)) {
          seenProducts.add(productKey);
          unknownProducts.push({ name: productName, orderKey: order.orderKey, price: item.price, unit: item.product?.unit || 'phần' });
        }
      });
    });

    return { unknownCustomers, unknownProducts };
  };

  // Submit đơn hàng cửa hàng lên API
  const handleSubmit = async (allowNewEntries = false, confirmedWarning = false) => {
    if (!allowNewEntries && (loading || isSubmittingRef.current)) return;

    for (const order of orders) {
      if (!order.selectedCustomerId) {
        if (!order.customerName || !order.customerName.trim()) {
          setError(`Vui lòng chọn bàn ăn cho hóa đơn [${order.ticketLabel || 'Chưa đặt tên'}].`);
          return;
        }
      }
      for (const item of order.items) {
        if (item.quantity <= 0) {
          setError(`Số lượng của ${item.product?.name || 'món ăn'} phải lớn hơn 0.`);
          return;
        }
        if (item.price <= 0) {
          setError(`Đơn giá của ${item.product?.name || 'món ăn'} trong hóa đơn phải lớn hơn 0.`);
          return;
        }
      }
    }

    const { unknownCustomers, unknownProducts } = findUnknownEntries();
    if ((unknownCustomers.length || unknownProducts.length) && !allowNewEntries) {
      const customerText = unknownCustomers.length
        ? `Bàn ăn chưa có trong danh sách:\n- ${unknownCustomers.map((entry) => entry.name).join('\n- ')}`
        : '';
      const productText = unknownProducts.length
        ? `Món ăn thực đơn chưa có trong danh sách:\n- ${unknownProducts.map((entry) => entry.name).join('\n- ')}`
        : '';

      isSubmittingRef.current = true;
      setLoading(true);
      popupModalRef.current?.show({
        type: 'confirm',
        title: 'Phát hiện dữ liệu mới',
        message: `${customerText}${customerText && productText ? '\n\n' : ''}${productText}\n\nBạn có muốn tạo mới và tiếp tục ghi hóa đơn không?`,
        confirmText: 'Tạo mới và ghi hóa đơn',
        cancelText: 'Kiểm tra lại',
        onConfirm: () => handleSubmit(true, true),
        onCancel: () => {
          setLoading(false);
          isSubmittingRef.current = false;
        },
      });
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;

    try {
      const customerByName = new Map(customers.map((c) => [getNameKey(c.name), c.id]));
      const productByName = new Map(products.map((p) => [getNameKey(p.name), p]));

      if (allowNewEntries) {
        const { unknownCustomers, unknownProducts } = findUnknownEntries();
        for (const entry of unknownCustomers) {
          const customerResponse = await api.post('/store/customers', {
            name: entry.name,
            isBadDebt: false,
          });
          const newCustomer = customerResponse.data?.data;
          if (!newCustomer?.id) throw new Error(`Không thể tạo bàn "${entry.name}".`);
          customerByName.set(getNameKey(entry.name), newCustomer.id);
          setCustomers((prev) => [...prev, newCustomer]);
        }

        for (const entry of unknownProducts) {
          const productResponse = await api.post('/store/products', {
            name: entry.name,
            defaultPrice: entry.price,
            unit: entry.unit || 'phần',
          });
          const newProduct = productResponse.data?.data;
          if (!newProduct?.id) throw new Error(`Không thể tạo món ăn "${entry.name}".`);
          productByName.set(getNameKey(entry.name), newProduct);
          setProducts((prev) => [...prev, newProduct]);
        }
      }

      // Tạo các hóa đơn
      for (const order of orders) {
        let customerId = order.selectedCustomerId || customerByName.get(getNameKey(order.customerName));
        if (!customerId) throw new Error(`Không thể xác định bàn ăn cho hóa đơn này.`);

        const payloadItems = order.items.map((item) => {
          let productId = item.selectedProductId;
          if (!productId && item.product?.name) {
            const prod = productByName.get(getNameKey(item.product.name));
            productId = prod?.id || null;
          }
          return {
            productId,
            productName: item.product?.name || 'Món lẻ',
            quantity: item.quantity,
            price: item.price,
          };
        });

        await api.post('/store/transactions', {
          customerId,
          date: order.voiceDate,
          note: note ? note.trim() : null,
          items: payloadItems,
        });
      }

      setVisible(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Lỗi ghi hóa đơn nợ.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>{modalTitleText}</Text>
          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          <ScrollView ref={mainScrollRef} style={{ flex: 1, marginBottom: 12 }} keyboardShouldPersistTaps="handled">
            {orders.map((order) => (
              <View key={order.orderKey}>
                <BillOrder
                  order={order}
                  customers={customers}
                  products={products}
                  onUpdateOrder={(updates) => handleUpdateOrder(order.orderKey, updates)}
                  onUpdateItem={(tempId, updates) => handleUpdateItem(order.orderKey, tempId, updates)}
                  onRemoveItem={(tempId) => handleRemoveItem(order.orderKey, tempId)}
                  onAddItem={handleAddItem}
                  onAddQuickDebtItem={handleAddQuickDebtItem}
                />
              </View>
            ))}

            {orders.length > 0 && (
              <View style={styles.noteCard}>
                <Text style={styles.label}>📝 Ghi chú chung cho toàn bộ đơn hàng này:</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Ví dụ: Khách thanh toán bằng chuyển khoản, phục vụ ca tối..."
                  placeholderTextColor={COLORS.textLight}
                  value={note}
                  onChangeText={setNote}
                  multiline={true}
                  numberOfLines={2}
                />
              </View>
            )}
          </ScrollView>

          <View style={styles.footerButtons}>
            <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={() => handleSubmit()} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.submitButtonText}>LƯU HÓA ĐƠN 💾</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setVisible(false)} disabled={loading}>
              <Text style={styles.cancelButtonText}>ĐÓNG LẠI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>
      <StorePopupModal ref={popupModalRef} />
    </>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '95%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: '#5B21B6',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  debtOrderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginBottom: 12,
    ...SHADOWS.card,
    overflow: 'hidden',
  },
  debtOrderHeaderCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8F5FF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9FE',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  headerRightClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderTotalCompact: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#5B21B6',
  },
  expandIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  orderContent: {
    padding: 12,
  },
  orderImageWrapperInline: {
    width: '100%',
    height: 150,
    backgroundColor: '#000',
    borderRadius: 8,
    marginBottom: 10,
  },
  orderMainImageInline: {
    width: '100%',
    height: '100%',
  },
  ticketMetadataRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  customerSelectCompact: {
    height: 38,
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 4,
  },
  headerCol: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  debtItemsList: {
    marginBottom: 8,
  },
  debtItemRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  numInputCompact: {
    backgroundColor: COLORS.inputBg,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    fontSize: 13,
    color: COLORS.text,
    textAlign: 'center',
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
    color: COLORS.dangerDark,
    fontSize: 12,
    fontWeight: 'bold',
  },
  addOrderButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  btnQuickDebtCompact: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#D8B4FE',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  btnQuickDebtCompactText: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnAddItemCompact: {
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  btnAddItemCompactText: {
    color: '#5B21B6',
    fontSize: 12,
    fontWeight: 'bold',
  },
  selectWrapper: {
    position: 'relative',
    width: '100%',
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
  },
  selectTriggerCompact: {
    height: 36,
    borderRadius: 6,
  },
  selectTriggerOpen: {
    borderColor: '#5B21B6',
  },
  selectTriggerInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
  },
  selectTriggerTextCompact: {
    fontSize: 13,
  },
  selectPlaceholder: {
    color: COLORS.textLight,
  },
  selectArrow: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginLeft: 6,
  },
  selectDropdown: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    maxHeight: 180,
    zIndex: 9999,
    elevation: 9999,
    ...SHADOWS.card,
  },
  selectDropdownScroll: {
    flex: 1,
  },
  selectEmptyText: {
    padding: 10,
    textAlign: 'center',
    color: COLORS.textLight,
    fontStyle: 'italic',
    fontSize: 13,
  },
  selectOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectOptionCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  selectOptionText: {
    fontSize: 14,
    color: COLORS.text,
  },
  customerOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productOptionPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  noteCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.text,
    marginTop: 6,
    minHeight: 50,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    height: 46,
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
    fontSize: 15,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#5B21B6',
    shadowColor: '#5B21B6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

export default ScanInvoiceModal;
