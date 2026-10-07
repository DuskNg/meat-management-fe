// meat-management-fe/src/components/MonthlyPaymentsModal.js
import React, { useState, forwardRef, useImperativeHandle, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { showGlobalToast } from '../store/toastStore';
import { matchSearch } from '../utils/searchHelper';
import { COLORS } from '../theme';

// Helper định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

// Helper định dạng số rút gọn
const formatShortAmount = (amount) => {
  if (!amount || isNaN(amount)) return '0đ';
  const num = Math.round(Number(amount));
  return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
};

// Helper lấy tháng hiện tại theo định dạng MM/YYYY
const getCurrentMonthString = () => {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${m}/${y}`;
};

// Helper định dạng ngày/tháng/năm từ ISO string
const formatDateDM = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
};

const formatTimeHM = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
};

const MonthlyPaymentsModal = forwardRef(({ onSelectCustomer }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Tháng đang chọn (MM/YYYY)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthString());

  // Phạm vi lọc: 'up_to_today' (Tính đến hôm nay) | 'all_month' (Toàn bộ tháng)
  const [rangeMode, setRangeMode] = useState('up_to_today');

  // Chế độ xem: 'list' (Chi tiết từng lượt) | 'by_customer' (Gom theo từng khách)
  const [viewMode, setViewMode] = useState('list');

  // Ô tìm kiếm khách hàng
  const [searchText, setSearchText] = useState('');

  // Danh sách toàn bộ thanh toán trong tháng tải từ server
  const [rawPayments, setRawPayments] = useState([]);

  // Tải danh sách thanh toán của tháng được chọn
  const fetchPayments = async (monthStr) => {
    const targetMonth = monthStr || selectedMonth;
    try {
      setLoading(true);
      const res = await api.get('/payments', {
        params: {
          month: targetMonth,
          _t: Date.now(),
        },
      });

      if (res.data?.success && Array.isArray(res.data?.data)) {
        setRawPayments(res.data.data);
      } else {
        setRawPayments([]);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách thanh toán trong tháng:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể tải danh sách tiền đến.', 'error');
      setRawPayments([]);
    } finally {
      setLoading(false);
    }
  };

  // Phơi bày phương thức open/close ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (options = {}) => {
      const initialMonth = options.month || getCurrentMonthString();
      setSelectedMonth(initialMonth);
      setRangeMode(options.rangeMode || 'up_to_today');
      setViewMode(options.viewMode || 'list');
      setSearchText('');
      setVisible(true);
      fetchPayments(initialMonth);
    },
    close: () => {
      setVisible(false);
    },
    refresh: () => {
      if (visible) {
        fetchPayments(selectedMonth);
      }
    },
  }));

  // Chuyển sang tháng trước
  const handlePrevMonth = () => {
    const parts = selectedMonth.split('/');
    let m = parseInt(parts[0], 10);
    let y = parseInt(parts[1], 10);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const newMonth = `${String(m).padStart(2, '0')}/${y}`;
    setSelectedMonth(newMonth);
    fetchPayments(newMonth);
  };

  // Chuyển sang tháng sau
  const handleNextMonth = () => {
    const parts = selectedMonth.split('/');
    let m = parseInt(parts[0], 10);
    let y = parseInt(parts[1], 10);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const newMonth = `${String(m).padStart(2, '0')}/${y}`;
    setSelectedMonth(newMonth);
    fetchPayments(newMonth);
  };

  // Chuyển về tháng hiện tại
  const handleCurrentMonth = () => {
    const current = getCurrentMonthString();
    setSelectedMonth(current);
    fetchPayments(current);
  };

  // Xác định xem tháng đang chọn có phải là tháng hiện tại hay không
  const isCurrentMonth = useMemo(() => {
    return selectedMonth === getCurrentMonthString();
  }, [selectedMonth]);

  // Lấy nhãn ngày hôm nay để hiển thị
  const todayLabel = useMemo(() => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
  }, []);

  // Lọc danh sách thanh toán theo điều kiện: phạm vi ngày & từ khóa tìm kiếm
  const filteredPayments = useMemo(() => {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return rawPayments.filter((p) => {
      // 1. Lọc theo phạm vi: nếu chọn "Tính đến hôm nay" và đang ở tháng hiện tại
      if (rangeMode === 'up_to_today' && isCurrentMonth) {
        const payDate = new Date(p.paidAt);
        if (payDate > endOfToday) return false;
      }

      // 2. Lọc theo từ khóa tìm kiếm
      if (searchText.trim()) {
        const query = searchText.trim();
        const custName = p.customer?.name || '';
        const custPhone = p.customer?.phone || '';
        const note = p.note || '';

        const matchName = matchSearch(custName, query);
        const matchPhone = custPhone.includes(query);
        const matchNote = matchSearch(note, query);

        if (!matchName && !matchPhone && !matchNote) return false;
      }

      return true;
    });
  }, [rawPayments, rangeMode, isCurrentMonth, searchText]);

  // Tính toán tóm tắt tổng tiền và sản lượng
  const summary = useMemo(() => {
    let totalAmount = 0;
    const customerSet = new Set();

    filteredPayments.forEach((p) => {
      const val = parseFloat(p.amount) || 0;
      totalAmount += val;
      if (p.customerId) {
        customerSet.add(p.customerId);
      }
    });

    return {
      totalAmount,
      totalCount: filteredPayments.length,
      customerCount: customerSet.size,
    };
  }, [filteredPayments]);

  // Gom nhóm theo từng khách hàng
  const groupedByCustomer = useMemo(() => {
    const map = {};

    filteredPayments.forEach((p) => {
      const cId = p.customerId || p.customer?.name || 'unknown';
      if (!map[cId]) {
        map[cId] = {
          customerId: p.customerId,
          customerName: p.customer?.name || 'Khách vãng lai',
          customerPhone: p.customer?.phone || '',
          totalAmount: 0,
          count: 0,
          latestPaidAt: p.paidAt,
          payments: [],
        };
      }

      const val = parseFloat(p.amount) || 0;
      map[cId].totalAmount += val;
      map[cId].count += 1;
      map[cId].payments.push(p);

      if (new Date(p.paidAt) > new Date(map[cId].latestPaidAt)) {
        map[cId].latestPaidAt = p.paidAt;
      }
    });

    // Sắp xếp khách trả nhiều tiền nhất lên đầu
    return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredPayments]);

  // Xử lý khi bấm vào khách hàng để xem lịch sử nợ
  const handleCustomerClick = (customerId, customerName, customerPhone) => {
    if (onSelectCustomer && customerId) {
      setVisible(false);
      onSelectCustomer({
        id: customerId,
        name: customerName,
        phone: customerPhone,
      });
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* HEADER CHUẨN BOTTOM-SHEET */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerIconWrap}>
              <Text style={styles.headerIcon}>💰</Text>
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.modalTitle}>TIỀN KHÁCH TRẢ TRONG THÁNG</Text>
              <Text style={styles.modalSubTitle}>
                {rangeMode === 'up_to_today' && isCurrentMonth
                  ? `Tháng ${selectedMonth} (tính đến hôm nay ngày ${todayLabel})`
                  : `Toàn bộ tháng ${selectedMonth}`}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* BỘ ĐIỀU HƯỚNG THÁNG & PHẠM VI NGÀY */}
        <View style={styles.filterBar}>
          {/* Thanh chuyển tháng */}
          <View style={styles.monthNavRow}>
            <TouchableOpacity
              style={styles.monthNavBtn}
              onPress={handlePrevMonth}
              activeOpacity={0.7}
            >
              <Text style={styles.monthNavBtnText}>◀</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.monthCurrentBtn}
              onPress={handleCurrentMonth}
              activeOpacity={0.7}
            >
              <Text style={styles.monthCurrentText}>Tháng {selectedMonth}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.monthNavBtn}
              onPress={handleNextMonth}
              activeOpacity={0.7}
            >
              <Text style={styles.monthNavBtnText}>▶</Text>
            </TouchableOpacity>
          </View>

          {/* Nút lọc phạm vi ngày: Tính đến hôm nay vs Cả tháng */}
          {isCurrentMonth ? (
            <View style={styles.rangeToggleRow}>
              <TouchableOpacity
                style={[
                  styles.rangeToggleBtn,
                  rangeMode === 'up_to_today' && styles.rangeToggleBtnActive,
                ]}
                onPress={() => setRangeMode('up_to_today')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.rangeToggleText,
                    rangeMode === 'up_to_today' && styles.rangeToggleTextActive,
                  ]}
                >
                  Đến hôm nay ({todayLabel})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.rangeToggleBtn,
                  rangeMode === 'all_month' && styles.rangeToggleBtnActive,
                ]}
                onPress={() => setRangeMode('all_month')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.rangeToggleText,
                    rangeMode === 'all_month' && styles.rangeToggleTextActive,
                  ]}
                >
                  Cả tháng
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* THẺ TÓM TẮT SẢN LƯỢNG / TIỀN ĐẾN */}
        <View style={styles.summaryContainer}>
          <View style={styles.summaryCardMain}>
            <Text style={styles.summaryCardMainLabel}>TỔNG TIỀN ĐẾN</Text>
            <Text style={styles.summaryCardMainValue}>
              {formatCurrency(summary.totalAmount)}
            </Text>
          </View>

          <View style={styles.summaryMiniGroup}>
            <View style={styles.summaryMiniCard}>
              <Text style={styles.summaryMiniValue}>{summary.totalCount}</Text>
              <Text style={styles.summaryMiniLabel}>Lượt trả</Text>
            </View>
            <View style={styles.summaryMiniCard}>
              <Text style={styles.summaryMiniValue}>{summary.customerCount}</Text>
              <Text style={styles.summaryMiniLabel}>Khách trả</Text>
            </View>
          </View>
        </View>

        {/* THANH TÌM KIẾM & CHỌN CHẾ ĐỘ XEM TAB */}
        <View style={styles.searchAndTabRow}>
          {/* Ô tìm kiếm */}
          <View style={styles.searchInputWrap}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm theo tên khách, SĐT..."
              placeholderTextColor="#94A3B8"
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchText('')}
                style={styles.clearSearchBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tab chuyển đổi chế độ xem: Từng lượt vs Gom khách */}
          <View style={styles.viewModeTabs}>
            <TouchableOpacity
              style={[
                styles.viewModeTabBtn,
                viewMode === 'list' && styles.viewModeTabBtnActive,
              ]}
              onPress={() => setViewMode('list')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.viewModeTabText,
                  viewMode === 'list' && styles.viewModeTabTextActive,
                ]}
              >
                Từng lượt ({filteredPayments.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.viewModeTabBtn,
                viewMode === 'by_customer' && styles.viewModeTabBtnActive,
              ]}
              onPress={() => setViewMode('by_customer')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.viewModeTabText,
                  viewMode === 'by_customer' && styles.viewModeTabTextActive,
                ]}
              >
                Gom khách ({groupedByCustomer.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* NỘI DUNG DẠNG BẢNG (TABLE VIEW) */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#16A34A" />
            <Text style={styles.loadingText}>Đang tải danh sách tiền đến...</Text>
          </View>
        ) : filteredPayments.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>Chưa có lượt trả tiền nào</Text>
            <Text style={styles.emptySubtitle}>
              {searchText
                ? 'Không tìm thấy khách hàng nào khớp với từ khóa tìm kiếm.'
                : `Chưa có giao dịch trả tiền trong tháng ${selectedMonth}.`}
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.tableScrollContent}
          >
            {/* ─── TAB 1: DANH SÁCH CHI TIẾT TỪNG LƯỢT TRẢ TIỀN ─── */}
            {viewMode === 'list' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.tableContainer}>
                  {/* HEADER BẢNG */}
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCell, styles.colStt]}>STT</Text>
                    <Text style={[styles.tableHeaderCell, styles.colDate]}>NGÀY</Text>
                    <Text style={[styles.tableHeaderCell, styles.colCustomer]}>TÊN KHÁCH</Text>
                    <Text style={[styles.tableHeaderCell, styles.colAmount]}>SỐ TIỀN ĐẾN</Text>
                    <Text style={[styles.tableHeaderCell, styles.colNote]}>GHI CHÚ</Text>
                    <Text style={[styles.tableHeaderCell, styles.colAction]}>CHI TIẾT</Text>
                  </View>

                  {/* NỘI DUNG CÁC DÒNG */}
                  {filteredPayments.map((p, idx) => {
                    const isEven = idx % 2 === 0;
                    const isLast = idx === filteredPayments.length - 1;

                    return (
                      <View
                        key={p.id || idx}
                        style={[
                          styles.tableRow,
                          isEven ? styles.tableRowEven : styles.tableRowOdd,
                          !isLast && styles.tableRowBorder,
                        ]}
                      >
                        {/* STT */}
                        <View style={styles.colStt}>
                          <Text style={styles.sttText}>{idx + 1}</Text>
                        </View>

                        {/* NGÀY */}
                        <View style={styles.colDate}>
                          <Text style={styles.dateText}>{formatDateDM(p.paidAt)}</Text>
                          <Text style={styles.timeText}>{formatTimeHM(p.paidAt)}</Text>
                        </View>

                        {/* TÊN KHÁCH */}
                        <TouchableOpacity
                          style={styles.colCustomer}
                          onPress={() =>
                            handleCustomerClick(p.customerId, p.customer?.name, p.customer?.phone)
                          }
                          activeOpacity={0.7}
                        >
                          <Text style={styles.customerNameText} numberOfLines={1}>
                            {p.customer?.name || 'Khách vãng lai'}
                          </Text>
                          {p.customer?.phone ? (
                            <Text style={styles.customerPhoneText} numberOfLines={1}>
                              📞 {p.customer.phone}
                            </Text>
                          ) : null}
                        </TouchableOpacity>

                        {/* SỐ TIỀN ĐẾN */}
                        <View style={styles.colAmount}>
                          <Text style={styles.amountText}>{formatCurrency(p.amount)}</Text>
                        </View>

                        {/* GHI CHÚ */}
                        <View style={styles.colNote}>
                          <Text style={styles.noteText} numberOfLines={2}>
                            {p.note || '—'}
                          </Text>
                        </View>

                        {/* THAO TÁC / CHI TIẾT */}
                        <View style={styles.colAction}>
                          <TouchableOpacity
                            style={styles.viewDetailBtn}
                            onPress={() =>
                              handleCustomerClick(p.customerId, p.customer?.name, p.customer?.phone)
                            }
                            activeOpacity={0.7}
                            title="Xem lịch sử nợ"
                          >
                            <Text style={styles.viewDetailBtnText}>👁️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              /* ─── TAB 2: GOM NHÓM THEO TỪNG KHÁCH HÀNG ─── */
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.tableContainer}>
                  {/* HEADER BẢNG GOM */}
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCell, styles.colStt]}>STT</Text>
                    <Text style={[styles.tableHeaderCell, styles.colCustomerGrouped]}>
                      KHÁCH HÀNG
                    </Text>
                    <Text style={[styles.tableHeaderCell, styles.colCount]}>SỐ LẦN</Text>
                    <Text style={[styles.tableHeaderCell, styles.colAmount]}>TỔNG TIỀN ĐẾN</Text>
                    <Text style={[styles.tableHeaderCell, styles.colLatestDate]}>GẦN NHẤT</Text>
                    <Text style={[styles.tableHeaderCell, styles.colAction]}>CHI TIẾT</Text>
                  </View>

                  {/* NỘI DUNG DÒNG GOM */}
                  {groupedByCustomer.map((item, idx) => {
                    const isEven = idx % 2 === 0;
                    const isLast = idx === groupedByCustomer.length - 1;

                    return (
                      <View
                        key={item.customerId || idx}
                        style={[
                          styles.tableRow,
                          isEven ? styles.tableRowEven : styles.tableRowOdd,
                          !isLast && styles.tableRowBorder,
                        ]}
                      >
                        {/* STT */}
                        <View style={styles.colStt}>
                          <Text style={styles.sttText}>{idx + 1}</Text>
                        </View>

                        {/* KHÁCH HÀNG */}
                        <TouchableOpacity
                          style={styles.colCustomerGrouped}
                          onPress={() =>
                            handleCustomerClick(
                              item.customerId,
                              item.customerName,
                              item.customerPhone
                            )
                          }
                          activeOpacity={0.7}
                        >
                          <Text style={styles.customerNameText} numberOfLines={1}>
                            {item.customerName}
                          </Text>
                          {item.customerPhone ? (
                            <Text style={styles.customerPhoneText} numberOfLines={1}>
                              📞 {item.customerPhone}
                            </Text>
                          ) : null}
                        </TouchableOpacity>

                        {/* SỐ LẦN */}
                        <View style={styles.colCount}>
                          <View style={styles.countBadge}>
                            <Text style={styles.countBadgeText}>{item.count} lần</Text>
                          </View>
                        </View>

                        {/* TỔNG TIỀN ĐẾN */}
                        <View style={styles.colAmount}>
                          <Text style={styles.amountText}>{formatCurrency(item.totalAmount)}</Text>
                        </View>

                        {/* GẦN NHẤT */}
                        <View style={styles.colLatestDate}>
                          <Text style={styles.dateText}>{formatDateDM(item.latestPaidAt)}</Text>
                        </View>

                        {/* THAO TÁC / CHI TIẾT */}
                        <View style={styles.colAction}>
                          <TouchableOpacity
                            style={styles.viewDetailBtn}
                            onPress={() =>
                              handleCustomerClick(
                                item.customerId,
                                item.customerName,
                                item.customerPhone
                              )
                            }
                            activeOpacity={0.7}
                            title="Xem lịch sử nợ"
                          >
                            <Text style={styles.viewDetailBtnText}>👁️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </ScrollView>
        )}

        {/* FOOTER ĐÓNG LẠI FULL WIDTH */}
        <View style={styles.footerWrap}>
          <TouchableOpacity
            style={styles.closeFooterBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.closeFooterBtnText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default MonthlyPaymentsModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: '92%',
    minHeight: 380,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 10,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTextWrap: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.2,
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 8,
    marginBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthNavBtnText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: 'bold',
  },
  monthCurrentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  monthCurrentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  rangeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  rangeToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rangeToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  rangeToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  rangeToggleTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  summaryCardMain: {
    flex: 1.4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  summaryCardMainLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  summaryCardMainValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#16A34A',
    marginTop: 2,
  },
  summaryMiniGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  summaryMiniCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryMiniValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
  },
  summaryMiniLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  searchAndTabRow: {
    marginBottom: 10,
    gap: 8,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
    ...(Platform.OS === 'web'
      ? {
          outlineStyle: 'none',
          outlineWidth: 0,
        }
      : {}),
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  viewModeTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  viewModeTabBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewModeTabBtnActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  viewModeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  viewModeTabTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  loadingWrap: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  tableScrollContent: {
    paddingBottom: 8,
  },
  tableContainer: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    minWidth: 520,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableRowEven: {
    backgroundColor: '#FFFFFF',
  },
  tableRowOdd: {
    backgroundColor: '#F8FAFC',
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  colStt: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  sttText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  colDate: {
    width: 66,
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  timeText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  colCustomer: {
    width: 140,
    paddingRight: 6,
    justifyContent: 'center',
  },
  colCustomerGrouped: {
    width: 160,
    paddingRight: 6,
    justifyContent: 'center',
  },
  customerNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  customerPhoneText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  colAmount: {
    width: 115,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 8,
    textAlign: 'right',
  },
  amountText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#16A34A',
  },
  colNote: {
    width: 110,
    paddingRight: 6,
    justifyContent: 'center',
  },
  noteText: {
    fontSize: 11,
    color: '#64748B',
  },
  colCount: {
    width: 65,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338CA',
  },
  colLatestDate: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colAction: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewDetailBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  viewDetailBtnText: {
    fontSize: 12,
  },
  footerWrap: {
    paddingTop: 10,
  },
  closeFooterBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
