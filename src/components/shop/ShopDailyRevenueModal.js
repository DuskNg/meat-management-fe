// meat-management-fe/src/components/shop/ShopDailyRevenueModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';

// Định dạng tiền tệ VND
const formatVND = (num) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
};

// Định dạng ngày hiển thị dd/mm/yyyy
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Định dạng giờ hiển thị hh:mm
const formatTimeOnly = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Lấy ngày hôm nay theo format YYYY-MM-DD (múi giờ GMT+7)
const getTodayDateStr = () => {
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 3600 * 1000);
  const year = vnTime.getUTCFullYear();
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vnTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Modal Báo Cáo Doanh Thu Từng Ngày & Chi Tiết Phiên Chơi
const ShopDailyRevenueModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Chế độ xem: 'ALL_DAYS' (Danh sách tổng hợp từng ngày) hoặc 'DAY_DETAIL' (Chi tiết các bàn của ngày)
  const [viewMode, setViewMode] = useState('ALL_DAYS');

  const [selectedDate, setSelectedDate] = useState(getTodayDateStr());
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedTableName, setSelectedTableName] = useState('');

  // Danh sách doanh thu tổng hợp từng ngày
  const [dailySummaryList, setDailySummaryList] = useState([]);
  const [totalAllRevenue, setTotalAllRevenue] = useState(0);

  // Chi tiết các phiên chơi của ngày đang chọn
  const [historyData, setHistoryData] = useState({
    sessions: [],
    stats: {
      totalRevenue: 0,
      totalPlayAmount: 0,
      totalItemAmount: 0,
      totalHours: 0,
      totalSessions: 0,
      paidSessions: 0,
    },
  });

  // 1. Tải danh sách doanh thu từng ngày
  const fetchDailySummaries = async () => {
    setLoading(true);
    try {
      const response = await api.get('/shop/revenue/daily');
      if (response.data && response.data.success) {
        const list = response.data.data || [];
        setDailySummaryList(list);
        const total = list.reduce((sum, item) => sum + (item.amount || 0), 0);
        setTotalAllRevenue(total);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách doanh thu ngày:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Tải chi tiết các phiên chơi theo ngày / bàn
  const fetchDayDetail = async (dateStr, tableId) => {
    setLoading(true);
    try {
      let url = `/shop/sessions/history?date=${dateStr}`;
      if (tableId) {
        url += `&tableId=${tableId}`;
      }
      const response = await api.get(url);
      if (response.data && response.data.success) {
        setHistoryData(response.data.data);
      }
    } catch (err) {
      console.error('Lỗi tải chi tiết phiên chơi:', err);
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (options = {}) => {
      const targetMode = options.mode || (options.tableId ? 'DAY_DETAIL' : 'ALL_DAYS');
      const targetDate = options.date || getTodayDateStr();
      const targetTableId = options.tableId || null;
      const targetTableName = options.tableName || '';

      setViewMode(targetMode);
      setSelectedDate(targetDate);
      setSelectedTableId(targetTableId);
      setSelectedTableName(targetTableName);
      setVisible(true);

      if (targetMode === 'ALL_DAYS') {
        fetchDailySummaries();
      } else {
        fetchDayDetail(targetDate, targetTableId);
      }
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Xử lý khi nhấn vào 1 ngày để xem chi tiết
  const handleSelectDay = (dateKey) => {
    setSelectedDate(dateKey);
    setViewMode('DAY_DETAIL');
    fetchDayDetail(dateKey, selectedTableId);
  };

  // Xử lý chuyển ngày trong chế độ xem chi tiết
  const handleChangeDate = (offsetDays) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const currentDate = new Date(Date.UTC(y, m - 1, d + offsetDays));
    const nextY = currentDate.getUTCFullYear();
    const nextM = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
    const nextD = String(currentDate.getUTCDate()).padStart(2, '0');
    const newDateStr = `${nextY}-${nextM}-${nextD}`;

    setSelectedDate(newDateStr);
    fetchDayDetail(newDateStr, selectedTableId);
  };

  const sessions = historyData?.sessions || [];
  const stats = historyData?.stats || {
    totalRevenue: 0,
    totalPlayAmount: 0,
    totalItemAmount: 0,
    totalHours: 0,
    totalSessions: 0,
    paidSessions: 0,
  };

  // Gộp các phiên chơi theo từng bàn và sắp xếp theo thứ tự thời gian từ sáng đến tối
  const groupedTables = useMemo(() => {
    const map = {};
    sessions.forEach((s) => {
      const tableId = s.tableId || s.table?.id || 'unknown';
      const tableName = s.table?.name || 'Bàn khác';
      const pricePerHour = s.table?.pricePerHour || 0;

      if (!map[tableId]) {
        map[tableId] = {
          tableId,
          tableName,
          pricePerHour,
          totalAmount: 0,
          totalPlayAmount: 0,
          totalItemAmount: 0,
          totalMinutes: 0,
          sessions: [],
        };
      }

      map[tableId].sessions.push(s);
      map[tableId].totalAmount += s.calculatedTotalAmount || 0;
      map[tableId].totalPlayAmount += s.calculatedPlayAmount || 0;
      map[tableId].totalItemAmount += s.extraAmount || 0;
      map[tableId].totalMinutes += s.durationMinutes || 0;
    });

    // Sắp xếp các phiên của từng bàn theo startTime tăng dần (từ sáng đến tối)
    Object.values(map).forEach((group) => {
      group.sessions.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    });

    // Sắp xếp tự nhiên tên bàn (Bàn 1, Bàn 2, ... Bàn 7, Bàn 10)
    return Object.values(map).sort((a, b) =>
      a.tableName.localeCompare(b.tableName, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [sessions]);

  if (!visible) return null;

  const isToday = selectedDate === getTodayDateStr();

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>

        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {viewMode === 'ALL_DAYS'
                  ? '📈 Doanh Thu Từng Ngày'
                  : selectedTableName
                    ? `📜 Lịch Sử: ${selectedTableName}`
                    : `📋 Chi Tiết Ngày ${formatDateDisplay(selectedDate)}`}
              </Text>
              <Text style={styles.subtitle}>
                {viewMode === 'ALL_DAYS'
                  ? 'Thống kê tổng hợp doanh thu theo từng ngày'
                  : 'Chi tiết số giờ, bàn chơi, đồ dùng và tiền bàn'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* CHẾ ĐỘ 1: XEM DANH SÁCH DOANH THU TỪNG NGÀY */}
          {viewMode === 'ALL_DAYS' ? (
            <View style={styles.flexOne}>
              {/* Thẻ tổng doanh thu tất cả các ngày */}
              <View style={styles.allRevenueCard}>
                <Text style={styles.allRevenueLabel}>💰 TỔNG DOANH THU TÍCH LŨY:</Text>
                <Text style={styles.allRevenueValue}>{formatVND(totalAllRevenue)}</Text>
              </View>

              <Text style={styles.sectionHeaderTitle}>
                📅 DANH SÁCH DOANH THU THEO NGÀY ({dailySummaryList.length})
              </Text>

              {loading ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="large" color="#0F766E" />
                  <Text style={styles.loadingText}>Đang nạp doanh thu từng ngày...</Text>
                </View>
              ) : dailySummaryList.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyIcon}>📭</Text>
                  <Text style={styles.emptyText}>Chưa có dữ liệu doanh thu nào.</Text>
                </View>
              ) : (
                <ScrollView style={styles.daysScrollList} showsVerticalScrollIndicator={true}>
                  {dailySummaryList.map((item) => {
                    const isItemToday = item.dateKey === getTodayDateStr();
                    return (
                      <TouchableOpacity
                        key={item.dateKey}
                        style={[styles.dayCard, isItemToday && styles.dayCardToday]}
                        onPress={() => handleSelectDay(item.dateKey)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.dayCardLeft}>
                          <View style={styles.dayDateRow}>
                            <Text style={styles.dayDateText}>
                              📅 {formatDateDisplay(item.dateKey)}
                            </Text>
                            {isItemToday && (
                              <View style={styles.todayBadge}>
                                <Text style={styles.todayBadgeText}>Hôm nay</Text>
                              </View>
                            )}
                          </View>

                          {/* Chi tiết phụ: Số giờ • Tiền bàn • Đồ dùng • Lượt chơi */}
                          <View style={styles.dayMetaRow}>
                            <Text style={styles.dayMetaItem}>⏱️ {item.totalHours || 0}h</Text>
                            <Text style={styles.dayMetaDot}>•</Text>
                            <Text style={styles.dayMetaItem}>
                              🪑 Bàn: {formatVND(item.playAmount || 0)}
                            </Text>
                            {item.itemAmount > 0 && (
                              <>
                                <Text style={styles.dayMetaDot}>•</Text>
                                <Text style={styles.dayMetaItem}>
                                  🥤 Đồ dùng: {formatVND(item.itemAmount)}
                                </Text>
                              </>
                            )}
                            <Text style={styles.dayMetaDot}>•</Text>
                            <Text style={styles.dayMetaItem}>{item.sessionCount || 0} lượt</Text>
                          </View>
                        </View>

                        <View style={styles.dayCardRight}>
                          <Text style={styles.dayAmountText}>{formatVND(item.amount)}</Text>
                          <Text style={styles.viewDetailArrow}>Chi tiết ➔</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          ) : (
            /* CHẾ ĐỘ 2: XEM CHI TIẾT CÁC PHIÊN CHƠI CỦA 1 NGÀY */
            <View style={styles.flexOne}>
              {/* Nút quay lại danh sách tất cả các ngày */}
              <View style={styles.backToDaysRow}>
                <TouchableOpacity
                  style={styles.backToDaysBtn}
                  onPress={() => {
                    setViewMode('ALL_DAYS');
                    fetchDailySummaries();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backToDaysBtnText}>← Xem danh sách các ngày</Text>
                </TouchableOpacity>
              </View>

              {/* Thanh chuyển ngày: Trước - Ngày hiện tại - Sau */}
              <View style={styles.dateSelectorRow}>
                <TouchableOpacity
                  style={styles.dateNavBtn}
                  onPress={() => handleChangeDate(-1)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dateNavBtnText}>◀ Trước</Text>
                </TouchableOpacity>

                <View style={styles.currentDateBox}>
                  <Text style={styles.currentDateText} numberOfLines={1}>
                    📅 {formatDateDisplay(selectedDate)} {isToday && '(Hôm nay)'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.dateNavBtn, isToday && styles.dateNavBtnDisabled]}
                  onPress={() => handleChangeDate(1)}
                  disabled={isToday}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dateNavBtnText, isToday && styles.dateNavBtnTextDisabled]}>
                    Sau ▶
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Thẻ thống kê tổng quan trong ngày */}
              <View style={styles.statsCard}>
                <View style={styles.statsTopRow}>
                  <View>
                    <Text style={styles.statsRevenueLabel}>💰 TỔNG DOANH THU NGÀY</Text>
                    <Text style={styles.statsRevenueValue}>{formatVND(stats.totalRevenue)}</Text>
                  </View>
                  <View style={styles.sessionCountBadge}>
                    <Text style={styles.sessionCountText}>
                      {stats.paidSessions}/{stats.totalSessions} lượt đã chốt
                    </Text>
                  </View>
                </View>

                <View style={styles.statsDivider} />

                {/* Chi tiết 3 cột: Số giờ chơi • Tiền bàn • Tiền đồ dùng/nước */}
                <View style={styles.statsGrid}>
                  <View style={styles.statGridItem}>
                    <Text style={styles.statGridLabel}>⏱️ Tổng giờ chơi</Text>
                    <Text style={styles.statGridValue}>{stats.totalHours} giờ</Text>
                  </View>
                  <View style={styles.statGridItem}>
                    <Text style={styles.statGridLabel}>🪑 Tiền bàn (giờ)</Text>
                    <Text style={styles.statGridValue}>{formatVND(stats.totalPlayAmount)}</Text>
                  </View>
                  <View style={styles.statGridItem}>
                    <Text style={styles.statGridLabel}>🥤 Đồ dùng / Món</Text>
                    <Text style={styles.statGridValue}>{formatVND(stats.totalItemAmount)}</Text>
                  </View>
                </View>
              </View>

              {/* Danh sách các bàn chơi được gộp chung */}
              <View style={styles.listHeaderRow}>
                <Text style={styles.listHeaderTitle}>
                  📋 DANH SÁCH BÀN CHƠI ({groupedTables.length} bàn • {sessions.length} lượt)
                </Text>
                {selectedTableId && (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedTableId(null);
                      setSelectedTableName('');
                      fetchDayDetail(selectedDate, null);
                    }}
                  >
                    <Text style={styles.viewAllTablesText}>👁️ Xem tất cả bàn</Text>
                  </TouchableOpacity>
                )}
              </View>

              {loading ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="large" color="#0F766E" />
                  <Text style={styles.loadingText}>Đang nạp chi tiết phiên chơi...</Text>
                </View>
              ) : groupedTables.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyIcon}>📭</Text>
                  <Text style={styles.emptyText}>
                    Không có lượt chơi nào {selectedTableName ? `tại ${selectedTableName}` : ''} trong ngày này.
                  </Text>
                </View>
              ) : (
                <ScrollView style={styles.sessionList} showsVerticalScrollIndicator={true}>
                  {groupedTables.map((group) => {
                    const hr = Math.floor(group.totalMinutes / 60);
                    const mn = group.totalMinutes % 60;
                    const durationStr = hr > 0 ? `${hr}h ${mn}p` : `${mn}p`;

                    return (
                      <View key={group.tableId} style={styles.tableGroupCard}>
                        {/* Header của bàn */}
                        <View style={styles.tableGroupHeader}>
                          <View style={styles.tableGroupTitleCol}>
                            <Text style={styles.tableGroupName}>{group.tableName}</Text>
                            <Text style={styles.tableGroupRate}>({formatVND(group.pricePerHour)}/h)</Text>
                          </View>
                          <View style={styles.tableGroupSummaryRight}>
                            <Text style={styles.tableGroupTotalAmount}>
                              {formatVND(group.totalAmount)}
                            </Text>
                            <Text style={styles.tableGroupSummaryMeta}>
                              {group.sessions.length} lượt • {durationStr}
                            </Text>
                          </View>
                        </View>

                        {/* Danh sách các lượt chơi của bàn này theo thứ tự từ sáng đến tối */}
                        <View style={styles.tableTurnsList}>
                          {group.sessions.map((s, index) => {
                            const isPaid = s.isPaid;
                            const isPlaying = !s.endTime && !isPaid;
                            const startTimeStr = formatTimeOnly(s.startTime);
                            const endTimeStr = s.endTime ? formatTimeOnly(s.endTime) : (isPlaying ? 'Đang chơi' : '');
                            const items = s.items || [];

                            return (
                              <View
                                key={s.id}
                                style={[
                                  styles.turnRow,
                                  index < group.sessions.length - 1 && styles.turnRowDivider,
                                  isPlaying && styles.turnRowPlaying,
                                ]}
                              >
                                {/* Hàng 1: Thời gian & Tổng tiền của lượt */}
                                <View style={styles.turnTopLine}>
                                  <View style={styles.turnTimeGroup}>
                                    <Text style={styles.turnLabel}>Lượt {index + 1}:</Text>
                                    <Text style={styles.turnTimeText}>
                                      {startTimeStr} ➔ {endTimeStr}
                                    </Text>
                                    <View style={styles.turnDurationBadge}>
                                      <Text style={styles.turnDurationText}>{s.durationStr}</Text>
                                    </View>
                                  </View>

                                  <View style={styles.turnPriceGroup}>
                                    <Text style={styles.turnTotalText}>
                                      {formatVND(s.calculatedTotalAmount)}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.turnStatusText,
                                        isPaid && styles.textGreen,
                                        isPlaying && styles.textRed,
                                        !isPaid && !isPlaying && styles.textYellow,
                                      ]}
                                    >
                                      {isPaid ? '✓ Đã Thanh toán' : isPlaying ? '● Đang chơi' : 'Chờ TT'}
                                    </Text>
                                  </View>
                                </View>

                                {/* Hàng 2: Bóc tách tiền giờ & đồ dùng */}
                                <View style={styles.turnBottomLine}>
                                  <Text style={styles.turnDetailText}>
                                    Tiền giờ: <Text style={styles.boldText}>{formatVND(s.calculatedPlayAmount)}</Text>
                                    {s.extraAmount > 0 && (
                                      <>
                                        {' '}+ Đồ dùng: <Text style={styles.boldText}>{formatVND(s.extraAmount)}</Text>
                                        {items.length > 0 && (
                                          <Text style={styles.itemsSummaryText}>
                                            {' '}({items.map((it) => `${it.product?.name || 'Món'} ×${parseFloat(it.quantity || 0)}`).join(', ')})
                                          </Text>
                                        )}
                                      </>
                                    )}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}

          {/* Footer nút đóng */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.footerCloseBtn} onPress={() => setVisible(false)}>
              <Text style={styles.footerCloseBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

export default ShopDailyRevenueModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '96%',
    maxWidth: 640,
    height: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    ...SHADOWS.card,
    display: 'flex',
    flexDirection: 'column',
  },
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingBottom: 10,
    marginBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    marginLeft: 10,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: 'bold',
  },

  // Chế độ xem danh sách ngày
  allRevenueCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#99F6E4',
    marginBottom: 10,
    alignItems: 'center',
  },
  allRevenueLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0F766E',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  allRevenueValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 8,
  },
  daysScrollList: {
    flex: 1,
  },
  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  dayCardToday: {
    borderColor: '#99F6E4',
    backgroundColor: '#F0FDFA',
  },
  dayCardLeft: {
    flex: 1,
  },
  dayDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  dayDateText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  todayBadge: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  todayBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  dayMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 3,
  },
  dayMetaItem: {
    fontSize: 11,
    color: '#64748B',
  },
  dayMetaDot: {
    fontSize: 10,
    color: '#CBD5E1',
  },
  dayCardRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  dayAmountText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  viewDetailArrow: {
    fontSize: 11,
    color: '#3B82F6',
    fontWeight: '600',
    marginTop: 2,
  },

  // Chế độ xem chi tiết 1 ngày
  backToDaysRow: {
    marginBottom: 8,
  },
  backToDaysBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  backToDaysBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0F766E',
  },

  // Thanh chuyển ngày
  dateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  dateNavBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavBtnDisabled: {
    opacity: 0.35,
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  dateNavBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  dateNavBtnTextDisabled: {
    color: '#94A3B8',
  },
  currentDateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  currentDateText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F766E',
    textAlign: 'center',
  },

  // Thẻ thống kê tổng quan ngày
  statsCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#99F6E4',
    marginBottom: 10,
  },
  statsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRevenueLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  statsRevenueValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  sessionCountBadge: {
    backgroundColor: '#CCFBF1',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  sessionCountText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  statsDivider: {
    height: 1,
    backgroundColor: '#CCFBF1',
    marginVertical: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statGridItem: {
    flex: 1,
    alignItems: 'center',
  },
  statGridLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2,
  },
  statGridValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },

  // Danh sách phiên chơi
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  listHeaderTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  viewAllTablesText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 20,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  sessionList: {
    flex: 1,
  },
  // Card gộp theo bàn
  tableGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  tableGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  tableGroupTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tableGroupName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  tableGroupRate: {
    fontSize: 12,
    color: '#64748B',
  },
  tableGroupSummaryRight: {
    alignItems: 'flex-end',
  },
  tableGroupTotalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  tableGroupSummaryMeta: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  tableTurnsList: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  turnRow: {
    paddingVertical: 10,
  },
  turnRowDivider: {
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  turnRowPlaying: {
    backgroundColor: '#FFFBFB',
    borderRadius: 8,
    paddingHorizontal: 8,
    marginVertical: 2,
  },
  turnTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  turnTimeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  turnLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  turnTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  turnDurationBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  turnDurationText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#475569',
  },
  turnPriceGroup: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  turnTotalText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  turnStatusText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  turnBottomLine: {
    marginTop: 2,
  },
  turnDetailText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#334155',
  },
  itemsSummaryText: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '500',
  },
  textGreen: {
    color: '#16A34A',
  },
  textRed: {
    color: '#DC2626',
  },
  textYellow: {
    color: '#D97706',
  },
  footer: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'flex-end',
  },
  footerCloseBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  footerCloseBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
});
