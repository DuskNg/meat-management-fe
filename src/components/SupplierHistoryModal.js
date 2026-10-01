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
import DatePickerInput from './DatePickerInput';
import ExportSupplierHistoryModal from './ExportSupplierHistoryModal';
import EditSupplierTransactionModal from './EditSupplierTransactionModal';
import EditSupplierPaymentModal from './EditSupplierPaymentModal';
import InvoiceImageViewerModal from './InvoiceImageViewerModal';
import PopupModal from './PopupModal';
import { showGlobalToast } from '../store/toastStore';

// Các hàm tiện ích xử lý định dạng ngày tháng
const padZero = (n) => String(n).padStart(2, '0');

const formatDateToDDMMYYYY = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  return `${padZero(dateObj.getDate())}/${padZero(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
};

const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

const parseDDMMYYYYToDate = (str, isEndOfDay = false) => {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (isEndOfDay) {
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

const getTodayStr = () => formatDateToDDMMYYYY(new Date());

const getDaysAgoStr = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDateToDDMMYYYY(d);
};

const getMonthRange = (monthStr) => {
  // monthStr: "MM/YYYY"
  const [m, y] = monthStr.split('/').map(Number);
  const totalDays = getDaysInMonth(y, m);
  return {
    from: `01/${padZero(m)}/${y}`,
    to: `${padZero(totalDays)}/${padZero(m)}/${y}`,
  };
};

// Modal xem lịch sử dòng công nợ của nhà cung cấp kèm sửa/xóa giao dịch
const SupplierHistoryModal = forwardRef(({ supplier, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState(supplier);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('ALL');
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
      setSelectedFilter('ALL');
      setFromDate('');
      setToDate('');
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

  // Tạo danh sách các tùy chọn lọc thời gian
  const filterOptions = useMemo(() => {
    const list = [
      { id: 'ALL', name: 'Toàn bộ thời gian' },
      { id: 'TODAY', name: 'Hôm nay' },
      { id: '7_DAYS', name: '7 ngày gần nhất' },
      { id: '30_DAYS', name: '30 ngày gần nhất' },
    ];
    availableMonths.forEach((m) => {
      list.push({ id: m, name: `Tháng ${m}` });
    });
    if (selectedFilter === 'CUSTOM') {
      list.push({ id: 'CUSTOM', name: 'Tùy chọn khoảng ngày' });
    }
    return list;
  }, [availableMonths, selectedFilter]);

  const selectedFilterOption = filterOptions.find((opt) => opt.id === selectedFilter) || filterOptions[0];

  // Xử lý khi chọn mốc thời gian từ menu chọn nhanh
  const handleSelectFilterOption = (item) => {
    const optId = item.id;
    setSelectedFilter(optId);
    if (optId === 'ALL') {
      setFromDate('');
      setToDate('');
    } else if (optId === 'TODAY') {
      const today = getTodayStr();
      setFromDate(today);
      setToDate(today);
    } else if (optId === '7_DAYS') {
      setFromDate(getDaysAgoStr(6));
      setToDate(getTodayStr());
    } else if (optId === '30_DAYS') {
      setFromDate(getDaysAgoStr(29));
      setToDate(getTodayStr());
    } else if (optId.includes('/')) {
      const { from, to } = getMonthRange(optId);
      setFromDate(from);
      setToDate(to);
    }
  };

  // Xử lý khi đổi Từ ngày
  const handleFromDateChange = (val) => {
    setFromDate(val);
    if (val && toDate) {
      const dFrom = parseDDMMYYYYToDate(val, false);
      const dTo = parseDDMMYYYYToDate(toDate, true);
      if (dFrom && dTo && dFrom > dTo) {
        setToDate(val);
      }
    }
    setSelectedFilter('CUSTOM');
  };

  // Xử lý khi đổi Đến ngày
  const handleToDateChange = (val) => {
    setToDate(val);
    if (fromDate && val) {
      const dFrom = parseDDMMYYYYToDate(fromDate, false);
      const dTo = parseDDMMYYYYToDate(val, true);
      if (dFrom && dTo && dTo < dFrom) {
        setFromDate(val);
      }
    }
    setSelectedFilter('CUSTOM');
  };

  // Xóa toàn bộ bộ lọc ngày để xem toàn bộ thời gian
  const handleClearDateFilter = () => {
    setFromDate('');
    setToDate('');
    setSelectedFilter('ALL');
  };

  // Lọc danh sách giao dịch theo khoảng ngày hoặc tháng đã chọn
  const filteredHistory = useMemo(() => {
    const parsedFrom = parseDDMMYYYYToDate(fromDate, false);
    const parsedTo = parseDDMMYYYYToDate(toDate, true);

    if (parsedFrom || parsedTo) {
      return history.filter((item) => {
        if (!item.date) return false;
        const d = new Date(item.date);
        if (isNaN(d.getTime())) return false;
        if (parsedFrom && d < parsedFrom) return false;
        if (parsedTo && d > parsedTo) return false;
        return true;
      });
    }

    if (selectedFilter && selectedFilter !== 'ALL' && selectedFilter.includes('/')) {
      return history.filter((item) => {
        if (!item.date) return false;
        const d = new Date(item.date);
        if (isNaN(d.getTime())) return false;
        const mStr = `${padZero(d.getMonth() + 1)}/${d.getFullYear()}`;
        return mStr === selectedFilter;
      });
    }

    return history;
  }, [history, fromDate, toDate, selectedFilter]);

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

    let targetM = selectedFilter;
    if (!targetM || targetM === 'ALL' || targetM === 'CUSTOM' || targetM === 'TODAY' || targetM === '7_DAYS' || targetM === '30_DAYS') {
      if (fromDate && toDate) {
        const partsFrom = fromDate.split('/');
        const partsTo = toDate.split('/');
        if (partsFrom.length === 3 && partsTo.length === 3 && partsFrom[1] === partsTo[1] && partsFrom[2] === partsTo[2]) {
          targetM = `${partsFrom[1]}/${partsFrom[2]}`;
        }
      }
    }

    if (!targetM || !targetM.includes('/')) {
      const curM = `${padZero(currentMonth)}/${currentYear}`;
      targetM = availableMonths.includes(curM) ? curM : (availableMonths[0] || curM);
    }

    if (!targetM || !targetM.includes('/')) {
      return { targetMonthKey: '', missingDays: [], maxEvaluatedDay: 0, minEvaluatedDay: 0, isCreatedAfter: false };
    }

    const [monthNum, yearNum] = targetM.split('/').map(Number);
    const totalDaysInMonth = new Date(yearNum, monthNum, 0).getDate();

    let maxDay = 0;
    if (yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth)) {
      maxDay = totalDaysInMonth;
    } else if (yearNum === currentYear && monthNum === currentMonth) {
      maxDay = currentDay;
    } else {
      maxDay = 0;
    }

    let minDay = 1;
    // Nếu có fromDate/toDate thuộc tháng này thì thu hẹp phạm vi đánh giá
    if (fromDate && fromDate.endsWith(`/${targetM}`)) {
      const sDay = parseInt(fromDate.split('/')[0], 10);
      if (!isNaN(sDay) && sDay >= 1) minDay = Math.max(minDay, sDay);
    }
    if (toDate && toDate.endsWith(`/${targetM}`)) {
      const eDay = parseInt(toDate.split('/')[0], 10);
      if (!isNaN(eDay) && eDay >= 1 && eDay < maxDay) maxDay = eDay;
    }

    const createdDateRaw = currentSupplier?.createdAt || supplier?.createdAt;
    let isCreatedAfterMonth = false;

    if (createdDateRaw) {
      const cDate = new Date(createdDateRaw);
      if (!isNaN(cDate.getTime())) {
        const cYear = cDate.getFullYear();
        const cMonth = cDate.getMonth() + 1;
        const cDay = cDate.getDate();

        if (yearNum < cYear || (yearNum === cYear && monthNum < cMonth)) {
          isCreatedAfterMonth = true;
          return {
            targetMonthKey: targetM,
            missingDays: [],
            maxEvaluatedDay: 0,
            minEvaluatedDay: 0,
            isCreatedAfter: true,
          };
        } else if (yearNum === cYear && monthNum === cMonth) {
          minDay = Math.max(minDay, cDay);
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
  }, [selectedFilter, fromDate, toDate, availableMonths, history, currentSupplier?.createdAt, supplier?.createdAt]);

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

  // Header của Bảng lịch sử giao dịch
  const renderTableHeader = () => {
    if (!filteredHistory || filteredHistory.length === 0) return null;
    return (
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, styles.colDate]}>NGÀY</Text>
        <Text style={[styles.tableHeaderCell, styles.colType]}>LOẠI / NỘI DUNG</Text>
        <Text style={[styles.tableHeaderCell, styles.colAmount]}>SỐ TIỀN</Text>
        <Text style={[styles.tableHeaderCell, styles.colActions]}>XỬ LÝ</Text>
      </View>
    );
  };

  // Dòng của Bảng lịch sử giao dịch
  const renderHistoryItem = ({ item, index }) => {
    const isDebt = item.type === 'DEBT';
    const hasItems = Array.isArray(item.items) && item.items.length > 0;
    const hasMedia = Array.isArray(item.mediaUrls) && item.mediaUrls.length > 0;
    const isExpanded = expandedTransIds.has(item.id);
    const isEven = index % 2 === 0;

    return (
      <View style={[styles.tableRowContainer, isEven ? styles.rowEven : styles.rowOdd]}>
        {/* Dòng dữ liệu chính dạng bảng */}
        <View style={styles.tableRowMain}>
          {/* Cột 1: Ngày */}
          <View style={styles.colDate}>
            <Text style={styles.tableCellDate}>{formatDate(item.date)}</Text>
          </View>

          {/* Cột 2: Loại giao dịch, món thịt, ghi chú, chứng từ */}
          <View style={styles.colType}>
            <View style={styles.typeBadgeRow}>
              <View style={[styles.typeBadge, isDebt ? styles.badgeDebt : styles.badgePayment]}>
                <Text style={[styles.typeText, isDebt ? styles.textDebt : styles.textPayment]}>
                  {isDebt ? '📥 Nhập nợ' : '💵 Trả tiền'}
                </Text>
              </View>

              {hasMedia && (
                <TouchableOpacity
                  style={styles.miniMediaBtn}
                  onPress={() => handleOpenMediaViewer(item.mediaUrls, item)}
                  activeOpacity={0.7}
                  title="Xem ảnh chứng từ"
                >
                  <Text style={styles.miniMediaBtnText}>📸 {item.mediaUrls.length}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Ghi chú giao dịch nếu có */}
            {item.note ? (
              <Text style={styles.tableCellNote} numberOfLines={1}>
                {item.note}
              </Text>
            ) : null}

            {/* Nút bấm xem chi tiết các món thịt nếu có */}
            {hasItems && (
              <TouchableOpacity
                style={styles.miniToggleItemsBtn}
                onPress={() => toggleExpandTrans(item.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.miniToggleItemsText}>
                  🥩 {item.items.length} món thịt {isExpanded ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cột 3: Số tiền */}
          <View style={styles.colAmount}>
            <Text style={[styles.tableCellAmount, isDebt ? styles.amountDebt : styles.amountPayment]}>
              {isDebt ? '+' : '-'}{formatCurrency(item.amount)}
            </Text>
          </View>

          {/* Cột 4: Nút Sửa & Xóa gọn gàng */}
          <View style={styles.colActions}>
            <TouchableOpacity
              style={styles.actionBtnEditSmall}
              onPress={() => handleEditItem(item)}
              activeOpacity={0.7}
              title="Chỉnh sửa"
            >
              <Text style={styles.actionBtnTextSmall}>✏️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnDeleteSmall}
              onPress={() => confirmDeleteItem(item)}
              activeOpacity={0.7}
              title="Xóa"
            >
              <Text style={styles.actionBtnTextSmall}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Khối hiển thị chi tiết các món thịt dạng bảng con khi mở rộng */}
        {hasItems && isExpanded && (
          <View style={styles.expandedSubTable}>
            <View style={styles.subTableHeaderRow}>
              <Text style={[styles.subTableThCell, { flex: 2.2 }]}>Mặt hàng</Text>
              <Text style={[styles.subTableThCell, { flex: 1.1, textAlign: 'center' }]}>Số lượng</Text>
              <Text style={[styles.subTableThCell, { flex: 1.3, textAlign: 'right' }]}>Đơn giá</Text>
              <Text style={[styles.subTableThCell, { flex: 1.6, textAlign: 'right' }]}>Thành tiền</Text>
            </View>
            {item.items.map((it, idx) => (
              <View key={idx} style={[styles.subTableRow, idx % 2 === 1 && styles.subTableRowAlt]}>
                <Text style={[styles.subTableTdCell, { flex: 2.2, fontWeight: '600' }]} numberOfLines={1}>
                  {it.productName || 'Thịt'}
                </Text>
                <Text style={[styles.subTableTdCell, { flex: 1.1, textAlign: 'center', color: '#64748B' }]}>
                  {it.quantity || 0} {it.unit || 'kg'}
                </Text>
                <Text style={[styles.subTableTdCell, { flex: 1.3, textAlign: 'right', color: '#64748B' }]}>
                  {formatCurrency(it.price)}
                </Text>
                <Text style={[styles.subTableTdCell, { flex: 1.6, textAlign: 'right', fontWeight: 'bold', color: '#DC2626' }]}>
                  {formatCurrency(it.amount || 0)} đ
                </Text>
              </View>
            ))}
          </View>
        )}
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
                options={filterOptions}
                value={selectedFilterOption}
                placeholder="Lọc thời gian..."
                onSelect={handleSelectFilterOption}
                renderSelected={(m) => m?.name || ''}
                zIndex={999999}
                onOpenChange={(isOpen) => setSelectContainerZIndex(isOpen ? 999999 : 10)}
              />
            </View>

            <TouchableOpacity
              style={styles.exportBtn}
              onPress={() => {
                const now = new Date();
                const currentMonthStr = `${padZero(now.getMonth() + 1)}/${now.getFullYear()}`;
                const targetMonth = selectedFilter && selectedFilter.includes('/')
                  ? selectedFilter
                  : (availableMonths[0] || currentMonthStr);
                exportSupplierHistoryModalRef.current?.open(currentSupplier || supplier, targetMonth, history);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.exportBtnText}>🖼️ Xuất ảnh</Text>
            </TouchableOpacity>
          </View>

          {/* Thanh chọn khoảng ngày từ ngày ➔ đến ngày */}
          <View style={styles.dateRangeBar}>
            <View style={styles.dateCol}>
              <Text style={styles.dateSubLabel}>Từ ngày</Text>
              <DatePickerInput
                value={fromDate}
                onChange={handleFromDateChange}
                placeholder="Từ ngày"
                allowFuture={true}
                compact={true}
                dense={true}
                showIcon={true}
                style={styles.compactDatePicker}
              />
            </View>

            <View style={styles.dateArrowWrap}>
              <Text style={styles.dateArrowText}>➔</Text>
            </View>

            <View style={styles.dateCol}>
              <Text style={styles.dateSubLabel}>Đến ngày</Text>
              <DatePickerInput
                value={toDate}
                onChange={handleToDateChange}
                placeholder="Đến ngày"
                allowFuture={true}
                compact={true}
                dense={true}
                showIcon={true}
                style={styles.compactDatePicker}
              />
            </View>

            {(fromDate || toDate || selectedFilter !== 'ALL') ? (
              <TouchableOpacity
                style={styles.clearDateFilterBtn}
                onPress={handleClearDateFilter}
                activeOpacity={0.7}
              >
                <Text style={styles.clearDateFilterBtnText}>✕ Xóa</Text>
              </TouchableOpacity>
            ) : null}
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
              ListHeaderComponent={
                <>
                  {renderMissingDaysCard()}
                  {renderTableHeader()}
                </>
              }
              ListFooterComponent={
                filteredHistory && filteredHistory.length > 0 ? (
                  <View style={styles.tableFooterRow}>
                    <Text style={styles.tableFooterText}>
                      Tổng cộng: <Text style={styles.tableFooterBold}>{filteredHistory.length}</Text> giao dịch
                    </Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {selectedFilter === 'ALL'
                      ? 'Chưa có giao dịch nhập hàng hay trả tiền nào được ghi nhận.'
                      : `Không có giao dịch nào${selectedFilter ? ` trong ${selectedFilter}` : ''}.`}
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
  dateRangeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  dateCol: {
    flex: 1,
  },
  dateSubLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  compactDatePicker: {
    height: 38,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    justifyContent: 'center',
    marginBottom: 0,
  },
  dateArrowWrap: {
    paddingTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateArrowText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  clearDateFilterBtn: {
    paddingTop: 16,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearDateFilterBtnText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '700',
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
  // ─── Giao diện Bảng Lịch Sử Giao Dịch ───
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  colDate: {
    width: 76,
    paddingLeft: 2,
  },
  colType: {
    flex: 1.3,
    paddingHorizontal: 4,
  },
  colAmount: {
    flex: 1.2,
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  colActions: {
    width: 58,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  tableRowContainer: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowEven: {
    backgroundColor: '#FFFFFF',
  },
  rowOdd: {
    backgroundColor: '#F8FAFC',
  },
  tableRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tableCellDate: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  typeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  typeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
  },
  badgeDebt: {
    backgroundColor: '#FEE2E2',
  },
  badgePayment: {
    backgroundColor: '#DCFCE7',
  },
  typeText: {
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  textDebt: {
    color: '#DC2626',
  },
  textPayment: {
    color: '#16A34A',
  },
  miniMediaBtn: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  miniMediaBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  tableCellNote: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  miniToggleItemsBtn: {
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  miniToggleItemsText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#0284C7',
  },
  tableCellAmount: {
    fontSize: 12.5,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  amountDebt: {
    color: '#DC2626', // Màu đỏ cho nợ tăng thêm
  },
  amountPayment: {
    color: '#16A34A', // Màu xanh cho khoản đã trả giảm nợ
  },
  actionBtnEditSmall: {
    width: 25,
    height: 25,
    borderRadius: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDeleteSmall: {
    width: 25,
    height: 25,
    borderRadius: 5,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnTextSmall: {
    fontSize: 11,
  },
  expandedSubTable: {
    backgroundColor: '#F1F5F9',
    marginHorizontal: 6,
    marginBottom: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 6,
  },
  subTableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingBottom: 4,
    marginBottom: 4,
  },
  subTableThCell: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
  },
  subTableRow: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    alignItems: 'center',
  },
  subTableRowAlt: {
    backgroundColor: '#E2E8F0',
  },
  subTableTdCell: {
    fontSize: 11,
    color: '#1E293B',
  },
  tableFooterRow: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 0,
  },
  tableFooterText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  tableFooterBold: {
    fontWeight: 'bold',
    color: '#1E293B',
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
