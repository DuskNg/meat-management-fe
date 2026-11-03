// meat-management-fe/src/components/ZaloDailyTrackingModal.js
// Modal theo dõi, kiểm soát dòng tiền & chốt tiền nhanh cho các nhóm Zalo báo hàng cuốn chiếu
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import DatePickerInput from './DatePickerInput';
import PopupModal from './PopupModal';
import { api, API_HOST } from '../api/client';
import { showGlobalToast } from '../store/toastStore';
import { copyTextToClipboard } from '../utils/imageShareHelper';

// Định dạng tiền tệ VNĐ
const formatCurrency = (val) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(val || 0)
    .replace('₫', 'đ');

const getTodayString = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const toISODate = (ddmmyyyy) => {
  if (!ddmmyyyy) return new Date().toISOString().slice(0, 10);
  const parts = ddmmyyyy.split('/');
  if (parts.length !== 3) return new Date().toISOString().slice(0, 10);
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const ZaloDailyTrackingModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [dashboardData, setDashboardData] = useState({
    summary: {
      totalGroups: 0,
      todayOrderSum: 0,
      todayPaidSum: 0,
      todayUnpaidSum: 0,
      previousDebtSum: 0,
    },
    groups: [],
  });

  // Bộ lọc trạng thái: 'all' | 'unpaid' | 'paid' | 'has_debt'
  const [filterTab, setFilterTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form tạo nhanh nhóm Zalo
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPhone, setNewGroupPhone] = useState('');
  const [newGroupPin, setNewGroupPin] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Thao tác chốt tiền nhanh
  const [submittingGroupId, setSubmittingGroupId] = useState(null);

  const popupRef = useRef(null);

  // Tải dữ liệu dashboard
  const fetchDashboard = async (targetDate) => {
    try {
      setLoading(true);
      const isoDate = toISODate(targetDate || selectedDate);
      const res = await api.get(`/portal/manage/zalo-daily-dashboard?date=${isoDate}`);
      if (res.data?.success) {
        setDashboardData(res.data.data || { summary: {}, groups: [] });
      }
    } catch (err) {
      console.error('Lỗi khi tải bảng kiểm soát nhóm Zalo:', err);
      showGlobalToast('Không thể tải dữ liệu nhóm Zalo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (dateStr) => {
      const d = dateStr || getTodayString();
      setSelectedDate(d);
      setVisible(true);
      fetchDashboard(d);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Đổi ngày xem
  const handleChangeDate = (newDate) => {
    setSelectedDate(newDate);
    fetchDashboard(newDate);
  };

  // Tạo nhóm Zalo mới siêu tốc
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      showGlobalToast('Vui lòng nhập tên nhóm Zalo.', 'warning');
      return;
    }

    try {
      setCreateSubmitting(true);
      const res = await api.post('/portal/manage/create-zalo-daily-group', {
        groupName: newGroupName.trim(),
        phone: newGroupPhone.trim() || undefined,
        pin: newGroupPin.trim() || undefined,
      });

      if (res.data?.success) {
        const portalUrl = res.data.data?.portalUrl || '';
        const fullUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${portalUrl}`;

        showGlobalToast(`Đã tạo nhóm "${newGroupName.trim()}" thành công!`, 'success');
        if (fullUrl) {
          copyTextToClipboard(fullUrl);
        }

        setNewGroupName('');
        setNewGroupPhone('');
        setNewGroupPin('');
        setShowCreateModal(false);
        fetchDashboard();
      }
    } catch (err) {
      console.error('Lỗi tạo nhóm Zalo:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể tạo nhóm Zalo.', 'error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Chốt tiền nhanh 1 chạm (xác nhận đã nhận đủ tiền hôm nay)
  const handleQuickPay = (group) => {
    if (!group) return;
    const amountToPay = group.remainingToday > 0 ? group.remainingToday : group.todayOrderAmount;
    if (amountToPay <= 0) {
      showGlobalToast('Nhóm này không có tiền hàng cần thanh toán hôm nay.', 'info');
      return;
    }

    popupRef.current?.show({
      type: 'confirm',
      title: 'Xác nhận nhận tiền Zalo',
      message: `Xác nhận đã nhận đủ ${formatCurrency(amountToPay)} từ nhóm "${group.groupName}"?\nSố tiền này sẽ được ghi nhận ngay vào dòng tiền và báo cáo hôm nay.`,
      onConfirm: async () => {
        try {
          setSubmittingGroupId(group.customerId);
          const res = await api.post('/portal/manage/zalo-daily-quick-pay', {
            customerId: group.customerId,
            amount: amountToPay,
            paidAt: new Date().toISOString(),
            note: `Nhận chuyển khoản Zalo ngày ${selectedDate}`,
          });

          if (res.data?.success) {
            showGlobalToast(`Đã chốt nhận ${formatCurrency(amountToPay)} thành công!`, 'success');
            fetchDashboard();
          }
        } catch (err) {
          console.error('Lỗi khi chốt tiền nhóm Zalo:', err);
          showGlobalToast(err.response?.data?.message || 'Không thể ghi nhận thanh toán.', 'error');
        } finally {
          setSubmittingGroupId(null);
        }
      },
    });
  };

  // Copy link Zalo để ghim
  const handleCopyLink = (group) => {
    if (!group?.portalToken) {
      showGlobalToast('Chưa có link portal cho nhóm này.', 'warning');
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : API_HOST;
    const fullUrl = `${origin}/portal/${group.portalToken}`;
    copyTextToClipboard(fullUrl);
    showGlobalToast(`Đã copy link nhóm "${group.groupName}" để ghim Zalo!`, 'success');
  };

  // Mở xem link portal
  const handleOpenPortalLink = (group) => {
    if (!group?.portalToken) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : API_HOST;
    const fullUrl = `${origin}/portal/${group.portalToken}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(fullUrl, '_blank');
    }
  };

  // Lọc danh sách nhóm hiển thị
  const filteredGroups = useMemo(() => {
    const list = dashboardData.groups || [];
    return list.filter((g) => {
      // 1. Lọc theo tab
      if (filterTab === 'unpaid' && g.status !== 'UNPAID' && g.status !== 'PARTIAL') return false;
      if (filterTab === 'paid' && g.status !== 'PAID') return false;
      if (filterTab === 'has_debt' && !g.hasPendingDebt) return false;

      // 2. Tìm kiếm theo tên nhóm hoặc sđt
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (g.groupName || '').toLowerCase().includes(q);
        const matchPhone = (g.phone || '').includes(q);
        if (!matchName && !matchPhone) return false;
      }

      return true;
    });
  }, [dashboardData.groups, filterTab, searchQuery]);

  const summary = dashboardData.summary || {};

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          {/* Header chuẩn Bottom-Sheet */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerIcon}>⚡</Text>
              <Text style={styles.headerTitle}>THEO DÕI & CHỐT TIỀN NHÓM ZALO</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Body cuộn */}
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalBodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Khối tóm tắt dòng tiền hôm nay */}
            <View style={styles.summaryContainer}>
              <View style={[styles.summaryCard, styles.summaryCardOrder]}>
                <Text style={styles.summaryCardLabel}>📦 TIỀN HÀNG HÔM NAY</Text>
                <Text style={[styles.summaryCardValue, { color: '#0F172A' }]}>
                  {formatCurrency(summary.todayOrderSum)}
                </Text>
                <Text style={styles.summaryCardSub}>{summary.totalGroups || 0} nhóm Zalo</Text>
              </View>

              <View style={[styles.summaryCard, styles.summaryCardPaid]}>
                <Text style={[styles.summaryCardLabel, { color: '#047857' }]}>🟢 ĐÃ NHẬN TIỀN</Text>
                <Text style={[styles.summaryCardValue, { color: '#059669' }]}>
                  {formatCurrency(summary.todayPaidSum)}
                </Text>
                <Text style={[styles.summaryCardSub, { color: '#047857' }]}>Đã vào dòng tiền</Text>
              </View>

              <View style={[styles.summaryCard, styles.summaryCardUnpaid]}>
                <Text style={[styles.summaryCardLabel, { color: '#B91C1C' }]}>🔴 CHƯA CHUYỂN</Text>
                <Text style={[styles.summaryCardValue, { color: '#DC2626' }]}>
                  {formatCurrency(summary.todayUnpaidSum)}
                </Text>
                <Text style={[styles.summaryCardSub, { color: '#DC2626' }]}>Cần nhắc chuyển</Text>
              </View>
            </View>

            {/* Cảnh báo nợ đọng cũ nếu có */}
            {summary.previousDebtSum > 0 && (
              <View style={styles.warningDebtBanner}>
                <Text style={styles.warningDebtIcon}>⚠️</Text>
                <Text style={styles.warningDebtText}>
                  Có tổng cộng <Text style={{ fontWeight: 'bold' }}>{formatCurrency(summary.previousDebtSum)}</Text> nợ tồn từ các ngày trước chưa thanh toán.
                </Text>
              </View>
            )}

            {/* Hàng công cụ: Chọn ngày + Tìm kiếm + Nút Tạo nhóm */}
            <View style={styles.toolbarRow}>
              <View style={styles.datePickerWrap}>
                <DatePickerInput
                  value={selectedDate}
                  onChange={handleChangeDate}
                  compact={true}
                />
              </View>

              <TextInput
                style={styles.searchBarInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tìm tên nhóm Zalo..."
                placeholderTextColor="#94A3B8"
              />

              <TouchableOpacity
                style={styles.createGroupBtn}
                onPress={() => setShowCreateModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.createGroupBtnText}>+ Thêm nhóm</Text>
              </TouchableOpacity>
            </View>

            {/* Tab lọc trạng thái */}
            <View style={styles.filterTabsRow}>
              <TouchableOpacity
                style={[styles.filterTabItem, filterTab === 'all' && styles.filterTabItemActive]}
                onPress={() => setFilterTab('all')}
              >
                <Text style={[styles.filterTabItemText, filterTab === 'all' && styles.filterTabItemTextActive]}>
                  Tất cả ({dashboardData.groups?.length || 0})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterTabItem, filterTab === 'unpaid' && styles.filterTabItemActive]}
                onPress={() => setFilterTab('unpaid')}
              >
                <Text style={[styles.filterTabItemText, filterTab === 'unpaid' && styles.filterTabItemTextActive]}>
                  🔴 Chưa chuyển ({dashboardData.groups?.filter((g) => g.status === 'UNPAID' || g.status === 'PARTIAL').length || 0})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterTabItem, filterTab === 'paid' && styles.filterTabItemActive]}
                onPress={() => setFilterTab('paid')}
              >
                <Text style={[styles.filterTabItemText, filterTab === 'paid' && styles.filterTabItemTextActive]}>
                  🟢 Đã chuyển ({dashboardData.groups?.filter((g) => g.status === 'PAID').length || 0})
                </Text>
              </TouchableOpacity>

              {summary.previousDebtSum > 0 && (
                <TouchableOpacity
                  style={[styles.filterTabItem, filterTab === 'has_debt' && styles.filterTabItemActive]}
                  onPress={() => setFilterTab('has_debt')}
                >
                  <Text style={[styles.filterTabItemText, filterTab === 'has_debt' && styles.filterTabItemTextActive]}>
                    ⚠️ Nợ cũ tồn ({dashboardData.groups?.filter((g) => g.previousDebt > 0).length || 0})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* BẢNG DỮ LIỆU CHÍNH (TABLE / GRID VIEW) */}
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.loadingText}>Đang tải danh sách nhóm Zalo...</Text>
              </View>
            ) : filteredGroups.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={styles.emptyTitle}>Chưa có nhóm Zalo báo hàng nào</Text>
                <Text style={styles.emptySubtitle}>
                  Bấm nút "+ Thêm nhóm" ở trên để tạo đường link riêng ghim thẳng vào nhóm Zalo.
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
                <View style={styles.tableContainer}>
                  {/* Table Header */}
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.thCell, { width: 36, textAlign: 'center' }]}>STT</Text>
                    <Text style={[styles.thCell, { width: 150 }]}>Tên nhóm Zalo</Text>
                    <Text style={[styles.thCell, { width: 105, textAlign: 'right' }]}>Đơn hôm nay</Text>
                    <Text style={[styles.thCell, { width: 105, textAlign: 'right' }]}>Đã chuyển</Text>
                    <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>Trạng thái</Text>
                    <Text style={[styles.thCell, { width: 95, textAlign: 'right' }]}>Nợ cũ tồn</Text>
                    <Text style={[styles.thCell, { width: 145, textAlign: 'center' }]}>Thao tác</Text>
                  </View>

                  {/* Table Rows */}
                  {filteredGroups.map((group, index) => {
                    const isSubmitting = submittingGroupId === group.customerId;
                    const isEven = index % 2 === 0;

                    return (
                      <View
                        key={group.customerId}
                        style={[
                          styles.tableRow,
                          !isEven && styles.tableRowZebra,
                          group.status === 'UNPAID' && styles.tableRowUnpaid,
                        ]}
                      >
                        {/* STT */}
                        <Text style={[styles.tdCell, { width: 36, textAlign: 'center', color: '#64748B' }]}>
                          {index + 1}
                        </Text>

                        {/* Tên nhóm */}
                        <View style={[styles.tdCellWrap, { width: 150 }]}>
                          <Text style={styles.groupNameText} numberOfLines={1}>
                            {group.groupName}
                          </Text>
                          {group.phone ? (
                            <Text style={styles.groupPhoneText}>{group.phone}</Text>
                          ) : null}
                        </View>

                        {/* Tiền đơn hôm nay */}
                        <View style={[styles.tdCellWrap, { width: 105, alignItems: 'flex-end' }]}>
                          <Text style={[styles.orderAmountText, group.todayOrderAmount > 0 && { color: '#0F172A' }]}>
                            {group.todayOrderAmount > 0 ? formatCurrency(group.todayOrderAmount) : '-'}
                          </Text>
                          {group.todayItemsCount > 0 && (
                            <Text style={styles.itemCountText}>({group.todayItemsCount} món)</Text>
                          )}
                        </View>

                        {/* Tiền đã chuyển */}
                        <View style={[styles.tdCellWrap, { width: 105, alignItems: 'flex-end' }]}>
                          <Text style={[styles.paidAmountText, group.todayPaidAmount > 0 && { color: '#059669' }]}>
                            {group.todayPaidAmount > 0 ? formatCurrency(group.todayPaidAmount) : '-'}
                          </Text>
                        </View>

                        {/* Trạng thái */}
                        <View style={[styles.tdCellWrap, { width: 110, alignItems: 'center' }]}>
                          {group.status === 'PAID' ? (
                            <View style={styles.badgePaid}>
                              <Text style={styles.badgePaidText}>🟢 ĐÃ CHUYỂN</Text>
                            </View>
                          ) : group.status === 'PARTIAL' ? (
                            <View style={styles.badgePartial}>
                              <Text style={styles.badgePartialText}>
                                🟡 THIẾU {formatCurrency(group.remainingToday)}
                              </Text>
                            </View>
                          ) : group.status === 'UNPAID' ? (
                            <View style={styles.badgeUnpaid}>
                              <Text style={styles.badgeUnpaidText}>🔴 CHƯA CHUYỂN</Text>
                            </View>
                          ) : (
                            <Text style={styles.noOrderText}>Chưa có đơn</Text>
                          )}
                        </View>

                        {/* Nợ cũ tồn */}
                        <View style={[styles.tdCellWrap, { width: 95, alignItems: 'flex-end' }]}>
                          <Text style={[styles.prevDebtText, group.previousDebt > 0 && { color: '#D97706', fontWeight: 'bold' }]}>
                            {group.previousDebt > 0 ? formatCurrency(group.previousDebt) : '0đ'}
                          </Text>
                        </View>

                        {/* Thao tác */}
                        <View style={[styles.tdActionsWrap, { width: 145 }]}>
                          {/* Nút 1 chạm chốt tiền nếu chưa chuyển đủ */}
                          {(group.status === 'UNPAID' || group.status === 'PARTIAL') && (
                            <TouchableOpacity
                              style={styles.quickPayBtn}
                              onPress={() => handleQuickPay(group)}
                              disabled={isSubmitting}
                              activeOpacity={0.7}
                            >
                              {isSubmitting ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text style={styles.quickPayBtnText}>⚡ Chốt tiền</Text>
                              )}
                            </TouchableOpacity>
                          )}

                          {/* Nút copy link để ghim Zalo */}
                          <TouchableOpacity
                            style={styles.iconActionBtn}
                            onPress={() => handleCopyLink(group)}
                            activeOpacity={0.7}
                            title="Copy link để ghim vào Zalo"
                          >
                            <Text style={styles.iconActionBtnText}>🔗</Text>
                          </TouchableOpacity>

                          {/* Nút xem link portal */}
                          <TouchableOpacity
                            style={styles.iconActionBtn}
                            onPress={() => handleOpenPortalLink(group)}
                            activeOpacity={0.7}
                            title="Mở xem trang báo hàng"
                          >
                            <Text style={styles.iconActionBtnText}>👁️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </ScrollView>

          {/* Footer chân modal */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.fullCloseBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.fullCloseBtnText}>ĐÓNG LẠI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>

      {/* MODAL CON: TẠO NHANH NHÓM ZALO MỚI (ĐỘC LẬP NGOÀI SMOOTHMODAL CHA) */}
      <SmoothModal visible={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <View style={styles.subModalView}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>➕ THÊM NHÓM ZALO BÁO HÀNG</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowCreateModal(false)}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.createFormContent}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Tên nhóm Zalo *:</Text>
              <TextInput
                style={styles.formInput}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="Ví dụ: Phở Cống, Bún bò Bà Triệu..."
                placeholderTextColor="#94A3B8"
                autoFocus={true}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Số điện thoại đại diện (nếu có):</Text>
              <TextInput
                style={styles.formInput}
                value={newGroupPhone}
                onChangeText={setNewGroupPhone}
                placeholder="Ví dụ: 0912345678"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Mã PIN bảo mật cho link (4 số, tùy chọn):</Text>
              <TextInput
                style={styles.formInput}
                value={newGroupPin}
                onChangeText={setNewGroupPin}
                placeholder="Để trống nếu không cài mã PIN"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                maxLength={6}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitCreateBtn, createSubmitting && styles.btnDisabled]}
              onPress={handleCreateGroup}
              disabled={createSubmitting}
              activeOpacity={0.8}
            >
              {createSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitCreateBtnText}>LƯU & LẤY LINK GHIM ZALO</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>

      {/* POPUP XÁC NHẬN CHUNG Ở TẦNG CAO NHẤT */}
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
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  subModalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
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
    fontSize: 15,
    color: '#64748B',
    fontWeight: 'bold',
  },
  modalBody: {
    flexGrow: 0,
  },
  modalBodyContent: {
    paddingVertical: 12,
    gap: 12,
  },

  // Cards tóm tắt dòng tiền
  summaryContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  summaryCardOrder: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  summaryCardPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  summaryCardUnpaid: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  summaryCardLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 4,
  },
  summaryCardValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  summaryCardSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },

  warningDebtBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 8,
  },
  warningDebtIcon: {
    fontSize: 16,
  },
  warningDebtText: {
    fontSize: 11.5,
    color: '#92400E',
    flex: 1,
  },

  // Toolbar
  toolbarRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  datePickerWrap: {
    width: 130,
  },
  searchBarInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0F172A',
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  createGroupBtn: {
    height: 38,
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createGroupBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },

  // Tabs lọc
  filterTabsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterTabItem: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  filterTabItemActive: {
    backgroundColor: '#0F172A',
  },
  filterTabItemText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  filterTabItemTextActive: {
    color: '#FFFFFF',
  },

  // Bảng dữ liệu (Table View)
  tableScroll: {
    maxHeight: 400,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  thCell: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  tableRowZebra: {
    backgroundColor: '#F8FAFC',
  },
  tableRowUnpaid: {
    backgroundColor: '#FFF1F2',
  },
  tdCell: {
    fontSize: 11.5,
    color: '#0F172A',
  },
  tdCellWrap: {
    paddingHorizontal: 4,
  },
  groupNameText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  groupPhoneText: {
    fontSize: 10,
    color: '#64748B',
  },
  orderAmountText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  itemCountText: {
    fontSize: 9.5,
    color: '#64748B',
  },
  paidAmountText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  badgePaid: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePaidText: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#16A34A',
  },
  badgePartial: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePartialText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#D97706',
  },
  badgeUnpaid: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeUnpaidText: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  noOrderText: {
    fontSize: 10,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  prevDebtText: {
    fontSize: 11,
    color: '#64748B',
  },
  tdActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  quickPayBtn: {
    backgroundColor: '#059669',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickPayBtnText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  iconActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionBtnText: {
    fontSize: 12,
  },

  loadingWrap: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyEmoji: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 16,
  },

  modalFooter: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  fullCloseBtn: {
    height: 46,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullCloseBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
  },

  // Form tạo nhóm
  createFormContent: {
    paddingVertical: 14,
    gap: 12,
  },
  formGroup: {
    gap: 4,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  formInput: {
    height: 42,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  submitCreateBtn: {
    height: 46,
    backgroundColor: '#059669',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitCreateBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

export default ZaloDailyTrackingModal;

