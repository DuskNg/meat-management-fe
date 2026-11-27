// meat-management-fe/src/components/NotificationCenterModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import SmoothModal from './SmoothModal';

const formatCurrency = (val) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);

// Modal Trung tâm Thông báo: gom thông báo lên lịch, báo hàng, tiền khách trả trong ngày, nhắc trả lương và nhắc định kỳ
const NotificationCenterModal = forwardRef(({
  dueNotifications = [],
  todayPriceSchedules = [],
  unbilledDeliveryData = null,
  todayPaymentsSummary = { count: 0, totalAmount: 0, items: [] },
  salaryReminderInfo = null,
  activeReminderGroups = [],
  isPeriodicDay = false,
  onDismissDueNotification,
  onDismissReminderGroup,
  onOpenScheduledNotifications,
  onOpenScheduledPriceUpdates,
  onOpenDeliveryRequests,
  onOpenTodayPayments,
  onOpenSalaryNotification,
  onOpenGroupExport,
  onOpenPeriodicReminder,
}, ref) => {
  const [visible, setVisible] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => setVisible(true),
    close: () => setVisible(false),
  }));

  const closeAndRun = (fn) => {
    setVisible(false);
    if (typeof fn === 'function') {
      setTimeout(() => fn(), 80);
    }
  };

  const hasScheduled = dueNotifications.length > 0 || todayPriceSchedules.length > 0;
  const hasDelivery = Boolean(unbilledDeliveryData?.unbilledCount > 0);
  const hasTodayPayments = Boolean(todayPaymentsSummary?.count > 0);
  const hasSalaryReminder = Boolean(salaryReminderInfo?.shouldShow);
  const hasPeriodic = activeReminderGroups.length > 0 || isPeriodicDay;
  const hasAny = hasScheduled || hasDelivery || hasTodayPayments || hasSalaryReminder || hasPeriodic;

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)} zIndex={88000}>
      <View style={styles.modalView}>
        {/* Header Bottom-Sheet */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>🔔 TRUNG TÂM THÔNG BÁO</Text>
            <Text style={styles.headerSub}>Tổng hợp nhắc việc, báo hàng, thu tiền, lương & lịch định kỳ</Text>
          </View>
          <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn} activeOpacity={0.7}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
          {!hasAny && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyTitle}>Hôm nay chưa có thông báo nào cần xử lý</Text>
              <Text style={styles.emptySub}>Mọi nhắc việc lên lịch, báo hàng, tiền thu & lịch định kỳ sẽ tự động gom về đây.</Text>
            </View>
          )}

          {/* 1. THÔNG BÁO LÊN LỊCH (Hẹn ngày + Lịch cập nhật giá thịt) */}
          {hasScheduled && (
            <View style={styles.groupSection}>
              <Text style={styles.groupHeading}>⏰ THÔNG BÁO LÊN LỊCH</Text>

              {dueNotifications.map((notif) => (
                <View key={notif.id} style={[styles.itemCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => closeAndRun(onOpenScheduledNotifications)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.itemTitle, { color: '#1E3A8A' }]} numberOfLines={2}>
                      🔔 Nhắc việc: {notif.content}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dismissMiniBtn}
                    onPress={() => onDismissDueNotification?.(notif.id)}
                  >
                    <Text style={styles.dismissMiniText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {todayPriceSchedules.map((sched) => (
                <TouchableOpacity
                  key={sched.id}
                  style={[styles.itemCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                  onPress={() => closeAndRun(onOpenScheduledPriceUpdates)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: '#065F46' }]}>
                      {sched.status === 'APPLIED'
                        ? `✅ Lịch giá thịt hôm nay đã áp dụng (${(sched.items || []).length} món)`
                        : sched.status === 'FAILED'
                          ? '❌ Lịch giá thịt hôm nay bị lỗi'
                          : `⏳ Lịch cập nhật giá thịt hôm nay (${(sched.items || []).length} món)`}
                    </Text>
                  </View>
                  <Text style={styles.arrowText}>Xem ➔</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 2. BÁO HÀNG (ZALO PORTAL CHƯA LÊN NỢ) */}
          {hasDelivery && (
            <View style={styles.groupSection}>
              <Text style={styles.groupHeading}>📦 BÁO HÀNG</Text>
              <TouchableOpacity
                style={[styles.itemCard, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
                onPress={() => closeAndRun(onOpenDeliveryRequests)}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: '#9A3412' }]}>
                    Có {unbilledDeliveryData.unbilledCount} quán đã báo hàng hôm nay nhưng chưa lên công nợ
                  </Text>
                </View>
                <Text style={[styles.arrowText, { color: '#EA580C' }]}>Chốt ➔</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 3. TIỀN KHÁCH TRẢ TRONG NGÀY */}
          {hasTodayPayments && (
            <View style={styles.groupSection}>
              <Text style={styles.groupHeading}>💰 TIỀN KHÁCH TRẢ TRONG NGÀY</Text>
              <TouchableOpacity
                style={[styles.itemCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                onPress={() => closeAndRun(onOpenTodayPayments)}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: '#166534' }]}>
                    Đã thu {formatCurrency(todayPaymentsSummary.totalAmount)} ({todayPaymentsSummary.count} lượt trả hôm nay)
                  </Text>
                </View>
                <Text style={[styles.arrowText, { color: '#15803D' }]}>Bảng thu ➔</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 4. NHẮC TRẢ LƯƠNG */}
          {hasSalaryReminder && (
            <View style={styles.groupSection}>
              <Text style={styles.groupHeading}>💵 NHẮC TRẢ LƯƠNG</Text>
              <TouchableOpacity
                style={[styles.itemCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                onPress={() => closeAndRun(() => onOpenSalaryNotification?.(salaryReminderInfo.monthKey))}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: '#991B1B' }]}>
                    Đến kỳ chốt & trả lương nhân viên tháng {salaryReminderInfo.monthKey}
                  </Text>
                </View>
                <Text style={[styles.arrowText, { color: '#DC2626' }]}>Mở ➔</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 5. NHẮC ĐỊNH KỲ */}
          {hasPeriodic && (
            <View style={styles.groupSection}>
              <Text style={styles.groupHeading}>📅 NHẮC ĐỊNH KỲ</Text>

              {activeReminderGroups.map((rg) => (
                <View key={rg.id} style={[styles.itemCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => closeAndRun(() => onOpenGroupExport?.(rg.customerIds))}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.itemTitle, { color: '#92400E' }]}>
                      Đến kỳ gửi công nợ {rg.billingCycle === '15_to_end' ? 'nửa tháng (15 - 31)' : 'cuối tháng'}: {rg.name} ({(rg.customerIds || []).length} quán)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dismissMiniBtn}
                    onPress={() => onDismissReminderGroup?.(rg.id)}
                  >
                    <Text style={styles.dismissMiniText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {isPeriodicDay && (
                <TouchableOpacity
                  style={[styles.itemCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
                  onPress={() => closeAndRun(onOpenPeriodicReminder)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: '#92400E' }]}>
                      Lịch gửi công nợ định kỳ (Ngày 1 & 15)
                    </Text>
                  </View>
                  <Text style={[styles.arrowText, { color: '#B45309' }]}>Gửi ➔</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Lối tắt quản lý nhanh */}
          <View style={styles.quickLinksRow}>
            <TouchableOpacity
              style={styles.quickLinkBtn}
              onPress={() => closeAndRun(onOpenScheduledNotifications)}
            >
              <Text style={styles.quickLinkText}>🔔 Tạo nhắc việc</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLinkBtn}
              onPress={() => closeAndRun(onOpenScheduledPriceUpdates)}
            >
              <Text style={styles.quickLinkText}>⏰ Lịch giá thịt</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.footerCloseBtn} onPress={() => setVisible(false)} activeOpacity={0.8}>
          <Text style={styles.footerCloseText}>ĐÓNG LẠI</Text>
        </TouchableOpacity>
      </View>
    </SmoothModal>
  );
});

NotificationCenterModal.displayName = 'NotificationCenterModal';
export default NotificationCenterModal;

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
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptySub: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 },
  groupSection: { marginBottom: 12, gap: 6 },
  groupHeading: { fontSize: 11.5, fontWeight: '800', color: '#475569', letterSpacing: 0.3 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  itemTitle: { fontSize: 13, fontWeight: '700' },
  itemDesc: { fontSize: 12, marginTop: 2 },
  arrowText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  dismissMiniBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissMiniText: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },
  quickLinksRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 6 },
  quickLinkBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  quickLinkText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  footerCloseBtn: {
    height: 46,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCloseText: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
});
