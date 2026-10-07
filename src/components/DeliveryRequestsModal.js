// meat-management-fe/src/components/DeliveryRequestsModal.js
import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect, useMemo } from 'react';
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
import PopupModal from './PopupModal';
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
  const popupRef = useRef(null);
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

  // Xóa lượt báo hàng của quán
  const confirmDelete = (item) => {
    if (!item) return;
    popupRef.current?.show({
      type: 'confirm',
      title: 'XÓA BÁO HÀNG',
      message: `Bạn có chắc chắn muốn xóa lượt báo hàng của [${item.customer?.name || 'khách hàng'}] không?`,
      confirmText: 'XÓA NGAY',
      cancelText: 'HỦY BỎ',
      onConfirm: async () => {
        try {
          const res = await api.delete(`/portal/manage/delivery-requests/${item.id}`);
          if (res.data?.success) {
            showGlobalToast(res.data.message || 'Đã xóa lượt báo hàng thành công!', 'success');
            fetchRequests(activeDateType);
            if (onRefresh) onRefresh();
          }
        } catch (err) {
          showGlobalToast(err.response?.data?.message || 'Lỗi khi xóa lượt báo hàng', 'error');
        }
      },
    });
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
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* HEADER MODAL */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerIcon}>📋</Text>
            <View>
              <Text style={styles.modalTitle}>DANH SÁCH BÁO HÀNG</Text>
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

        {/* BỘ CHỌN NGÀY NHANH: HÔM NAY / NGÀY MAI (SIÊU GỌN) */}
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

        {/* THỐNG KÊ TÓM TẮT 2 CHỈ SỐ: ĐÃ BÁO HÀNG & ĐÃ NHẬP CÔNG NỢ (BỎ LOGIC CHỐT) */}
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryItem, styles.summaryItemReported]}>
            <Text style={[styles.summaryValue, styles.summaryValueReported]}>
              {summary.totalRequests}
            </Text>
            <Text style={styles.summaryLabel}>Đã báo hàng</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemBilled]}>
            <Text style={[styles.summaryValue, styles.summaryValueBilled]}>
              {summary.billedCount}
            </Text>
            <Text style={styles.summaryLabel}>
              Đã nhập công nợ {summary.unbilledCount > 0 ? `(còn ${summary.unbilledCount} chưa nợ)` : ''}
            </Text>
          </View>
        </View>

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
            {/* BẢNG TINH GỌN VỪA KHÍT 100% VIEWPORT - KHÔNG SCROLL NGANG */}
            <View style={styles.tableContainer}>
              {/* HEADER BẢNG */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, styles.colStt]}>STT</Text>
                <Text style={[styles.tableHeaderCell, styles.colCustomer]}>TÊN KHÁCH</Text>
                <Text style={[styles.tableHeaderCell, styles.colActions]}>THAO TÁC</Text>
              </View>

              {/* NỘI DUNG CÁC DÒNG */}
              {requests.map((item, idx) => {
                const hasDebt = item.hasDebt;
                const isEven = idx % 2 === 0;
                const isLast = idx === requests.length - 1;

                return (
                  <View
                    key={item.id || idx}
                    style={[
                      styles.tableRow,
                      isEven ? styles.tableRowEven : styles.tableRowOdd,
                      !isLast && styles.tableRowBorder,
                    ]}
                  >
                    {/* CỘT 1: STT */}
                    <View style={styles.colStt}>
                      <Text style={styles.sttText}>{idx + 1}</Text>
                    </View>

                    {/* CỘT 2: TÊN KHÁCH */}
                    <View style={styles.colCustomer}>
                      <Text style={styles.customerNameText} numberOfLines={1}>
                        {item.customer?.name || 'Khách hàng'}
                      </Text>
                      <View style={styles.customerSubInfoRow}>
                        {item.customer?.phone ? (
                          <TouchableOpacity
                            onPress={() => handleCallCustomer(item.customer?.phone)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.phoneChipText}>📞 {item.customer?.phone}</Text>
                          </TouchableOpacity>
                        ) : null}
                        {item.note ? (
                          <Text style={styles.noteSnippetText} numberOfLines={1}>
                            • {item.note}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* CỘT 3: THAO TÁC (NÚT GHI NỢ & NÚT XÓA) */}
                    <View style={styles.colActions}>
                      {/* NÚT GHI NỢ */}
                      <TouchableOpacity
                        style={[
                          styles.actionDebtBtn,
                          hasDebt ? styles.actionDebtBtnDone : styles.actionDebtBtnPending,
                        ]}
                        onPress={() => handleQuickCreateDebt(item)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.actionDebtBtnText,
                            hasDebt ? styles.actionDebtBtnTextDone : styles.actionDebtBtnTextPending,
                          ]}
                        >
                          {hasDebt ? '✓ Đã nợ' : '➕ Ghi nợ'}
                        </Text>
                      </TouchableOpacity>

                      {/* NÚT XÓA */}
                      <TouchableOpacity
                        style={styles.actionDeleteBtn}
                        onPress={() => confirmDelete(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionDeleteBtnText}>🗑️ Xóa</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
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

    {/* POPUP MODAL XÁC NHẬN XÓA Ở TẦNG CAO NHẤT ĐỘC LẬP */}
    <PopupModal ref={popupRef} />
    </>
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
    borderRadius: 8,
    padding: 2,
    marginVertical: 6,
  },
  tabDateBtn: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  tabDateBtnActive: {
    backgroundColor: '#059669',
  },
  tabDateLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
  },
  tabDateLabelActive: {
    color: '#FFFFFF',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    width: '100%',
  },
  summaryItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryItemReported: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  summaryItemBilled: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  summaryValueReported: {
    color: '#1D4ED8',
  },
  summaryValueBilled: {
    color: '#059669',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    fontWeight: '600',
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
    paddingBottom: 10,
  },
  tableContainer: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.3,
  },
  colStt: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  colCustomer: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  colActions: {
    width: 146,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingRight: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 46,
  },
  tableRowEven: {
    backgroundColor: '#FFFFFF',
  },
  tableRowOdd: {
    backgroundColor: '#F8FAFC',
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sttText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  customerNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  customerSubInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  phoneChipText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  noteSnippetText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
    maxWidth: 220,
  },
  actionDebtBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDebtBtnPending: {
    backgroundColor: '#059669',
  },
  actionDebtBtnDone: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  actionDebtBtnText: {
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  actionDebtBtnTextPending: {
    color: '#FFFFFF',
  },
  actionDebtBtnTextDone: {
    color: '#15803D',
  },
  actionDeleteBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDeleteBtnText: {
    color: '#DC2626',
    fontSize: 11.5,
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
