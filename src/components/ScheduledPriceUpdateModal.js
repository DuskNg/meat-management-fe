// meat-management-fe/src/components/ScheduledPriceUpdateModal.js
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { api } from '../api/client';
import SmoothModal from './SmoothModal';
import DatePickerInput from './DatePickerInput';
import CustomSelect from './CustomSelect';
import MoneyInput from './MoneyInput';
import PopupModal from './PopupModal';
import { showGlobalToast } from '../store/toastStore';

const formatCurrency = (val) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);

// Chuyển YYYY-MM-DD sang DD/MM/YYYY
const formatYMDToDMY = (ymd) => {
  if (!ymd || typeof ymd !== 'string') return '';
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Chuyển DD/MM/YYYY sang YYYY-MM-DD
const formatDMYToYMD = (dmy) => {
  if (!dmy || typeof dmy !== 'string') return '';
  const parts = dmy.split('/');
  if (parts.length !== 3) return dmy;
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
};

// Lấy ngày mặc định (ngày mai theo giờ Việt Nam)
const getTomorrowVN = () => {
  const now = new Date();
  const vnTomorrow = new Date(now.getTime() + (7 * 60 + 24 * 60) * 60 * 1000);
  const y = vnTomorrow.getUTCFullYear();
  const m = String(vnTomorrow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vnTomorrow.getUTCDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
};

// Kiểm tra sản phẩm giả lập (Tiền hàng / Trả hàng nhanh) không phải loại thịt thật
const isQuickDebtProduct = (prod) => {
  const n = (prod?.name || '').trim().toLowerCase();
  return n === 'tiền hàng' || n.startsWith('tiền') || n === 'trả hàng nhanh' || n === 'ghi nợ nhanh';
};

// Modal lên lịch tự động cập nhật giá thịt vào ngày đã chọn
const ScheduledPriceUpdateModal = forwardRef(({ onApplied }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Form tạo/sửa lịch
  const [editingId, setEditingId] = useState(null);
  const [targetDateDMY, setTargetDateDMY] = useState(() => getTomorrowVN());
  const [scope, setScope] = useState('DEFAULT'); // 'DEFAULT' | 'CUSTOMER'
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]); // [{ productId, productName, oldPrice, newPrice }]
  const [note, setNote] = useState('');
  const [errorText, setErrorText] = useState('');

  // State nâng zIndex khi mở dropdown CustomSelect
  const [activeDropdown, setActiveDropdown] = useState(null); // 'customer' | 'product' | null

  // Tăng/giảm đồng loạt bằng MoneyInput
  const [bulkAmount, setBulkAmount] = useState(0);
  const [bulkSign, setBulkSign] = useState(1);

  const popupRef = useRef(null);

  // Tải danh sách lịch, sản phẩm và khách hàng
  const fetchData = async () => {
    try {
      setLoading(true);
      const [schedRes, prodRes, custRes] = await Promise.all([
        api.get('/scheduled-price-updates'),
        api.get('/products'),
        api.get('/customers'),
      ]);

      if (schedRes.data?.success) {
        setSchedules(Array.isArray(schedRes.data.data) ? schedRes.data.data : []);
      }
      if (prodRes.data?.success) {
        const cleanProds = (prodRes.data.data || []).filter((p) => !isQuickDebtProduct(p));
        setProducts(cleanProds);
      }
      if (custRes.data?.success) {
        setCustomers(Array.isArray(custRes.data.data) ? custRes.data.data : []);
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu lịch cập nhật giá:', err);
      showGlobalToast('Không thể tải dữ liệu lịch cập nhật giá.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTargetDateDMY(getTomorrowVN());
    setScope('DEFAULT');
    setSelectedCustomerIds([]);
    setSelectedItems([]);
    setNote('');
    setErrorText('');
    setBulkAmount(0);
    setBulkSign(1);
  };

  useImperativeHandle(ref, () => ({
    open: () => {
      resetForm();
      setVisible(true);
      fetchData();
    },
    close: () => setVisible(false),
    submit: () => handleSave(),
  }));

  // Thêm loại thịt vào danh sách lịch (nếu đang chọn đúng 1 khách thì ưu tiên lấy giá riêng hiện tại của khách đó)
  const handleAddProduct = async (prod) => {
    if (!prod || selectedItems.some((it) => it.productId === prod.id)) return;

    let basePrice = Number(prod.defaultPrice) || 0;
    if (scope === 'CUSTOMER' && selectedCustomerIds.length > 0) {
      try {
        const res = await api.get(`/products?customerId=${selectedCustomerIds[0]}`);
        if (res.data?.success && Array.isArray(res.data.data)) {
          const matched = res.data.data.find((p) => p.id === prod.id);
          if (matched) {
            basePrice = Number(matched.effectivePrice ?? matched.customPrice ?? matched.defaultPrice) || basePrice;
          }
        }
      } catch {}
    }

    setSelectedItems((prev) => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        oldPrice: basePrice,
        newPrice: basePrice,
      },
    ]);
  };

  // Nạp tất cả món thịt có giá riêng của khách hàng đầu tiên đang chọn
  const handleLoadAllCustomMeats = async () => {
    if (selectedCustomerIds.length === 0) {
      showGlobalToast('Vui lòng chọn ít nhất 1 khách hàng trước.', 'warning');
      return;
    }
    try {
      const res = await api.get(`/products?customerId=${selectedCustomerIds[0]}`);
      if (res.data?.success && Array.isArray(res.data.data)) {
        const customProds = res.data.data.filter(
          (p) => !isQuickDebtProduct(p) && p.hasCustomPrice
        );
        if (customProds.length === 0) {
          showGlobalToast('Khách hàng này chưa có món thịt nào cài giá riêng.', 'info');
          return;
        }
        setSelectedItems((prev) => {
          const existingIds = new Set(prev.map((it) => it.productId));
          const additions = customProds
            .filter((p) => !existingIds.has(p.id))
            .map((p) => {
              const curP = Number(p.customPrice ?? p.effectivePrice ?? p.defaultPrice) || 0;
              return {
                productId: p.id,
                productName: p.name,
                oldPrice: curP,
                newPrice: curP,
              };
            });
          return [...prev, ...additions];
        });
        showGlobalToast(`Đã nạp ${customProds.length} món có giá riêng của khách.`, 'success');
      }
    } catch {
      showGlobalToast('Không thể tải giá riêng của khách hàng.', 'error');
    }
  };

  // Áp dụng tăng/giảm đồng loạt cho các món thịt đang chọn
  const handleApplyBulkAdjust = () => {
    const delta = (Number(bulkAmount) || 0) * (bulkSign === -1 ? -1 : 1);
    if (!delta) {
      showGlobalToast('Vui lòng nhập mức tăng/giảm (VD: gõ 5 -> 5.000 đ).', 'warning');
      return;
    }
    if (selectedItems.length === 0) return;

    setSelectedItems((prev) =>
      prev.map((it) => ({
        ...it,
        newPrice: Math.max(0, (Number(it.newPrice) || 0) + delta),
      }))
    );
    setBulkAmount(0);
    showGlobalToast(
      `Đã điều chỉnh ${delta > 0 ? '+' : '-'}${formatCurrency(Math.abs(delta))} cho ${selectedItems.length} món.`,
      'success'
    );
  };

  // Lưu lịch tạo mới / chỉnh sửa
  const handleSave = async () => {
    if (!targetDateDMY) {
      setErrorText('Vui lòng chọn ngày tự động cập nhật giá.');
      return;
    }
    if (scope === 'CUSTOMER' && selectedCustomerIds.length === 0) {
      setErrorText('Vui lòng chọn ít nhất 1 khách hàng khi cập nhật giá riêng.');
      return;
    }
    if (selectedItems.length === 0) {
      setErrorText('Vui lòng chọn ít nhất 1 loại thịt và nhập giá mới.');
      return;
    }

    setErrorText('');
    setSaving(true);
    try {
      const payload = {
        targetDate: formatDMYToYMD(targetDateDMY),
        scope,
        customerIds: scope === 'CUSTOMER' ? selectedCustomerIds : [],
        items: selectedItems.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          newPrice: Math.round(Number(it.newPrice) || 0),
        })),
        note: note.trim(),
      };

      const res = editingId
        ? await api.put(`/scheduled-price-updates/${editingId}`, payload)
        : await api.post('/scheduled-price-updates', payload);

      if (res.data?.success) {
        showGlobalToast(res.data.message || 'Đã lưu lịch cập nhật giá thịt.', 'success');
        resetForm();
        await fetchData();
        if (res.data?.data?.status === 'APPLIED') {
          onApplied?.();
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Không thể lưu lịch cập nhật giá.';
      setErrorText(msg);
      showGlobalToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Nạp lịch vào form để sửa
  const handleStartEdit = (sched) => {
    setEditingId(sched.id);
    setTargetDateDMY(formatYMDToDMY(sched.targetDate));
    setScope(sched.scope === 'CUSTOMER' ? 'CUSTOMER' : 'DEFAULT');
    setSelectedCustomerIds(Array.isArray(sched.customerIds) ? sched.customerIds : []);
    setSelectedItems(
      (sched.items || []).map((it) => ({
        productId: it.productId,
        productName: it.productName,
        oldPrice: it.newPrice,
        newPrice: it.newPrice,
      }))
    );
    setNote(sched.note || '');
    setErrorText('');
  };

  // Áp dụng ngay lập tức trước ngày hẹn
  const handleApplyNow = (sched) => {
    popupRef.current?.show({
      type: 'confirm',
      title: 'Áp dụng giá ngay bây giờ',
      message: `Bạn có muốn cập nhật ngay ${(sched.items || []).length} món thịt trong lịch ngày ${formatYMDToDMY(sched.targetDate)} không?`,
      onConfirm: async () => {
        try {
          const res = await api.post(`/scheduled-price-updates/${sched.id}/apply-now`);
          if (res.data?.success) {
            showGlobalToast(res.data.message || 'Đã áp dụng cập nhật giá!', 'success');
            await fetchData();
            onApplied?.();
          }
        } catch (err) {
          showGlobalToast(err.response?.data?.message || 'Lỗi khi áp dụng lịch giá.', 'error');
        }
      },
    });
  };

  // Xóa lịch
  const handleDelete = (sched) => {
    popupRef.current?.show({
      type: 'confirm',
      title: 'Xóa lịch cập nhật giá',
      message: `Bạn có chắc chắn muốn xóa lịch ngày ${formatYMDToDMY(sched.targetDate)} không?`,
      onConfirm: async () => {
        try {
          const res = await api.delete(`/scheduled-price-updates/${sched.id}`);
          if (res.data?.success) {
            showGlobalToast('Đã xóa lịch cập nhật giá.', 'success');
            if (editingId === sched.id) resetForm();
            await fetchData();
          }
        } catch {
          showGlobalToast('Lỗi khi xóa lịch cập nhật giá.', 'error');
        }
      },
    });
  };

  const customerNameMap = new Map(customers.map((c) => [c.id, c.name]));

  const getStatusBadge = (status) => {
    if (status === 'APPLIED') return { label: 'Đã áp dụng', bg: '#DCFCE7', color: '#15803D' };
    if (status === 'FAILED') return { label: 'Lỗi', bg: '#FEE2E2', color: '#B91C1C' };
    return { label: 'Chờ đến ngày', bg: '#DBEAFE', color: '#1D4ED8' };
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)} zIndex={88000}>
        <View style={styles.modalView}>
          {/* Header chuẩn Bottom-Sheet */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>⏰ LÊN LỊCH CẬP NHẬT GIÁ THỊT</Text>
              <Text style={styles.headerSub}>Đến ngày đã chọn, hệ thống tự động đổi giá thịt</Text>
            </View>
            <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            {/* Form lên lịch */}
            <View style={styles.formCard}>
              <Text style={styles.label}>NGÀY TỰ ĐỘNG CẬP NHẬT *</Text>
              <DatePickerInput
                value={targetDateDMY}
                onChange={setTargetDateDMY}
                allowFuture={true}
                dense={true}
                showIcon={true}
              />

              {/* Phạm vi áp dụng */}
              <Text style={[styles.label, { marginTop: 10 }]}>PHẠM VI ÁP DỤNG *</Text>
              <View style={styles.scopeRow}>
                <TouchableOpacity
                  style={[styles.scopeBtn, scope === 'DEFAULT' && styles.scopeBtnActive]}
                  onPress={() => setScope('DEFAULT')}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.scopeBtnText, scope === 'DEFAULT' && styles.scopeBtnTextActive]}>
                    🏪 Giá chung sạp
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scopeBtn, scope === 'CUSTOMER' && styles.scopeBtnActive]}
                  onPress={() => setScope('CUSTOMER')}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.scopeBtnText, scope === 'CUSTOMER' && styles.scopeBtnTextActive]}>
                    👥 Giá riêng khách
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Chọn khách hàng nếu phạm vi là CUSTOMER */}
              {scope === 'CUSTOMER' && (
                <View style={[styles.dropdownWrap, activeDropdown === 'customer' && { zIndex: 999999, elevation: 999999 }]}>
                  <Text style={[styles.label, { marginTop: 10 }]}>CHỌN KHÁCH HÀNG *</Text>
                  <CustomSelect
                    value={null}
                    placeholder="🔍 Tìm & thêm khách hàng..."
                    options={customers}
                    getOptionLabel={(c) => c?.name || ''}
                    renderSelected={() => ''}
                    onSelect={(c) => {
                      if (c?.id && !selectedCustomerIds.includes(c.id)) {
                        setSelectedCustomerIds((prev) => [...prev, c.id]);
                      }
                    }}
                    compact={true}
                    zIndex={999999}
                    onOpenChange={(isOpen) => setActiveDropdown(isOpen ? 'customer' : null)}
                  />
                  {selectedCustomerIds.length > 0 && (
                    <View style={styles.chipsWrap}>
                      {selectedCustomerIds.map((cId) => (
                        <TouchableOpacity
                          key={cId}
                          style={styles.custChip}
                          onPress={() => setSelectedCustomerIds((prev) => prev.filter((id) => id !== cId))}
                        >
                          <Text style={styles.custChipText}>
                            {customerNameMap.get(cId) || 'Khách hàng'} ✕
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Chọn món thịt */}
              <View style={[styles.dropdownWrap, activeDropdown === 'product' && { zIndex: 999999, elevation: 999999 }]}>
                <View style={styles.meatHeaderRow}>
                  <Text style={[styles.label, { marginTop: 10, marginBottom: 0 }]}>CHỌN LOẠI THỊT & GIÁ MỚI *</Text>
                  {scope === 'CUSTOMER' && selectedCustomerIds.length > 0 && (
                    <TouchableOpacity onPress={handleLoadAllCustomMeats} style={styles.loadCustomBtn}>
                      <Text style={styles.loadCustomBtnText}>📋 Nạp thịt có giá riêng</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ marginTop: 5 }}>
                  <CustomSelect
                    value={null}
                    placeholder="🥩 Gõ tìm & thêm loại thịt..."
                    options={products}
                    getOptionLabel={(p) => p?.name || ''}
                    renderSelected={() => ''}
                    onSelect={handleAddProduct}
                    compact={true}
                    zIndex={999999}
                    onOpenChange={(isOpen) => setActiveDropdown(isOpen ? 'product' : null)}
                  />
                </View>
              </View>

              {/* Thanh tăng/giảm đồng loạt bằng MoneyInput */}
              {selectedItems.length > 0 && (
                <View style={styles.bulkBar}>
                  <Text style={styles.bulkLabel}>⚡ Tăng/giảm đồng loạt ({selectedItems.length} món):</Text>
                  <View style={styles.bulkRow}>
                    <TouchableOpacity
                      style={[styles.signBtn, bulkSign === -1 && styles.signBtnMinus]}
                      onPress={() => setBulkSign((s) => (s === -1 ? 1 : -1))}
                    >
                      <Text style={[styles.signBtnText, bulkSign === -1 && styles.signBtnTextMinus]}>
                        {bulkSign === -1 ? '➖ Giảm' : '➕ Tăng'}
                      </Text>
                    </TouchableOpacity>
                    <MoneyInput
                      value={bulkAmount}
                      onChangeValue={setBulkAmount}
                      placeholder="Gõ 5 -> 5.000..."
                      style={{ flex: 1, marginBottom: 0 }}
                      inputStyle={styles.bulkInput}
                    />
                    <TouchableOpacity style={styles.bulkApplyBtn} onPress={handleApplyBulkAdjust}>
                      <Text style={styles.bulkApplyText}>Áp dụng</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Danh sách thịt đang cấu hình giá mới */}
              {selectedItems.length > 0 && (
                <View style={styles.itemsList}>
                  {selectedItems.map((it) => (
                    <View key={it.productId} style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{it.productName}</Text>
                        <Text style={styles.itemOldPrice}>Hiện tại: {formatCurrency(it.oldPrice)}</Text>
                      </View>
                      <MoneyInput
                        value={it.newPrice}
                        onChangeValue={(val) =>
                          setSelectedItems((prev) =>
                            prev.map((p) => (p.productId === it.productId ? { ...p, newPrice: val } : p))
                          )
                        }
                        textAlign="right"
                        style={{ width: 120, marginBottom: 0 }}
                        inputStyle={styles.itemPriceInput}
                      />
                      <TouchableOpacity
                        style={styles.removeItemBtn}
                        onPress={() =>
                          setSelectedItems((prev) => prev.filter((p) => p.productId !== it.productId))
                        }
                      >
                        <Text style={styles.removeItemText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={[styles.label, { marginTop: 10 }]}>GHI CHÚ (TÙY CHỌN)</Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="VD: Tăng giá bò từ đầu tuần..."
                placeholderTextColor="#94A3B8"
              />

              {Boolean(errorText) && <Text style={styles.errorText}>{errorText}</Text>}

              <View style={styles.formActions}>
                {editingId && (
                  <TouchableOpacity style={styles.cancelEditBtn} onPress={resetForm}>
                    <Text style={styles.cancelEditText}>Hủy sửa</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.65 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {editingId ? '💾 Cập nhật lịch giá' : '💾 Lưu lịch hẹn giá'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Bảng danh sách lịch đã tạo */}
            <Text style={styles.listTitle}>DANH SÁCH LỊCH ĐÃ TẠO ({schedules.length})</Text>
            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.emptyText}>Đang tải danh sách lịch...</Text>
              </View>
            ) : schedules.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyText}>Chưa có lịch hẹn cập nhật giá nào.</Text>
              </View>
            ) : (
              <View style={styles.tableBox}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thText, { width: 82 }]}>Ngày áp dụng</Text>
                  <Text style={[styles.thText, { flex: 1 }]}>Chi tiết giá mới</Text>
                  <Text style={[styles.thText, { width: 72, textAlign: 'center' }]}>Trạng thái</Text>
                  <Text style={[styles.thText, { width: 96, textAlign: 'right' }]}>Thao tác</Text>
                </View>
                {schedules.map((sched, idx) => {
                  const badge = getStatusBadge(sched.status);
                  const scopeLabel =
                    sched.scope === 'CUSTOMER'
                      ? `👥 ${(sched.customerIds || []).map((id) => customerNameMap.get(id) || 'Khách').join(', ')}`
                      : '🏪 Giá chung sạp';
                  const itemsSummary = (sched.items || [])
                    .map((it) => `${it.productName}: ${formatCurrency(it.newPrice)}`)
                    .join(' • ');

                  return (
                    <View key={sched.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={[styles.tdDate, { width: 82 }]}>{formatYMDToDMY(sched.targetDate)}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tdScope}>{scopeLabel}</Text>
                        <Text style={styles.tdItems} numberOfLines={3}>{itemsSummary}</Text>
                      </View>
                      <View style={{ width: 72, alignItems: 'center' }}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                      </View>
                      <View style={styles.rowActions}>
                        {sched.status !== 'APPLIED' && (
                          <>
                            <TouchableOpacity
                              style={[styles.iconBtn, { backgroundColor: '#DCFCE7' }]}
                              onPress={() => handleApplyNow(sched)}
                              title="Áp dụng ngay"
                            >
                              <Text style={styles.iconBtnText}>⚡</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconBtn}
                              onPress={() => handleStartEdit(sched)}
                              title="Sửa"
                            >
                              <Text style={styles.iconBtnText}>✏️</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        <TouchableOpacity
                          style={[styles.iconBtn, styles.iconBtnDanger]}
                          onPress={() => handleDelete(sched)}
                          title="Xóa"
                        >
                          <Text style={styles.iconBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.footerCloseBtn} onPress={() => setVisible(false)} activeOpacity={0.8}>
            <Text style={styles.footerCloseText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>

      <PopupModal ref={popupRef} />
    </>
  );
});

ScheduledPriceUpdateModal.displayName = 'ScheduledPriceUpdateModal';
export default ScheduledPriceUpdateModal;

const styles = StyleSheet.create({
  modalView: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: { flex: 1, paddingRight: 8 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A' },
  headerSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 15, fontWeight: 'bold', color: '#475569' },
  bodyScroll: { flexShrink: 1, marginTop: 12, marginBottom: 10 },
  formCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  label: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 5 },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  scopeBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  scopeBtnText: { fontSize: 12.5, fontWeight: '600', color: '#475569' },
  scopeBtnTextActive: { color: '#1D4ED8', fontWeight: '700' },
  dropdownWrap: { zIndex: 100 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  custChip: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  custChipText: { fontSize: 11.5, fontWeight: '700', color: '#1E40AF' },
  meatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  loadCustomBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  loadCustomBtnText: { fontSize: 11, fontWeight: '700', color: '#047857' },
  bulkBar: {
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 6,
  },
  bulkLabel: { fontSize: 11.5, fontWeight: '700', color: '#92400E' },
  bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signBtn: {
    height: 36,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signBtnMinus: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  signBtnText: { fontSize: 11.5, fontWeight: '700', color: '#15803D' },
  signBtnTextMinus: { color: '#B91C1C' },
  bulkInput: {
    height: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  bulkApplyBtn: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkApplyText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  itemsList: { marginTop: 8, gap: 6 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  itemName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  itemOldPrice: { fontSize: 11, color: '#64748B', marginTop: 1 },
  itemPriceInput: {
    height: 34,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  removeItemBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeItemText: { fontSize: 12, fontWeight: 'bold', color: '#DC2626' },
  noteInput: {
    height: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  errorText: { color: '#DC2626', fontSize: 12, fontWeight: '600', marginTop: 6 },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  cancelEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
  },
  cancelEditText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  listTitle: { fontSize: 12, fontWeight: 'bold', color: '#334155', marginTop: 14, marginBottom: 6 },
  centerBox: { paddingVertical: 18, alignItems: 'center', gap: 6 },
  emptyText: { fontSize: 13, color: '#64748B' },
  tableBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 6,
  },
  thText: { fontSize: 11, fontWeight: 'bold', color: '#475569' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  tableRowAlt: { backgroundColor: '#F8FAFC' },
  tdDate: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  tdScope: { fontSize: 11.5, fontWeight: '700', color: '#1E293B' },
  tdItems: { fontSize: 11.5, color: '#475569', marginTop: 2 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  rowActions: { width: 96, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDanger: { backgroundColor: '#FEF2F2' },
  iconBtnText: { fontSize: 12.5 },
  footerCloseBtn: {
    height: 46,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCloseText: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
});
