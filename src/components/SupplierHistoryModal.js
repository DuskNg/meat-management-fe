// meat-management-fe/src/components/SupplierHistoryModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import ExportSupplierHistoryModal from './ExportSupplierHistoryModal';
import EditSupplierTransactionModal from './EditSupplierTransactionModal';
import EditSupplierPaymentModal from './EditSupplierPaymentModal';
import InvoiceImageViewerModal from './InvoiceImageViewerModal';
import PopupModal from './PopupModal';
import { showGlobalToast } from '../store/toastStore';

// Modal xem lịch sử dòng công nợ của nhà cung cấp kèm sửa/xóa giao dịch
const SupplierHistoryModal = forwardRef(({ supplier, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState(supplier);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectContainerZIndex, setSelectContainerZIndex] = useState(10);
  const activeSupplierIdRef = useRef(null);
  const exportSupplierHistoryModalRef = useRef(null);
  const editSupplierTransactionModalRef = useRef(null);
  const editSupplierPaymentModalRef = useRef(null);
  const imageViewerRef = useRef(null);
  const popupModalRef = useRef(null);
  const [expandedTransIds, setExpandedTransIds] = useState(new Set());

  // Đồng bộ nhà cung cấp khi prop supplier thay đổi
  useEffect(() => {
    if (supplier) {
      setCurrentSupplier(supplier);
    }
  }, [supplier]);

  useImperativeHandle(ref, () => ({
    open: (targetSupplier) => {
      // Ưu tiên targetSupplier được truyền trực tiếp khi mở modal để tránh stale state
      const activeSup = targetSupplier || supplier || currentSupplier;
      if (activeSup) {
        setCurrentSupplier(activeSup);
      }
      // Dọn dẹp dữ liệu cũ và chuẩn bị tải dữ liệu mới
      setHistory([]);
      setError('');
      setSelectedMonth('ALL');
      setVisible(true);

      if (activeSup?.id) {
        fetchHistory(activeSup.id);
      }
    },
    close: () => {
      setVisible(false);
    },
    refresh: () => {
      const activeId = currentSupplier?.id || supplier?.id;
      if (activeId) {
        fetchHistory(activeId);
      }
    },
  }));

  const fetchHistory = async (supplierId) => {
    const id = supplierId || currentSupplier?.id || supplier?.id;
    if (!id) {
      setLoading(false);
      return;
    }

    activeSupplierIdRef.current = id;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/suppliers/${id}/history`);
      // Đảm bảo chỉ cập nhật state nếu kết quả trả về đúng với nhà cung cấp đang được chọn
      if (activeSupplierIdRef.current === id) {
        if (response.data?.success) {
          setHistory(response.data.data || []);
          if (response.data?.supplier) {
            setCurrentSupplier((prev) => ({
              ...(prev || {}),
              ...response.data.supplier,
            }));
          }
        } else {
          setError(response.data?.message || 'Không thể tải lịch sử giao dịch.');
        }
      }
    } catch (err) {
      if (activeSupplierIdRef.current === id) {
        setError(err.response?.data?.message || 'Có lỗi khi kết nối máy chủ.');
      }
    } finally {
      if (activeSupplierIdRef.current === id) {
        setLoading(false);
      }
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  // Trích xuất danh sách các tháng có dữ liệu giao dịch
  const availableMonths = useMemo(() => {
    const set = new Set();
    history.forEach((item) => {
      if (item.date) {
        const d = new Date(item.date);
        if (!isNaN(d.getTime())) {
          const mStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
          set.add(mStr);
        }
      }
    });

    return Array.from(set).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return yB !== yA ? yB - yA : mB - mA;
    });
  }, [history]);

  // Tạo options cho CustomSelect
  const monthOptions = useMemo(() => [
    { id: 'ALL', name: 'Toàn bộ thời gian' },
    ...availableMonths.map((m) => ({ id: m, name: `Tháng ${m}` }))
  ], [availableMonths]);

  // Lọc danh sách giao dịch theo tháng đã chọn
  const filteredHistory = useMemo(() => {
    if (!selectedMonth || selectedMonth === 'ALL') return history;
    return history.filter((item) => {
      if (!item.date) return false;
      const d = new Date(item.date);
      if (isNaN(d.getTime())) return false;
      const mStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
      return mStr === selectedMonth;
    });
  }, [history, selectedMonth]);

  // Tính tổng nợ nhập hàng, tổng tiền đã trả và chênh lệch cho danh sách đã lọc
  const { totalDebt, totalPayment, balance } = useMemo(() => {
    let debt = 0;
    let payment = 0;
    filteredHistory.forEach((it) => {
      const amt = parseFloat(it.amount || 0);
      if (it.type === 'DEBT') {
        debt += amt;
      } else {
        payment += amt;
      }
    });
    return {
      totalDebt: debt,
      totalPayment: payment,
      balance: debt - payment,
    };
  }, [filteredHistory]);

  // Tính toán danh sách các ngày trong tháng không có tiền hàng nhập (DEBT) tính từ ngày tạo khách/NCC đến ngày hiện tại
  const { targetMonthKey, missingDays, maxEvaluatedDay, minEvaluatedDay, isCreatedAfter } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1 - 12
    const currentDay = now.getDate();

    let targetM = selectedMonth;
    if (!targetM || targetM === 'ALL') {
      const curM = `${String(currentMonth).padStart(2, '0')}/${currentYear}`;
      targetM = availableMonths.includes(curM) ? curM : (availableMonths[0] || curM);
    }

    if (!targetM || !targetM.includes('/')) {
      return { targetMonthKey: '', missingDays: [], maxEvaluatedDay: 0, minEvaluatedDay: 0, isCreatedAfter: false };
    }

    const [monthNum, yearNum] = targetM.split('/').map(Number);
    const totalDaysInMonth = new Date(yearNum, monthNum, 0).getDate();

    let maxDay = 0;
    if (yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth)) {
      // Tháng trong quá khứ -> tính toàn bộ các ngày trong tháng
      maxDay = totalDaysInMonth;
    } else if (yearNum === currentYear && monthNum === currentMonth) {
      // Tháng hiện tại -> chỉ tính đến ngày hôm nay (không liệt kê ngày tương lai)
      maxDay = currentDay;
    } else {
      // Tháng trong tương lai -> không tính
      maxDay = 0;
    }

    // Xét ngày bắt đầu tạo khách hàng / nhà cung cấp:
    // Nếu khách mới tạo giữa tháng thì các ngày trước ngày tạo tất nhiên không có đơn, không tính là ngày thiếu!
    const createdDateRaw = currentSupplier?.createdAt || supplier?.createdAt;
    let minDay = 1;
    let isCreatedAfterMonth = false;

    if (createdDateRaw) {
      const cDate = new Date(createdDateRaw);
      if (!isNaN(cDate.getTime())) {
        const cYear = cDate.getFullYear();
        const cMonth = cDate.getMonth() + 1;
        const cDay = cDate.getDate();

        if (yearNum < cYear || (yearNum === cYear && monthNum < cMonth)) {
          // Tháng đang xem diễn ra trước khi khách/NCC được tạo trên hệ thống
          isCreatedAfterMonth = true;
          return {
            targetMonthKey: targetM,
            missingDays: [],
            maxEvaluatedDay: 0,
            minEvaluatedDay: 0,
            isCreatedAfter: true,
          };
        } else if (yearNum === cYear && monthNum === cMonth) {
          // Khách/NCC được tạo trong chính tháng này -> chỉ xét từ ngày bắt đầu tạo trở đi
          minDay = Math.max(1, cDay);
        } else {
          // Khách/NCC đã được tạo ở các tháng trước đó -> xét từ ngày 1
          minDay = 1;
        }
      }
    }

    // Tập hợp các ngày có tiền hàng nhập (DEBT)
    const daysWithDebt = new Set();
    history.forEach((it) => {
      if (it.type === 'DEBT' && it.date) {
        const d = new Date(it.date);
        if (!isNaN(d.getTime())) {
          const itemMonth = d.getMonth() + 1;
          const itemYear = d.getFullYear();
          if (itemMonth === monthNum && itemYear === yearNum) {
            daysWithDebt.add(d.getDate());
          }
        }
      }
    });

    const missing = [];
    for (let day = minDay; day <= maxDay; day++) {
      if (!daysWithDebt.has(day)) {
        missing.push(day);
      }
    }

    return {
      targetMonthKey: targetM,
      missingDays: missing,
      maxEvaluatedDay: maxDay,
      minEvaluatedDay: minDay,
      isCreatedAfter: isCreatedAfterMonth,
    };
  }, [selectedMonth, availableMonths, history, currentSupplier?.createdAt, supplier?.createdAt]);

  const selectedMonthOption = monthOptions.find((opt) => opt.id === selectedMonth) || monthOptions[0];

  // Mở modal sửa giao dịch
  const handleEditItem = (item) => {
    const sName = currentSupplier?.name || supplier?.name || '';
    if (item.type === 'DEBT') {
      editSupplierTransactionModalRef.current?.open(item, sName, currentSupplier?.id || supplier?.id);
    } else {
      editSupplierPaymentModalRef.current?.open(item, sName);
    }
  };

  // Xác nhận xóa giao dịch
  const confirmDeleteItem = (item) => {
    const isDebt = item.type === 'DEBT';
    const typeLabel = isDebt ? 'đơn nhập hàng' : 'lượt trả tiền';
    const formattedAmt = formatCurrency(item.amount);
    const dateFormatted = formatDate(item.date);

    popupModalRef.current?.show({
      type: 'confirm',
      title: 'XÁC NHẬN XÓA GIAO DỊCH',
      message: `Bạn có chắc chắn muốn xóa ${typeLabel} ${formattedAmt} (ngày ${dateFormatted}) không? Thao tác này sẽ cập nhật lại số dư công nợ.`,
      onConfirm: () => handleDeleteItem(item),
    });
  };

  // Thực hiện xóa giao dịch qua API
  const handleDeleteItem = async (item) => {
    try {
      const endpoint = item.type === 'DEBT'
        ? `/suppliers/transactions/${item.id}`
        : `/suppliers/payments/${item.id}`;

      const response = await api.delete(endpoint);
      if (response.data?.success) {
        showGlobalToast('Đã xóa giao dịch thành công!', 'success');
        fetchHistory(currentSupplier?.id || supplier?.id);
        if (onRefresh) onRefresh();
      } else {
        showGlobalToast(response.data?.message || 'Không thể xóa giao dịch.', 'error');
      }
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Có lỗi xảy ra khi xóa giao dịch.', 'error');
    }
  };

  // Tải lại dữ liệu sau khi sửa thành công
  const handleSubModalRefresh = () => {
    fetchHistory(currentSupplier?.id || supplier?.id);
    if (onRefresh) onRefresh();
  };

  // Mở/thu gọn chi tiết món thịt của đơn nợ
  const toggleExpandTrans = (id) => {
    setExpandedTransIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Mở trình xem ảnh/video chứng từ
  const handleOpenMediaViewer = (mediaUrls, transItem) => {
    if (!mediaUrls || mediaUrls.length === 0) return;
    const formattedImages = mediaUrls.map((m, idx) => {
      const url = m.url || m;
      const isVideo = m.fileType === 'VIDEO' || /\.(mp4|mov|qt|avi|webm|m4v|3gp|mkv)$/i.test(url);
      return {
        id: `media-${idx}`,
        imageUrl: url,
        title: isVideo ? `Video chứng từ #${idx + 1}` : `Ảnh chứng từ #${idx + 1}`,
        isVideo,
      };
    });

    imageViewerRef.current?.open({
      images: formattedImages,
      title: `Chứng từ NCC: ${currentSupplier?.name || ''}`,
      subtitle: `Giao dịch ngày ${formatDate(transItem.date)} (${formatCurrency(transItem.amount)}đ)`,
    });
  };

  const renderHistoryItem = ({ item }) => {
    const isDebt = item.type === 'DEBT';
    const hasItems = Array.isArray(item.items) && item.items.length > 0;
    const hasMedia = Array.isArray(item.mediaUrls) && item.mediaUrls.length > 0;
    const isExpanded = expandedTransIds.has(item.id);
    return (
      <View style={styles.historyCard}>
        <View style={styles.cardMain}>
          <View style={styles.cardLeft}>
            <View style={[styles.typeBadge, isDebt ? styles.badgeDebt : styles.badgePayment]}>
              <Text style={[styles.typeText, isDebt ? styles.textDebt : styles.textPayment]}>
                {isDebt ? '📥 Nhập nợ' : '💵 Trả tiền'}
              </Text>
            </View>
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          </View>

          <View style={styles.cardRight}>
            <Text style={[styles.amountText, isDebt ? styles.amountDebt : styles.amountPayment]}>
              {isDebt ? '+' : '-'}{formatCurrency(item.amount)}
            </Text>
            {item.note ? <Text style={styles.noteText} numberOfLines={2}>{item.note}</Text> : null}
          </View>
        </View>

        {/* Khối hiển thị chi tiết các món thịt nếu có */}
        {hasItems && (
          <View style={styles.detailItemsContainer}>
            <TouchableOpacity
              style={styles.btnToggleDetailItems}
              onPress={() => toggleExpandTrans(item.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.btnToggleDetailText}>
                🥩 Chi tiết: {item.items.length} món thịt {isExpanded ? '▲ Thu gọn' : '▼ Xem chi tiết'}
              </Text>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.expandedItemsList}>
                {item.items.map((it, idx) => (
                  <View key={idx} style={styles.expandedItemRow}>
                    <Text style={styles.expandedItemName}>
                      • {it.productName || 'Thịt'}: {it.quantity || 0}{it.unit || 'kg'} x {formatCurrency(it.price)}đ
                    </Text>
                    <Text style={styles.expandedItemAmount}>
                      {formatCurrency(it.amount || 0)} đ
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Khối nút bấm xem ảnh & video chứng từ nếu có */}
        {hasMedia && (
          <View style={styles.mediaContainer}>
            <TouchableOpacity
              style={styles.btnViewMedia}
              onPress={() => handleOpenMediaViewer(item.mediaUrls, item)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnViewMediaText}>
                📸 Xem {item.mediaUrls.length} ảnh/video chứng từ
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Hàng nút bấm thao tác Sửa & Xóa */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionBtnEdit}
            onPress={() => handleEditItem(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.actionBtnEditText}>✏️ Sửa</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnDelete}
            onPress={() => confirmDeleteItem(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.actionBtnDeleteText}>🗑️ Xóa</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Giao diện chú thích các ngày không có tiền hàng
  const renderMissingDaysCard = () => {
    if (!targetMonthKey) return null;

    if (isCreatedAfter) {
      return (
        <View style={styles.missingDaysCard}>
          <View style={styles.missingDaysHeaderRow}>
            <Text style={styles.missingDaysIcon}>ℹ️</Text>
            <Text style={styles.missingDaysTitle}>
              Chưa có giao dịch tháng {targetMonthKey}
            </Text>
          </View>
          <Text style={styles.missingDaysSubtitle}>
            NCC được tạo sau tháng này nên chưa có dữ liệu.
          </Text>
        </View>
      );
    }

    if (maxEvaluatedDay <= 0) return null;

    const [mNum, yNum] = targetMonthKey.split('/').map(Number);
    const mStr = mNum < 10 ? `0${mNum}` : `${mNum}`;
    const maxDayStr = maxEvaluatedDay < 10 ? `0${maxEvaluatedDay}` : `${maxEvaluatedDay}`;
    const minDayStr = minEvaluatedDay < 10 ? `0${minEvaluatedDay}` : `${minEvaluatedDay}`;

    return (
      <View style={styles.missingDaysCard}>
        {/* Hàng tiêu đề + badge */}
        <View style={styles.missingDaysHeaderRow}>
          <Text style={styles.missingDaysIcon}>📌</Text>
          <Text style={styles.missingDaysTitle} numberOfLines={2}>
            Ngày thiếu tiền hàng – Tháng {targetMonthKey}
            {minEvaluatedDay > 1 ? ` (từ ngày ${minDayStr})` : ''}
          </Text>
          <View style={[
            styles.missingCountBadge,
            missingDays.length > 0 ? styles.missingCountBadgeActive : styles.missingCountBadgeZero
          ]}>
            <Text style={[
              styles.missingCountText,
              missingDays.length > 0 ? styles.missingCountTextActive : styles.missingCountTextZero
            ]}>
              {missingDays.length > 0 ? `${missingDays.length} ngày` : '✓ Đủ'}
            </Text>
          </View>
        </View>

        {/* Chips ngày hoặc thông báo đủ */}
        {missingDays.length > 0 ? (
          <>
            <View style={styles.daysChipContainer}>
              {missingDays.map((d) => (
                <View key={d} style={styles.dayChip}>
                  <Text style={styles.dayChipText}>
                    {d < 10 ? `0${d}` : d}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.missingDaysSubtitle}>
              {'* Đến ngày '}{maxDayStr}/{mStr}{', các ngày trên chưa có tiền hàng nhập.'}
            </Text>
          </>
        ) : (
          <Text style={styles.allDaysPresentText}>
            🎉 Tất cả các ngày đều có đơn nhập hàng (đến ngày {maxDayStr}/{mStr})!
          </Text>
        )}
      </View>
    );
  };

  // Xóa nhà cung cấp ngay từ modal lịch sử
  const confirmDeleteSupplierFromHistory = () => {
    const targetSup = currentSupplier || supplier;
    if (!targetSup) return;
    const debtVal = balance !== undefined ? balance : (targetSup.debt || 0);
    const hasDebt = debtVal > 0;
    const warningMsg = hasDebt
      ? `Nhà cung cấp "${targetSup.name}" hiện đang có dư nợ ${formatCurrency(debtVal)}. Bạn có chắc chắn muốn xóa nhà cung cấp này không? Lịch sử giao dịch vẫn được lưu trữ an toàn.`
      : `Bạn có chắc chắn muốn xóa nhà cung cấp "${targetSup.name}" không?`;

    popupModalRef.current?.show({
      title: 'Xác nhận xóa nhà cung cấp',
      message: warningMsg,
      type: 'confirm',
      confirmText: 'Xóa ngay',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          const res = await api.delete(`/suppliers/${targetSup.id}`);
          if (res.data.success) {
            showGlobalToast(`Đã xóa nhà cung cấp "${targetSup.name}" thành công!`, 'success');
            setVisible(false);
            if (typeof onRefresh === 'function') onRefresh();
          } else {
            showGlobalToast(res.data.message || 'Không thể xóa nhà cung cấp.', 'error');
          }
        } catch (err) {
          showGlobalToast(err.response?.data?.message || 'Có lỗi xảy ra khi xóa nhà cung cấp.', 'error');
        }
      },
    });
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          <View style={styles.historyModalHeaderRow}>
            <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
              <Text style={styles.modalTitle}>👁️ LỊCH SỬ GIAO DỊCH</Text>
              <Text style={styles.supplierName} numberOfLines={1}>
                Nhà cung cấp: {currentSupplier?.name || supplier?.name || ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.btnDeleteSupplierHeader}
              onPress={confirmDeleteSupplierFromHistory}
              activeOpacity={0.7}
            >
              <Text style={styles.btnDeleteSupplierHeaderText}>🗑️ Xóa NCC</Text>
            </TouchableOpacity>
          </View>

          {/* Thanh lọc tháng và nút xuất ảnh */}
          <View style={[styles.filterBar, { zIndex: selectContainerZIndex }]}>
            <View style={styles.selectWrapper}>
              <CustomSelect
                options={monthOptions}
                value={selectedMonthOption}
                placeholder="Lọc theo tháng..."
                onSelect={(item) => setSelectedMonth(item.id)}
                renderSelected={(m) => m?.name || ''}
                zIndex={999999}
                onOpenChange={(isOpen) => setSelectContainerZIndex(isOpen ? 999999 : 10)}
              />
            </View>

            <TouchableOpacity
              style={styles.exportBtn}
              onPress={() => {
                const now = new Date();
                const currentMonthStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
                const targetMonth = selectedMonth === 'ALL'
                  ? (availableMonths[0] || currentMonthStr)
                  : selectedMonth;
                exportSupplierHistoryModalRef.current?.open(currentSupplier || supplier, targetMonth, history);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.exportBtnText}>🖼️ Xuất ảnh</Text>
            </TouchableOpacity>
          </View>

          {/* Thanh thống kê nhanh theo tháng đang lọc */}
          <View style={styles.summaryBar}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Tiền hàng nhập (+)</Text>
              <Text style={styles.summaryValueDebt}>+{formatCurrency(totalDebt)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Đã trả (-)</Text>
              <Text style={styles.summaryValuePayment}>-{formatCurrency(totalPayment)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Chênh lệch</Text>
              <Text style={[
                styles.summaryValueBalance,
                balance > 0 ? styles.textDebt : (balance < 0 ? styles.textPayment : styles.textNeutral)
              ]}>
                {balance > 0 ? '+' : ''}{formatCurrency(balance)}
              </Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => fetchHistory(currentSupplier?.id || supplier?.id)}
              >
                <Text style={styles.retryText}>Thử lại 🔄</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredHistory}
              renderItem={renderHistoryItem}
              keyExtractor={(item) => `${item.type || 'tx'}-${item.id}`}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={renderMissingDaysCard}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {selectedMonth === 'ALL'
                      ? 'Chưa có giao dịch nhập hàng hay trả tiền nào được ghi nhận.'
                      : `Không có giao dịch nào trong Tháng ${selectedMonth}.`}
                  </Text>
                </View>
              }
            />
          )}

          <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>

      {/* Modal xuất báo cáo lịch sử dạng ảnh */}
      <ExportSupplierHistoryModal ref={exportSupplierHistoryModalRef} />

      {/* Modal chỉnh sửa đơn nhập hàng */}
      <EditSupplierTransactionModal
        ref={editSupplierTransactionModalRef}
        onRefresh={handleSubModalRefresh}
      />

      {/* Modal chỉnh sửa giao dịch trả tiền */}
      <EditSupplierPaymentModal
        ref={editSupplierPaymentModalRef}
        onRefresh={handleSubModalRefresh}
      />

      {/* Modal xem phóng to ảnh & video chứng từ NCC */}
      <InvoiceImageViewerModal ref={imageViewerRef} />

      {/* Modal xác nhận xóa */}
      <PopupModal ref={popupModalRef} />
    </>
  );
});

export default SupplierHistoryModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  historyModalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  btnDeleteSupplierHeader: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  btnDeleteSupplierHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    position: 'relative',
  },
  selectWrapper: {
    flex: 1,
  },
  exportBtn: {
    backgroundColor: '#0284C7',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  summaryValueDebt: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  summaryValuePayment: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#16A34A',
  },
  summaryValueBalance: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },
  textNeutral: {
    color: COLORS.text,
  },
  listContent: {
    paddingBottom: 20,
  },
  historyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeDebt: {
    backgroundColor: '#FFE2E2',
  },
  badgePayment: {
    backgroundColor: '#E8F5E9',
  },
  typeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textDebt: {
    color: '#D32F2F',
  },
  textPayment: {
    color: '#388E3C',
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  cardRight: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 10,
  },
  amountText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  amountDebt: {
    color: '#D32F2F', // Màu đỏ cho nợ tăng thêm
  },
  amountPayment: {
    color: '#388E3C', // Màu xanh cho khoản đã trả giảm nợ
  },
  noteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'right',
  },
  detailItemsContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
    padding: 6,
  },
  btnToggleDetailItems: {
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  btnToggleDetailText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  expandedItemsList: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 6,
  },
  expandedItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  expandedItemName: {
    fontSize: 12,
    color: '#334155',
  },
  expandedItemAmount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#B91C1C',
  },
  mediaContainer: {
    marginTop: 8,
  },
  btnViewMedia: {
    backgroundColor: '#F0F9FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnViewMediaText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
  },
  actionBtnEdit: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  actionBtnEditText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  actionBtnDelete: {
    backgroundColor: '#FEF2F2',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  actionBtnDeleteText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  errorContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.inputBg,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 20,
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  missingDaysCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  missingDaysHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  missingDaysIcon: {
    fontSize: 14,
  },
  missingDaysTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#92400E',
    flex: 1,
  },
  missingCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 0,
  },
  missingCountBadgeActive: {
    backgroundColor: '#FEF08A',
  },
  missingCountBadgeZero: {
    backgroundColor: '#DCFCE7',
  },
  missingCountText: {
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  missingCountTextActive: {
    color: '#B45309',
  },
  missingCountTextZero: {
    color: '#15803D',
  },
  daysChipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 6,
  },
  dayChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  missingDaysSubtitle: {
    fontSize: 11.5,
    color: '#78350F',
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 16,
  },
  allDaysPresentText: {
    fontSize: 12.5,
    color: '#15803D',
    fontWeight: '500',
    marginTop: 2,
  },
});
