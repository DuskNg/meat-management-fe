// meat-management-fe/src/components/BatchExportDebtModal.js
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Image,
  Platform,
  Linking,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import DatePickerInput from './DatePickerInput';
import CustomSelect from './CustomSelect';
import { showGlobalToast } from '../store/toastStore';
import { useCustomerGroups } from '../hooks/useCustomerGroups';
import { drawDebtImageCanvas, parseDDMMYYYY } from '../utils/debtImageDrawer';
import {
  downloadOrShareMultipleImages,
  downloadOrShareImage,
  isMobileDevice,
} from '../utils/imageShareHelper';
import { matchSearch, matchItemSearch } from '../utils/searchHelper';

// Helper lấy ngày hôm nay định dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Helper lấy khoảng ngày nhanh
const getPresetRange = (presetKey) => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  const y = today.getFullYear();
  const m = today.getMonth();

  if (presetKey === 'today') {
    const t = fmt(today);
    return { from: t, to: t };
  }

  if (presetKey === 'yesterday') {
    const yday = new Date(today);
    yday.setDate(today.getDate() - 1);
    const yStr = fmt(yday);
    return { from: yStr, to: yStr };
  }

  if (presetKey === 'last_7_days') {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return { from: fmt(from), to: fmt(today) };
  }

  if (presetKey === 'first_half') {
    return {
      from: `01/${pad(m + 1)}/${y}`,
      to: `15/${pad(m + 1)}/${y}`,
    };
  }

  if (presetKey === 'second_half') {
    const lastDay = new Date(y, m + 1, 0).getDate();
    return {
      from: `16/${pad(m + 1)}/${y}`,
      to: `${pad(lastDay)}/${pad(m + 1)}/${y}`,
    };
  }

  if (presetKey === 'this_month') {
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from: fmt(first), to: fmt(last) };
  }

  if (presetKey === 'last_month') {
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    return { from: fmt(first), to: fmt(last) };
  }

  // Toàn bộ: từ đầu năm đến nay
  if (presetKey === 'all') {
    return { from: `01/01/${y}`, to: fmt(today) };
  }

  return { from: fmt(today), to: fmt(today) };
};

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount || 0).replace('₫', 'đ');
};

/**
 * Modal Xuất công nợ hàng loạt (BatchExportDebtModal)
 * - Cho phép chọn nhiều khách hàng thành 1 nhóm và lưu lại dùng cho các lần sau.
 * - Cho phép chọn khoảng thời gian đối soát công nợ linh hoạt.
 * - Quy chuẩn tải/xuất ảnh:
 *   + Trên Web PC: Tự động tải tất cả các file ảnh về máy tính.
 *   + Trên Web Mobile: Chuyển tiếp tất cả ảnh xuất sang Zalo.
 */
const BatchExportDebtModal = forwardRef(({ popupModalRef, currentUserId }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customers, setCustomers] = useState([]);

  // Quản lý nhóm khách hàng đã lưu
  const { groups, saveGroup, deleteGroup, refreshGroups } = useCustomerGroups(currentUserId);
  const [selectedGroupId, setSelectedGroupId] = useState('has_debt');

  // Danh sách ID các khách hàng đang được chọn (Set)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');

  // Trạng thái modal lưu nhóm mới
  const [showSaveGroupDialog, setShowSaveGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Khoảng thời gian đối soát
  const [activePreset, setActivePreset] = useState('this_month');
  const [fromDate, setFromDate] = useState(getPresetRange('this_month').from);
  const [toDate, setToDate] = useState(getPresetRange('this_month').to);

  // Trạng thái tiến trình xuất nợ
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, currentName: '' });

  // Kết quả sau khi xuất thành công
  const [exportResults, setExportResults] = useState(null);
  // Xem trước ảnh phóng to (khi bấm vào thumbnail)
  const [zoomedImage, setZoomedImage] = useState(null);

  // Expose các phương thức modal qua forwardRef
  useImperativeHandle(ref, () => ({
    open: (initialSelectedIds = []) => {
      setVisible(true);
      setExportResults(null);
      setZoomedImage(null);
      setSearchKeyword('');
      fetchCustomers(initialSelectedIds);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Tải danh sách khách hàng hoạt động
  const fetchCustomers = async (initialSelectedIds = []) => {
    setLoadingCustomers(true);
    try {
      const res = await api.get('/customers?isBadDebt=false');
      const list = res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setCustomers(list);

      // Nếu có danh sách truyền vào sẵn, tick chọn
      if (initialSelectedIds && initialSelectedIds.length > 0) {
        setSelectedCustomerIds(new Set(initialSelectedIds));
        setSelectedGroupId('custom');
      } else {
        // Mặc định tự động chọn toàn bộ khách hàng đang có dư nợ > 0
        const debtCustomerIds = list
          .filter(c => (parseFloat(c.debt) || 0) > 0)
          .map(c => c.id);
        setSelectedCustomerIds(new Set(debtCustomerIds));
        setSelectedGroupId('has_debt');
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách khách hàng:', err);
      showGlobalToast('Không thể tải danh sách khách hàng.', 'error');
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Tính số dư nợ hiện tại của từng khách hàng và sắp xếp ưu tiên khách còn nợ (theo số nợ giảm dần)
  const customersWithDebt = useMemo(() => {
    return customers
      .map(c => {
        let currentDebt = 0;
        if (c.debt !== undefined && c.debt !== null) {
          currentDebt = Math.max(0, parseFloat(c.debt) || 0);
        } else {
          let totalDebt = 0;
          let totalPaid = 0;
          (c.transactions || []).forEach(t => {
            totalDebt += parseFloat(t.totalAmount || 0);
          });
          (c.payments || []).forEach(p => {
            totalPaid += parseFloat(p.amount || 0);
          });
          currentDebt = Math.max(0, totalDebt - totalPaid);
        }
        return {
          ...c,
          currentDebt,
        };
      })
      .sort((a, b) => {
        const debtA = a.currentDebt || 0;
        const debtB = b.currentDebt || 0;

        // Ưu tiên những người còn nợ lên đầu
        if (debtA > 0 && debtB <= 0) return -1;
        if (debtB > 0 && debtA <= 0) return 1;

        // Nếu cả hai đều còn nợ, xếp theo số nợ từ lớn đến bé
        if (debtA > 0 && debtB > 0) {
          return debtB - debtA;
        }

        // Nếu cả hai đều không còn nợ, sắp xếp theo tên theo bảng chữ cái tiếng Việt
        return (a.name || '').localeCompare(b.name || '', 'vi');
      });
  }, [customers]);

  // Lọc khách hàng theo ô tìm kiếm và ưu tiên khách thuộc nhóm đã chọn lên đầu
  const filteredCustomers = useMemo(() => {
    let list = customersWithDebt;
    if (searchKeyword.trim()) {
      list = list.filter(c => matchItemSearch(c, searchKeyword, ['name', 'phone', 'address', 'note']));
    }
    // Nếu đang chọn một nhóm cụ thể (không phải 'all' hay 'has_debt'), đưa khách hàng thuộc nhóm đó lên đầu danh sách
    if (selectedGroupId && selectedGroupId !== 'all' && selectedGroupId !== 'has_debt' && selectedCustomerIds.size > 0) {
      return [...list].sort((a, b) => {
        const inA = selectedCustomerIds.has(a.id);
        const inB = selectedCustomerIds.has(b.id);
        if (inA && !inB) return -1;
        if (!inA && inB) return 1;
        return 0;
      });
    }
    return list;
  }, [customersWithDebt, searchKeyword, selectedGroupId, selectedCustomerIds]);

  // Xử lý khi chọn một nhóm khách hàng
  const handleSelectGroup = (groupId) => {
    setSelectedGroupId(groupId);

    if (groupId === 'all') {
      // Chọn tất cả khách hàng
      setSelectedCustomerIds(new Set(customers.map(c => c.id)));
      return;
    }

    if (groupId === 'has_debt') {
      // Chọn khách hàng đang còn nợ > 0
      const debtIds = customersWithDebt.filter(c => c.currentDebt > 0).map(c => c.id);
      setSelectedCustomerIds(new Set(debtIds));
      return;
    }

    // Nhóm từ danh sách nhóm đã lưu hoặc portal
    const targetGroup = groups.find(g => g.id === groupId);
    if (targetGroup && targetGroup.customerIds) {
      const validIds = targetGroup.customerIds
        .map(id => customers.find(c => String(c.id) === String(id))?.id)
        .filter(Boolean);
      setSelectedCustomerIds(new Set(validIds));
    }
  };

  // Xử lý chọn/bỏ chọn từng khách hàng
  const toggleCustomer = (customerId) => {
    setSelectedCustomerIds(prev => {
      const next = new Set(prev);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  };

  // Chọn tất cả khách trong danh sách lọc
  const handleSelectAllFiltered = () => {
    setSelectedCustomerIds(prev => {
      const next = new Set(prev);
      filteredCustomers.forEach(c => next.add(c.id));
      return next;
    });
  };

  // Bỏ chọn tất cả khách
  const handleDeselectAll = () => {
    setSelectedCustomerIds(new Set());
    setSelectedGroupId(null);
  };

  // Áp dụng mốc thời gian nhanh (Presets)
  const handleApplyPreset = (presetKey) => {
    setActivePreset(presetKey);
    const range = getPresetRange(presetKey);
    setFromDate(range.from);
    setToDate(range.to);
  };

  // Thay đổi ngày tùy chọn
  const handleDateChange = (newFrom, newTo) => {
    setFromDate(newFrom);
    setToDate(newTo);
    setActivePreset('custom');
  };

  // Lưu nhóm khách hàng hiện tại
  const handleSaveCurrentGroup = async () => {
    if (!newGroupName.trim()) {
      showGlobalToast('Vui lòng nhập tên nhóm khách hàng.', 'warning');
      return;
    }
    if (selectedCustomerIds.size === 0) {
      showGlobalToast('Vui lòng chọn ít nhất 1 khách hàng để lưu vào nhóm.', 'warning');
      return;
    }

    const saved = await saveGroup(newGroupName.trim(), Array.from(selectedCustomerIds));
    if (saved) {
      showGlobalToast(`Đã lưu thành công "${saved.name}" (${saved.customerIds.length} khách)!`, 'success');
      setSelectedGroupId(saved.id);
      setShowSaveGroupDialog(false);
      setNewGroupName('');
    }
  };

  // Xác nhận xóa nhóm đã lưu
  const handleDeleteGroup = (group) => {
    if (popupModalRef && popupModalRef.current) {
      popupModalRef.current.show({
        type: 'confirm',
        title: 'Xóa nhóm khách hàng',
        message: `Bạn có chắc chắn muốn xóa nhóm "${group.name}"? Thao tác này không ảnh hưởng đến dữ liệu khách hàng.`,
        onConfirm: async () => {
          await deleteGroup(group.id);
          showGlobalToast('Đã xóa nhóm khách hàng thành công!', 'info');
          if (selectedGroupId === group.id) {
            setSelectedGroupId('all');
          }
        },
      });
    } else {
      deleteGroup(group.id);
    }
  };

  // ─── THỰC HIỆN XUẤT CÔNG NỢ HÀNG LOẠT ───
  const handleExecuteBatchExport = async () => {
    const targetCustomers = customers.filter(c => selectedCustomerIds.has(c.id));
    if (targetCustomers.length === 0) {
      showGlobalToast('Vui lòng chọn ít nhất một khách hàng để xuất công nợ.', 'warning');
      return;
    }

    setExporting(true);
    setExportProgress({ current: 0, total: targetCustomers.length, currentName: targetCustomers[0]?.name || '' });

    const results = [];
    const imagesToProcess = [];

    try {
      for (let i = 0; i < targetCustomers.length; i++) {
        const cust = targetCustomers[i];
        setExportProgress({ current: i + 1, total: targetCustomers.length, currentName: cust.name });

        try {
          // Lấy giao dịch & thanh toán của khách hàng
          const [transRes, payRes] = await Promise.all([
            api.get(`/transactions?customerId=${cust.id}`).catch(() => ({ data: { data: [] } })),
            api.get(`/payments?customerId=${cust.id}`).catch(() => ({ data: { data: [] } })),
          ]);

          const transList = transRes.data?.data || [];
          const payList = payRes.data?.data || [];

          // Vẽ ảnh canvas công nợ chuẩn Retina
          const drawResult = await drawDebtImageCanvas({
            transList,
            payList,
            cust,
            fromDate,
            toDate,
          });

          const itemData = {
            customer: cust,
            hasData: drawResult.hasTransactions,
            imageUri: drawResult.imageUri,
            totalMeatAmount: drawResult.totalMeatAmount,
            totalPaymentAmount: drawResult.totalPaymentAmount,
            totalReturnAmount: drawResult.totalReturnAmount,
            finalDebt: drawResult.finalDebt,
            rowsCount: drawResult.rowsCount,
          };

          results.push(itemData);

          if (drawResult.imageUri) {
            const cleanCustName = (cust.name || 'Khach').replace(/[^a-zA-Z0-9À-ỹ]/g, '_');
            const cleanFrom = fromDate.replace(/\//g, '-');
            const cleanTo = toDate.replace(/\//g, '-');
            const fileName = `Cong_no_${cleanCustName}_${cleanFrom}_${cleanTo}.png`;

            imagesToProcess.push({
              imageUri: drawResult.imageUri,
              fileName,
              customerName: cust.name,
              phone: cust.phone,
            });
          }
        } catch (itemErr) {
          console.error(`Lỗi xuất cho khách ${cust.name}:`, itemErr);
          results.push({
            customer: cust,
            hasData: false,
            error: 'Lỗi tải dữ liệu',
          });
        }
      }

      setExportResults({
        items: results,
        successImages: imagesToProcess,
        fromDate,
        toDate,
      });

      // Thực hiện quy chuẩn xuất ảnh:
      // - Web PC: Tự động tải tất cả các ảnh về máy tính
      // - Web Mobile: Chuyển tiếp tất cả ảnh vào Zalo
      if (imagesToProcess.length > 0) {
        await downloadOrShareMultipleImages({
          items: imagesToProcess,
          title: `Bảng kê công nợ (${fromDate} - ${toDate})`,
          text: `Bảng kê công nợ ${imagesToProcess.length} khách hàng`,
        });
      } else {
        showGlobalToast('Không có giao dịch phát sinh nào trong khoảng thời gian đã chọn.', 'warning');
      }

    } catch (globalErr) {
      console.error('Lỗi quy trình xuất hàng loạt:', globalErr);
      showGlobalToast('Có lỗi xảy ra trong quá trình xuất công nợ hàng loạt.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Chia sẻ / tải lại tất cả các ảnh
  const handleReShareAll = async () => {
    if (!exportResults?.successImages || exportResults.successImages.length === 0) {
      showGlobalToast('Không có ảnh nào để xuất lại.', 'warning');
      return;
    }
    await downloadOrShareMultipleImages({
      items: exportResults.successImages,
      title: `Bảng kê công nợ (${exportResults.fromDate} - ${exportResults.toDate})`,
      text: `Bảng kê công nợ ${exportResults.successImages.length} khách hàng`,
    });
  };

  // Tải hoặc gửi Zalo riêng cho một khách hàng
  const handleSingleItemAction = async (item) => {
    if (!item.imageUri) return;
    const cleanCustName = (item.customer.name || 'Khach').replace(/[^a-zA-Z0-9À-ỹ]/g, '_');
    const fileName = `Cong_no_${cleanCustName}_${fromDate.replace(/\//g, '-')}.png`;

    await downloadOrShareImage({
      imageUri: item.imageUri,
      fileName,
      title: `Bảng kê công nợ - ${item.customer.name}`,
      text: `Gửi bảng kê công nợ của ${item.customer.name}`,
      phone: item.customer.phone,
      customerName: item.customer.name,
    });
  };

  // Chuẩn bị danh sách options cho CustomSelect chọn nhóm
  const groupSelectOptions = useMemo(() => {
    const debtCount = customersWithDebt.filter(c => c.currentDebt > 0).length;
    const list = [
      { id: 'has_debt', name: `🔴 Khách đang còn nợ (${debtCount})` },
      { id: 'all', name: `👥 Tất cả khách hàng (${customers.length})` },
    ];
    groups.forEach(g => {
      list.push({
        id: g.id,
        name: `${g.source === 'portal' ? '🌐' : '📁'} ${g.name} (${g.count || 0})`,
        rawGroup: g,
      });
    });
    return list;
  }, [customers.length, customersWithDebt, groups]);

  const selectedGroupOption = groupSelectOptions.find(o => o.id === selectedGroupId) || null;

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.modalHeaderRow}>
          <View style={styles.modalTitleBox}>
            <Text style={styles.modalTitleIcon}>📊</Text>
            <View>
              <Text style={styles.modalTitle}>XUẤT CÔNG NỢ HÀNG LOẠT</Text>
              <Text style={styles.modalSubtitle}>
                {isMobileDevice() ? '📱 Chuyển tiếp Zalo nhiều khách' : '💻 Tải trọn bộ ảnh bảng kê về máy'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.modalCloseIconBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.modalCloseIconText}>✕</Text>
          </TouchableOpacity>
        </View>

        {loadingCustomers ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Đang tải danh sách khách hàng...</Text>
          </View>
        ) : exportResults ? (
          /* ─── MÀN HÌNH KẾT QUẢ XUẤT NỢ HÀNG LOẠT ─── */
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.resultBannerCard}>
              <Text style={styles.resultBannerTitle}>
                🎉 ĐÃ HOÀN TẤT XUẤT CÔNG NỢ
              </Text>
              <Text style={styles.resultBannerSub}>
                Khoảng ngày: <Text style={styles.bold}>{exportResults.fromDate} ➔ {exportResults.toDate}</Text>
                {' '}| Tổng số: <Text style={styles.bold}>{exportResults.items.length} khách</Text>
                {' '}| Có ảnh phát sinh: <Text style={styles.bold}>{exportResults.successImages.length}</Text>
              </Text>

              {/* Nút hành động tổng */}
              <View style={styles.resultActionRow}>
                <TouchableOpacity
                  style={[styles.reExportBtn, isMobileDevice() ? styles.zaloPrimaryBtn : styles.pcDownloadBtn]}
                  onPress={handleReShareAll}
                  activeOpacity={0.8}
                >
                  <Text style={styles.reExportBtnText}>
                    {isMobileDevice() ? '📲 Chuyển tiếp lại tất cả vào Zalo' : '💾 Tải lại tất cả ảnh về máy'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setExportResults(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.backBtnText}>🔄 Xuất nhóm khác</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Danh sách từng khách hàng đã xuất */}
            <Text style={styles.sectionHeaderLabel}>Chi tiết từng khách hàng:</Text>
            {exportResults.items.map((resItem, idx) => (
              <View key={resItem.customer.id || idx} style={styles.resultItemCard}>
                <View style={styles.resultItemInfo}>
                  <Text style={styles.resultItemName}>{resItem.customer.name}</Text>
                  <Text style={styles.resultItemPhone}>
                    📞 {resItem.customer.phone || 'Chưa có SĐT'}
                  </Text>
                  {resItem.hasData ? (
                    <View style={styles.resultItemMetrics}>
                      <Text style={styles.metricText}>
                        Tiền hàng: <Text style={styles.metricValue}>{formatCurrency(resItem.totalMeatAmount)}</Text>
                      </Text>
                      <Text style={styles.metricText}>
                        Đã thu: <Text style={styles.metricValueGreen}>{formatCurrency(resItem.totalPaymentAmount)}</Text>
                      </Text>
                      <Text style={styles.metricText}>
                        Còn nợ: <Text style={styles.metricValueRed}>{formatCurrency(resItem.finalDebt)}</Text>
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noDataWarningText}>
                      ⚠️ Không có phát sinh giao dịch trong khoảng ngày này
                    </Text>
                  )}
                </View>

                {resItem.imageUri && (
                  <View style={styles.resultItemActions}>
                    <TouchableOpacity
                      style={styles.thumbnailBtn}
                      onPress={() => setZoomedImage(resItem.imageUri)}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: resItem.imageUri }} style={styles.thumbnailImg} resizeMode="contain" />
                      <Text style={styles.thumbnailZoomText}>🔍 Xem</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.itemDirectActionBtn, isMobileDevice() ? styles.zaloMiniBtn : styles.pcMiniBtn]}
                      onPress={() => handleSingleItemAction(resItem)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.itemDirectActionBtnText}>
                        {isMobileDevice() ? '💬 Zalo' : '💾 Tải'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            <View style={{ height: 30 }} />
          </ScrollView>
        ) : (
          /* ─── MÀN HÌNH CẤU HÌNH & CHỌN KHÁCH / THỜI GIAN ─── */
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* BƯỚC 1: CHỌN NHÓM & QUẢN LÝ NHÓM KHÁCH HÀNG */}
            <View style={styles.stepCard}>
              <View style={styles.stepHeaderRow}>
                <Text style={styles.stepNumberBadge}>1</Text>
                <Text style={styles.stepTitle}>CHỌN NHÓM KHÁCH HÀNG</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {selectedGroupOption?.source === 'saved' && (
                    <TouchableOpacity
                      style={[styles.saveGroupTriggerBtn, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                      onPress={() => handleDeleteGroup(selectedGroupOption)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.saveGroupTriggerText, { color: '#DC2626' }]}>
                        🗑️ Xóa nhóm
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.saveGroupTriggerBtn}
                    onPress={() => setShowSaveGroupDialog(prev => !prev)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveGroupTriggerText}>
                      {showSaveGroupDialog ? 'Đóng' : '💾 Lưu nhóm mới'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Hộp thoại nhanh nhập tên để lưu nhóm mới */}
              {showSaveGroupDialog && (
                <View style={styles.saveGroupCard}>
                  <Text style={styles.saveGroupLabel}>
                    Đặt tên cho nhóm {selectedCustomerIds.size} khách hàng đang chọn:
                  </Text>
                  <View style={styles.saveGroupInputRow}>
                    <TextInput
                      style={styles.saveGroupInput}
                      placeholder="Ví dụ: Nhóm Trường Hoàng, Nhóm Bếp, Quán Phở..."
                      placeholderTextColor={COLORS.textLight}
                      value={newGroupName}
                      onChangeText={setNewGroupName}
                    />
                    <TouchableOpacity
                      style={styles.saveGroupSubmitBtn}
                      onPress={handleSaveCurrentGroup}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.saveGroupSubmitBtnText}>LƯU</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Dropdown CustomSelect chọn nhóm */}
              <View style={{ zIndex: 999999, elevation: 999999, marginVertical: 8 }}>
                <CustomSelect
                  value={selectedGroupOption}
                  options={groupSelectOptions}
                  onSelect={(opt) => handleSelectGroup(opt.id)}
                  renderSelected={(opt) => (opt ? opt.name : 'Chọn nhóm khách hàng...')}
                  getOptionLabel={(opt) => (opt ? opt.name : '')}
                  placeholder="Chọn nhóm khách hàng..."
                />
              </View>

              {/* Ô tìm kiếm khách hàng & thanh công cụ chọn */}
              <View style={styles.filterBarRow}>
                <TextInput
                  style={styles.searchCustomerInput}
                  placeholder="🔍 Tìm tên khách hàng, số điện thoại..."
                  placeholderTextColor={COLORS.textLight}
                  value={searchKeyword}
                  onChangeText={setSearchKeyword}
                />
                <View style={styles.bulkSelectButtons}>
                  <TouchableOpacity
                    style={styles.miniTextBtn}
                    onPress={handleSelectAllFiltered}
                  >
                    <Text style={styles.miniTextBtnLabel}>Chọn tất cả ({filteredCustomers.length})</Text>
                  </TouchableOpacity>
                  <Text style={styles.dividerSlash}>|</Text>
                  <TouchableOpacity
                    style={styles.miniTextBtn}
                    onPress={handleDeselectAll}
                  >
                    <Text style={styles.miniTextBtnLabel}>Bỏ chọn</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Danh sách khách hàng kèm Checkbox */}
              <View style={styles.customerListContainer}>
                <View style={styles.customerListHeader}>
                  <Text style={styles.customerListHeaderCount}>
                    Đã tích chọn: <Text style={styles.boldPrimary}>{selectedCustomerIds.size}</Text> / {customers.length} khách
                  </Text>
                </View>

                <ScrollView style={styles.customerScroll} nestedScrollEnabled={true}>
                  {filteredCustomers.length === 0 ? (
                    <Text style={styles.emptySearchText}>Không tìm thấy khách hàng phù hợp.</Text>
                  ) : (
                    filteredCustomers.map((cust) => {
                      const isSelected = selectedCustomerIds.has(cust.id);
                      return (
                        <TouchableOpacity
                          key={cust.id}
                          style={[styles.customerItemRow, isSelected && styles.selectedCustomerRow]}
                          onPress={() => toggleCustomer(cust.id)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.checkboxSquare, isSelected && styles.checkboxSquareActive]}>
                            {isSelected && <Text style={styles.checkmarkIcon}>✓</Text>}
                          </View>

                          <View style={styles.customerItemCol}>
                            <Text style={styles.customerItemName} numberOfLines={1}>
                              {cust.name}
                            </Text>
                            <Text style={styles.customerItemSub}>
                              📞 {cust.phone || 'Chưa có SĐT'}
                            </Text>
                          </View>

                          <View style={styles.customerDebtBadge}>
                            <Text style={cust.currentDebt > 0 ? styles.debtBadgeRed : styles.debtBadgeGreen}>
                              {cust.currentDebt > 0 ? formatCurrency(cust.currentDebt) : '0 đ'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </View>

            {/* BƯỚC 2: CHỌN THỜI GIAN ĐỐI SOÁT CÔNG NỢ */}
            <View style={styles.stepCard}>
              <View style={styles.stepHeaderRow}>
                <Text style={styles.stepNumberBadge}>2</Text>
                <Text style={styles.stepTitle}>CHỌN THỜI GIAN XUẤT CÔNG NỢ</Text>
              </View>

              {/* Các nút chọn nhanh mốc thời gian */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
                {[
                  { key: 'today', label: 'Hôm nay' },
                  { key: 'yesterday', label: 'Hôm qua' },
                  { key: 'last_7_days', label: '7 ngày qua' },
                  { key: 'first_half', label: 'Kỳ 1 (01-15)' },
                  { key: 'second_half', label: 'Kỳ 2 (16-Hết)' },
                  { key: 'this_month', label: 'Tháng này' },
                  { key: 'last_month', label: 'Tháng trước' },
                  { key: 'all', label: 'Toàn bộ' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.presetChip,
                      activePreset === item.key && styles.activePresetChip,
                    ]}
                    onPress={() => handleApplyPreset(item.key)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        activePreset === item.key && styles.activePresetChipText,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Hàng 2 ô chọn ngày Từ ngày ➔ Đến ngày */}
              <View style={styles.dateInputsRow}>
                <View style={styles.dateInputCol}>
                  <Text style={styles.dateInputSubLabel}>Từ ngày</Text>
                  <DatePickerInput
                    value={fromDate}
                    onChange={(val) => handleDateChange(val, toDate)}
                    allowFuture={true}
                    compact={true}
                  />
                </View>

                <View style={styles.dateInputDivider}>
                  <Text style={styles.dateInputDividerText}>➔</Text>
                </View>

                <View style={styles.dateInputCol}>
                  <Text style={styles.dateInputSubLabel}>Đến ngày</Text>
                  <DatePickerInput
                    value={toDate}
                    onChange={(val) => handleDateChange(fromDate, val)}
                    allowFuture={true}
                    compact={true}
                  />
                </View>
              </View>
            </View>

            {/* BƯỚC 3: NÚT THỰC HIỆN XUẤT HÀNG LOẠT */}
            <View style={styles.footerActionContainer}>
              {exporting ? (
                <View style={styles.exportProgressBox}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.exportProgressText}>
                    Đang xử lý ({exportProgress.current}/{exportProgress.total}): {exportProgress.currentName}...
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.primaryExportBtn,
                    selectedCustomerIds.size === 0 && styles.disabledExportBtn,
                    isMobileDevice() ? styles.zaloPrimaryBtn : styles.pcDownloadBtn,
                  ]}
                  onPress={handleExecuteBatchExport}
                  disabled={selectedCustomerIds.size === 0}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryExportBtnText}>
                    {isMobileDevice()
                      ? `📲 XUẤT & CHUYỂN TIẾP ZALO (${selectedCustomerIds.size} KHÁCH)`
                      : `💻 XUẤT & TẢI VỀ MÁY TÍNH (${selectedCustomerIds.size} KHÁCH)`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ height: 20 }} />
          </ScrollView>
        )}

        {/* MODAL PHÓNG TO ẢNH XEM TRƯỚC */}
        {zoomedImage && (
          <SmoothModal visible={Boolean(zoomedImage)} onClose={() => setZoomedImage(null)} centered={true}>
            <View style={styles.zoomModalView}>
              <View style={styles.zoomModalHeader}>
                <Text style={styles.zoomModalTitle}>BẢNG KÊ CÔNG NỢ</Text>
                <TouchableOpacity onPress={() => setZoomedImage(null)}>
                  <Text style={styles.modalCloseIconText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView maximumZoomScale={3} minimumZoomScale={1} style={styles.zoomScroll}>
                <Image source={{ uri: zoomedImage }} style={styles.zoomedFullImg} resizeMode="contain" />
              </ScrollView>
            </View>
          </SmoothModal>
        )}
      </View>
    </SmoothModal>
  );
});

export default BatchExportDebtModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    width: '100%',
    maxWidth: 720,
    maxHeight: '94%',
    alignSelf: 'center',
    marginHorizontal: 'auto',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flex: 1,
    ...SHADOWS.card,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#F8FAFC',
  },
  modalTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitleIcon: {
    fontSize: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  modalCloseIconBtn: {
    padding: 6,
  },
  modalCloseIconText: {
    fontSize: 20,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  loadingBox: {
    flex: 1,
    padding: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  stepCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 14,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: 'bold',
    fontSize: 12,
    marginRight: 8,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
    flex: 1,
  },
  saveGroupTriggerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  saveGroupTriggerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  saveGroupCard: {
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  saveGroupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 6,
  },
  saveGroupInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  saveGroupInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#93C5FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0F172A',
  },
  saveGroupSubmitBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  saveGroupSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  groupTagsScroll: {
    marginVertical: 8,
  },
  groupTagWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  groupTagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  activeGroupTagChip: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  groupTagText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#334155',
  },
  activeGroupTagText: {
    color: '#15803D',
    fontWeight: 'bold',
  },
  deleteGroupMiniBtn: {
    marginLeft: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteGroupMiniText: {
    fontSize: 10,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  filterBarRow: {
    marginTop: 8,
    marginBottom: 6,
  },
  searchCustomerInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  bulkSelectButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  miniTextBtn: {
    paddingVertical: 2,
  },
  miniTextBtnLabel: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '500',
  },
  dividerSlash: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  customerListContainer: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  customerListHeader: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  customerListHeaderCount: {
    fontSize: 12,
    color: '#475569',
  },
  boldPrimary: {
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },
  customerScroll: {
    maxHeight: 180,
  },
  customerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  selectedCustomerRow: {
    backgroundColor: '#F0FDF4',
  },
  checkboxSquare: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },
  checkboxSquareActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmarkIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  customerItemCol: {
    flex: 1,
  },
  customerItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  customerItemSub: {
    fontSize: 11,
    color: '#64748B',
  },
  customerDebtBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  debtBadgeRed: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  debtBadgeGreen: {
    fontSize: 12,
    fontWeight: '500',
    color: '#059669',
  },
  emptySearchText: {
    textAlign: 'center',
    color: '#94A3B8',
    paddingVertical: 20,
    fontSize: 13,
  },
  presetScroll: {
    marginVertical: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  activePresetChip: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  presetChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  activePresetChipText: {
    color: '#1D4ED8',
    fontWeight: 'bold',
  },
  dateInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  dateInputCol: {
    flex: 1,
  },
  dateInputSubLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  dateInputDivider: {
    paddingTop: 16,
  },
  dateInputDividerText: {
    fontSize: 16,
    color: '#94A3B8',
  },
  footerActionContainer: {
    marginTop: 6,
    marginBottom: 10,
  },
  exportProgressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  exportProgressText: {
    fontSize: 13.5,
    color: COLORS.primaryDark,
    fontWeight: '600',
  },
  primaryExportBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  disabledExportBtn: {
    opacity: 0.5,
  },
  pcDownloadBtn: {
    backgroundColor: '#0F766E', // Xanh đậm chuyên nghiệp
  },
  zaloPrimaryBtn: {
    backgroundColor: '#0068FF', // Xanh Zalo thương hiệu
  },
  primaryExportBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  resultBannerCard: {
    backgroundColor: '#F0FDF4',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 16,
  },
  resultBannerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#15803D',
    marginBottom: 4,
  },
  resultBannerSub: {
    fontSize: 12.5,
    color: '#166534',
    marginBottom: 10,
  },
  bold: {
    fontWeight: 'bold',
  },
  resultActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reExportBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reExportBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  backBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#475569',
    fontSize: 12.5,
    fontWeight: '600',
  },
  sectionHeaderLabel: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 8,
  },
  resultItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 8,
  },
  resultItemInfo: {
    flex: 1,
  },
  resultItemName: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  resultItemPhone: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  resultItemMetrics: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  metricText: {
    fontSize: 11.5,
    color: '#475569',
  },
  metricValue: {
    fontWeight: '600',
    color: '#0F172A',
  },
  metricValueGreen: {
    fontWeight: '600',
    color: '#059669',
  },
  metricValueRed: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  noDataWarningText: {
    fontSize: 11.5,
    color: '#D97706',
    marginTop: 4,
  },
  resultItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  thumbnailBtn: {
    alignItems: 'center',
  },
  thumbnailImg: {
    width: 44,
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  thumbnailZoomText: {
    fontSize: 10,
    color: '#2563EB',
    marginTop: 2,
  },
  itemDirectActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pcMiniBtn: {
    backgroundColor: '#0F766E',
  },
  zaloMiniBtn: {
    backgroundColor: '#0068FF',
  },
  itemDirectActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  zoomModalView: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '95%',
    maxWidth: 900,
    maxHeight: '90%',
    padding: 14,
    alignSelf: 'center',
    marginHorizontal: 'auto',
  },
  zoomModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  zoomModalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  zoomScroll: {
    marginTop: 10,
    maxHeight: 600,
  },
  zoomedFullImg: {
    width: '100%',
    height: 550,
  },
});
