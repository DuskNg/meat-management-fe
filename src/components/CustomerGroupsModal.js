// meat-management-fe/src/components/CustomerGroupsModal.js
import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { useCustomerGroups } from '../hooks/useCustomerGroups';
import { showGlobalToast } from '../store/toastStore';
import { matchItemSearch } from '../utils/searchHelper';

// Danh sách gợi ý các quán quen thuộc của nhóm Trường Hoàng
const TRUONG_HOANG_DEFAULT_KEYWORDS = [
  'hàm nghi',
  'kim mã',
  '373 kim mã',
  'khánh toàn',
  'nguyễn khánh toàn',
  'trường hoàng',
  'an khánh',
  'cuốn an khánh',
  'giảng võ',
  'láng hạ',
  'cuốn láng hạ',
  'thái tông',
  'trần thái tông',
  'xã đàn',
  '236 xã đàn',
  'khương đình',
  '268 khương đình',
];

// Danh mục các lựa chọn chu kỳ chốt nợ
const BILLING_CYCLES = [
  { id: '15_to_end', name: 'Cứ 15 đến 31 xuất nợ (Nửa tháng & Cuối tháng)' },
  { id: 'end_of_month', name: 'Cuối tháng xuất nợ (1 lần/tháng)' },
  { id: 'daily', name: 'Gửi công nợ hàng ngày' },
  { id: 'custom', name: 'Không cố định / Theo đợt' },
];

const getCycleLabel = (cycleId) => {
  const found = BILLING_CYCLES.find((c) => c.id === cycleId);
  return found ? found.name : 'Không cố định';
};

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

const CustomerGroupsModal = forwardRef(
  ({ currentUserId, popupModalRef, onGroupBatchPayment, onGroupBatchExport }, ref) => {
    const [visible, setVisible] = useState(false);
    const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
    const [customers, setCustomers] = useState([]);
    const [loadingCustomers, setLoadingCustomers] = useState(false);

    // Form state khi thêm/sửa nhóm
    const [editingGroupId, setEditingGroupId] = useState(null);
    const [groupName, setGroupName] = useState('');
    const [billingCycle, setBillingCycle] = useState('15_to_end');
    const [groupNote, setGroupNote] = useState('');
    const [selectedCustomerIds, setSelectedCustomerIds] = useState(new Set());
    const [customerSearch, setCustomerSearch] = useState('');
    const [cycleSelectOpen, setCycleSelectOpen] = useState(false);

    const { groups, loading: loadingGroups, saveGroup, deleteGroup, refreshGroups } =
      useCustomerGroups(currentUserId);

    // Phơi bày phương thức open / close ra ngoài
    useImperativeHandle(ref, () => ({
      open: () => {
        setVisible(true);
        setMode('list');
        resetForm();
        fetchCustomers();
        refreshGroups();
      },
      close: () => {
        setVisible(false);
      },
    }));

    // Tải danh sách khách hàng hoạt động để tính công nợ và chọn nhóm
    const fetchCustomers = async () => {
      setLoadingCustomers(true);
      try {
        const res = await api.get('/customers?isBadDebt=false');
        const list = res.data?.data || (Array.isArray(res.data) ? res.data : []);
        setCustomers(list);
      } catch (err) {
        console.error('Lỗi khi tải danh sách khách hàng cho nhóm:', err);
      } finally {
        setLoadingCustomers(false);
      }
    };

    const resetForm = () => {
      setEditingGroupId(null);
      setGroupName('');
      setBillingCycle('15_to_end');
      setGroupNote('');
      setSelectedCustomerIds(new Set());
      setCustomerSearch('');
      setCycleSelectOpen(false);
    };

    // Mở form tạo nhóm mới
    const handleStartCreate = () => {
      resetForm();
      setMode('create');
    };

    // Mở form chỉnh sửa nhóm
    const handleStartEdit = (group) => {
      setEditingGroupId(group.id);
      setGroupName(group.name || '');
      setBillingCycle(group.billingCycle || 'custom');
      setGroupNote(group.note || '');
      setSelectedCustomerIds(new Set(group.customerIds || []));
      setCustomerSearch('');
      setMode('edit');
    };

    // Nút chọn nhanh "Tạo mẫu Nhóm Trường Hoàng (10 quán)"
    const handleQuickSelectTruongHoang = () => {
      setGroupName('Nhóm Trường Hoàng');
      setBillingCycle('15_to_end');
      setGroupNote('Quản lý chung chuỗi 10-11 nhà hàng, xuất nợ từ 15 đến 31 hàng tháng');

      const matchedIds = new Set();
      customers.forEach((cust) => {
        const nameLower = (cust.name || '').toLowerCase();
        const addressLower = (cust.address || '').toLowerCase();
        const isMatch = TRUONG_HOANG_DEFAULT_KEYWORDS.some(
          (kw) => nameLower.includes(kw) || addressLower.includes(kw)
        );
        if (isMatch) {
          matchedIds.add(cust.id);
        }
      });

      setSelectedCustomerIds(matchedIds);
      showGlobalToast(
        matchedIds.size > 0
          ? `Đã tự động chọn ${matchedIds.size} quán thuộc Nhóm Trường Hoàng!`
          : 'Không tìm thấy quán nào có tên khớp mẫu Trường Hoàng. Vui lòng tự tích chọn bên dưới.',
        matchedIds.size > 0 ? 'success' : 'info'
      );
    };

    // Lưu nhóm (tạo mới hoặc sửa)
    const handleSave = async () => {
      if (!groupName.trim()) {
        showGlobalToast('Vui lòng nhập tên nhóm nhà hàng.', 'warning');
        return;
      }
      if (selectedCustomerIds.size < 2) {
        showGlobalToast('Một nhóm phải có từ 2 nhà hàng trở lên. Vui lòng chọn ít nhất 2 nhà hàng.', 'warning');
        return;
      }

      try {
        await saveGroup(groupName.trim(), Array.from(selectedCustomerIds), {
          billingCycle,
          note: groupNote.trim(),
        });
        showGlobalToast(
          mode === 'edit'
            ? `Đã cập nhật nhóm [${groupName.trim()}] thành công!`
            : `Đã tạo nhóm [${groupName.trim()}] thành công!`,
          'success'
        );
        resetForm();
        setMode('list');
      } catch (err) {
        console.error('Lỗi khi lưu nhóm:', err);
        showGlobalToast('Có lỗi xảy ra khi lưu nhóm.', 'error');
      }
    };

    // Xóa nhóm (xác nhận bằng PopupModal)
    const handleDelete = (group) => {
      if (group.source === 'portal') {
        showGlobalToast('Nhóm liên kết từ Zalo Portal cần quản lý tại mục Zalo Portal.', 'info');
        return;
      }

      popupModalRef?.current?.show({
        type: 'confirm',
        title: 'Xóa nhóm nhà hàng',
        message: `Bạn có chắc muốn xóa nhóm "${group.name}"? Dữ liệu công nợ và các nhà hàng bên trong vẫn được giữ nguyên.`,
        onConfirm: async () => {
          try {
            await deleteGroup(group.id);
            showGlobalToast(`Đã xóa nhóm [${group.name}] thành công!`, 'success');
          } catch (e) {
            showGlobalToast('Không thể xóa nhóm.', 'error');
          }
        },
      });
    };

    // Toggle chọn khách hàng
    const toggleCustomer = (id) => {
      setSelectedCustomerIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    // Chọn tất cả / Bỏ chọn
    const handleSelectAll = () => {
      setSelectedCustomerIds(new Set(customers.map((c) => c.id)));
    };
    const handleDeselectAll = () => {
      setSelectedCustomerIds(new Set());
    };
    const handleSelectDebtOnly = () => {
      const debtIds = customers.filter((c) => (parseFloat(c.debt) || 0) > 0).map((c) => c.id);
      setSelectedCustomerIds(new Set(debtIds));
    };

    // Danh sách khách hàng sau khi tìm kiếm
    const filteredCustomers = useMemo(() => {
      let list = customers;
      if (customerSearch.trim()) {
        list = list.filter((c) => matchItemSearch(c, customerSearch, ['name', 'phone', 'address']));
      }
      return list;
    }, [customers, customerSearch]);

    // Map tính nợ nhanh của từng khách hàng
    const customerMap = useMemo(() => {
      const map = new Map();
      customers.forEach((c) => map.set(c.id, c));
      return map;
    }, [customers]);

    // Tính tổng nợ cho từng nhóm
    const enrichedGroups = useMemo(() => {
      return groups.map((g) => {
        const memberIds = g.customerIds || [];
        let totalDebt = 0;
        let activeCount = 0;
        const memberNames = [];

        memberIds.forEach((id) => {
          const cust = customerMap.get(id);
          if (cust) {
            const d = Math.max(0, parseFloat(cust.debt) || 0);
            totalDebt += d;
            activeCount++;
            memberNames.push(cust.name);
          }
        });

        return {
          ...g,
          memberCount: memberIds.length,
          activeCount,
          totalDebt,
          memberNamesPreview: memberNames.slice(0, 4).join(', ') + (memberNames.length > 4 ? ` (+${memberNames.length - 4} quán nữa)` : ''),
        };
      });
    }, [groups, customerMap]);

    // Nút Thu nợ gộp cho nhóm
    const handleTriggerBatchPayment = (group) => {
      setVisible(false);
      if (onGroupBatchPayment) {
        onGroupBatchPayment(group);
      }
    };

    // Nút Xuất công nợ cho nhóm
    const handleTriggerBatchExport = (group) => {
      setVisible(false);
      if (onGroupBatchExport) {
        onGroupBatchExport(group);
      }
    };

    return (
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.modalTitle}>
                {mode === 'list'
                  ? '🏢 QUẢN LÝ NHÓM NHÀ HÀNG & CHUỖI'
                  : mode === 'create'
                  ? '➕ TẠO NHÓM NHÀ HÀNG MỚI'
                  : '✏️ CHỈNH SỬA NHÓM NHÀ HÀNG'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {mode === 'list'
                  ? 'Gom cụm chi nhánh, theo dõi tổng nợ chuỗi & thu nợ gộp dứt điểm'
                  : 'Gom các nhà hàng lẻ thành một nhóm để xuất nợ & thu tiền một thể'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.modalCloseIconBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseIconText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          {mode === 'list' ? (
            <View style={styles.listContainer}>
              {/* Thanh công cụ danh sách */}
              <View style={styles.toolbarRow}>
                <Text style={styles.groupCountBadge}>
                  Đang có <Text style={{ fontWeight: 'bold' }}>{groups.length}</Text> nhóm
                </Text>
                <TouchableOpacity style={styles.createBtn} onPress={handleStartCreate}>
                  <Text style={styles.createBtnText}>➕ Thêm nhóm mới</Text>
                </TouchableOpacity>
              </View>

              {loadingGroups || loadingCustomers ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={styles.loadingText}>Đang tải danh sách nhóm nhà hàng...</Text>
                </View>
              ) : enrichedGroups.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyIcon}>🏢</Text>
                  <Text style={styles.emptyTitle}>Chưa có nhóm nhà hàng nào</Text>
                  <Text style={styles.emptyDesc}>
                    Hãy tạo nhóm (ví dụ: "Nhóm Trường Hoàng", "Nhóm Bếp") để gom 11 nhà hàng lại, giúp theo dõi tổng nợ và thu nợ một lần cực kỳ nhanh!
                  </Text>
                  <TouchableOpacity style={styles.emptyCreateBtn} onPress={handleStartCreate}>
                    <Text style={styles.emptyCreateBtnText}>⚡ Tạo ngay nhóm đầu tiên</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView style={styles.groupScroll} showsVerticalScrollIndicator={true}>
                  {enrichedGroups.map((group) => (
                    <View key={group.id} style={styles.groupCard}>
                      {/* Tiêu đề & Thông tin cơ bản */}
                      <View style={styles.groupCardHeader}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <View style={styles.groupTitleRow}>
                            <Text style={styles.groupCardName}>{group.name}</Text>
                            <View style={styles.cycleBadge}>
                              <Text style={styles.cycleBadgeText}>
                                📅 {getCycleLabel(group.billingCycle)}
                              </Text>
                            </View>
                            {group.source === 'portal' && (
                              <View style={styles.portalBadge}>
                                <Text style={styles.portalBadgeText}>Zalo Portal</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.groupCardMembers} numberOfLines={1}>
                            👥 {group.memberCount} quán: {group.memberNamesPreview || 'Chưa có quán'}
                          </Text>
                          {group.note ? (
                            <Text style={styles.groupCardNote} numberOfLines={1}>
                              📝 {group.note}
                            </Text>
                          ) : null}
                        </View>

                        {/* Tổng nợ của nhóm */}
                        <View style={styles.debtBox}>
                          <Text style={styles.debtBoxLabel}>TỔNG NỢ NHÓM</Text>
                          <Text
                            style={[
                              styles.debtBoxValue,
                              group.totalDebt > 0 ? styles.debtPositive : styles.debtZero,
                            ]}
                          >
                            {formatCurrency(group.totalDebt)}
                          </Text>
                        </View>
                      </View>

                      {/* Các nút hành động */}
                      <View style={styles.groupActionsRow}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.payBtn]}
                          onPress={() => handleTriggerBatchPayment(group)}
                        >
                          <Text style={styles.payBtnText}>🟢 Thu nợ gộp</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.exportBtn]}
                          onPress={() => handleTriggerBatchExport(group)}
                        >
                          <Text style={styles.exportBtnText}>📊 Xuất công nợ</Text>
                        </TouchableOpacity>

                        {group.source !== 'portal' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.editBtn]}
                              onPress={() => handleStartEdit(group)}
                            >
                              <Text style={styles.editBtnText}>✏️ Sửa</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.actionBtn, styles.deleteBtn]}
                              onPress={() => handleDelete(group)}
                            >
                              <Text style={styles.deleteBtnText}>🗑️</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            /* Form Tạo / Sửa nhóm */
            <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              {/* Tên nhóm */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  Tên nhóm nhà hàng <Text style={{ color: COLORS.danger }}>*</Text>
                </Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ví dụ: Nhóm Trường Hoàng, Nhóm 3 Bếp..."
                  value={groupName}
                  onChangeText={setGroupName}
                />
              </View>

              {/* Phím tắt tạo nhanh Trường Hoàng */}
              {mode === 'create' && (
                <TouchableOpacity
                  style={styles.quickTemplateBtn}
                  onPress={handleQuickSelectTruongHoang}
                >
                  <Text style={styles.quickTemplateBtnText}>
                    ⚡ Điền mẫu & Tự động chọn 10 quán "Nhóm Trường Hoàng"
                  </Text>
                </TouchableOpacity>
              )}

              {/* Chu kỳ chốt nợ */}
              <View
                style={[
                  styles.formGroup,
                  cycleSelectOpen && { zIndex: 999999, elevation: 999999 },
                ]}
              >
                <Text style={styles.formLabel}>Chu kỳ xuất công nợ / Thanh toán</Text>
                <CustomSelect
                  value={BILLING_CYCLES.find((c) => c.id === billingCycle)}
                  options={BILLING_CYCLES}
                  getOptionLabel={(item) => item?.name || ''}
                  renderSelected={(item) => item?.name || 'Chọn chu kỳ...'}
                  onSelect={(item) => setBillingCycle(item.id)}
                  onOpenChange={setCycleSelectOpen}
                  zIndex={999999}
                />
              </View>

              {/* Ghi chú */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Ghi chú nhóm (tùy chọn)</Text>
                <TextInput
                  style={[styles.textInput, { height: 40 }]}
                  placeholder="Ghi chú người đại diện, số tài khoản nhận tiền..."
                  value={groupNote}
                  onChangeText={setGroupNote}
                />
              </View>

              {/* Chọn các nhà hàng vào nhóm */}
              <View style={styles.formGroup}>
                <View style={styles.selectHeaderRow}>
                  <Text style={styles.formLabel}>
                    Chọn nhà hàng vào nhóm ({selectedCustomerIds.size} quán đã chọn)
                  </Text>
                  <View style={styles.quickSelectRow}>
                    <TouchableOpacity onPress={handleSelectAll} style={styles.quickSelectBtn}>
                      <Text style={styles.quickSelectBtnText}>Tất cả</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSelectDebtOnly} style={styles.quickSelectBtn}>
                      <Text style={styles.quickSelectBtnText}>Chỉ quán nợ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleDeselectAll} style={styles.quickSelectBtn}>
                      <Text style={styles.quickSelectBtnText}>Bỏ chọn</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Ô tìm kiếm nhà hàng */}
                <TextInput
                  style={styles.searchInput}
                  placeholder="🔍 Gõ tên hoặc địa chỉ quán để tìm nhanh..."
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                />

                {/* Danh sách nhà hàng dạng checkbox */}
                <View style={styles.customerListBox}>
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled={true}>
                    {filteredCustomers.length === 0 ? (
                      <Text style={styles.noCustText}>Không tìm thấy nhà hàng nào.</Text>
                    ) : (
                      filteredCustomers.map((cust) => {
                        const isChecked = selectedCustomerIds.has(cust.id);
                        const debt = parseFloat(cust.debt) || 0;
                        return (
                          <TouchableOpacity
                            key={cust.id}
                            style={[
                              styles.customerRowItem,
                              isChecked && styles.customerRowItemSelected,
                            ]}
                            onPress={() => toggleCustomer(cust.id)}
                          >
                            <View
                              style={[
                                styles.checkboxSquare,
                                isChecked && styles.checkboxSquareChecked,
                              ]}
                            >
                              {isChecked && <Text style={styles.checkIcon}>✓</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.custName}>{cust.name}</Text>
                              {cust.address ? (
                                <Text style={styles.custAddress} numberOfLines={1}>
                                  📍 {cust.address}
                                </Text>
                              ) : null}
                            </View>
                            {debt > 0 && (
                              <Text style={styles.custDebtText}>{formatCurrency(debt)}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              </View>

              {/* Nút hành động form */}
              <View style={styles.formFooterRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    resetForm();
                    setMode('list');
                  }}
                >
                  <Text style={styles.cancelBtnText}>Quay lại danh sách</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.submitBtn} onPress={handleSave}>
                  <Text style={styles.submitBtnText}>
                    {mode === 'create' ? '💾 Lưu Nhóm Mới' : '💾 Lưu Thay Đổi'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* Nút đóng chân Modal chuẩn Ảnh 2 */}
          {mode === 'list' && (
            <TouchableOpacity
              style={styles.closeFooterBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.closeFooterBtnText}>ĐÓNG LẠI</Text>
            </TouchableOpacity>
          )}
        </View>
      </SmoothModal>
    );
  }
);

export default CustomerGroupsModal;

const styles = StyleSheet.create({
  modalContainer: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'web' ? 16 : 24,
    alignSelf: 'center',
    marginHorizontal: 'auto',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 2,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseIconText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: 'bold',
    lineHeight: 18,
  },
  closeFooterBtn: {
    backgroundColor: '#F1F5F9',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  closeFooterBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#334155',
  },
  listContainer: {
    flexShrink: 1,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 2,
  },
  groupCountBadge: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  createBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginVertical: 10,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 480,
    marginBottom: 16,
  },
  emptyCreateBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    ...SHADOWS.small,
  },
  emptyCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  groupScroll: {
    maxHeight: 560,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    ...SHADOWS.small,
  },
  groupCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  groupCardName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  portalBadge: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  portalBadgeText: {
    fontSize: 10.5,
    color: '#0284C7',
    fontWeight: '700',
  },
  groupCardNote: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    fontStyle: 'italic',
  },
  groupCardMembers: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  debtBox: {
    alignItems: 'flex-end',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexShrink: 0,
  },
  debtBoxLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  debtBoxValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  debtPositive: {
    color: '#DC2626',
  },
  debtZero: {
    color: '#16A34A',
  },
  cycleBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cycleBadgeText: {
    fontSize: 10.5,
    color: '#B45309',
    fontWeight: '700',
  },
  groupActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtn: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  payBtnText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '700',
  },
  exportBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  exportBtnText: {
    color: '#0369A1',
    fontSize: 12,
    fontWeight: '700',
  },
  editBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editBtnText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 8,
  },
  deleteBtnText: {
    color: '#DC2626',
    fontSize: 12,
  },
  /* Form */
  formScroll: {
    padding: 14,
    maxHeight: 560,
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 5,
  },
  textInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    fontSize: 13.5,
    color: '#0F172A',
  },
  quickTemplateBtn: {
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#FDE047',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    marginBottom: 12,
  },
  quickTemplateBtnText: {
    color: '#854D0E',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  selectHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickSelectRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickSelectBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  quickSelectBtnText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  searchInput: {
    height: 36,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    fontSize: 12.5,
    marginBottom: 6,
    color: '#0F172A',
  },
  customerListBox: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  customerRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  customerRowItemSelected: {
    backgroundColor: '#F0FDF4',
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSquareChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  custName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  custAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  custDebtText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  noCustText: {
    padding: 16,
    textAlign: 'center',
    fontSize: 12,
    color: '#64748B',
  },
  formFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  submitBtnText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
