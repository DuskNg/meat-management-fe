// meat-management-fe/src/components/RegularCustomersModal.js
import React, { useState, forwardRef, useImperativeHandle, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Platform,
  Linking,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { matchItemSearch } from '../utils/searchHelper';
import AnimatedPressable from './AnimatedPressable';

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

// Chuyển chuỗi date (ISO hoặc YYYY-MM-DD) sang chuỗi DD/MM/YYYY
const toDateKey = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Chuyển chuỗi date (ISO hoặc YYYY-MM-DD) sang chuỗi YYYY-MM-DD
const toISODateKey = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Lấy ngày hôm nay định dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Helper: cộng/trừ ngày từ chuỗi DD/MM/YYYY
const addDaysToFormatted = (dateStr, days) => {
  const parts = (dateStr || '').split('/');
  if (parts.length !== 3) return getTodayFormatted();
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + days);
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const RegularCustomersModal = forwardRef(({ onRefresh, onOpenDebt, onViewHistory }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getTodayFormatted()); // Ngày kiểm tra (mặc định hôm nay)
  const [activeTab, setActiveTab] = useState('MISSING'); // 'MISSING' (Chưa có đơn), 'COMPLETED' (Đã lên đơn), 'ALL' (Tất cả)
  const [search, setSearch] = useState('');

  // Tải dữ liệu khách hàng và toàn bộ giao dịch để phân tích khách quen
  const fetchData = async () => {
    setLoading(true);
    try {
      const [custRes, txRes] = await Promise.all([
        api.get('/customers?isBadDebt=false'),
        api.get('/transactions'),
      ]);

      if (custRes.data?.success && custRes.data?.data) {
        setCustomers(custRes.data.data);
      }
      if (txRes.data?.success && txRes.data?.data) {
        setTransactions(txRes.data.data);
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu phân tích khách quen:', err);
    } finally {
      setLoading(false);
    }
  };

  // Mở modal và làm mới dữ liệu
  useImperativeHandle(ref, () => ({
    open: (date = null) => {
      setVisible(true);
      setSelectedDate(date || getTodayFormatted());
      setActiveTab('MISSING');
      setSearch('');
      fetchData();
    },
    close: () => {
      setVisible(false);
    },
    refresh: () => {
      if (visible) {
        fetchData();
      }
    },
  }));

  // Xử lý chuyển ngày kiểm tra
  const handlePrevDate = () => {
    setSelectedDate((prev) => addDaysToFormatted(prev, -1));
  };

  const handleNextDate = () => {
    setSelectedDate((prev) => addDaysToFormatted(prev, 1));
  };

  const handleTodayDate = () => {
    setSelectedDate(getTodayFormatted());
  };

  // ── Logic tính toán danh sách khách quen và đối chiếu công nợ trong ngày ──
  const {
    regularCustomers,
    missingCustomers,
    completedCustomers,
    threeDaysLabels,
  } = useMemo(() => {
    // 1. Phân tích mốc ngày được chọn (selectedDate: DD/MM/YYYY)
    const parts = (selectedDate || '').split('/');
    if (parts.length !== 3) {
      return {
        regularCustomers: [],
        missingCustomers: [],
        completedCustomers: [],
        threeDaysLabels: [],
      };
    }

    const targetDay = parseInt(parts[0], 10);
    const targetMonth = parseInt(parts[1], 10);
    const targetYear = parseInt(parts[2], 10);

    const targetDateObj = new Date(targetYear, targetMonth - 1, targetDay);
    targetDateObj.setHours(0, 0, 0, 0);

    // 2. Xác định khoảng thời gian 3 ngày gần nhất (3 ngày liền kề trước ngày kiểm tra)
    // Ví dụ: Ngày kiểm tra là 05/09 -> 3 ngày trước là 04/09, 03/09, 02/09
    const day1Obj = new Date(targetDateObj);
    day1Obj.setDate(day1Obj.getDate() - 1); // 1 ngày trước

    const day2Obj = new Date(targetDateObj);
    day2Obj.setDate(day2Obj.getDate() - 2); // 2 ngày trước

    const day3Obj = new Date(targetDateObj);
    day3Obj.setDate(day3Obj.getDate() - 3); // 3 ngày trước

    const day1Key = toDateKey(day1Obj);
    const day2Key = toDateKey(day2Obj);
    const day3Key = toDateKey(day3Obj);

    const recent3DaysSet = new Set([day1Key, day2Key, day3Key]);
    const labels = [day3Key, day2Key, day1Key];

    // Gom nhóm các đơn nợ phát sinh theo từng khách hàng
    const recentTxByCustomer = {};
    const todayTxByCustomer = {};

    transactions.forEach((tx) => {
      if (!tx.customerId || !tx.date) return;
      const txDateKey = toDateKey(tx.date);

      // Đơn nợ thuộc 3 ngày gần nhất
      if (recent3DaysSet.has(txDateKey)) {
        if (!recentTxByCustomer[tx.customerId]) {
          recentTxByCustomer[tx.customerId] = [];
        }
        recentTxByCustomer[tx.customerId].push(tx);
      }

      // Đơn nợ phát sinh trong ngày kiểm tra (selectedDate)
      if (txDateKey === selectedDate) {
        if (!todayTxByCustomer[tx.customerId]) {
          todayTxByCustomer[tx.customerId] = [];
        }
        todayTxByCustomer[tx.customerId].push(tx);
      }
    });

    // 3. Lọc danh sách khách quen:
    // Khách hàng còn hoạt động, không phải nợ xấu và ĐÃ CÓ ÍT NHẤT 1 ĐƠN ĐẶT HÀNG TRONG 3 NGÀY GẦN NHẤT
    const regulars = [];
    const missing = [];
    const completed = [];

    customers.forEach((cust) => {
      if (cust.isBadDebt) return;

      const recentOrders = recentTxByCustomer[cust.id] || [];
      // Khách hàng có phát sinh đơn trong 3 ngày gần nhất
      if (recentOrders.length > 0) {
        // Đếm số ngày khác nhau mà khách hàng đặt hàng trong 3 ngày qua
        const uniqueOrderedDays = new Set(recentOrders.map((o) => toDateKey(o.date)));
        
        // Tìm đơn hàng gần nhất trong 3 ngày qua
        const sortedRecent = [...recentOrders].sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastOrder = sortedRecent[0];

        // Kiểm tra xem khách hàng này đã có đơn nợ trong ngày kiểm tra hay chưa
        const todayOrders = todayTxByCustomer[cust.id] || [];
        const hasOrderToday = todayOrders.length > 0;
        const todayTotalDebt = todayOrders.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);

        const regularItem = {
          ...cust,
          recentOrdersCount: recentOrders.length,
          uniqueDaysCount: uniqueOrderedDays.size,
          recentOrderDates: Array.from(uniqueOrderedDays),
          lastOrder,
          todayOrders,
          todayTotalDebt,
          hasOrderToday,
        };

        regulars.push(regularItem);

        if (hasOrderToday) {
          completed.push(regularItem);
        } else {
          missing.push(regularItem);
        }
      }
    });

    // Sắp xếp danh sách: Ưu tiên khách có tần suất đặt nhiều ngày hơn, nợ hiện tại cao hơn
    const sortFn = (a, b) => {
      if (b.uniqueDaysCount !== a.uniqueDaysCount) {
        return b.uniqueDaysCount - a.uniqueDaysCount;
      }
      return (b.debt || 0) - (a.debt || 0);
    };

    regulars.sort(sortFn);
    missing.sort(sortFn);
    completed.sort(sortFn);

    return {
      regularCustomers: regulars,
      missingCustomers: missing,
      completedCustomers: completed,
      threeDaysLabels: labels,
    };
  }, [customers, transactions, selectedDate]);

  // 4. Lọc theo tab và tìm kiếm nhanh
  const displayCustomers = useMemo(() => {
    let list = [];
    if (activeTab === 'MISSING') {
      list = missingCustomers;
    } else if (activeTab === 'COMPLETED') {
      list = completedCustomers;
    } else {
      list = regularCustomers;
    }

    if (!search.trim()) return list;
    return list.filter((item) => matchItemSearch(item, search, ['name', 'phone', 'address', 'note']));
  }, [activeTab, missingCustomers, completedCustomers, regularCustomers, search]);

  // Xử lý mở nhanh Modal Ghi nợ cho khách hàng
  const handleAddDebtForCustomer = (cust) => {
    setVisible(false);
    if (onOpenDebt) {
      onOpenDebt(cust);
    }
  };

  // Xử lý mở nhanh Modal Lịch sử nợ cho khách hàng
  const handleViewHistoryForCustomer = (cust) => {
    if (onViewHistory) {
      onViewHistory(cust);
    }
  };

  // Xử lý gọi điện trực tiếp
  const handleCallCustomer = (phone) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch((err) => {
      console.warn('Không thể mở ứng dụng gọi điện:', err);
    });
  };

  // Xử lý xuất ảnh danh sách khách quen chưa có đơn trong ngày (Chỉ hiển thị tên khách)
  const handleExportImage = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      alert('Chức năng xuất ảnh hiện hỗ trợ trên trình duyệt Web.');
      return;
    }

    try {
      const listToExport = missingCustomers; // Danh sách khách quen chưa có đơn
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const isTwoCol = listToExport.length > 15;
      const width = isTwoCol ? 750 : 550;
      const padding = 20;
      const headerHeight = 85;
      const rowHeight = 44;
      const emptyRowHeight = 65;
      const footerHeight = 45;

      const numRows = isTwoCol ? Math.ceil(listToExport.length / 2) : Math.max(listToExport.length, 1);
      const contentHeight = listToExport.length === 0 ? emptyRowHeight : numRows * rowHeight;
      const totalHeight = padding * 2 + headerHeight + 15 + contentHeight + footerHeight;

      // Render độ nét cao (2x scale)
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = totalHeight * scale;
      ctx.scale(scale, scale);

      // Nền trắng toàn bộ ảnh
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, totalHeight);

      // Khung viền ngoài
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(8, 8, width - 16, totalHeight - 16);

      // ── Header ảnh ──
      ctx.fillStyle = '#065F46'; // Xanh lá đậm sang trọng
      ctx.fillRect(12, 12, width - 24, headerHeight);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DANH SÁCH KHÁCH CHƯA LÊN ĐƠN HÔM NAY', width / 2, 44);

      ctx.fillStyle = '#A7F3D0';
      ctx.font = 'bold 13px Arial, sans-serif';
      ctx.fillText(`Ngày: ${selectedDate}   •   Tổng số: ${listToExport.length} khách`, width / 2, 70);

      let startY = 12 + headerHeight + 15;

      // ── Render danh sách tên khách hàng ──
      if (listToExport.length === 0) {
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(padding, startY, width - padding * 2, emptyRowHeight);
        ctx.strokeStyle = '#E2E8F0';
        ctx.strokeRect(padding, startY, width - padding * 2, emptyRowHeight);

        ctx.fillStyle = '#059669';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎉 Tất cả khách quen đều đã được lên đơn trong ngày hôm nay!', width / 2, startY + 38);
        startY += emptyRowHeight;
      } else if (!isTwoCol) {
        // 1 Cột duy nhất
        listToExport.forEach((item, idx) => {
          ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          ctx.fillRect(padding, startY, width - padding * 2, rowHeight);
          ctx.strokeStyle = '#E2E8F0';
          ctx.strokeRect(padding, startY, width - padding * 2, rowHeight);

          // Tên khách hàng (to, rõ ràng)
          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 16px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${idx + 1}. ${item.name || ''}`, padding + 20, startY + 27);

          startY += rowHeight;
        });
      } else {
        // 2 Cột song song
        const half = Math.ceil(listToExport.length / 2);
        const colW = (width - padding * 2 - 16) / 2;
        const leftX = padding;
        const rightX = padding + colW + 16;

        for (let i = 0; i < half; i++) {
          const rowY = startY + i * rowHeight;

          // Cột trái
          const leftItem = listToExport[i];
          if (leftItem) {
            ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            ctx.fillRect(leftX, rowY, colW, rowHeight);
            ctx.strokeStyle = '#E2E8F0';
            ctx.strokeRect(leftX, rowY, colW, rowHeight);

            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 15px Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${i + 1}. ${leftItem.name || ''}`, leftX + 16, rowY + 27);
          }

          // Cột phải
          const rightIdx = half + i;
          if (rightIdx < listToExport.length) {
            const rightItem = listToExport[rightIdx];
            ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            ctx.fillRect(rightX, rowY, colW, rowHeight);
            ctx.strokeStyle = '#E2E8F0';
            ctx.strokeRect(rightX, rowY, colW, rowHeight);

            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 15px Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${rightIdx + 1}. ${rightItem.name || ''}`, rightX + 16, rowY + 27);
          }
        }
        startY += half * rowHeight;
      }

      // ── Footer ảnh ──
      const footerY = startY + 12;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, footerY);
      ctx.lineTo(width - padding, footerY);
      ctx.stroke();

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ngày ${toDateKey(now)}`;

      ctx.fillStyle = '#64748B';
      ctx.font = '11px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Thời gian xuất: ${timeStr}`, padding, footerY + 18);

      ctx.textAlign = 'right';
      ctx.fillText('Phần mềm Quản lý Giao dịch & Công nợ Sạp thịt', width - padding, footerY + 18);

      // Tải file ảnh về máy
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `Khach_Chua_Len_Don_${selectedDate.replace(/\//g, '_')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('[EXPORT REGULAR CUSTOMERS IMAGE ERROR]', err);
      alert('Đã xảy ra lỗi khi xuất ảnh danh sách khách.');
    }
  };

  const isToday = selectedDate === getTodayFormatted();

  // Render từng thẻ khách quen
  const renderItem = ({ item }) => {
    const firstLetter = (item.name || 'K').trim().charAt(0).toUpperCase();
    const hasOrder = item.hasOrderToday;

    return (
      <View style={[styles.customerCard, hasOrder ? styles.cardCompleted : styles.cardMissing]}>
        {/* Phần thông tin cơ bản & Trạng thái đơn hôm nay */}
        <View style={styles.cardTopRow}>
          <View style={[styles.avatar, hasOrder ? styles.avatarCompleted : styles.avatarMissing]}>
            <Text style={[styles.avatarText, hasOrder ? styles.avatarTextCompleted : styles.avatarTextMissing]}>
              {firstLetter}
            </Text>
          </View>

          <View style={styles.infoCol}>
            <View style={styles.nameRow}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.name}
              </Text>
              {hasOrder ? (
                <View style={styles.badgeSuccess}>
                  <Text style={styles.badgeSuccessText}>✅ Đã có {item.todayOrders.length} đơn</Text>
                </View>
              ) : (
                <View style={styles.badgeWarning}>
                  <Text style={styles.badgeWarningText}>⚠️ Chưa có đơn hôm nay</Text>
                </View>
              )}
            </View>

            <View style={styles.subInfoRow}>
              <Text style={styles.phoneText}>
                {item.phone ? `📞 ${item.phone}` : '📞 Chưa có SĐT'}
              </Text>
              {item.address ? (
                <Text style={styles.addressText} numberOfLines={1}>
                  • 📍 {item.address}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Khối thống kê tần suất đặt hàng & Dư nợ */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Tần suất 3 ngày qua:</Text>
            <Text style={styles.statValHighlight}>
              Đặt {item.uniqueDaysCount}/3 ngày ({item.recentOrdersCount} đơn)
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Tổng nợ hiện tại:</Text>
            <Text style={[styles.statValDebt, item.debt > 0 ? styles.debtPositive : styles.debtZero]}>
              {formatCurrency(item.debt || 0)}
            </Text>
          </View>
        </View>

        {/* Chi tiết đơn hàng gần nhất trong 3 ngày qua */}
        {item.lastOrder && (
          <View style={styles.lastOrderRow}>
            <Text style={styles.lastOrderText}>
              🕒 Đơn gần nhất: <Text style={styles.lastOrderDate}>{toDateKey(item.lastOrder.date)}</Text>
              {' '}— Giá trị: <Text style={styles.lastOrderAmount}>{formatCurrency(item.lastOrder.totalAmount || 0)}</Text>
              {item.lastOrder.items?.length ? ` (${item.lastOrder.items.length} món)` : ''}
            </Text>
          </View>
        )}

        {/* Nếu đã có đơn hôm nay thì hiển thị tổng nợ phát sinh hôm nay */}
        {hasOrder && item.todayTotalDebt > 0 && (
          <View style={styles.todayOrderRow}>
            <Text style={styles.todayOrderText}>
              🧾 Đơn phát sinh hôm nay: <Text style={styles.todayOrderAmount}>{formatCurrency(item.todayTotalDebt)}</Text>
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Thanh nút hành động nhanh */}
        <View style={styles.actionRow}>
          {item.phone ? (
            <AnimatedPressable
              style={styles.btnCall}
              onPress={() => handleCallCustomer(item.phone)}
              activeOpacity={0.7}
            >
              <Text style={styles.btnCallText}>📞 Gọi</Text>
            </AnimatedPressable>
          ) : null}

          <AnimatedPressable
            style={styles.btnHistory}
            onPress={() => handleViewHistoryForCustomer(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.btnHistoryText}>👁️ Xem nợ</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={[styles.btnAddDebt, !hasOrder && styles.btnAddDebtPriority]}
            onPress={() => handleAddDebtForCustomer(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.btnAddDebtText}>
              {hasOrder ? '➕ Thêm đơn nợ' : '📝 Lên đơn ngay'}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalCard}>
        {/* HEADER MODAL */}
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconContainer}>
              <Text style={styles.headerIcon}>🌟</Text>
            </View>
            <View style={styles.headerTitleWrapper}>
              <Text style={styles.headerTitle} numberOfLines={1}>QUẢN LÝ KHÁCH QUEN</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                Đối chiếu khách đặt hàng 3 ngày gần nhất
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={fetchData}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.refreshBtnText}>{loading ? '⏳' : '🔄'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* THANH CHỌN NGÀY & PHẠM VI 3 NGÀY ĐỐI CHIẾU */}
        <View style={styles.dateControlBar}>
          <View style={styles.dateSelectorRow}>
            <TouchableOpacity style={styles.dateArrowBtn} onPress={handlePrevDate} activeOpacity={0.7}>
              <Text style={styles.dateArrowText}>◀</Text>
            </TouchableOpacity>

            <View style={styles.dateDisplayWrapper}>
              <Text style={styles.dateDisplayLabel}>Ngày kiểm tra đối chiếu:</Text>
              <Text style={styles.dateDisplayValue}>
                📅 {selectedDate} {isToday ? '(Hôm nay)' : ''}
              </Text>
            </View>

            <TouchableOpacity style={styles.dateArrowBtn} onPress={handleNextDate} activeOpacity={0.7}>
              <Text style={styles.dateArrowText}>▶</Text>
            </TouchableOpacity>

            {!isToday && (
              <TouchableOpacity style={styles.btnToday} onPress={handleTodayDate} activeOpacity={0.7}>
                <Text style={styles.btnTodayText}>Hôm nay</Text>
              </TouchableOpacity>
            )}
          </View>

          {threeDaysLabels.length > 0 && (
            <Text style={styles.threeDaysHint}>
              🔍 3 ngày gần nhất phân tích: <Text style={styles.threeDaysRange}>{threeDaysLabels.join('  •  ')}</Text>
            </Text>
          )}
        </View>

        {/* 3 THẺ TỔNG HỢP KPI NHANH */}
        <View style={styles.kpiContainer}>
          <TouchableOpacity
            style={[styles.kpiCard, styles.kpiCardMissing, activeTab === 'MISSING' && styles.kpiCardActiveMissing]}
            onPress={() => setActiveTab('MISSING')}
            activeOpacity={0.8}
          >
            <View style={styles.kpiHeaderRow}>
              <Text style={styles.kpiLabelMissing}>⚠️ CHƯA CÓ ĐƠN</Text>
              {missingCustomers.length > 0 && <View style={styles.kpiBadgeAlert} />}
            </View>
            <Text style={styles.kpiValMissing}>{missingCustomers.length}</Text>
            <Text style={styles.kpiSubMissing}>Cần kiểm tra tránh sót</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, styles.kpiCardCompleted, activeTab === 'COMPLETED' && styles.kpiCardActiveCompleted]}
            onPress={() => setActiveTab('COMPLETED')}
            activeOpacity={0.8}
          >
            <Text style={styles.kpiLabelCompleted}>✅ ĐÃ LÊN ĐƠN</Text>
            <Text style={styles.kpiValCompleted}>{completedCustomers.length}</Text>
            <Text style={styles.kpiSubCompleted}>Đã phát sinh nợ hôm nay</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, styles.kpiCardAll, activeTab === 'ALL' && styles.kpiCardActiveAll]}
            onPress={() => setActiveTab('ALL')}
            activeOpacity={0.8}
          >
            <Text style={styles.kpiLabelAll}>👥 TỔNG KHÁCH QUEN</Text>
            <Text style={styles.kpiValAll}>{regularCustomers.length}</Text>
            <Text style={styles.kpiSubAll}>Có đơn trong 3 ngày qua</Text>
          </TouchableOpacity>
        </View>

        {/* Ô TÌM KIẾM NHANH KHÁCH QUEN & NÚT XUẤT ẢNH */}
        <View style={styles.searchContainer}>
          <View style={styles.searchRow}>
            <View style={styles.searchInputWrapper}>
              <TextInput
                style={styles.searchInput}
                placeholder="🔍 Tìm tên hoặc SĐT khách..."
                placeholderTextColor={COLORS.textLight}
                value={search}
                onChangeText={setSearch}
              />
              {search ? (
                <TouchableOpacity style={styles.clearSearch} onPress={() => setSearch('')}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.exportImgBtn}
              onPress={handleExportImage}
              activeOpacity={0.8}
            >
              <Text style={styles.exportImgBtnText}>📸 Xuất ảnh ({missingCustomers.length})</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* DANH SÁCH KHÁCH HÀNG */}
        {loading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.loadingText}>Đang phân tích danh sách khách quen...</Text>
          </View>
        ) : (
          <FlatList
            data={displayCustomers}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrapper}>
                {activeTab === 'MISSING' ? (
                  <>
                    <Text style={styles.emptyIcon}>🎉</Text>
                    <Text style={styles.emptyTitle}>Không còn khách quen nào bị sót đơn!</Text>
                    <Text style={styles.emptySubtitle}>
                      Tất cả khách quen trong 3 ngày gần nhất đều đã được lên đơn nợ hôm nay ({selectedDate}).
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyIcon}>📂</Text>
                    <Text style={styles.emptyTitle}>Không có khách hàng nào</Text>
                    <Text style={styles.emptySubtitle}>
                      Không tìm thấy khách hàng nào phù hợp với bộ lọc hiện tại.
                    </Text>
                  </>
                )}
              </View>
            }
          />
        )}
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 720,
    maxHeight: '92%',
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    ...SHADOWS.large,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FAF5FF', // Nền tím pastel nhẹ
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  headerTitleWrapper: {
    flex: 1,
    minWidth: 0,
  },
  headerIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    flexShrink: 0,
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#6B21A8', // Tím đậm
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#7E22CE',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshBtnText: {
    fontSize: 15,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#64748B',
  },
  dateControlBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  dateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dateArrowBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateArrowText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
  },
  dateDisplayWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  dateDisplayLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  dateDisplayValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    marginTop: 1,
  },
  btnToday: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  btnTodayText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  threeDaysHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
  },
  threeDaysRange: {
    fontWeight: 'bold',
    color: '#475569',
  },
  kpiContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#F8FAFC',
  },
  kpiCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  kpiCardMissing: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  kpiCardActiveMissing: {
    borderColor: '#D97706',
    borderWidth: 2,
    backgroundColor: '#FEF3C7',
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kpiBadgeAlert: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC2626',
  },
  kpiLabelMissing: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  kpiValMissing: {
    fontSize: 20,
    fontWeight: '900',
    color: '#D97706',
    marginVertical: 2,
  },
  kpiSubMissing: {
    fontSize: 9,
    color: '#92400E',
    textAlign: 'center',
  },
  kpiCardCompleted: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  kpiCardActiveCompleted: {
    borderColor: '#059669',
    borderWidth: 2,
    backgroundColor: '#DCFCE7',
  },
  kpiLabelCompleted: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  kpiValCompleted: {
    fontSize: 20,
    fontWeight: '900',
    color: '#16A34A',
    marginVertical: 2,
  },
  kpiSubCompleted: {
    fontSize: 9,
    color: '#166534',
    textAlign: 'center',
  },
  kpiCardAll: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  kpiCardActiveAll: {
    borderColor: '#7C3AED',
    borderWidth: 2,
    backgroundColor: '#F3E8FF',
  },
  kpiLabelAll: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  kpiValAll: {
    fontSize: 20,
    fontWeight: '900',
    color: '#334155',
    marginVertical: 2,
  },
  kpiSubAll: {
    fontSize: 9,
    color: '#64748B',
    textAlign: 'center',
  },
  searchContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInputWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    backgroundColor: '#F1F5F9',
    height: 40,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 36,
    fontSize: 13,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  clearSearch: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  exportImgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#065F46', // Xanh lá đậm
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#047857',
    flexShrink: 0,
    ...SHADOWS.small,
  },
  exportImgBtnText: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 10,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    ...SHADOWS.card,
  },
  cardMissing: {
    borderColor: '#FDE68A',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B', // Viền cam cảnh báo
    backgroundColor: '#FFFDF9',
  },
  cardCompleted: {
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981', // Viền xanh thành công
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMissing: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  avatarTextMissing: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D97706',
  },
  avatarCompleted: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  avatarTextCompleted: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#15803D',
  },
  infoCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  customerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
    flex: 1,
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeWarningText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#B45309',
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  badgeSuccessText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#15803D',
  },
  subInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  phoneText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  addressText: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  statValHighlight: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#7C3AED',
    marginTop: 1,
  },
  statValDebt: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 1,
  },
  debtPositive: {
    color: '#DC2626',
  },
  debtZero: {
    color: '#059669',
  },
  lastOrderRow: {
    marginTop: 6,
    paddingHorizontal: 2,
  },
  lastOrderText: {
    fontSize: 11,
    color: '#475569',
  },
  lastOrderDate: {
    fontWeight: 'bold',
    color: '#0F172A',
  },
  lastOrderAmount: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  todayOrderRow: {
    marginTop: 4,
    paddingHorizontal: 2,
    backgroundColor: '#F0FDF4',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  todayOrderText: {
    fontSize: 11,
    color: '#15803D',
  },
  todayOrderAmount: {
    fontWeight: 'bold',
    color: '#059669',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btnCall: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  btnCallText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  btnHistory: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnHistoryText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  btnAddDebt: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 1,
    borderColor: '#059669',
  },
  btnAddDebtPriority: {
    backgroundColor: '#EA580C', // Cam đỏ nổi bật cho khách chưa lên đơn
    borderColor: '#C2410C',
  },
  btnAddDebtText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  loadingWrapper: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyWrapper: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default RegularCustomersModal;
