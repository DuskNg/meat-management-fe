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
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [selectedGroupProductIds, setSelectedGroupProductIds] = useState([]);

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

  // Helper: Tìm nhóm khách hàng đang chọn của một khách hàng (nếu có từ 2 khách trong nhóm đang được chọn)
  const getSelectedGroupOfCustomer = (customerId) => {
    if (!linkInfo?.groups) return null;
    return linkInfo.groups.find((grp) => {
      if (!grp.customerIds.includes(customerId)) return false;
      const selectedInGroup = grp.customerIds.filter((id) =>
        selectedCustomers.some((sc) => sc.id === id)
      );
      return selectedInGroup.length >= 2;
    });
  };

  const activeGroup = useMemo(
    () => linkInfo?.groups?.find((group) => group.id === activeGroupId) || null,
    [linkInfo?.groups, activeGroupId]
  );

  const activeGroupCustomers = useMemo(() => {
    if (!activeGroup) return [];
    return (linkInfo?.customers || []).filter((customer) => activeGroup.customerIds.includes(customer.id));
  }, [activeGroup, linkInfo?.customers]);

  const activeGroupProducts = useMemo(() => {
    const firstCustomerId = activeGroupCustomers[0]?.id;
    const items = firstCustomerId ? (editingItemsMap[firstCustomerId] || []) : [];
    return selectedGroupProductIds
      .map((productId) => items.find((item) => item.productId === productId))
      .filter(Boolean);
  }, [activeGroupCustomers, editingItemsMap, selectedGroupProductIds]);

  // Helper: Tự động tải và áp dụng các món thịt cùng 1 mức giá cho tất cả nhà hàng trong một nhóm
  const populateMeatsForGroup = async (groupCustomers, groupName = '') => {
    if (!groupCustomers || groupCustomers.length === 0) return [];

    // 1. Tải giá riêng của tất cả khách hàng trong nhóm
    const priceMapsWithCust = await Promise.all(
      groupCustomers.map(async (c) => {
        const pMap = await ensureCustomerPricesLoaded(c.id);
        return { customerId: c.id, priceMap: pMap };
      })
    );

    // 2. Gom tất cả sản phẩm có giá riêng trong nhóm và tính đơn giá chung phổ biến nhất
    const groupProductFreqPrice = new Map(); // prodId -> Map<price, count>
    priceMapsWithCust.forEach(({ priceMap }) => {
      priceMap.forEach((price, prodId) => {
        if (!groupProductFreqPrice.has(prodId)) {
          groupProductFreqPrice.set(prodId, new Map());
        }
        const freq = groupProductFreqPrice.get(prodId);
        freq.set(price, (freq.get(price) || 0) + 1);
      });
    });

    const groupCommonPrices = new Map(); // prodId -> commonPrice
    groupProductFreqPrice.forEach((freqMap, prodId) => {
      let bestPrice = null;
      let maxCount = -1;
      freqMap.forEach((count, price) => {
        if (count > maxCount) {
          maxCount = count;
          bestPrice = price;
        }
      });
      groupCommonPrices.set(prodId, bestPrice);
    });

    // 3. Xây dựng danh sách món thịt chuẩn cho cả nhóm
    const productsList = linkInfo?.products || [];
    const groupMeatItems = [];

    groupCommonPrices.forEach((price, prodId) => {
      const prod = productsList.find((p) => p.id === prodId);
      if (prod) {
        groupMeatItems.push({
          productId: prod.id,
          name: prod.name,
          customName: prod.name,
          unit: prod.unit || 'kg',
          defaultPrice: prod.defaultPrice,
          originalPrice: price,
          currentPrice: price,
          hasCustomPrice: true,
          resetToDefault: false,
          isEdited: false,
          isEditingName: false,
        });
      }
    });

    // Sắp xếp danh sách món thịt theo tên tiếng Việt
    groupMeatItems.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    // 4. Áp dụng đồng loạt danh sách món thịt cùng 1 mức giá này cho TẤT CẢ các nhà hàng trong nhóm
    setEditingItemsMap((prev) => {
      const next = { ...prev };
      groupCustomers.forEach((c) => {
        next[c.id] = groupMeatItems.map((it) => ({ ...it }));
      });
      return next;
    });

    return groupMeatItems;
  };

  // Helper: Tải và nạp danh sách món thịt riêng cho một khách hàng đơn lẻ
  const populateMeatsForSingleCustomer = async (cust) => {
    const priceMap = await ensureCustomerPricesLoaded(cust.id);
    const productsList = linkInfo?.products || [];
    const custItems = [];

    priceMap.forEach((price, prodId) => {
      const prod = productsList.find((p) => p.id === prodId);
      if (prod) {
        custItems.push({
          productId: prod.id,
          name: prod.name,
          customName: prod.name,
          unit: prod.unit || 'kg',
          defaultPrice: prod.defaultPrice,
          originalPrice: price,
          currentPrice: price,
          hasCustomPrice: true,
          resetToDefault: false,
          isEdited: false,
          isEditingName: false,
        });
      }
    });

    custItems.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    setEditingItemsMap((prev) => ({
      ...prev,
      [cust.id]: custItems,
    }));
  };

  // Mở modal chọn nhiều khách hàng
  const handleOpenCustomerSelectModal = () => {
    custSelectModalRef.current?.open({
      customers: linkInfo?.customers || [],
      groups: linkInfo?.groups || [],
      currentSelectedIds: selectedCustomers.map((c) => c.id),
      onConfirm: async (newSelectedCustomers) => {
        setSelectedCustomers(newSelectedCustomers);
        setActiveGroupId(null);
        setSelectedGroupProductIds([]);

        // Kiểm tra xem có nhóm nào được chọn đầy đủ (hoặc >= 2 khách) không
        const processedCustomerIds = new Set();
        for (const grp of linkInfo?.groups || []) {
          const groupCustomers = newSelectedCustomers.filter((c) =>
            grp.customerIds.includes(c.id)
          );
          if (groupCustomers.length >= 2 && groupCustomers.length === grp.customerIds.length) {
            setActiveGroupId(grp.id);
            await populateMeatsForGroup(groupCustomers, grp.name);
            groupCustomers.forEach((c) => processedCustomerIds.add(c.id));
          }
        }

        // Với các khách lẻ chưa thuộc nhóm nào được nạp đồng loạt
        for (const c of newSelectedCustomers) {
          if (!processedCustomerIds.has(c.id)) {
            await populateMeatsForSingleCustomer(c);
          }
        }
      },
    });
  };

  const handleSelectGroupProduct = async (product) => {
    if (!product || activeGroupCustomers.length === 0) return;
    const targetCustomerIds = activeGroupCustomers.map((customer) => customer.id);
    const firstCustomerId = targetCustomerIds[0];
    const firstItems = editingItemsMap[firstCustomerId] || [];
    const existing = firstItems.find((item) => item.productId === product.id);

    if (!existing) {
      const priceMap = await ensureCustomerPricesLoaded(firstCustomerId);
      const hasCustom = priceMap.has(product.id);
      const currentPrice = hasCustom ? priceMap.get(product.id) : product.defaultPrice;
      const newItem = {
        productId: product.id,
        name: product.name,
        customName: product.name,
        unit: product.unit || 'kg',
        defaultPrice: product.defaultPrice,
        originalPrice: currentPrice,
        currentPrice,
        hasCustomPrice: hasCustom,
        resetToDefault: false,
        isEdited: false,
        isEditingName: false,
      };
      setEditingItemsMap((prev) => {
        const next = { ...prev };
        targetCustomerIds.forEach((customerId) => {
          const items = next[customerId] || [];
          next[customerId] = items.some((item) => item.productId === product.id)
            ? items
            : [...items, { ...newItem }];
        });
        return next;
      });
    }
    setSelectedGroupProductIds((prev) => (
      prev.includes(product.id) ? prev : [...prev, product.id]
    ));
  };

  // Chọn nhanh hoặc bỏ chọn một nhóm khách hàng ngay ngoài màn hình
  const handleToggleGroupQuick = async (group) => {
    if (!group || !group.customerIds || !linkInfo?.customers) return;
    const groupCustomers = linkInfo.customers.filter((c) =>
      group.customerIds.includes(c.id)
    );
    if (groupCustomers.length === 0) return;

    const groupCustIds = groupCustomers.map((c) => c.id);
    const isAllSelected = groupCustIds.every((id) =>
      selectedCustomers.some((sc) => sc.id === id)
    );

    if (isAllSelected) {
      // Bỏ chọn cả nhóm
      setSelectedCustomers((prev) => prev.filter((c) => !groupCustIds.includes(c.id)));
      setEditingItemsMap((prev) => {
        const next = { ...prev };
        groupCustIds.forEach((id) => delete next[id]);
        return next;
      });
      if (activeGroupId === group.id) {
        setActiveGroupId(null);
        setSelectedGroupProductIds([]);
      }
      showGlobalToast(`Đã bỏ chọn nhóm: ${group.name}`, 'info');
    } else {
      // Hợp nhất thêm cả nhóm vào danh sách chọn
      setSelectedCustomers((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const toAdd = groupCustomers.filter((c) => !existingIds.has(c.id));
        return [...prev, ...toAdd];
      });

      // Tự động tải và áp dụng các loại thịt cùng 1 mức giá cho tất cả nhà hàng trong nhóm
      setActiveGroupId(group.id);
      setSelectedGroupProductIds([]);
      const items = await populateMeatsForGroup(groupCustomers, group.name);
      showGlobalToast(
        `Đã chọn nhóm "${group.name}" (${groupCustomers.length} khách) với ${items?.length || 0} món thịt cùng giá!`,
        'success'
      );
    }
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

  // Thêm một món thịt vào danh sách sửa (tự động đồng bộ cho nhóm nếu thuộc nhóm)
  const handleAddMeatToCustomer = (customerId, product, priceMap) => {
    const matchedGroup = getSelectedGroupOfCustomer(customerId);
    const targetCustomerIds = matchedGroup
      ? matchedGroup.customerIds.filter((id) => selectedCustomers.some((sc) => sc.id === id))
      : [customerId];

    const hasCustom = priceMap.has(product.id);
    const origPrice = hasCustom ? priceMap.get(product.id) : product.defaultPrice;

    setEditingItemsMap((prev) => {
      const next = { ...prev };
      targetCustomerIds.forEach((cId) => {
        const currentItems = next[cId] || [];
        if (!currentItems.some((it) => it.productId === product.id)) {
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
          next[cId] = [...currentItems, newItem];
        }
      });
      return next;
    });

    if (matchedGroup) {
      showGlobalToast(`Đã thêm "${product.name}" cho tất cả ${targetCustomerIds.length} khách trong nhóm!`, 'info');
    } else {
      showGlobalToast(`Đã thêm "${product.name}" vào danh sách sửa!`, 'info');
    }
  };

  // Cập nhật giá mới cho món thịt (tự động đồng bộ cùng 1 giá cho tất cả nhà hàng trong nhóm)
  const handlePriceChange = (customerId, productId, newPriceValue) => {
    const matchedGroup = getSelectedGroupOfCustomer(customerId);
    const targetCustomerIds = matchedGroup
      ? matchedGroup.customerIds.filter((id) => selectedCustomers.some((sc) => sc.id === id))
      : [customerId];

    setEditingItemsMap((prev) => {
      const next = { ...prev };
      const numVal = typeof newPriceValue === 'number' ? newPriceValue : parseFloat(newPriceValue) || 0;

      targetCustomerIds.forEach((cId) => {
        const items = next[cId] || [];
        next[cId] = items.map((item) => {
          if (item.productId !== productId) return item;
          const isChanged = numVal !== item.originalPrice || item.customName !== item.name;
          return {
            ...item,
            currentPrice: numVal,
            resetToDefault: false,
            isEdited: isChanged,
          };
        });
      });
      return next;
    });
  };

  // Cập nhật tên thịt riêng (tự động đồng bộ cho nhóm nếu thuộc nhóm)
  const handleNameChange = (customerId, productId, newName) => {
    const matchedGroup = getSelectedGroupOfCustomer(customerId);
    const targetCustomerIds = matchedGroup
      ? matchedGroup.customerIds.filter((id) => selectedCustomers.some((sc) => sc.id === id))
      : [customerId];

    setEditingItemsMap((prev) => {
      const next = { ...prev };
      targetCustomerIds.forEach((cId) => {
        const items = next[cId] || [];
        next[cId] = items.map((item) => {
          if (item.productId !== productId) return item;
          const isChanged = newName.trim() !== item.name || item.currentPrice !== item.originalPrice;
          return {
            ...item,
            customName: newName,
            isEdited: isChanged,
          };
        });
      });
      return next;
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

  // Khôi phục món thịt về giá sạp niêm yết mặc định (đồng bộ cho nhóm nếu thuộc nhóm)
  const handleResetToDefault = (customerId, productId) => {
    const matchedGroup = getSelectedGroupOfCustomer(customerId);
    const targetCustomerIds = matchedGroup
      ? matchedGroup.customerIds.filter((id) => selectedCustomers.some((sc) => sc.id === id))
      : [customerId];

    setEditingItemsMap((prev) => {
      const next = { ...prev };
      targetCustomerIds.forEach((cId) => {
        const items = next[cId] || [];
        next[cId] = items.map((item) => {
          if (item.productId !== productId) return item;
          return {
            ...item,
            currentPrice: item.defaultPrice,
            resetToDefault: true,
            isEdited: true,
          };
        });
      });
      return next;
    });
    showGlobalToast('Đã chọn khôi phục về giá sạp mặc định.', 'info');
  };

  // Xóa món thịt khỏi danh sách sửa (đồng bộ cho nhóm nếu thuộc nhóm)
  const handleRemoveMeatItem = (customerId, productId) => {
    const matchedGroup = getSelectedGroupOfCustomer(customerId);
    const targetCustomerIds = matchedGroup
      ? matchedGroup.customerIds.filter((id) => selectedCustomers.some((sc) => sc.id === id))
      : [customerId];

    setEditingItemsMap((prev) => {
      const next = { ...prev };
      targetCustomerIds.forEach((cId) => {
        const items = next[cId] || [];
        next[cId] = items.filter((it) => it.productId !== productId);
      });
      return next;
    });
  };

  // Tính tổng số món thịt đang được sửa đơn giá trên tất cả các khách
  const totalChangedItems = useMemo(() => {
    let count = 0;
    Object.values(editingItemsMap).forEach((items) => {
      if (Array.isArray(items)) {
        count += items.filter((it) => it.isEdited).length;
      }
    });
    return count;
  }, [editingItemsMap]);

  // Tổng số lượng món thịt hiện có trong danh sách hiển thị của tất cả khách hàng
  const totalAvailableItems = useMemo(() => {
    let count = 0;
    Object.values(editingItemsMap).forEach((items) => {
      if (Array.isArray(items)) {
        count += items.length;
      }
    });
    return count;
  }, [editingItemsMap]);

  // Danh sách các khách hàng có món thịt được thay đổi giá
  const affectedCustomers = useMemo(() => {
    return selectedCustomers.filter((cust) => {
      const items = editingItemsMap[cust.id] || [];
      return items.some((it) => it.isEdited);
    });
  }, [selectedCustomers, editingItemsMap]);

  // Danh sách khách hàng có ít nhất một món thịt trong danh sách
  const customersWithItems = useMemo(() => {
    return selectedCustomers.filter((cust) => {
      const items = editingItemsMap[cust.id] || [];
      return items.length > 0;
    });
  }, [selectedCustomers, editingItemsMap]);

  // Điều kiện cho phép bấm Lưu: Có món sửa giá HOẶC có món thịt và người dùng muốn áp dụng cho ngày mới
  const isActiveGroupEditor = Boolean(
    activeGroup &&
    activeGroupCustomers.length >= 2 &&
    activeGroupCustomers.every((customer) => selectedCustomers.some((selected) => selected.id === customer.id)) &&
    selectedGroupProductIds.length > 0
  );

  const canApply = isActiveGroupEditor || totalChangedItems > 0 || totalAvailableItems > 0;

  // Xử lý khi bấm nút "ÁP DỤNG GIÁ MỚI & CẬP NHẬT ĐƠN NỢ"
  const handleApplyPress = () => {
    const targetCustomers = isActiveGroupEditor
      ? activeGroupCustomers
      : (totalChangedItems > 0 ? affectedCustomers : customersWithItems);
    if (targetCustomers.length === 0) {
      showGlobalToast('Chưa có món thịt nào trong danh sách áp dụng.', 'info');
      return;
    }

    // Soạn tóm tắt cho popup xác nhận
    const customerSummaries = targetCustomers
      .map((c) => {
        const allItems = editingItemsMap[c.id] || [];
        const changed = allItems.filter((it) => it.isEdited);
        const countText = isActiveGroupEditor
          ? `${selectedGroupProductIds.length} món trong nhóm`
          : totalChangedItems > 0
          ? `${changed.length} món đổi giá`
          : `${allItems.length} món thịt`;
        return `• ${c.name}: ${countText}`;
      })
      .join('\n');

    const actionTitle = isActiveGroupEditor || totalChangedItems > 0
      ? '🥩 Xác Nhận Áp Dụng Giá Mới'
      : `🥩 Xác Nhận Áp Dụng Bảng Giá Từ Ngày ${effectiveDate}`;

    popupRef.current?.show({
      type: 'confirm',
      title: actionTitle,
      message:
        `Anh chủ xác nhận áp dụng bảng giá cho ${targetCustomers.length} khách hàng?\n\n` +
        `📅 Ngày bắt đầu áp dụng: ${effectiveDate}\n\n` +
        `Chi tiết danh sách:\n${customerSummaries}\n\n` +
        `⚠️ LƯU Ý QUAN TRỌNG: Tất cả đơn nợ của các khách hàng này từ ngày ${effectiveDate} trở về sau sẽ được TỰ ĐỘNG TÍNH LẠI tiền theo bảng giá này. Toàn bộ đơn nợ trước ngày ${effectiveDate} được BẢO TOÀN NGUYÊN VẸN 100%.`,
      confirmText: 'Đồng ý áp dụng',
      cancelText: 'Xem lại',
      onConfirm: async () => {
        await executeApplyAll();
      },
    });
  };

  // Thực thi gửi request lưu giá cho các khách hàng và tính lại đơn nợ
  const executeApplyAll = async () => {
    try {
      setSubmitting(true);
      let totalRecalculated = 0;
      let successCount = 0;

      const targetCustomers = isActiveGroupEditor
        ? activeGroupCustomers
        : (totalChangedItems > 0 ? affectedCustomers : customersWithItems);

      const applyRequests = targetCustomers.map(async (cust) => {
        const allItems = editingItemsMap[cust.id] || [];
        // Nếu có món sửa giá thì gửi món sửa giá, nếu chỉ thay đổi ngày áp dụng (giá đã đúng) thì gửi toàn bộ món hiện có
        const itemsToApply = isActiveGroupEditor
          ? allItems.filter((item) => selectedGroupProductIds.includes(item.productId))
          : totalChangedItems > 0
          ? allItems.filter((it) => it.isEdited)
          : allItems;

        if (itemsToApply.length === 0) return null;

        const payload = {
          customerId: cust.id,
          effectiveDate,
          pin: linkInfo?.hasPin ? pin : undefined,
          items: itemsToApply.map((item) => ({
            productId: item.productId,
            price: item.resetToDefault ? null : item.currentPrice,
            productName: item.customName.trim() !== item.name ? item.customName.trim() : undefined,
            resetToDefault: item.resetToDefault,
          })),
        };

        const res = await api.post(`/quick-price/public/apply/${token}`, payload);
        if (res.data?.success) {
          // Cập nhật lại cache giá riêng của khách này
          setCustomerPricesMap((prev) => {
            const newPriceMap = new Map(prev[cust.id] || new Map());
            itemsToApply.forEach((it) => {
              if (it.resetToDefault) {
                newPriceMap.delete(it.productId);
              } else {
                newPriceMap.set(it.productId, it.currentPrice);
              }
            });
            return { ...prev, [cust.id]: newPriceMap };
          });

          return {
            customer: cust,
            recalculatedCount: res.data.data?.recalculatedCount || 0,
          };
        }

        return null;
      });

      // Các nhà hàng không phụ thuộc dữ liệu của nhau nên gửi song song,
      // giảm thời gian chờ tổng từ tổng thời gian 11 request xuống gần bằng
      // request lâu nhất. Vẫn dùng allSettled để biết chính xác nhà hàng nào lỗi.
      const settledResults = await Promise.allSettled(applyRequests);
      const successfulResults = settledResults
        .filter((result) => result.status === 'fulfilled' && result.value)
        .map((result) => result.value);
      const failedResults = settledResults.filter((result) => result.status === 'rejected');

      successCount = successfulResults.length;
      totalRecalculated = successfulResults.reduce(
        (total, result) => total + result.recalculatedCount,
        0
      );

      if (failedResults.length > 0) {
        const firstError = failedResults[0].reason;
        showGlobalToast(
          `Đã lưu ${successCount}/${targetCustomers.length} khách hàng. ${
            firstError?.response?.data?.message || 'Một số khách hàng chưa cập nhật được.'
          }`,
          'error',
          'Cập nhật chưa hoàn tất',
          6000
        );
        return;
      }

      // Đánh dấu lại các món đã lưu (không còn isEdited) để người dùng tiếp tục theo dõi
      setEditingItemsMap((prev) => {
        const next = {};
        Object.keys(prev).forEach((cId) => {
          next[cId] = (prev[cId] || []).map((it) => ({
            ...it,
            originalPrice: it.currentPrice,
            isEdited: false,
          }));
        });
        return next;
      });

      showGlobalToast(
        `Đã lưu giá cho ${successCount} khách hàng và tự động tính lại ${totalRecalculated} đơn nợ từ ngày ${effectiveDate}!`,
        'success',
        'Cập nhật thành công',
        6000
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

          {/* Thanh chọn nhanh theo Nhóm/Chuỗi khách hàng */}
          {linkInfo?.groups && linkInfo.groups.length > 0 && (
            <View style={styles.quickGroupBar}>
              <Text style={styles.quickGroupBarLabel}>👥 Chọn nhanh nhóm:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickGroupList}>
                {linkInfo.groups.map((grp) => {
                  const groupCustomers = (linkInfo.customers || []).filter((c) =>
                    grp.customerIds.includes(c.id)
                  );
                  const selectedInGroup = groupCustomers.filter((c) =>
                    selectedCustomers.some((sc) => sc.id === c.id)
                  ).length;
                  const isFull = groupCustomers.length > 0 && selectedInGroup === groupCustomers.length;
                  const isPartial = selectedInGroup > 0 && selectedInGroup < groupCustomers.length;

                  return (
                    <TouchableOpacity
                      key={grp.id}
                      style={[
                        styles.quickGroupChip,
                        isFull && styles.quickGroupChipFull,
                        isPartial && styles.quickGroupChipPartial,
                      ]}
                      onPress={() => handleToggleGroupQuick(grp)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.quickGroupChipText,
                          isFull && styles.quickGroupChipTextFull,
                          isPartial && styles.quickGroupChipTextPartial,
                        ]}
                      >
                        {isFull ? '✓ ' : '👥 '}
                        {grp.name} ({selectedInGroup}/{groupCustomers.length})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

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
            {activeGroup && activeGroupCustomers.length >= 2 && activeGroupCustomers.every((customer) =>
              selectedCustomers.some((selected) => selected.id === customer.id)
            ) ? (
              <View style={styles.groupPriceEditorCard}>
                <Text style={styles.groupPriceEditorTitle}>CẬP NHẬT GIÁ CHO CẢ NHÓM</Text>
                <Text style={styles.groupPriceEditorSubtitle}>
                  {activeGroup.name} · {activeGroupCustomers.length} nhà hàng. Chọn thịt và nhập một mức giá dùng chung.
                </Text>
                <CustomSelect
                  value={null}
                  options={linkInfo?.products || []}
                  placeholder="Chọn loại thịt cần cập nhật..."
                  getOptionLabel={(product) => product?.name || ''}
                  renderSelected={() => ''}
                  onSelect={handleSelectGroupProduct}
                  compact={true}
                  zIndex={999999}
                />
                {activeGroupProducts.length > 0 ? activeGroupProducts.map((item) => (
                  <View key={item.productId} style={styles.groupPriceInputRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupPriceProductName}>{item.name}</Text>
                      <Text style={styles.groupPriceCurrentText}>
                        Giá hiện tại: {formatCurrency(item.currentPrice)} / {item.unit}
                      </Text>
                    </View>
                    <MoneyInput
                      value={item.currentPrice}
                      onChangeValue={(value) => handlePriceChange(activeGroupCustomers[0].id, item.productId, value)}
                      placeholder="Giá mới"
                      textAlign="right"
                      style={styles.groupPriceMoneyBox}
                      inputStyle={styles.groupPriceMoneyInput}
                    />
                  </View>
                )) : (
                  <Text style={styles.groupPriceEmptyText}>Chọn loại thịt để nhập giá mới.</Text>
                )}
              </View>
            ) : selectedCustomers.map((cust) => {
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
              {totalChangedItems > 0 ? (
                <>
                  Đang sửa: <Text style={{ fontWeight: '700', color: COLORS.primary }}>{totalChangedItems}</Text> món trên{' '}
                  <Text style={{ fontWeight: '700', color: COLORS.primary }}>{affectedCustomers.length}</Text> khách
                </>
              ) : (
                <>
                  Áp dụng: <Text style={{ fontWeight: '700', color: COLORS.primary }}>{totalAvailableItems}</Text> món trên{' '}
                  <Text style={{ fontWeight: '700', color: COLORS.primary }}>{customersWithItems.length}</Text> khách
                </>
              )}
            </Text>
          </View>

          <AnimatedPressable
            style={[
              styles.applyButton,
              (!canApply || submitting) && styles.buttonDisabled,
            ]}
            onPress={handleApplyPress}
            disabled={!canApply || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.applyButtonText}>
                {totalChangedItems > 0
                  ? `💾 ÁP DỤNG GIÁ MỚI (${totalChangedItems} MÓN ĐỔI - ${affectedCustomers.length} KHÁCH HÀNG)`
                  : totalAvailableItems > 0
                  ? `💾 ÁP DỤNG BẢNG GIÁ TỪ NGÀY ${effectiveDate} (${totalAvailableItems} MÓN - ${customersWithItems.length} KHÁCH HÀNG)`
                  : 'CHƯA CÓ MÓN THỊT NÀO ĐƯỢC CHỌN'}
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
  quickGroupBar: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  quickGroupBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  quickGroupList: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  quickGroupChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickGroupChipFull: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  quickGroupChipPartial: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  quickGroupChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  quickGroupChipTextFull: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quickGroupChipTextPartial: {
    color: '#1D4ED8',
    fontWeight: '700',
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
  groupPriceEditorCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  groupPriceEditorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  groupPriceEditorSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  groupPriceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  groupPriceProductName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  groupPriceCurrentText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  groupPriceMoneyBox: {
    width: 125,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 7,
  },
  groupPriceMoneyInput: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  groupPriceEmptyText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 14,
  },
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
