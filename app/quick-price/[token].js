// meat-management-fe/app/quick-price/[token].js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../src/api/client';
import { showGlobalToast } from '../../src/store/toastStore';
import { COLORS, SHADOWS } from '../../src/theme';
import DatePickerInput from '../../src/components/DatePickerInput';
import MoneyInput from '../../src/components/MoneyInput';
import PopupModal from '../../src/components/PopupModal';
import AnimatedPressable from '../../src/components/AnimatedPressable';
import CustomerMultiSelectModal from '../../src/components/CustomerMultiSelectModal';
import CustomSelect from '../../src/components/CustomSelect';

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

// Lấy ngày hôm nay định dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Lấy ngày mai định dạng DD/MM/YYYY
const getTomorrowFormatted = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = String(tomorrow.getDate()).padStart(2, '0');
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const y = today => tomorrow.getFullYear();
  return `${d}/${m}/${tomorrow.getFullYear()}`;
};

export default function QuickPriceScreen() {
  const { token } = useLocalSearchParams();

  // State thông tin link và dữ liệu gốc từ backend
  const [linkInfo, setLinkInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State xác thực mã PIN (nếu link có cài đặt mã PIN)
  const [pin, setPin] = useState('');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Ngày bắt đầu áp dụng bảng giá mới (mặc định là hôm nay)
  const [effectiveDate, setEffectiveDate] = useState(getTodayFormatted());

  // Danh sách các khách hàng được chọn
  const [selectedCustomers, setSelectedCustomers] = useState([]);

  // Bộ nhớ cache bảng giá riêng hiện có của từng khách hàng: { [customerId]: Map<productId, price> }
  const [customerPricesMap, setCustomerPricesMap] = useState({});
  const [loadingPriceCustomerIds, setLoadingPriceCustomerIds] = useState(new Set());

  // Danh sách các món thịt đang mở sửa của từng khách: { [customerId]: editedMeatItem[] }
  const [editingItemsMap, setEditingItemsMap] = useState({});

  // Trạng thái đang lưu và tính lại đơn nợ
  const [submitting, setSubmitting] = useState(false);

  // State quản lý dropdown tìm thịt của khách nào đang mở
  const [activeDropdownCustId, setActiveDropdownCustId] = useState(null);

  // Refs điều khiển modal
  const custSelectModalRef = useRef(null);
  const popupRef = useRef(null);

  // Tải dữ liệu ban đầu từ Backend khi mở link
  const fetchLinkData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/quick-price/public/info/${token}`);
      if (res.data?.success) {
        setLinkInfo(res.data.data);
        if (!res.data.data.hasPin) {
          setIsPinVerified(true);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải thông tin link cập nhật giá:', err);
      setError(err.response?.data?.message || 'Đường dẫn không tồn tại hoặc đã bị khóa.');
    } finally {
      setLoading(false);
    }
  };

  // Cập nhật tiêu đề tab trình duyệt web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Cập nhật giá thịt';
    }
  }, []);

  useEffect(() => {
    fetchLinkData();
  }, [token]);

  // Xác thực mã PIN
  const handleVerifyPin = async () => {
    if (!pin || pin.length < 4) {
      showGlobalToast('Vui lòng nhập đầy đủ mã PIN 4 số.', 'warning');
      return;
    }
    try {
      setVerifyingPin(true);
      const res = await api.post(`/quick-price/public/verify-pin/${token}`, { pin });
      if (res.data?.success) {
        setIsPinVerified(true);
        showGlobalToast('Xác thực mã PIN thành công!', 'success');
      }
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Mã PIN không chính xác.', 'error');
    } finally {
      setVerifyingPin(false);
    }
  };

  // Tải bảng giá riêng của 1 khách hàng (nếu chưa có trong cache)
  const ensureCustomerPricesLoaded = async (customerId) => {
    if (customerPricesMap[customerId]) {
      return customerPricesMap[customerId];
    }

    try {
      setLoadingPriceCustomerIds((prev) => new Set(prev).add(customerId));
      const res = await api.get(`/quick-price/public/customer-prices/${token}/${customerId}`);
      const priceMap = new Map();
      if (res.data?.success && Array.isArray(res.data.data)) {
        res.data.data.forEach((cp) => {
          priceMap.set(cp.productId, cp.price);
        });
      }
      setCustomerPricesMap((prev) => ({ ...prev, [customerId]: priceMap }));
      return priceMap;
    } catch (err) {
      console.error(`Lỗi khi tải giá riêng của khách ${customerId}:`, err);
      return new Map();
    } finally {
      setLoadingPriceCustomerIds((prev) => {
        const next = new Set(prev);
        next.delete(customerId);
        return next;
      });
    }
  };

  // Mở modal chọn nhiều khách hàng
  const handleOpenCustomerSelectModal = () => {
    custSelectModalRef.current?.open({
      customers: linkInfo?.customers || [],
      currentSelectedIds: selectedCustomers.map((c) => c.id),
      onConfirm: (newSelectedCustomers) => {
        setSelectedCustomers(newSelectedCustomers);
        // Tải trước giá riêng cho các khách hàng vừa được chọn
        newSelectedCustomers.forEach((c) => {
          ensureCustomerPricesLoaded(c.id);
        });
      },
    });
  };

  // Xóa một khách hàng khỏi danh sách chọn
  const handleRemoveCustomer = (customerId) => {
    const cust = selectedCustomers.find((c) => c.id === customerId);
    const editedItems = editingItemsMap[customerId] || [];
    const hasEdited = editedItems.some((it) => it.isEdited);

    if (hasEdited) {
      popupRef.current?.show({
        type: 'confirm',
        title: '⚠️ Bỏ Khách Hàng Này?',
        message: `Khách hàng "${cust?.name}" đang có món thịt được sửa giá nhưng chưa lưu. Anh chủ có chắc muốn bỏ khách hàng này không?`,
        confirmText: 'Đồng ý bỏ',
        cancelText: 'Giữ lại',
        onConfirm: () => {
          setSelectedCustomers((prev) => prev.filter((c) => c.id !== customerId));
        },
      });
      return;
    }

    setSelectedCustomers((prev) => prev.filter((c) => c.id !== customerId));
  };

  // Thêm một món thịt vào danh sách sửa của một khách hàng
  const handleAddMeatToCustomer = (customerId, product, priceMap) => {
    const currentItems = editingItemsMap[customerId] || [];
    const exists = currentItems.some((it) => it.productId === product.id);
    if (exists) {
      showGlobalToast(`Món "${product.name}" đã có trong danh sách sửa.`, 'info');
      return;
    }

    const hasCustom = priceMap.has(product.id);
    const origPrice = hasCustom ? priceMap.get(product.id) : product.defaultPrice;

    const newItem = {
      productId: product.id,
      name: product.name,
      customName: product.name,
      unit: product.unit || 'kg',
      defaultPrice: product.defaultPrice,
      originalPrice: origPrice,
      currentPrice: origPrice,
      hasCustomPrice: hasCustom,
      resetToDefault: false,
      isEdited: false,
      isEditingName: false,
    };

    setEditingItemsMap((prev) => ({
      ...prev,
      [customerId]: [...(prev[customerId] || []), newItem],
    }));

    showGlobalToast(`Đã thêm "${product.name}" vào danh sách sửa!`, 'info');
  };

  // Cập nhật giá mới cho món thịt của một khách hàng
  const handlePriceChange = (customerId, productId, newPriceValue) => {
    setEditingItemsMap((prev) => {
      const items = prev[customerId] || [];
      const updated = items.map((item) => {
        if (item.productId !== productId) return item;
        const numVal = typeof newPriceValue === 'number' ? newPriceValue : parseFloat(newPriceValue) || 0;
        const isChanged = numVal !== item.originalPrice || item.customName !== item.name;
        return {
          ...item,
          currentPrice: numVal,
          resetToDefault: false,
          isEdited: isChanged,
        };
      });
      return { ...prev, [customerId]: updated };
    });
  };

  // Cập nhật tên thịt riêng cho một khách hàng
  const handleNameChange = (customerId, productId, newName) => {
    setEditingItemsMap((prev) => {
      const items = prev[customerId] || [];
      const updated = items.map((item) => {
        if (item.productId !== productId) return item;
        const isChanged = newName.trim() !== item.name || item.currentPrice !== item.originalPrice;
        return {
          ...item,
          customName: newName,
          isEdited: isChanged,
        };
      });
      return { ...prev, [customerId]: updated };
    });
  };

  // Bật/tắt chế độ sửa tên thịt
  const toggleEditName = (customerId, productId) => {
    setEditingItemsMap((prev) => {
      const items = prev[customerId] || [];
      const updated = items.map((item) => {
        if (item.productId !== productId) return item;
        return {
          ...item,
          isEditingName: !item.isEditingName,
        };
      });
      return { ...prev, [customerId]: updated };
    });
  };

  // Khôi phục món thịt về giá sạp niêm yết mặc định
  const handleResetToDefault = (customerId, productId) => {
    setEditingItemsMap((prev) => {
      const items = prev[customerId] || [];
      const updated = items.map((item) => {
        if (item.productId !== productId) return item;
        return {
          ...item,
          currentPrice: item.defaultPrice,
          resetToDefault: true,
          isEdited: true,
        };
      });
      return { ...prev, [customerId]: updated };
    });
    showGlobalToast('Đã chọn khôi phục về giá sạp mặc định.', 'info');
  };

  // Xóa món thịt khỏi danh sách sửa của khách hàng
  const handleRemoveMeatItem = (customerId, productId) => {
    setEditingItemsMap((prev) => {
      const items = prev[customerId] || [];
      return {
        ...prev,
        [customerId]: items.filter((it) => it.productId !== productId),
      };
    });
  };

  // Tính tổng số món thịt đang được sửa trên tất cả các khách
  const totalChangedItems = useMemo(() => {
    let count = 0;
    Object.values(editingItemsMap).forEach((items) => {
      if (Array.isArray(items)) {
        count += items.filter((it) => it.isEdited).length;
      }
    });
    return count;
  }, [editingItemsMap]);

  // Danh sách các khách hàng có món thịt được thay đổi
  const affectedCustomers = useMemo(() => {
    return selectedCustomers.filter((cust) => {
      const items = editingItemsMap[cust.id] || [];
      return items.some((it) => it.isEdited);
    });
  }, [selectedCustomers, editingItemsMap]);

  // Xử lý khi bấm nút "ÁP DỤNG GIÁ MỚI & CẬP NHẬT ĐƠN NỢ"
  const handleApplyPress = () => {
    if (totalChangedItems === 0) {
      showGlobalToast('Chưa có món thịt nào được điều chỉnh giá.', 'info');
      return;
    }

    // Soạn tóm tắt cho popup xác nhận
    const customerSummaries = affectedCustomers
      .map((c) => {
        const changed = (editingItemsMap[c.id] || []).filter((it) => it.isEdited);
        return `• ${c.name}: ${changed.length} món thịt`;
      })
      .join('\n');

    popupRef.current?.show({
      type: 'confirm',
      title: '🥩 Xác Nhận Áp Dụng Bảng Giá Mới',
      message:
        `Anh chủ xác nhận áp dụng giá mới cho ${affectedCustomers.length} khách hàng?\n\n` +
        `📅 Ngày bắt đầu áp dụng: ${effectiveDate}\n\n` +
        `Chi tiết thay đổi:\n${customerSummaries}\n\n` +
        `⚠️ LƯU Ý QUAN TRỌNG: Tất cả đơn nợ của các khách hàng này từ ngày ${effectiveDate} trở về sau có chứa các món thịt này sẽ được TỰ ĐỘNG TÍNH LẠI tiền theo giá mới. Toàn bộ đơn nợ trước ngày ${effectiveDate} được BẢO TOÀN NGUYÊN VẸN 100%.`,
      confirmText: 'Đồng ý áp dụng',
      cancelText: 'Xem lại',
      onConfirm: async () => {
        await executeApplyAll();
      },
    });
  };

  // Thực thi gửi request lưu giá cho các khách hàng có thay đổi
  const executeApplyAll = async () => {
    try {
      setSubmitting(true);
      let totalRecalculated = 0;
      let successCount = 0;

      for (const cust of affectedCustomers) {
        const changedItems = (editingItemsMap[cust.id] || []).filter((it) => it.isEdited);
        if (changedItems.length === 0) continue;

        const payload = {
          customerId: cust.id,
          effectiveDate,
          pin: linkInfo?.hasPin ? pin : undefined,
          items: changedItems.map((item) => ({
            productId: item.productId,
            price: item.resetToDefault ? null : item.currentPrice,
            productName: item.customName.trim() !== item.name ? item.customName.trim() : undefined,
            resetToDefault: item.resetToDefault,
          })),
        };

        const res = await api.post(`/quick-price/public/apply/${token}`, payload);
        if (res.data?.success) {
          successCount += 1;
          totalRecalculated += res.data.data?.recalculatedCount || 0;

          // Cập nhật lại cache giá riêng của khách này
          const newPriceMap = new Map(customerPricesMap[cust.id] || new Map());
          changedItems.forEach((it) => {
            if (it.resetToDefault) {
              newPriceMap.delete(it.productId);
            } else {
              newPriceMap.set(it.productId, it.currentPrice);
            }
          });
          setCustomerPricesMap((prev) => ({ ...prev, [cust.id]: newPriceMap }));
        }
      }

      // Reset toàn bộ fields sau khi lưu thành công theo yêu cầu của người dùng
      setSelectedCustomers([]);
      setEditingItemsMap({});
      setActiveDropdownCustId(null);

      showGlobalToast(
        `Đã lưu giá mới cho ${successCount} khách hàng và tự động tính lại ${totalRecalculated} đơn nợ!`,
        'success'
      );
    } catch (err) {
      console.error('Lỗi khi áp dụng giá riêng:', err);
      showGlobalToast(err.response?.data?.message || 'Lỗi khi lưu bảng giá.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── GIAO DIỆN KHI ĐANG TẢI LINK HOẶC CÓ LỖI ───
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Đang tải thông tin bảng giá...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Không thể truy cập</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // ─── GIAO DIỆN NHẬP MÃ PIN NẾU LINK YÊU CẦU ───
  if (linkInfo?.hasPin && !isPinVerified) {
    return (
      <View style={styles.pinContainer}>
        <View style={styles.pinCard}>
          <Text style={styles.pinIcon}>🔒</Text>
          <Text style={styles.pinTitle}>Mã PIN Bảo Mật</Text>
          <Text style={styles.pinSubtitle}>
            Đường dẫn này được cài mã PIN bảo mật. Vui lòng nhập mã PIN 4 số để tiếp tục.
          </Text>

          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={(text) => setPin(text.replace(/[^0-9]/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry={true}
            placeholder="••••"
            placeholderTextColor="#94A3B8"
            autoFocus={true}
          />

          <TouchableOpacity
            style={[styles.pinButton, verifyingPin && styles.buttonDisabled]}
            onPress={handleVerifyPin}
            disabled={verifyingPin}
          >
            {verifyingPin ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.pinButtonText}>XÁC THỰC MÃ PIN</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── GIAO DIỆN CHÍNH: CHỌN NHIỀU KHÁCH & TÌM THỊT THEO TỪNG KHÁCH ───
  return (
    <View style={styles.container}>
      {/* ── HEADER CỐ ĐỊNH ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerIcon}>🥩</Text>
            <View>
              <Text style={styles.headerTitle}>CẬP NHẬT GIÁ BÁN RIÊNG</Text>
              <Text style={styles.headerSubtitle}>
                {linkInfo?.ownerName ? `Sạp thịt: ${linkInfo.ownerName}` : 'Cập nhật giá bán'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── PHẦN ĐIỀU KHIỂN CỐ ĐỊNH Ở TRÊN ── */}
      <View style={styles.fixedTopSection}>
        {/* 1. Chọn ngày áp dụng */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>📅 Ngày bắt đầu áp dụng đơn giá mới</Text>
            <View style={styles.quickDateRow}>
              <TouchableOpacity
                style={[styles.quickDateBtn, effectiveDate === getTodayFormatted() && styles.quickDateBtnActive]}
                onPress={() => setEffectiveDate(getTodayFormatted())}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    effectiveDate === getTodayFormatted() && styles.quickDateTextActive,
                  ]}
                >
                  Hôm nay
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickDateBtn, effectiveDate === getTomorrowFormatted() && styles.quickDateBtnActive]}
                onPress={() => setEffectiveDate(getTomorrowFormatted())}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    effectiveDate === getTomorrowFormatted() && styles.quickDateTextActive,
                  ]}
                >
                  Ngày mai
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <DatePickerInput
            value={effectiveDate}
            onChange={(val) => setEffectiveDate(val)}
            compact={true}
          />

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              💡 <Text style={{ fontWeight: '700' }}>Nguyên tắc:</Text> Đơn nợ từ ngày{' '}
              <Text style={{ fontWeight: '700', color: COLORS.primary }}>{effectiveDate}</Text> về sau sẽ tự động tính lại tiền. Toàn bộ đơn nợ trước ngày này được giữ nguyên 100%.
            </Text>
          </View>
        </View>

        {/* 2. Khối chọn khách hàng (Mở modal chọn nhiều khách) */}
        <View style={styles.sectionCard}>
          <View style={styles.custSelectHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>🏪 Khách hàng / Cửa hàng cần chỉnh giá</Text>
              <Text style={styles.custSelectCountMeta}>
                {selectedCustomers.length === 0
                  ? 'Chưa chọn khách hàng nào'
                  : `Đã chọn ${selectedCustomers.length} khách hàng`}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.openCustSelectBtn}
              onPress={handleOpenCustomerSelectModal}
              activeOpacity={0.8}
            >
              <Text style={styles.openCustSelectBtnText}>
                {selectedCustomers.length === 0 ? '+ Chọn khách hàng' : '✏️ Thay đổi / Thêm'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Hiển thị chip tag các khách hàng đã chọn để dễ nhìn */}
          {selectedCustomers.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.custChipsScroll}>
              <View style={styles.custChipsRow}>
                {selectedCustomers.map((c) => {
                  const items = editingItemsMap[c.id] || [];
                  const editedCount = items.filter((it) => it.isEdited).length;
                  return (
                    <View key={c.id} style={styles.custChipItem}>
                      <Text style={styles.custChipName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {editedCount > 0 && (
                        <View style={styles.custChipBadge}>
                          <Text style={styles.custChipBadgeText}>{editedCount}</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => handleRemoveCustomer(c.id)}
                        style={styles.custChipRemoveBtn}
                      >
                        <Text style={styles.custChipRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {/* ── PHẦN CUỘN DUY NHẤT: DANH SÁCH CÁC KHÁCH HÀNG ĐÃ CHỌN ── */}
      <View style={styles.mainScrollContainer}>
        {selectedCustomers.length === 0 ? (
          <View style={styles.placeholderWrap}>
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderIcon}>👆</Text>
              <Text style={styles.placeholderTitle}>Chưa chọn Khách hàng nào</Text>
              <Text style={styles.placeholderDesc}>
                Vui lòng bấm nút <Text style={{ fontWeight: '700', color: COLORS.primary }}>"+ Chọn khách hàng"</Text> ở trên để chọn một hoặc nhiều cửa hàng cần chỉnh đơn giá thịt.
              </Text>
              <TouchableOpacity
                style={styles.placeholderActionButton}
                onPress={handleOpenCustomerSelectModal}
              >
                <Text style={styles.placeholderActionButtonText}>🏪 CHỌN KHÁCH HÀNG NGAY</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView
            style={styles.mainScrollView}
            contentContainerStyle={styles.mainScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            {selectedCustomers.map((cust) => {
              const items = editingItemsMap[cust.id] || [];
              const editedCount = items.filter((it) => it.isEdited).length;
              const isDropdownActive = activeDropdownCustId === cust.id;

              return (
                <View
                  key={cust.id}
                  style={[
                    styles.customerCard,
                    isDropdownActive && { zIndex: 999999, elevation: 999999 },
                  ]}
                >
                  {/* Header thẻ khách hàng */}
                  <View style={styles.customerCardHeader}>
                    <View style={styles.customerCardTitleCol}>
                      <View style={styles.customerCardNameRow}>
                        <Text style={styles.customerStoreIcon}>🏪</Text>
                        <Text style={styles.customerCardName}>{cust.name}</Text>
                      </View>
                      {Boolean(cust.phone || cust.address) && (
                        <Text style={styles.customerCardMeta} numberOfLines={1}>
                          {[cust.phone, cust.address].filter(Boolean).join(' • ')}
                        </Text>
                      )}
                    </View>

                    <View style={styles.customerCardHeaderRight}>
                      {editedCount > 0 && (
                        <View style={styles.customerEditedBadge}>
                          <Text style={styles.customerEditedBadgeText}>Đã đổi {editedCount} món</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.customerRemoveBtn}
                        onPress={() => handleRemoveCustomer(cust.id)}
                      >
                        <Text style={styles.customerRemoveBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Ô tìm kiếm & thêm thịt dạng dropdown trực tiếp (không mở modal) */}
                  <View
                    style={[
                      styles.searchMeatTriggerRow,
                      isDropdownActive && { zIndex: 999999, elevation: 999999 },
                    ]}
                  >
                    <CustomSelect
                      value={null}
                      placeholder={`🔍 Gõ tìm & thêm loại thịt cho ${cust.name}...`}
                      options={linkInfo?.products || []}
                      getOptionLabel={(p) => p?.name || ''}
                      renderSelected={() => ''}
                      renderOption={(prod) => {
                        const priceMap = customerPricesMap[cust.id] || new Map();
                        const hasCustom = priceMap.has(prod.id);
                        const currentPrice = hasCustom ? priceMap.get(prod.id) : prod.defaultPrice;
                        const isAdded = (editingItemsMap[cust.id] || []).some(
                          (it) => it.productId === prod.id
                        );

                        return (
                          <View style={styles.meatOptionRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.meatOptionName, isAdded && styles.meatOptionNameAdded]}>
                                🥩 {prod.name}
                              </Text>
                              <Text style={styles.meatOptionMeta}>
                                {hasCustom ? (
                                  <Text style={styles.customPriceText}>
                                    Giá riêng: {formatCurrency(currentPrice)}
                                  </Text>
                                ) : (
                                  <Text style={styles.defaultPriceText}>
                                    Giá sạp: {formatCurrency(prod.defaultPrice)}
                                  </Text>
                                )}
                                {Boolean(prod.unit) && ` / ${prod.unit}`}
                              </Text>
                            </View>
                            {isAdded ? (
                              <View style={styles.optionAddedBadge}>
                                <Text style={styles.optionAddedText}>Đang sửa</Text>
                              </View>
                            ) : (
                              <View style={styles.optionAddBtn}>
                                <Text style={styles.optionAddBtnText}>+ Thêm</Text>
                              </View>
                            )}
                          </View>
                        );
                      }}
                      onSelect={(prod) => {
                        const priceMap = customerPricesMap[cust.id] || new Map();
                        handleAddMeatToCustomer(cust.id, prod, priceMap);
                      }}
                      compact={true}
                      zIndex={999999}
                      onOpenChange={(isOpen) => {
                        setActiveDropdownCustId(isOpen ? cust.id : null);
                        if (isOpen) {
                          ensureCustomerPricesLoaded(cust.id);
                        }
                      }}
                    />
                  </View>

                  {/* Danh sách các món thịt đang sửa của khách này (chỉ hiển thị món đã chọn) */}
                  {items.length === 0 ? (
                    <View style={styles.emptyCustomerMeatsWrap}>
                      <Text style={styles.emptyCustomerMeatsText}>
                        Chưa có món thịt nào được chọn. Bấm nút tìm thịt ở trên để chọn loại thịt cần đổi giá.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.customerMeatList}>
                      {items.map((item) => {
                        const isEdited = item.isEdited;
                        const hasCustom = item.hasCustomPrice;

                        return (
                          <View
                            key={item.productId}
                            style={[
                              styles.meatItemCard,
                              isEdited && styles.meatItemCardEdited,
                            ]}
                          >
                            {/* Cột trái: Tên thịt + Giá hiện tại & Nút về mặc định */}
                            <View style={styles.meatItemLeftCol}>
                              <View style={styles.meatNameWrap}>
                                {item.isEditingName ? (
                                  <View style={styles.nameEditWrap}>
                                    <TextInput
                                      style={styles.nameEditInput}
                                      value={item.customName}
                                      onChangeText={(val) => handleNameChange(cust.id, item.productId, val)}
                                      placeholder="Tên thịt..."
                                      autoFocus={true}
                                    />
                                    <TouchableOpacity
                                      style={styles.nameEditConfirmBtn}
                                      onPress={() => toggleEditName(cust.id, item.productId)}
                                    >
                                      <Text style={styles.nameEditConfirmText}>✓</Text>
                                    </TouchableOpacity>
                                  </View>
                                ) : (
                                  <View style={styles.nameDisplayRow}>
                                    <Text style={styles.meatNameText}>{item.customName}</Text>
                                    <TouchableOpacity
                                      style={styles.editNameBtn}
                                      onPress={() => toggleEditName(cust.id, item.productId)}
                                    >
                                      <Text style={styles.editNameBtnText}>✏️</Text>
                                    </TouchableOpacity>
                                    {item.customName !== item.name && (
                                      <Text style={styles.originalNameText}>({item.name})</Text>
                                    )}
                                  </View>
                                )}
                              </View>

                              {/* Giá hiện tại */}
                              <View style={styles.meatMetaRow}>
                                <Text style={styles.currentPriceLabel}>
                                  {hasCustom ? (
                                    <Text style={styles.currentPriceCustomText}>
                                      Giá riêng: <Text style={{ fontWeight: '700' }}>{formatCurrency(item.originalPrice)}</Text>
                                    </Text>
                                  ) : (
                                    <Text style={styles.currentPriceDefaultText}>
                                      Giá sạp: {formatCurrency(item.defaultPrice)}
                                    </Text>
                                  )}
                                </Text>
                              </View>
                            </View>

                            {/* Cột phải: Ô nhập giá mới + Nút xóa ✕ */}
                            <View style={styles.meatItemRightCol}>
                              <View style={styles.moneyInputCol}>
                                <MoneyInput
                                  value={item.currentPrice}
                                  onChangeValue={(val) => handlePriceChange(cust.id, item.productId, val)}
                                  placeholder="Đơn giá mới"
                                  textAlign="right"
                                  style={styles.moneyInputWrap}
                                  inputStyle={[
                                    styles.moneyInputField,
                                    isEdited && styles.moneyInputFieldEdited,
                                  ]}
                                />
                              </View>

                              <TouchableOpacity
                                style={styles.removeMeatBtn}
                                onPress={() => handleRemoveMeatItem(cust.id, item.productId)}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Text style={styles.removeMeatBtnText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── FOOTER CỐ ĐỊNH CHỨA NÚT ÁP DỤNG ĐỒNG LOẠT ── */}
      {selectedCustomers.length > 0 && (
        <View style={styles.bottomBar}>
          <View style={styles.bottomSummary}>
            <Text style={styles.bottomSummaryLabel}>Ngày áp dụng: {effectiveDate}</Text>
            <Text style={styles.bottomSummaryCount}>
              Đang sửa: <Text style={{ fontWeight: '700', color: COLORS.primary }}>{totalChangedItems}</Text> món trên{' '}
              <Text style={{ fontWeight: '700', color: COLORS.primary }}>{affectedCustomers.length}</Text> khách
            </Text>
          </View>

          <AnimatedPressable
            style={[
              styles.applyButton,
              (totalChangedItems === 0 || submitting) && styles.buttonDisabled,
            ]}
            onPress={handleApplyPress}
            disabled={totalChangedItems === 0 || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.applyButtonText}>
                {totalChangedItems > 0
                  ? `💾 ÁP DỤNG GIÁ MỚI (${totalChangedItems} MÓN - ${affectedCustomers.length} KHÁCH HÀNG)`
                  : 'CHƯA CÓ MÓN NÀO THAY ĐỔI GIÁ'}
              </Text>
            )}
          </AnimatedPressable>
        </View>
      )}

      {/* ── CÁC MODAL ĐỘC LẬP Ở TẦNG CAO NHẤT (THEO USER RULES) ── */}
      <CustomerMultiSelectModal ref={custSelectModalRef} />
      <PopupModal ref={popupRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    height: Platform.OS === 'web' ? '100vh' : '100%',
    maxHeight: Platform.OS === 'web' ? '100vh' : '100%',
    overflow: 'hidden',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#475569',
    fontWeight: '500',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  errorText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },

  // ─── PIN STYLES ───
  pinContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0F172A',
  },
  pinCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  pinIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  pinTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  pinSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  pinInput: {
    width: '100%',
    height: 52,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    color: '#0F172A',
    marginBottom: 20,
  },
  pinButton: {
    width: '100%',
    height: 48,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // ─── HEADER STYLES ───
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 14 : 44,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    fontSize: 28,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },

  // ─── PHẦN ĐIỀU KHIỂN CỐ ĐỊNH Ở TRÊN ───
  fixedTopSection: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
    backgroundColor: '#F1F5F9',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 4,
  },
  quickDateBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  quickDateBtnActive: {
    backgroundColor: COLORS.primary,
  },
  quickDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickDateTextActive: {
    color: '#FFFFFF',
  },
  noteBox: {
    marginTop: 4,
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 2.5,
    borderLeftColor: COLORS.primary,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  noteText: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 14,
  },

  // ─── CUSTOMER SELECT HEADER ───
  custSelectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  custSelectCountMeta: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  openCustSelectBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  openCustSelectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  custChipsScroll: {
    marginTop: 8,
  },
  custChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  custChipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  custChipName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3730A3',
    maxWidth: 140,
  },
  custChipBadge: {
    backgroundColor: '#4338CA',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  custChipBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  custChipRemoveBtn: {
    padding: 2,
  },
  custChipRemoveText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#6366F1',
  },

  // ─── PHẦN CUỘN CHÍNH ───
  mainScrollContainer: {
    flex: 1,
    minHeight: 0,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  mainScrollView: {
    flex: 1,
    minHeight: 0,
  },
  mainScrollContent: {
    paddingBottom: 120, // Đệm đáy để không bị bottomBar che khuất
    gap: 10,
  },

  // ─── THẺ KHÁCH HÀNG ───
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    ...SHADOWS.small,
  },
  customerCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  customerCardTitleCol: {
    flex: 1,
  },
  customerCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerStoreIcon: {
    fontSize: 16,
  },
  customerCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  customerCardMeta: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  customerCardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  customerEditedBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  customerEditedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  customerRemoveBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerRemoveBtnText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: 'bold',
  },

  // ─── DROPDOWN TÌM VÀ THÊM THỊT ───
  searchMeatTriggerRow: {
    marginTop: 8,
    zIndex: 100,
  },
  meatOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 8,
  },
  meatOptionName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  meatOptionNameAdded: {
    color: '#64748B',
  },
  meatOptionMeta: {
    fontSize: 11.5,
    marginTop: 2,
  },
  customPriceText: {
    color: '#059669',
    fontWeight: '600',
  },
  defaultPriceText: {
    color: '#64748B',
  },
  optionAddedBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  optionAddedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338CA',
  },
  optionAddBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  optionAddBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },

  // ─── DANH SÁCH MÓN THỊT CỦA KHÁCH ───
  emptyCustomerMeatsWrap: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emptyCustomerMeatsText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  customerMeatList: {
    marginTop: 8,
    gap: 8,
  },
  meatItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  meatItemCardEdited: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  meatItemLeftCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  meatNameWrap: {
    marginBottom: 2,
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  meatNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  editNameBtn: {
    padding: 2,
  },
  editNameBtnText: {
    fontSize: 12,
  },
  originalNameText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  nameEditWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nameEditInput: {
    flex: 1,
    height: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  nameEditConfirmBtn: {
    width: 30,
    height: 30,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameEditConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  meatMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  currentPriceLabel: {
    fontSize: 11.5,
  },
  currentPriceCustomText: {
    color: '#059669',
  },
  currentPriceDefaultText: {
    color: '#64748B',
  },
  meatItemRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  moneyInputCol: {
    width: 125,
  },
  moneyInputWrap: {
    marginBottom: 0,
  },
  moneyInputField: {
    height: 36,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
  },
  moneyInputFieldEdited: {
    borderColor: '#F59E0B',
    color: '#B45309',
    backgroundColor: '#FEF3C7',
  },
  removeMeatBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMeatBtnText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: 'bold',
  },

  // ─── PLACEHOLDER KHI CHƯA CHỌN KHÁCH ───
  placeholderWrap: {
    marginTop: 10,
  },
  placeholderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  placeholderIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  placeholderDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
    maxWidth: 340,
  },
  placeholderActionButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    ...SHADOWS.small,
  },
  placeholderActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: 'bold',
  },

  // ─── FOOTER CỐ ĐỊNH ───
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 12,
    paddingBottom: Platform.OS === 'web' ? 14 : 28,
    ...SHADOWS.large,
  },
  bottomSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bottomSummaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  bottomSummaryCount: {
    fontSize: 12,
    color: '#475569',
  },
  applyButton: {
    height: 48,
    backgroundColor: '#16A34A', // Màu xanh lá nổi bật
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
