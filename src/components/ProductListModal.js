// meat-management-fe/src/components/ProductListModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import PopupModal from './PopupModal';
import { matchItemSearch } from '../utils/searchHelper';
import MoneyInput from './MoneyInput';
import { showGlobalToast } from '../store/toastStore';
import CustomSelect from './CustomSelect';
import { useCustomerGroups } from '../hooks/useCustomerGroups';
import { useAuthStore } from '../store/authStore';

const ProductListModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0); // Giá bán VNĐ (sử dụng MoneyInput)
  const [costPrice, setCostPrice] = useState(0); // Giá nhập VNĐ (sử dụng MoneyInput)
  const [unit, setUnit] = useState('kg'); // Đơn vị mặc định là kg
  const [searchQuery, setSearchQuery] = useState(''); // Từ khóa tìm kiếm tên thịt
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const [editingProduct, setEditingProduct] = useState(null); // Quản lý trạng thái đang sửa mặt hàng thịt
  const popupModalRef = useRef(null);

  // State phục vụ tính năng CẬP NHẬT GIÁ ĐỒNG LOẠT
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchItems, setBatchItems] = useState([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);

  // ── STATE PHỤC VỤ TAB CHỈNH GIÁ RIÊNG TỪNG CỬA HÀNG & NHÓM ──
  const user = useAuthStore((state) => state.user);
  const { groups, saveGroup, deleteGroup: deleteGroupHook, refreshGroups } = useCustomerGroups(user?.id);

  // Tab đang kích hoạt: 'general' (Giá thịt chung) hoặc 'custom' (Giá riêng cửa hàng & nhóm)
  const [activeTab, setActiveTab] = useState('general');

  // Mục tiêu chỉnh giá riêng: 'customer' (Từng cửa hàng) hoặc 'group' (Nhóm cửa hàng)
  const [customTargetType, setCustomTargetType] = useState('customer');
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [customProductItems, setCustomProductItems] = useState([]);
  const [loadingCustomPrices, setLoadingCustomPrices] = useState(false);
  const [savingCustomPrices, setSavingCustomPrices] = useState(false);
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [selectZIndex, setSelectZIndex] = useState(10);

  // Trạng thái dialog tạo nhóm mới trong tab giá riêng
  const [showAddGroupDialog, setShowAddGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedCustomersForGroup, setSelectedCustomersForGroup] = useState([]);

  // Tải danh sách khách hàng để chọn trong tab giá riêng
  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const res = await api.get('/customers?isBadDebt=false');
      setCustomers(res.data?.data || []);
    } catch (err) {
      console.error('Lỗi khi tải danh sách khách hàng:', err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // 1. Tải danh mục thịt từ Backend bằng React Query
  const { data: productsResponse, refetch, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await api.get('/products');
      return response.data;
    },
    enabled: visible,
  });

  // Lọc bỏ sản phẩm ảo của ghi nợ nhanh khỏi danh sách quản lý thịt đang bán
  const products = (productsResponse?.data || []).filter(
    (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
  );

  // Lọc danh sách thịt theo từ khóa tìm kiếm
  const filteredProducts = products.filter((p) =>
    matchItemSearch(p, searchQuery, ['name', 'unit'])
  );

  // 2. Expose các hàm mở/đóng modal ra ngoài
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setName('');
      setPrice(0);
      setCostPrice(0);
      setUnit('kg');
      setSearchQuery('');
      setError('');
      setEditingProduct(null);
      setBatchModalVisible(false);
      fetchCustomers();
    },
    close: () => {
      setVisible(false);
      setBatchModalVisible(false);
    }
  }));

  // Định dạng hiển thị tiền VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');
  };

  // Chuyển chuỗi định dạng trở lại số nguyên để gửi đi
  const parseNumberString = (formattedValue) => {
    if (typeof formattedValue === 'number') return formattedValue;
    const cleanValue = String(formattedValue || '').replace(/[^0-9]/g, '');
    return cleanValue ? parseInt(cleanValue, 10) : 0;
  };

  // Kích hoạt trạng thái chỉnh sửa thịt
  const handleStartEdit = (product) => {
    setEditingProduct(product);
    setName(product.name);
    setPrice(product.defaultPrice || 0);
    setCostPrice(product.costPrice || 0);
    setUnit(product.unit);
    setError('');
  };

  // Hủy bỏ trạng thái chỉnh sửa
  const handleCancelEdit = () => {
    setEditingProduct(null);
    setName('');
    setPrice(0);
    setCostPrice(0);
    setUnit('kg');
    setError('');
  };

  // Gửi yêu cầu cập nhật thông tin sản phẩm thịt lên backend
  const handleUpdateProduct = async () => {
    if (loading || !editingProduct) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Tên loại thịt không được để trống.');
      return;
    }
    const defaultPrice = parseNumberString(price);
    const parsedCostPrice = parseNumberString(costPrice);

    if (defaultPrice === undefined || defaultPrice === null || defaultPrice < 0) {
      setError('Giá bán không được để trống.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.put(`/products/${editingProduct.id}`, {
        name: trimmedName,
        defaultPrice,
        costPrice: parsedCostPrice,
        unit,
      });

      if (response.data.success) {
        handleCancelEdit();
        queryClient.invalidateQueries({ queryKey: ['products'] });
        if (onRefresh) onRefresh();
        showGlobalToast('Đã cập nhật thịt thành công!', 'success');
      } else {
        setError(response.data.message || 'Lỗi cập nhật sản phẩm.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Xử lý thêm loại thịt mới
  const handleAddProduct = async () => {
    if (loading) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Tên loại thịt không được để trống.');
      return;
    }
    const defaultPrice = parseNumberString(price);
    const parsedCostPrice = parseNumberString(costPrice);

    if (!defaultPrice || defaultPrice <= 0) {
      setError('Giá bán không được để trống hoặc phải lớn hơn 0đ.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await api.post('/products', {
        name: trimmedName,
        defaultPrice,
        costPrice: parsedCostPrice,
        unit,
      });

      if (response.data.success) {
        setName('');
        setPrice(0);
        setCostPrice(0);
        setUnit('kg');
        queryClient.invalidateQueries({ queryKey: ['products'] });
        if (onRefresh) onRefresh();
        showGlobalToast(`Đã thêm thịt "${trimmedName}" thành công!`, 'success');
      } else {
        setError(response.data.message || 'Lỗi thêm sản phẩm.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Xóa mềm (Deactivate) loại thịt qua PopupModal
  const handleDeleteProduct = async (productId, productName) => {
    popupModalRef.current?.show({
      title: 'Xác nhận ẩn',
      message: `Bạn có chắc chắn muốn ẩn loại thịt "${productName}" khỏi danh mục bán hàng?`,
      type: 'confirm',
      confirmText: 'Ẩn đi',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          const response = await api.delete(`/products/${productId}`);
          if (response.data.success) {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            if (onRefresh) onRefresh();
            showGlobalToast(`Đã ẩn loại thịt "${productName}".`, 'info');
          } else {
            popupModalRef.current?.show({
              title: 'Lỗi',
              message: response.data.message || 'Không thể ẩn thịt.',
              type: 'error',
            });
          }
        } catch (err) {
          popupModalRef.current?.show({
            title: 'Lỗi',
            message: 'Lỗi kết nối mạng, vui lòng thử lại.',
            type: 'error',
          });
        }
      }
    });
  };

  // ── XỬ LÝ CẬP NHẬT GIÁ ĐỒNG LOẠT ──
  const handleOpenBatchModal = () => {
    setBatchItems(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit || 'kg',
        defaultPrice: parseFloat(p.defaultPrice || 0),
        costPrice: parseFloat(p.costPrice || 0),
        originalDefaultPrice: parseFloat(p.defaultPrice || 0),
        originalCostPrice: parseFloat(p.costPrice || 0),
      }))
    );
    setBatchSearch('');
    setBatchModalVisible(true);
  };

  const handleBatchPriceChange = (id, field, val) => {
    setBatchItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: val };
        }
        return item;
      })
    );
  };

  // Số lượng loại thịt đã thay đổi giá
  const changedBatchCount = useMemo(() => {
    return batchItems.filter(
      (i) => i.defaultPrice !== i.originalDefaultPrice || i.costPrice !== i.originalCostPrice
    ).length;
  }, [batchItems]);

  // Lọc danh sách thịt trong batch modal
  const filteredBatchItems = useMemo(() => {
    if (!batchSearch.trim()) return batchItems;
    return batchItems.filter((i) =>
      i.name.toLowerCase().includes(batchSearch.toLowerCase().trim())
    );
  }, [batchItems, batchSearch]);

  // Lưu toàn bộ giá đã thay đổi đồng loạt
  const handleSaveBatchPrices = async () => {
    const changedItems = batchItems.filter(
      (i) => i.defaultPrice !== i.originalDefaultPrice || i.costPrice !== i.originalCostPrice
    );

    if (changedItems.length === 0) {
      showGlobalToast('Bạn chưa thay đổi đơn giá của loại thịt nào.', 'info');
      return;
    }

    setSavingBatch(true);
    try {
      const payload = {
        items: changedItems.map((i) => ({
          id: i.id,
          defaultPrice: i.defaultPrice,
          costPrice: i.costPrice,
        })),
      };

      const res = await api.post('/products/batch-update-prices', payload);
      if (res.data && res.data.success) {
        showGlobalToast(`Đã cập nhật giá cho ${changedItems.length} loại thịt thành công!`, 'success');
        queryClient.invalidateQueries({ queryKey: ['products'] });
        if (onRefresh) onRefresh();
        setBatchModalVisible(false);
      } else {
        showGlobalToast(res.data?.message || 'Không thể lưu giá đồng loạt.', 'error');
      }
    } catch (err) {
      console.error(err);
      showGlobalToast(err.response?.data?.message || 'Lỗi kết nối khi lưu bảng giá.', 'error');
    } finally {
      setSavingBatch(false);
    }
  };

  // ── CÁC HÀM XỬ LÝ CHO TAB CHỈNH GIÁ RIÊNG CỬA HÀNG & NHÓM ──
  // Khi chọn một cửa hàng cụ thể
  const handleSelectCustomer = async (cust) => {
    setSelectedCustomer(cust);
    if (!cust) {
      setCustomProductItems([]);
      return;
    }
    setLoadingCustomPrices(true);
    try {
      const res = await api.get(`/products?customerId=${cust.id}`);
      const list = (res.data?.data || []).filter(
        (p) => p.name !== 'Tiền hàng' && !p.name.toLowerCase().startsWith('tiền')
      );
      setCustomProductItems(
        list.map((p) => {
          const hasCustom = Boolean(p.hasCustomPrice);
          const currentPrice = hasCustom
            ? (p.customPrice ?? p.defaultPrice ?? 0)
            : (p.baseDefaultPrice ?? p.defaultPrice ?? 0);
          return {
            id: p.id,
            name: p.name,
            unit: p.unit,
            baseDefaultPrice: p.baseDefaultPrice ?? p.defaultPrice ?? 0,
            costPrice: p.costPrice || 0,
            customPrice: currentPrice,
            originalCustomPrice: hasCustom ? currentPrice : null,
            hasCustomPrice: hasCustom,
            resetToDefault: false,
            isEdited: false,
          };
        })
      );
    } catch (err) {
      console.error('Lỗi khi tải giá riêng của cửa hàng:', err);
      showGlobalToast('Không thể tải giá riêng của cửa hàng.', 'error');
    } finally {
      setLoadingCustomPrices(false);
    }
  };

  // Khi chọn một nhóm cửa hàng — gọi API phân tích giá phổ biến nhất
  const handleSelectGroup = async (grp) => {
    setSelectedGroup(grp);
    if (!grp) {
      setCustomProductItems([]);
      return;
    }

    const memberIds = grp.customerIds || [];
    if (memberIds.length === 0) {
      showGlobalToast('Nhóm này chưa có thành viên. Vui lòng thêm thành viên trước.', 'warning');
      setCustomProductItems([]);
      return;
    }

    setLoadingCustomPrices(true);
    try {
      const res = await api.post('/products/group-price-analysis', { customerIds: memberIds });
      const productList = res.data?.data?.products || [];

      setCustomProductItems(
        productList.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          baseDefaultPrice: p.baseDefaultPrice,
          costPrice: p.costPrice,
          // Giá hiển thị ban đầu = giá phổ biến nhất của nhóm (mode)
          customPrice: p.majorityPrice,
          originalCustomPrice: p.majorityPrice,
          majorityPrice: p.majorityPrice,
          majorityCount: p.majorityCount,
          totalCount: p.totalCount,
          // Danh sách cửa hàng đang có giá khác số đông
          outliers: p.outliers || [],
          outlierCount: p.outlierCount || 0,
          hasCustomPrice: false,
          resetToDefault: false,
          isEdited: false,
        }))
      );
    } catch (err) {
      console.error('Lỗi khi phân tích giá nhóm:', err);
      showGlobalToast('Không thể tải dữ liệu giá của nhóm cửa hàng.', 'error');
      setCustomProductItems([]);
    } finally {
      setLoadingCustomPrices(false);
    }
  };

  // Thay đổi giá riêng của một mặt hàng
  const handleCustomPriceChange = (productId, newPrice) => {
    setCustomProductItems((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          const num = typeof newPrice === 'number' ? newPrice : parseNumberString(newPrice);
          return {
            ...item,
            customPrice: num,
            resetToDefault: false,
            isEdited: true,
          };
        }
        return item;
      })
    );
  };

  // Đưa giá riêng về lại giá bán chung mặc định (bỏ giá riêng)
  const handleResetProductToDefault = (productId) => {
    setCustomProductItems((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          return {
            ...item,
            customPrice: item.baseDefaultPrice,
            resetToDefault: true,
            isEdited: true,
          };
        }
        return item;
      })
    );
  };

  // Lọc danh sách thịt trong tab giá riêng theo từ khóa tìm kiếm
  const filteredCustomProductItems = useMemo(() => {
    if (!customSearchQuery.trim()) return customProductItems;
    return customProductItems.filter((i) =>
      matchItemSearch(i, customSearchQuery, ['name', 'unit'])
    );
  }, [customProductItems, customSearchQuery]);

  // Đếm số lượng sản phẩm có sự thay đổi giá riêng
  const changedCustomCount = useMemo(() => {
    return customProductItems.filter((i) => i.isEdited || i.resetToDefault).length;
  }, [customProductItems]);

  // Lưu bảng giá riêng cho cửa hàng hoặc nhóm cửa hàng
  const handleSaveCustomPrices = async () => {
    let targetCustomerIds = [];
    let targetName = '';

    if (customTargetType === 'customer') {
      if (!selectedCustomer) {
        showGlobalToast('Vui lòng chọn cửa hàng cần cài đặt giá riêng.', 'warning');
        return;
      }
      targetCustomerIds = [selectedCustomer.id];
      targetName = selectedCustomer.name;
    } else {
      if (!selectedGroup) {
        showGlobalToast('Vui lòng chọn nhóm cửa hàng cần cài đặt giá riêng.', 'warning');
        return;
      }
      targetCustomerIds = selectedGroup.customerIds || [];
      if (targetCustomerIds.length === 0) {
        showGlobalToast('Nhóm này chưa có cửa hàng thành viên nào.', 'warning');
        return;
      }
      targetName = selectedGroup.name;
    }

    const changedItems = customProductItems.filter((i) => i.isEdited || i.resetToDefault);

    if (changedItems.length === 0) {
      showGlobalToast('Bạn chưa điều chỉnh đơn giá của mặt hàng nào.', 'info');
      return;
    }

    setSavingCustomPrices(true);
    try {
      const payload = {
        customerIds: targetCustomerIds,
        items: changedItems.map((i) => ({
          productId: i.id,
          price: i.resetToDefault ? null : i.customPrice,
          resetToDefault: i.resetToDefault,
        })),
      };

      const res = await api.post('/products/batch-customer-prices', payload);
      if (res.data && res.data.success) {
        showGlobalToast(
          `Đã lưu giá riêng thành công cho ${targetCustomerIds.length} cửa hàng!`,
          'success'
        );
        // Tải lại nếu đang chọn từng khách hàng để cập nhật trạng thái mới nhất
        if (customTargetType === 'customer' && selectedCustomer) {
          await handleSelectCustomer(selectedCustomer);
        } else {
          setCustomProductItems((prev) =>
            prev.map((i) => ({ ...i, isEdited: false }))
          );
        }
      } else {
        showGlobalToast(res.data?.message || 'Không thể lưu giá riêng.', 'error');
      }
    } catch (err) {
      console.error(err);
      showGlobalToast(err.response?.data?.message || 'Lỗi kết nối khi lưu bảng giá riêng.', 'error');
    } finally {
      setSavingCustomPrices(false);
    }
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🥩 QUẢN LÝ DANH SÁCH THỊT</Text>
            <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
              <Text style={styles.closeHeaderText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* ── THANH CHUYỂN TAB: GIÁ THỊT CHUNG VS GIÁ RIÊNG CỬA HÀNG & NHÓM ── */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'general' && styles.tabButtonActive]}
              onPress={() => setActiveTab('general')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabButtonText, activeTab === 'general' && styles.tabButtonTextActive]}>
                🥩 Giá thịt chung
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'custom' && styles.tabButtonActive]}
              onPress={() => {
                setActiveTab('custom');
                if (customers.length === 0) fetchCustomers();
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.tabButtonText, activeTab === 'custom' && styles.tabButtonTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                🏪 Giá riêng theo Cửa hàng
              </Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={[styles.alertBox, error.startsWith('✅') ? styles.alertSuccess : styles.alertError]}>
              <Text style={error.startsWith('✅') ? styles.alertTextSuccess : styles.alertTextError}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* ── TAB 1: QUẢN LÝ & GIÁ THỊT CHUNG ── */}
          {activeTab === 'general' && (
            <>
              {/* FORM THÊM / CẬP NHẬT THỊT - TỐI ƯU CHIỀU CAO SIÊU GỌN */}
              <View style={styles.compactFormBox}>
                <View style={styles.compactHeaderRow}>
                  <Text style={styles.compactTitle}>
                    {editingProduct ? '✏️ CẬP NHẬT THỊT' : '➕ THÊM THỊT MỚI'}
                  </Text>

                  <TouchableOpacity
                    style={styles.batchOpenButton}
                    onPress={handleOpenBatchModal}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.batchOpenButtonText}>⚡ CẬP NHẬT GIÁ ĐỒNG LOẠT</Text>
                  </TouchableOpacity>
                </View>

                {/* Hàng 1: Ô nhập tên thịt + 3 nút đơn vị tính (kg, lạng, cái) */}
                <View style={styles.compactRow1}>
                  <TextInput
                    style={styles.compactInputName}
                    placeholder="Tên thịt (Bắp bò, Ba chỉ...)"
                    placeholderTextColor={COLORS.textLight}
                    value={name}
                    onChangeText={setName}
                  />
                  <View style={styles.compactUnitGroup}>
                    {['kg', 'lạng', 'cái'].map((u) => {
                      const isSelected = unit === u;
                      return (
                        <TouchableOpacity
                          key={u}
                          style={[styles.compactUnitBadge, isSelected && styles.compactUnitBadgeSelected]}
                          onPress={() => setUnit(u)}
                        >
                          <Text style={[styles.compactUnitText, isSelected && styles.compactUnitTextSelected]}>
                            {u}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Hàng 2: Giá bán + Giá nhập + Nút Thêm / Lưu */}
                <View style={styles.compactRow2}>
                  <View style={{ flex: 1 }}>
                    <MoneyInput
                      style={styles.compactMoneyContainer}
                      inputStyle={styles.compactMoneyField}
                      value={price}
                      onChangeValue={(val) => {
                        setPrice(val);
                        setError('');
                      }}
                      placeholder="Giá bán..."
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <MoneyInput
                      style={styles.compactMoneyContainer}
                      inputStyle={styles.compactMoneyField}
                      value={costPrice}
                      onChangeValue={(val) => {
                        setCostPrice(val);
                        setError('');
                      }}
                      placeholder="Giá nhập..."
                    />
                  </View>

                  {editingProduct ? (
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <TouchableOpacity
                        style={styles.compactSaveButton}
                        onPress={handleUpdateProduct}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.compactSaveButtonText}>LƯU 💾</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.compactCancelButton}
                        onPress={handleCancelEdit}
                      >
                        <Text style={styles.compactCancelButtonText}>HỦY</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.compactAddButton}
                      onPress={handleAddProduct}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.compactAddButtonText}>THÊM 💾</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Thanh tìm kiếm tên thịt */}
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="🔍 Tìm kiếm tên loại thịt, đơn vị tính..."
                  placeholderTextColor={COLORS.textLight}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    style={styles.searchClearBtn}
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.searchClearText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Danh sách thịt hiện có */}
              <Text style={styles.sectionTitle}>
                📋 DANH SÁCH THỊT ĐANG BÁN ({filteredProducts.length}{searchQuery.trim() ? `/${products.length}` : ''})
              </Text>
              {isLoading ? (
                <ActivityIndicator color={COLORS.primary} style={{ margin: 20 }} />
              ) : (
                <FlatList
                  data={filteredProducts}
                  keyExtractor={(item) => item.id}
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item }) => {
                    const sellPrice = parseFloat(item.defaultPrice || 0);
                    const importPrice = parseFloat(item.costPrice || 0);
                    const profitPerUnit = sellPrice - importPrice;
                    const marginPercent = sellPrice > 0 ? Math.round((profitPerUnit / sellPrice) * 100) : 0;

                    return (
                      <View style={styles.productItem}>
                        <View style={styles.productDetails}>
                          <Text style={styles.productNameText}>{item.name}</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2, alignItems: 'center' }}>
                            <Text style={styles.productPriceText}>
                              Bán: <Text style={{ color: COLORS.dangerDark, fontWeight: 'bold' }}>{formatCurrency(sellPrice)}</Text>/{item.unit}
                            </Text>
                            <Text style={[styles.productPriceText, { color: COLORS.textSecondary }]}>
                              Nhập: <Text style={{ color: '#0369A1', fontWeight: 'bold' }}>{formatCurrency(importPrice)}</Text>/{item.unit}
                            </Text>
                            {importPrice > 0 && (
                              <View style={{ backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0369A1' }}>
                                  Lãi: +{formatCurrency(profitPerUnit)} ({marginPercent}%)
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => handleStartEdit(item)}
                          >
                            <Text style={styles.editButtonText}>✏️ Sửa</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() => handleDeleteProduct(item.id, item.name)}
                          >
                            <Text style={styles.deleteButtonText}>🗑️ Xóa</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>
                      {searchQuery.trim()
                        ? `Không tìm thấy loại thịt nào khớp với "${searchQuery}".`
                        : 'Chưa có loại thịt nào. Hãy thêm ở form trên!'}
                    </Text>
                  }
                />
              )}
            </>
          )}

          {/* ── TAB 2: CHỈNH GIÁ RIÊNG THEO CỬA HÀNG & NHÓM ── */}
          {activeTab === 'custom' && (
            <View style={{ flex: 1 }}>
              {/* Phân loại mục tiêu: Từng cửa hàng vs Nhóm cửa hàng */}
              {/* Thanh phân loại mục tiêu + Nút thêm nhóm mới */}
              <View style={styles.targetHeaderRow}>
                <View style={[styles.targetTypeSegment, { flex: 1, marginBottom: 0 }]}>
                  <TouchableOpacity
                    style={[styles.targetTypeBtn, customTargetType === 'customer' && styles.targetTypeBtnActive]}
                    onPress={() => {
                      setCustomTargetType('customer');
                      setSelectedGroup(null);
                      setCustomProductItems([]);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.targetTypeBtnText, customTargetType === 'customer' && styles.targetTypeBtnTextActive]}>
                      🏪 Cửa hàng ({customers.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.targetTypeBtn, customTargetType === 'group' && styles.targetTypeBtnActive]}
                    onPress={() => {
                      setCustomTargetType('group');
                      setSelectedCustomer(null);
                      setCustomProductItems([]);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.targetTypeBtnText, customTargetType === 'group' && styles.targetTypeBtnTextActive]}>
                      📁 Nhóm ({groups.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Nút thêm nhóm mới (chỉ hiện ở tab Nhóm) */}
                {customTargetType === 'group' && (
                  <TouchableOpacity
                    style={styles.addGroupBtn}
                    onPress={() => {
                      setNewGroupName('');
                      setShowAddGroupDialog(prev => !prev);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.addGroupBtnText}>
                      {showAddGroupDialog ? '✕ Đóng' : '➕ Thêm nhóm'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Dialog nhanh tạo nhóm mới từ danh sách khách hàng đã chọn */}
              {showAddGroupDialog && customTargetType === 'group' && (
                <View style={styles.addGroupCard}>
                  <Text style={styles.addGroupLabel}>Đặt tên nhóm mới:</Text>
                  <View style={styles.addGroupInputRow}>
                    <TextInput
                      style={styles.addGroupInput}
                      placeholder="Ví dụ: Nhóm Bếp, Nhóm Trường Hoàng..."
                      placeholderTextColor={COLORS.textLight}
                      value={newGroupName}
                      onChangeText={setNewGroupName}
                      autoFocus
                    />
                    <TouchableOpacity
                      style={[styles.addGroupSubmitBtn, !newGroupName.trim() && { opacity: 0.45 }]}
                      disabled={!newGroupName.trim()}
                      onPress={async () => {
                        const name = newGroupName.trim();
                        if (!name) return;
                        // Lưu nhóm với danh sách khách hàng đang chọn (rỗng nếu chưa chọn)
                        const ids = selectedCustomer ? [selectedCustomer.id] : [];
                        await saveGroup(name, ids);
                        setNewGroupName('');
                        setShowAddGroupDialog(false);
                        showGlobalToast(`Đã tạo nhóm "${name}" thành công!`, 'success');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.addGroupSubmitBtnText}>LƯU</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                    Nhóm sẽ được tạo trống. Bạn có thể thêm thành viên từ tính năng Xuất công nợ hàng loạt.
                  </Text>
                </View>
              )}

              {/* Ô chọn CustomSelect (Cửa hàng hoặc Nhóm) */}
              <View style={{ zIndex: selectZIndex, elevation: selectZIndex, marginBottom: 10 }}>
                {customTargetType === 'customer' ? (
                  <CustomSelect
                    value={selectedCustomer}
                    options={customers}
                    onSelect={(cust) => handleSelectCustomer(cust)}
                    renderSelected={(c) => (c ? `${c.name}${c.phone ? ` (${c.phone})` : ''}` : 'Chọn cửa hàng để chỉnh giá riêng...')}
                    getOptionLabel={(c) => (c ? `${c.name}${c.phone ? ` (${c.phone})` : ''}` : '')}
                    placeholder="Chọn cửa hàng để chỉnh giá riêng..."
                    onOpenChange={(isOpen) => setSelectZIndex(isOpen ? 999999 : 10)}
                  />
                ) : (
                  <CustomSelect
                    value={selectedGroup}
                    options={groups}
                    onSelect={(grp) => handleSelectGroup(grp)}
                    renderSelected={(g) => (g ? `${g.name} (${g.count || (g.customerIds || []).length} cửa hàng)` : 'Chọn nhóm cửa hàng để chỉnh giá riêng...')}
                    getOptionLabel={(g) => (g ? `${g.name} (${g.count || (g.customerIds || []).length} cửa hàng)` : '')}
                    placeholder="Chọn nhóm cửa hàng để chỉnh giá riêng..."
                    onOpenChange={(isOpen) => setSelectZIndex(isOpen ? 999999 : 10)}
                  />
                )}
              </View>

              {/* Trạng thái chưa chọn cửa hàng/nhóm */}
              {!selectedCustomer && !selectedGroup ? (
                <View style={styles.emptyCustomSelectBox}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🏪</Text>
                  <Text style={styles.emptyCustomSelectTitle}>
                    {customTargetType === 'customer'
                      ? 'Vui lòng chọn cửa hàng để xem & đặt giá riêng'
                      : 'Vui lòng chọn nhóm để áp dụng giá riêng cho nhiều cửa hàng'}
                  </Text>
                  <Text style={styles.emptyCustomSelectDesc}>
                    {customTargetType === 'customer'
                      ? 'Giá riêng sẽ được tự động áp dụng khi tạo đơn hàng hoặc xuất báo cáo cho cửa hàng này.'
                      : 'Khi lưu, đơn giá riêng này sẽ được cập nhật đồng loạt cho tất cả các cửa hàng thuộc nhóm đã chọn.'}
                  </Text>
                </View>
              ) : (
                <>
                  {/* Thanh thông tin đối tượng đang chọn + Ô tìm kiếm loại thịt */}
                  <View style={styles.customFilterRow}>
                    <View style={styles.customTargetBadge}>
                      <Text style={styles.customTargetBadgeText} numberOfLines={1}>
                        🎯 Đang sửa: <Text style={{ fontWeight: 'bold' }}>{customTargetType === 'customer' ? selectedCustomer?.name : `${selectedGroup?.name} (${selectedGroup?.customerIds?.length || 0} CH)`}</Text>
                      </Text>
                    </View>

                    <View style={styles.customSearchBox}>
                      <TextInput
                        style={styles.customSearchInput}
                        placeholder="🔍 Tìm loại thịt..."
                        placeholderTextColor={COLORS.textLight}
                        value={customSearchQuery}
                        onChangeText={setCustomSearchQuery}
                      />
                      {customSearchQuery ? (
                        <TouchableOpacity
                          onPress={() => setCustomSearchQuery('')}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>✕</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Tiêu đề bảng giá riêng - nội dung thay đổi theo chế độ */}
                  <View style={styles.customTableHead}>
                    <Text style={[styles.customHeadCol, { flex: 1.4 }]}>Mặt hàng thịt</Text>
                    <Text style={[styles.customHeadCol, { width: 95, textAlign: 'center' }]}>
                      {customTargetType === 'group' ? 'Số đông nhóm' : 'Giá mặc định'}
                    </Text>
                    <Text style={[styles.customHeadCol, { width: 110, textAlign: 'center' }]}>
                      {customTargetType === 'group' ? 'Giá đặt cho nhóm (đ)' : 'Giá riêng hiện tại (đ)'}
                    </Text>
                    <Text style={[styles.customHeadCol, { width: 65, textAlign: 'center' }]}>Gốc</Text>
                  </View>

                  {/* Danh sách thịt cho chỉnh giá */}
                  {loadingCustomPrices ? (
                    <View style={{ padding: 30, alignItems: 'center' }}>
                      <ActivityIndicator color={COLORS.primary} size="large" />
                      <Text style={{ marginTop: 10, color: COLORS.textSecondary, fontSize: 13 }}>
                        Đang tải bảng giá riêng của cửa hàng...
                      </Text>
                    </View>
                  ) : (
                    <FlatList
                      data={filteredCustomProductItems}
                      keyExtractor={(item) => item.id}
                      style={{ flex: 1 }}
                      contentContainerStyle={{ paddingBottom: 16 }}
                      renderItem={({ item }) => {
                        const isModified = item.isEdited || item.resetToDefault;
                        // Chế độ cửa hàng: tag hiện thị trạng thái giá riêng
                        const hasCustom = item.hasCustomPrice && !item.resetToDefault;
                        // Chế độ nhóm: có cửa hàng nào lệch giá không?
                        const hasOutliers = customTargetType === 'group' && (item.outlierCount || 0) > 0 && !isModified;

                        return (
                          <View style={[
                            styles.customRowItem,
                            isModified && styles.customRowItemModified,
                            hasOutliers && styles.customRowItemOutlier,
                          ]}>
                            {/* Tên thịt & ĐVT & Tag trạng thái */}
                            <View style={{ flex: 1.4, paddingRight: 6 }}>
                              <Text style={styles.customRowName} numberOfLines={1}>
                                {item.name}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                                <Text style={styles.customRowUnit}>ĐVT: {item.unit}</Text>

                                {/* Tag chế độ cửa hàng: đang có giá riêng */}
                                {customTargetType === 'customer' && hasCustom && (
                                  <View style={styles.customTagHasPrice}>
                                    <Text style={styles.customTagHasPriceText}>✅ Giá riêng</Text>
                                  </View>
                                )}
                                {customTargetType === 'customer' && !hasCustom && !isModified && (
                                  <View style={[styles.customTagHasPrice, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}>
                                    <Text style={[styles.customTagHasPriceText, { color: '#64748B' }]}>Giá chung</Text>
                                  </View>
                                )}

                                {/* Tag chế độ nhóm: có outliers */}
                                {hasOutliers && (
                                  <View style={styles.customTagOutlier}>
                                    <Text style={styles.customTagOutlierText}>
                                      ⚠️ {item.outlierCount} CH lệch giá
                                    </Text>
                                  </View>
                                )}
                                {customTargetType === 'group' && !hasOutliers && !isModified && (item.majorityCount || 0) > 0 && (
                                  <View style={[styles.customTagHasPrice, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }]}>
                                    <Text style={[styles.customTagHasPriceText, { color: '#065F46' }]}>
                                      ✔ {item.majorityCount}/{item.totalCount} cùng giá
                                    </Text>
                                  </View>
                                )}
                                {item.resetToDefault && (
                                  <View style={styles.customTagReset}>
                                    <Text style={styles.customTagResetText}>Về gốc</Text>
                                  </View>
                                )}
                              </View>

                              {/* Hiện danh sách cửa hàng lệch giá (chế độ nhóm) */}
                              {hasOutliers && (
                                <View style={{ marginTop: 4 }}>
                                  {(item.outliers || []).slice(0, 3).map((o) => (
                                    <Text key={o.customerId} style={styles.customOutlierLabel}>
                                      • {o.customerName}: {formatCurrency(o.currentPrice)}
                                    </Text>
                                  ))}
                                  {(item.outliers || []).length > 3 && (
                                    <Text style={styles.customOutlierLabel}>
                                      ...và {item.outliers.length - 3} cửa hàng khác
                                    </Text>
                                  )}
                                </View>
                              )}
                            </View>

                            {/* Cột giá mạc định (cửa hàng) / số đông (nhóm) */}
                            <View style={{ width: 95, alignItems: 'center', justifyContent: 'center' }}>
                              {customTargetType === 'group' ? (
                                <Text style={[
                                  styles.customRowBasePrice,
                                  hasOutliers && { color: '#F59E0B', fontWeight: 'bold' },
                                ]}>
                                  {formatCurrency(item.majorityPrice ?? item.baseDefaultPrice)}
                                </Text>
                              ) : (
                                <Text style={styles.customRowBasePrice}>
                                  {formatCurrency(item.baseDefaultPrice)}
                                </Text>
                              )}
                            </View>

                            {/* Ô nhập giá mới */}
                            <View style={{ width: 110, paddingHorizontal: 4 }}>
                              <MoneyInput
                                style={[
                                  styles.customRowMoneyBox,
                                  isModified && styles.customRowMoneyBoxModified,
                                  hasCustom && !isModified && styles.customRowMoneyBoxHasCustom,
                                ]}
                                inputStyle={styles.customRowMoneyInput}
                                value={item.customPrice}
                                onChangeValue={(val) => handleCustomPriceChange(item.id, val)}
                                placeholder="Nhập giá..."
                              />
                            </View>

                            {/* Nút reset về giá gốc */}
                            <View style={{ width: 65, alignItems: 'center', justifyContent: 'center' }}>
                              <TouchableOpacity
                                style={[
                                  styles.customRowResetBtn,
                                  (item.customPrice === item.baseDefaultPrice && !item.hasCustomPrice && !hasOutliers) && styles.customRowResetBtnDisabled,
                                ]}
                                onPress={() => handleResetProductToDefault(item.id)}
                                disabled={item.customPrice === item.baseDefaultPrice && !item.hasCustomPrice && !hasOutliers}
                              >
                                <Text style={styles.customRowResetBtnText}>🔄 Gốc</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      }}
                      ListEmptyComponent={
                        <Text style={styles.emptyText}>
                          {customSearchQuery.trim()
                            ? `Không tìm thấy loại thịt nào khớp với "${customSearchQuery}".`
                            : 'Không có mặt hàng thịt nào trong danh mục.'}
                        </Text>
                      }
                    />
                  )}

                  {/* Footer của Tab Giá riêng: Nút lưu */}
                  <View style={styles.customFooterRow}>
                    <TouchableOpacity
                      style={[
                        styles.customSaveBtn,
                        (changedCustomCount === 0 || savingCustomPrices) && styles.customSaveBtnDisabled,
                      ]}
                      onPress={handleSaveCustomPrices}
                      disabled={changedCustomCount === 0 || savingCustomPrices}
                      activeOpacity={0.8}
                    >
                      {savingCustomPrices ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.customSaveBtnText}>
                          💾 LƯU BẢNG GIÁ RIÊNG {changedCustomCount > 0 ? `(${changedCustomCount} MẶT HÀNG)` : ''}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Nút đóng chân modal */}
          <TouchableOpacity
            style={[styles.closeButton, { height: 38, marginTop: 8 }]}
            onPress={() => setVisible(false)}
          >
            <Text style={[styles.closeButtonText, { fontSize: 14 }]}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>

      {/* ── MODAL CẬP NHẬT GIÁ ĐỒNG LOẠT (NHẬP 1 THỂ) ── */}
      <SmoothModal visible={batchModalVisible} onClose={() => setBatchModalVisible(false)}>
        <View style={styles.batchModalContainer}>
          {/* Header */}
          <View style={styles.batchModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.batchModalTitle}>⚡ CẬP NHẬT GIÁ ĐỒNG LOẠT</Text>
              <Text style={styles.batchModalSubtitle}>
                Nhập nhanh giá bán & giá nhập cho tất cả các loại thịt một lượt
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeHeaderButton}
              onPress={() => setBatchModalVisible(false)}
            >
              <Text style={styles.closeHeaderText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Ô tìm kiếm nhanh trong bảng cập nhật giá */}
          <View style={styles.batchSearchBox}>
            <TextInput
              style={styles.batchSearchInput}
              placeholder="🔍 Lọc nhanh loại thịt..."
              placeholderTextColor="#94A3B8"
              value={batchSearch}
              onChangeText={setBatchSearch}
            />
            {batchSearch ? (
              <TouchableOpacity
                style={styles.batchSearchClearBtn}
                onPress={() => setBatchSearch('')}
              >
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Tiêu đề các cột trong danh sách */}
          <View style={styles.batchTableHead}>
            <Text style={[styles.batchHeadCol, { flex: 1.2 }]}>Loại thịt</Text>
            <Text style={[styles.batchHeadCol, { width: 110, textAlign: 'center' }]}>Giá bán chung (VND)</Text>
            <Text style={[styles.batchHeadCol, { width: 110, textAlign: 'center' }]}>Giá nhập (VND)</Text>
          </View>

          {/* Danh sách các loại thịt cho nhập 1 thể */}
          <FlatList
            data={filteredBatchItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.batchListContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const sellChanged = item.defaultPrice !== item.originalDefaultPrice;
              const costChanged = item.costPrice !== item.originalCostPrice;
              const isChanged = sellChanged || costChanged;

              return (
                <View style={[styles.batchRowItem, isChanged && styles.batchRowItemChanged]}>
                  {/* Cột 1: Tên thịt và ĐVT */}
                  <View style={{ flex: 1.2, paddingRight: 6 }}>
                    <Text style={styles.batchItemName} numberOfLines={1}>
                      {item.name} <Text style={styles.batchItemUnit}>({item.unit})</Text>
                    </Text>
                    <Text style={styles.batchItemSub}>
                      Gốc: {formatCurrency(item.originalDefaultPrice)}
                    </Text>
                  </View>

                  {/* Cột 2: Ô nhập giá bán mới */}
                  <View style={{ width: 110 }}>
                    <MoneyInput
                      style={[styles.batchMoneyBox, sellChanged && styles.batchMoneyBoxChanged]}
                      inputStyle={styles.batchMoneyField}
                      value={item.defaultPrice}
                      onChangeValue={(val) => handleBatchPriceChange(item.id, 'defaultPrice', val)}
                      placeholder="0"
                    />
                    {sellChanged && (
                      <Text style={[styles.diffBadge, { color: item.defaultPrice > item.originalDefaultPrice ? '#DC2626' : '#16A34A' }]}>
                        {item.defaultPrice > item.originalDefaultPrice ? '↗️' : '↘️'} {formatCurrency(Math.abs(item.defaultPrice - item.originalDefaultPrice))}
                      </Text>
                    )}
                  </View>

                  {/* Cột 3: Ô nhập giá nhập mới */}
                  <View style={{ width: 110, marginLeft: 6 }}>
                    <MoneyInput
                      style={[styles.batchMoneyBox, costChanged && styles.batchMoneyBoxChanged]}
                      inputStyle={styles.batchMoneyField}
                      value={item.costPrice}
                      onChangeValue={(val) => handleBatchPriceChange(item.id, 'costPrice', val)}
                      placeholder="0"
                    />
                    {costChanged && (
                      <Text style={[styles.diffBadge, { color: '#0369A1' }]}>
                        {item.costPrice > item.originalCostPrice ? '↗️' : '↘️'} {formatCurrency(Math.abs(item.costPrice - item.originalCostPrice))}
                      </Text>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Không tìm thấy loại thịt nào khớp.</Text>
            }
          />

          {/* Thanh công cụ hành động phía dưới */}
          <View style={styles.batchFooterRow}>
            <TouchableOpacity
              style={styles.batchCancelBtn}
              onPress={() => setBatchModalVisible(false)}
              disabled={savingBatch}
            >
              <Text style={styles.batchCancelBtnText}>HỦY BỎ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.batchSaveBtn, changedBatchCount === 0 && styles.batchSaveBtnDisabled]}
              onPress={handleSaveBatchPrices}
              disabled={savingBatch || changedBatchCount === 0}
            >
              {savingBatch ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.batchSaveBtnText}>
                  💾 LƯU TẤT CẢ ({changedBatchCount} loại thịt đổi giá)
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>

      <PopupModal ref={popupModalRef} />
    </>
  );
});

export default ProductListModal;

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  modalView: {
    backgroundColor: COLORS.card,
    height: '100%', // Chiều cao chiếm trọn màn hình (full height)
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30, // Tránh tai thỏ và thanh trạng thái trên di động
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
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
  alertBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
  },
  alertError: {
    backgroundColor: COLORS.dangerLight,
    borderColor: '#FECACA',
  },
  alertSuccess: {
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  alertTextError: {
    color: COLORS.dangerDark,
    fontWeight: '600',
    fontSize: FONTS.body,
  },
  alertTextSuccess: {
    color: '#065F46',
    fontWeight: '600',
    fontSize: FONTS.body,
  },
  // Form thêm / cập nhật thịt - Tối ưu siêu gọn
  compactFormBox: {
    backgroundColor: '#FAF8F6',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1EFEA',
    marginBottom: 12,
  },
  compactHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  compactTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  batchOpenButton: {
    backgroundColor: '#0284C7',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  batchOpenButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  compactRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  compactInputName: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    height: 38,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: '#E4E2DD',
  },
  compactUnitGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  compactUnitBadge: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E2DD',
  },
  compactUnitBadgeSelected: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  compactUnitText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  compactUnitTextSelected: {
    color: COLORS.primaryDark,
    fontWeight: 'bold',
  },
  compactRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactMoneyContainer: {
    backgroundColor: '#FFFFFF',
    height: 38,
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: '#E4E2DD',
    justifyContent: 'center',
  },
  compactMoneyField: {
    fontSize: 13,
    color: COLORS.text,
  },
  compactAddButton: {
    backgroundColor: COLORS.primary,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactAddButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  compactSaveButton: {
    backgroundColor: COLORS.primary,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  compactCancelButton: {
    backgroundColor: COLORS.inputBg,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactCancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 20,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  productDetails: {
    flex: 1,
  },
  productNameText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productPriceText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  editButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  editButtonText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: 'bold',
  },
  deleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteButtonText: {
    color: COLORS.dangerDark,
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    marginVertical: 14,
  },
  searchContainer: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: '#FAF8F6',
    height: 38,
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 36,
    fontSize: 13,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: '#E4E2DD',
  },
  searchClearBtn: {
    position: 'absolute',
    right: 10,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  searchClearText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },

  // ── Styles Modal Cập nhật giá đồng loạt ──
  batchModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    maxHeight: '92%',
    height: '92%',
    flexDirection: 'column',
  },
  batchModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
  },
  batchModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  batchModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  batchSearchBox: {
    position: 'relative',
    marginBottom: 8,
  },
  batchSearchInput: {
    backgroundColor: '#F8FAFC',
    height: 38,
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 32,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    color: '#0F172A',
  },
  batchSearchClearBtn: {
    position: 'absolute',
    right: 10,
    top: 9,
  },
  batchTableHead: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  batchHeadCol: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  batchListContent: {
    paddingBottom: 16,
    gap: 6,
  },
  batchRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  batchRowItemChanged: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  batchItemName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  batchItemUnit: {
    fontSize: 11,
    fontWeight: 'normal',
    color: '#64748B',
  },
  batchItemSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  batchMoneyBox: {
    backgroundColor: '#FFFFFF',
    height: 36,
    borderRadius: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
  },
  batchMoneyBoxChanged: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
  },
  batchMoneyField: {
    fontSize: 12,
    color: '#0F172A',
  },
  diffBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
    textAlign: 'center',
  },
  batchFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  batchCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchCancelBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
  batchSaveBtn: {
    flex: 2,
    backgroundColor: COLORS.primary,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  batchSaveBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  batchSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // ── Styles Tab Bar & Tab Giá riêng theo Cửa hàng / Nhóm ──
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  tabButtonTextActive: {
    color: COLORS.primaryDark,
    fontWeight: 'bold',
  },
  targetTypeSegment: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  targetTypeBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetTypeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  targetTypeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  targetTypeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  // Hàng chứa segment chọn loại + nút thêm nhóm mới
  targetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  // Nút thêm nhóm mới
  addGroupBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexShrink: 0,
  },
  addGroupBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  // Card dialog nhập tên nhóm mới
  addGroupCard: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  addGroupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 6,
  },
  addGroupInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addGroupInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    height: 36,
    paddingHorizontal: 10,
    fontSize: 13,
    color: COLORS.text,
    outlineWidth: 0,
  },
  addGroupSubmitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    height: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addGroupSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyCustomSelectBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 10,
  },
  emptyCustomSelectTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyCustomSelectDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  customFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  customTargetBadge: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  customTargetBadgeText: {
    fontSize: 12,
    color: '#1E40AF',
  },
  customSearchBox: {
    width: 140,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 34,
  },
  customSearchInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
    padding: 0,
    outlineWidth: 0,
    outlineStyle: 'none',
  },
  customTableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 6,
  },
  customHeadCol: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  customRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    marginBottom: 4,
  },
  customRowItemModified: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  customRowName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  customRowUnit: {
    fontSize: 11,
    color: '#64748B',
  },
  customTagHasPrice: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  customTagHasPriceText: {
    fontSize: 10,
    color: '#166534',
    fontWeight: 'bold',
  },
  customTagReset: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  customTagResetText: {
    fontSize: 10,
    color: '#991B1B',
    fontWeight: 'bold',
  },
  customRowBasePrice: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  customRowMoneyBox: {
    backgroundColor: '#FAF8F6',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  customRowMoneyBoxModified: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFFFF',
  },
  // MoneyBox khi cửa hàng đang có giá riêng trong DB (chế độ từng cửa hàng)
  customRowMoneyBoxHasCustom: {
    borderColor: '#34D399',
    backgroundColor: '#ECFDF5',
  },
  // Row bị highlight khi có outliers trong chế độ nhóm
  customRowItemOutlier: {
    backgroundColor: '#FFFBEB',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  // Tag cảnh báo outlier
  customTagOutlier: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  customTagOutlierText: {
    fontSize: 10,
    color: '#92400E',
    fontWeight: 'bold',
  },
  // Label hiển thị từng cửa hàng lệch giá trong chế độ nhóm
  customOutlierLabel: {
    fontSize: 10,
    color: '#B45309',
    marginTop: 1,
  },
  customRowMoneyInput: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
    textAlign: 'center',
  },
  customRowResetBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customRowResetBtnDisabled: {
    opacity: 0.35,
  },
  customRowResetBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  customFooterRow: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 4,
  },
  customSaveBtn: {
    backgroundColor: COLORS.primary,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  customSaveBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  customSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
