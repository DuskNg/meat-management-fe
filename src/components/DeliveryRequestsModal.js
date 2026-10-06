// meat-management-fe/src/components/DeliveryRequestsModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { showGlobalToast } from '../store/toastStore';
import { COLORS } from '../theme';

// Định dạng tiền tệ VND
const formatCurrency = (val) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(val || 0)
    .replace('₫', 'đ');

// Helper tính ngày hôm nay và ngày mai
const getDateOptions = () => {
  const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  // Hôm nay
  const todayDate = new Date(now);
  const todayDayName = daysOfWeek[todayDate.getDay()];
  const todayFormatted = `${pad(todayDate.getDate())}/${pad(todayDate.getMonth() + 1)}`;
  const todayIso = `${todayDate.getFullYear()}-${pad(todayDate.getMonth() + 1)}-${pad(todayDate.getDate())}`;

  // Ngày mai
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrowDayName = daysOfWeek[tomorrowDate.getDay()];
  const tomorrowFormatted = `${pad(tomorrowDate.getDate())}/${pad(tomorrowDate.getMonth() + 1)}`;
  const tomorrowIso = `${tomorrowDate.getFullYear()}-${pad(tomorrowDate.getMonth() + 1)}-${pad(tomorrowDate.getDate())}`;

  return {
    today: {
      type: 'today',
      dayName: todayDayName,
      formatted: todayFormatted,
      iso: todayIso,
      label: 'Hôm nay',
    },
    tomorrow: {
      type: 'tomorrow',
      dayName: tomorrowDayName,
      formatted: tomorrowFormatted,
      iso: tomorrowIso,
      label: 'Ngày mai',
    },
  };
};

const DeliveryRequestsModal = forwardRef(({ onOpenDebt, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeDateType, setActiveDateType] = useState('today'); // 'today' | 'tomorrow'
  const [data, setData] = useState({
    summary: {
      totalRequests: 0,
      confirmedCount: 0,
      billedCount: 0,
      unbilledCount: 0,
    },
    requests: [],
    unbilledCustomers: [],
  });

  const dateOpts = useMemo(() => getDateOptions(), []);

  // Tải danh sách đơn báo hàng theo ngày
  const fetchRequests = async (dateType) => {
    const targetType = dateType || activeDateType;
    try {
      setLoading(true);
      const res = await api.get('/portal/manage/delivery-requests', {
        params: {
          dateType: targetType,
          _t: Date.now(),
        },
      });

      if (res.data?.success && res.data?.data) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách báo hàng:', err);
      showGlobalToast('Không thể tải danh sách báo hàng, vui lòng thử lại.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (opts = {}) => {
      const initialType = opts.dateType || 'today';
      setActiveDateType(initialType);
      setVisible(true);
      fetchRequests(initialType);
    },
    close: () => {
      setVisible(false);
    },
    refetch: () => {
      fetchRequests(activeDateType);
    },
  }));

  // Xử lý chuyển tab ngày
  const handleSelectDateType = (type) => {
    setActiveDateType(type);
    fetchRequests(type);
  };

  // Chốt / Hủy chốt đơn cho từng quán
  const handleToggleConfirm = async (item) => {
    try {
      const newStatus = !item.isConfirmed;
      const res = await api.put(`/portal/manage/delivery-requests/${item.id}/confirm`, {
        isConfirmed: newStatus,
      });

      if (res.data?.success) {
        showGlobalToast(
          newStatus
            ? `Đã chốt có hàng cho quán [${item.customer?.name}]`
            : `Đã hủy chốt hàng cho quán [${item.customer?.name}]`,
          'success'
        );
        fetchRequests(activeDateType);
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Lỗi khi cập nhật trạng thái chốt hàng', 'error');
    }
  };

  // Chốt hàng loạt cho tất cả các quán chưa chốt
  const handleBulkConfirm = async () => {
    try {
      const targetObj = activeDateType === 'tomorrow' ? dateOpts.tomorrow : dateOpts.today;
      const res = await api.put('/portal/manage/delivery-requests/bulk-confirm', {
        dateType: activeDateType,
        date: targetObj.iso,
        isConfirmed: true,
      });

      if (res.data?.success) {
        showGlobalToast(res.data.message || 'Đã chốt tất cả quán có hàng!', 'success');
        fetchRequests(activeDateType);
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Lỗi khi chốt hàng loạt', 'error');
    }
  };

  // Bấm nút "Ghi nợ ngay" cho quán chưa có nợ
  const handleQuickCreateDebt = (item) => {
    if (!item.customer) return;
    setVisible(false);
    if (onOpenDebt) {
      const targetObj = activeDateType === 'tomorrow' ? dateOpts.tomorrow : dateOpts.today;
      onOpenDebt(item.customer, targetObj.iso);
    }
  };

  // Gọi điện cho quán
  const handleCallCustomer = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const requests = data.requests || [];
  const summary = data.summary || {
    totalRequests: 0,
    confirmedCount: 0,
    billedCount: 0,
    unbilledCount: 0,
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* HEADER MODAL */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerIcon}>📋</Text>
            <View>
              <Text style={styles.modalTitle}>DANH SÁCH BÁO HÀNG & CHỐT ĐƠN</Text>
              <Text style={styles.modalSubTitle}>
                Quản lý các nhà hàng đặt hàng qua Zalo Portal & đối soát nợ
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

        {/* BỘ CHỌN NGÀY NHANH: HÔM NAY / NGÀY MAI */}
        <View style={styles.tabDateRow}>
          <TouchableOpacity
            style={[
              styles.tabDateBtn,
              activeDateType === 'today' && styles.tabDateBtnActive,
            ]}
            onPress={() => handleSelectDateType('today')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabDateLabel,
                activeDateType === 'today' && styles.tabDateLabelActive,
              ]}
            >
              Hôm nay ({dateOpts.today.formatted})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabDateBtn,
              activeDateType === 'tomorrow' && styles.tabDateBtnActive,
            ]}
            onPress={() => handleSelectDateType('tomorrow')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabDateLabel,
                activeDateType === 'tomorrow' && styles.tabDateLabelActive,
              ]}
            >
              Ngày mai ({dateOpts.tomorrow.formatted})
            </Text>
          </TouchableOpacity>
        </View>

        {/* THỐNG KÊ TÓM TẮT 4 KHỐI (2 CỘT x 2 DÒNG MOBILE-FIRST) */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.totalRequests}</Text>
            <Text style={styles.summaryLabel}>Tổng quán báo</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemConfirmed]}>
            <Text style={[styles.summaryValue, styles.summaryValueConfirmed]}>
              {summary.confirmedCount}
            </Text>
            <Text style={styles.summaryLabel}>Đã chốt có hàng</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemBilled]}>
            <Text style={[styles.summaryValue, styles.summaryValueBilled]}>
              {summary.billedCount}
            </Text>
            <Text style={styles.summaryLabel}>Đã có công nợ</Text>
          </View>
          <View
            style={[
              styles.summaryItem,
              summary.unbilledCount > 0 && styles.summaryItemUnbilled,
            ]}
          >
            <Text
              style={[
                styles.summaryValue,
                summary.unbilledCount > 0 && styles.summaryValueUnbilled,
              ]}
            >
              {summary.unbilledCount}
            </Text>
            <Text style={styles.summaryLabel}>⚠️ Chưa có công nợ</Text>
          </View>
        </View>

        {/* THANH TÁC VỤ HÀNG LOẠT */}
        {requests.length > 0 && summary.confirmedCount < summary.totalRequests && (
          <View style={styles.bulkActionRow}>
            <TouchableOpacity
              style={styles.bulkConfirmBtn}
              onPress={handleBulkConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.bulkConfirmBtnText}>
                ✓ Chốt tất cả ({summary.totalRequests - summary.confirmedCount} quán chưa chốt)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* DANH SÁCH CÁC NHÀ HÀNG BÁO HÀNG */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.loadingText}>Đang tải dữ liệu báo hàng...</Text>
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>Chưa có nhà hàng nào báo hàng</Text>
            <Text style={styles.emptySubtitle}>
              Khi các quán bấm nút "Báo hàng" trên Zalo Portal, danh sách sẽ tự động hiển thị ở đây.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
          >
            {requests.map((item, idx) => {
              const isConfirmed = item.isConfirmed;
              const hasDebt = item.hasDebt;

              return (
                <View
                  key={item.id || idx}
                  style={[
                    styles.requestCard,
                    !hasDebt && styles.requestCardUnbilled,
                  ]}
                >
                  {/* DÒNG TIÊU ĐỀ: TÊN QUÁN + NHÓM */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.customerNameWrap}>
                      <Text style={styles.customerNameText}>
                        {item.customer?.name || 'Khách hàng'}
                      </Text>
                      {item.customer?.phone ? (
                        <TouchableOpacity
                          style={styles.phoneChip}
                          onPress={() => handleCallCustomer(item.customer?.phone)}
                        >
                          <Text style={styles.phoneChipText}>📞 {item.customer?.phone}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {/* NÚT CHỐT HÀNG */}
                    <TouchableOpacity
                      style={[
                        styles.confirmToggleBtn,
                        isConfirmed ? styles.confirmToggleBtnDone : styles.confirmToggleBtnPending,
                      ]}
                      onPress={() => handleToggleConfirm(item)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.confirmToggleText,
                          isConfirmed ? styles.confirmToggleTextDone : styles.confirmToggleTextPending,
                        ]}
                      >
                        {isConfirmed ? '✅ Đã chốt' : '⏳ Bấm chốt'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* THÔNG TIN CHI TIẾT: NHÓM PORTAL + GHI CHÚ */}
                  <View style={styles.cardDetailCol}>
                    {item.portalLink?.name ? (
                      <Text style={styles.portalLinkNameText}>
                        🔗 Nhóm Zalo: {item.portalLink.name}
                      </Text>
                    ) : null}

                    {item.note ? (
                      <View style={styles.noteBox}>
                        <Text style={styles.noteLabel}>Ghi chú:</Text>
                        <Text style={styles.noteContent}>{item.note}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* KHỐI TRẠNG THÁI CÔNG NỢ */}
                  <View style={styles.debtStatusRow}>
                    {hasDebt ? (
                      <View style={styles.debtStatusBilledBadge}>
                        <Text style={styles.debtStatusBilledText}>
                          ✅ Đã có công nợ: {formatCurrency(item.debtAmount)} ({item.debtCount} đơn)
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.debtStatusUnbilledRow}>
                        <View style={styles.debtStatusUnbilledBadge}>
                          <Text style={styles.debtStatusUnbilledText}>
                            ⚠️ Chưa có công nợ!
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.quickAddDebtBtn}
                          onPress={() => handleQuickCreateDebt(item)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.quickAddDebtBtnText}>➕ Ghi nợ ngay</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
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

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
    paddingHorizontal: 16,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  headerIcon: {
    fontSize: 24,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  modalSubTitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: 'bold',
  },
  tabDateRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginVertical: 12,
  },
  tabDateBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  tabDateBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  tabDateLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  tabDateLabelActive: {
    color: '#FFFFFF',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  summaryItem: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryItemConfirmed: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  summaryItemBilled: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  summaryItemUnbilled: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  summaryValueConfirmed: {
    color: '#059669',
  },
  summaryValueBilled: {
    color: '#2563EB',
  },
  summaryValueUnbilled: {
    color: '#DC2626',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  bulkActionRow: {
    marginBottom: 10,
  },
  bulkConfirmBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyWrap: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  listContainer: {
    gap: 10,
    paddingBottom: 10,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  requestCardUnbilled: {
    borderColor: '#FDBA74',
    backgroundColor: '#FFFBF5',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  customerNameText: {
    fontSize: 14.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  phoneChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  phoneChipText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  confirmToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confirmToggleBtnDone: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  confirmToggleBtnPending: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  confirmToggleText: {
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  confirmToggleTextDone: {
    color: '#15803D',
  },
  confirmToggleTextPending: {
    color: '#B45309',
  },
  cardDetailCol: {
    gap: 4,
  },
  portalLinkNameText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  noteBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  noteLabel: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#475569',
  },
  noteContent: {
    fontSize: 12,
    color: '#0F172A',
    marginTop: 1,
  },
  debtStatusRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  debtStatusBilledBadge: {
    backgroundColor: '#F0FDF4',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  debtStatusBilledText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  debtStatusUnbilledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  debtStatusUnbilledBadge: {
    backgroundColor: '#FFF7ED',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
    flex: 1,
  },
  debtStatusUnbilledText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#C2410C',
  },
  quickAddDebtBtn: {
    backgroundColor: '#EA580C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAddDebtBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  footerWrap: {
    paddingTop: 10,
  },
  closeFooterBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeFooterBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
  },
});

export default DeliveryRequestsModal;
