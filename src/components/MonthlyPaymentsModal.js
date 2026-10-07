// meat-management-fe/src/components/MonthlyPaymentsModal.js
import React, { useState, forwardRef, useImperativeHandle, useMemo } from 'react';
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

// Helper định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

// Helper lấy tháng hiện tại theo định dạng MM/YYYY
const getCurrentMonthString = () => {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${m}/${y}`;
};

// Helper định dạng ngày/tháng từ ISO string
const formatDateDM = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
};

// Helper định dạng giờ:phút
const formatTimeHM = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
};

// Helper kiểm tra xem một bản ghi payment có phải là đơn trả hàng hay không
const isReturnGoodsPayment = (payment) => {
  if (!payment) return false;
  const note = (payment.note || '').trim().toLowerCase();
  if (!note) return false;
  return (
    note.includes('[trả lại hàng]') ||
    note.includes('[trả hàng nhanh]') ||
    note.includes('trả lại hàng') ||
    note.includes('trả hàng') ||
    note.includes('trả lại') ||
    note.includes('nhập hàng')
  );
};

// Helper trích xuất ngày thanh toán nợ cụ thể từ ghi chú (ví dụ: "Thanh toán nợ ngày 21/09/2026" -> "(21/9)")
const extractPaymentSuffix = (note) => {
  if (!note || typeof note !== 'string') return '';
  const trimNote = note.trim();
  if (!trimNote || trimNote === '—' || trimNote === '-') return '';

  // 1. Khớp cụm "Thanh toán nợ ngày DD/MM/YYYY" hoặc "Thanh toán nợ từ ngày DD/MM/YYYY" hoặc "Trả nợ ngày DD/MM"
  const dateMatch = trimNote.match(/(?:thanh toán|trả nợ|nợ)\s*(?:từ ngày|ngày)?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
  if (dateMatch) {
    const d = parseInt(dateMatch[1], 10);
    const m = parseInt(dateMatch[2], 10);
    return `(${d}/${m})`;
  }

  // 2. Nếu có dạng ngày DD/MM hoặc DD/MM/YYYY bất kỳ trong ghi chú
  const genericMatch = trimNote.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (genericMatch) {
    const d = parseInt(genericMatch[1], 10);
    const m = parseInt(genericMatch[2], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return `(${d}/${m})`;
    }
  }

  return '';
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
      // 0. LOẠI BỎ HOÀN TOÀN CÁC ĐƠN TRẢ HÀNG (TRẢ LẠI THỊT KHÔNG PHẢI TIỀN ĐẾN THẬT)
      if (isReturnGoodsPayment(p)) {
        return false;
      }

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
        {/* HEADER TINH GỌN (1 DÒNG KHÔNG NGẮT CHỮ) */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerIcon}>💰</Text>
            <Text style={styles.modalTitle} numberOfLines={1}>
              TIỀN KHÁCH TRẢ THÁNG {selectedMonth}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 1. THANH CHỌN THÁNG & LỌC NGÀY GOM 1 DÒNG DUY NHẤT */}
        <View style={styles.filterBar}>
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
              <Text style={styles.monthCurrentText}>{selectedMonth}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.monthNavBtn}
              onPress={handleNextMonth}
              activeOpacity={0.7}
            >
              <Text style={styles.monthNavBtnText}>▶</Text>
            </TouchableOpacity>
          </View>

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
          ) : (
            <View style={styles.allMonthBadge}>
              <Text style={styles.allMonthBadgeText}>Toàn bộ tháng</Text>
            </View>
          )}
        </View>

        {/* 2. THANH TÓM TẮT THÔNG SỐ SIÊU GỌN (1 DÒNG DUY NHẤT) */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryLabel}>Tổng đến:</Text>
            <Text style={styles.summaryAmount}>{formatCurrency(summary.totalAmount)}</Text>
          </View>
          <View style={styles.summaryRight}>
            <View style={styles.statPill}>
              <Text style={styles.statPillText}>
                <Text style={styles.statPillNumber}>{summary.totalCount}</Text> lượt
              </Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statPillText}>
                <Text style={styles.statPillNumber}>{summary.customerCount}</Text> khách
              </Text>
            </View>
          </View>
        </View>

        {/* 3. THANH TÌM KIẾM & TAB LỌC GỌN GÀNG */}
        <View style={styles.searchAndTabRow}>
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

        {/* 4. NỘI DUNG DẠNG BẢNG (VỪA KHÍT 100% VIEWPORT - RỘNG THEO VIEWPORT - BỎ CỘT GHI CHÚ & CHI TIẾT) */}
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
            {/* ─── TAB 1: DANH SÁCH CHI TIẾT TỪNG LƯỢT TRẢ TIỀN (4 CỘT: STT | NGÀY | TÊN KHÁCH | SỐ TIỀN ĐẾN) ─── */}
            {viewMode === 'list' ? (
              <View style={styles.tableContainer}>
                {/* HEADER BẢNG */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderCell, styles.colStt]}>STT</Text>
                  <Text style={[styles.tableHeaderCell, styles.colDate]}>NGÀY</Text>
                  <Text style={[styles.tableHeaderCell, styles.colCustomer]}>TÊN KHÁCH</Text>
                  <Text style={[styles.tableHeaderCell, styles.colAmount]}>SỐ TIỀN ĐẾN</Text>
                </View>

                {/* NỘI DUNG CÁC DÒNG */}
                {filteredPayments.map((p, idx) => {
                  const isEven = idx % 2 === 0;
                  const isLast = idx === filteredPayments.length - 1;
                  const suffix = extractPaymentSuffix(p.note);

                  return (
                    <TouchableOpacity
                      key={p.id || idx}
                      style={[
                        styles.tableRow,
                        isEven ? styles.tableRowEven : styles.tableRowOdd,
                        !isLast && styles.tableRowBorder,
                      ]}
                      onPress={() =>
                        handleCustomerClick(p.customerId, p.customer?.name, p.customer?.phone)
                      }
                      activeOpacity={0.7}
                    >
                      {/* CỘT 1: STT */}
                      <View style={styles.colStt}>
                        <Text style={styles.sttText}>{idx + 1}</Text>
                      </View>

                      {/* CỘT 2: NGÀY */}
                      <View style={styles.colDate}>
                        <Text style={styles.dateText}>{formatDateDM(p.paidAt)}</Text>
                        <Text style={styles.timeText}>{formatTimeHM(p.paidAt)}</Text>
                      </View>

                      {/* CỘT 3: TÊN KHÁCH (RỘNG THEO VIEWPORT - flex: 1) */}
                      <View style={styles.colCustomer}>
                        <Text style={styles.customerNameText} numberOfLines={2}>
                          {p.customer?.name || 'Khách vãng lai'}
                        </Text>
                        {p.customer?.phone ? (
                          <Text style={styles.customerPhoneText} numberOfLines={1}>
                            📞 {p.customer.phone}
                          </Text>
                        ) : null}
                      </View>

                      {/* CỘT 4: SỐ TIỀN ĐẾN (KÈM NGÀY NỢ CỤ THỂ NẾU CÓ, VÍ DỤ: 300.000 đ (21/9)) */}
                      <View style={styles.colAmount}>
                        <Text style={styles.amountText}>
                          {formatCurrency(p.amount)}
                          {suffix ? (
                            <Text style={styles.amountSuffixText}> {suffix}</Text>
                          ) : null}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              /* ─── TAB 2: GOM NHÓM THEO TỪNG KHÁCH HÀNG ─── */
              <View style={styles.tableContainer}>
                {/* HEADER BẢNG GOM */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderCell, styles.colStt]}>STT</Text>
                  <Text style={[styles.tableHeaderCell, styles.colCustomer]}>KHÁCH HÀNG</Text>
                  <Text style={[styles.tableHeaderCell, styles.colCount]}>SỐ LẦN</Text>
                  <Text style={[styles.tableHeaderCell, styles.colAmount]}>TỔNG TIỀN ĐẾN</Text>
                  <Text style={[styles.tableHeaderCell, styles.colLatestDate]}>GẦN NHẤT</Text>
                </View>

                {/* NỘI DUNG DÒNG GOM */}
                {groupedByCustomer.map((item, idx) => {
                  const isEven = idx % 2 === 0;
                  const isLast = idx === groupedByCustomer.length - 1;

                  return (
                    <TouchableOpacity
                      key={item.customerId || idx}
                      style={[
                        styles.tableRow,
                        isEven ? styles.tableRowEven : styles.tableRowOdd,
                        !isLast && styles.tableRowBorder,
                      ]}
                      onPress={() =>
                        handleCustomerClick(
                          item.customerId,
                          item.customerName,
                          item.customerPhone
                        )
                      }
                      activeOpacity={0.7}
                    >
                      {/* STT */}
                      <View style={styles.colStt}>
                        <Text style={styles.sttText}>{idx + 1}</Text>
                      </View>

                      {/* KHÁCH HÀNG (RỘNG THEO VIEWPORT) */}
                      <View style={styles.colCustomer}>
                        <Text style={styles.customerNameText} numberOfLines={2}>
                          {item.customerName}
                        </Text>
                        {item.customerPhone ? (
                          <Text style={styles.customerPhoneText} numberOfLines={1}>
                            📞 {item.customerPhone}
                          </Text>
                        ) : null}
                      </View>

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
                    </TouchableOpacity>
                  );
                })}
              </View>
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
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    maxHeight: '92%',
    minHeight: 380,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 1040 : '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 6,
  },
  headerIcon: {
    fontSize: 18,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: 'bold',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 5,
    marginBottom: 6,
    gap: 6,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthNavBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  monthNavBtnText: {
    fontSize: 10,
    color: '#334155',
    fontWeight: 'bold',
  },
  monthCurrentBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  monthCurrentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  rangeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
    padding: 2,
    gap: 2,
  },
  rangeToggleBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  rangeToggleBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  rangeToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  rangeToggleTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  allMonthBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  allMonthBadgeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  summaryAmount: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#16A34A',
  },
  summaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statPillText: {
    fontSize: 11,
    color: '#166534',
    fontWeight: '600',
  },
  statPillNumber: {
    fontWeight: '800',
    color: '#15803D',
  },
  searchAndTabRow: {
    marginBottom: 6,
    gap: 5,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 32,
  },
  searchIcon: {
    fontSize: 11,
    marginRight: 5,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
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
    padding: 3,
  },
  clearSearchText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  viewModeTabs: {
    flexDirection: 'row',
    gap: 5,
  },
  viewModeTabBtn: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 6,
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
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  viewModeTabTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  loadingWrap: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyWrap: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyIcon: {
    fontSize: 30,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  tableScrollContent: {
    paddingBottom: 4,
  },
  tableContainer: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableHeaderCell: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
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
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  sttText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  colDate: {
    width: 48,
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  timeText: {
    fontSize: 9.5,
    color: '#94A3B8',
  },
  colCustomer: {
    flex: 1,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  customerNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  customerPhoneText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  colAmount: {
    minWidth: 125,
    alignItems: 'flex-end',
    justifyContent: 'center',
    textAlign: 'right',
    paddingHorizontal: 2,
  },
  amountText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#16A34A',
    textAlign: 'right',
  },
  amountSuffixText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  colCount: {
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  countBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#4338CA',
  },
  colLatestDate: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerWrap: {
    paddingTop: 8,
  },
  closeFooterBtn: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
