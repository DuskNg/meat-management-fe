// meat-management-fe/src/components/CustomerMultiSelectModal.js
import React, { useState, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { COLORS, SHADOWS } from '../theme';
import { matchSearch } from '../utils/searchHelper';

/**
 * Modal chọn nhiều khách hàng (Multi-select) chuẩn Bottom-sheet
 * Hỗ trợ chọn theo Nhóm/Chuỗi khách hàng (VD: Nhóm Trường Hoàng,...)
 */
const CustomerMultiSelectModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [allCustomers, setAllCustomers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedGroupFilterId, setSelectedGroupFilterId] = useState(null); // null = tất cả, hoặc groupId
  const onConfirmCallbackRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: ({ customers = [], groups = [], currentSelectedIds = [], onConfirm }) => {
      setAllCustomers(customers);
      setGroups(groups || []);
      setSelectedIds(new Set(currentSelectedIds));
      setSearchKeyword('');
      setSelectedGroupFilterId(null);
      onConfirmCallbackRef.current = onConfirm;
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const handleClose = () => {
    setVisible(false);
  };

  // Toggle chọn một khách hàng
  const handleToggleCustomer = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Bật/tắt chọn toàn bộ thành viên của một Nhóm
  const handleToggleGroup = (group) => {
    if (!group || !group.customerIds) return;
    const groupCustIds = group.customerIds.filter((cId) =>
      allCustomers.some((c) => c.id === cId)
    );
    if (groupCustIds.length === 0) return;

    const isAllSelected = groupCustIds.every((cId) => selectedIds.has(cId));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        // Nếu đã chọn đủ cả nhóm -> Bỏ chọn tất cả thành viên trong nhóm
        groupCustIds.forEach((cId) => next.delete(cId));
      } else {
        // Chưa chọn đủ -> Tích chọn toàn bộ thành viên nhóm
        groupCustIds.forEach((cId) => next.add(cId));
      }
      return next;
    });
  };

  // Chọn tất cả khách hàng đang hiển thị
  const handleSelectAll = () => {
    const allIds = allCustomers.map((c) => c.id);
    setSelectedIds(new Set(allIds));
  };

  // Bỏ chọn tất cả
  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Bản đồ tra cứu nhóm của từng khách hàng: { [customerId]: groupName[] }
  const customerGroupsMap = useMemo(() => {
    const map = {};
    groups.forEach((g) => {
      (g.customerIds || []).forEach((cId) => {
        if (!map[cId]) map[cId] = [];
        map[cId].push(g.name);
      });
    });
    return map;
  }, [groups]);

  // Thông tin trạng thái chọn của từng nhóm
  const groupStats = useMemo(() => {
    return groups.map((g) => {
      const validIds = (g.customerIds || []).filter((cId) =>
        allCustomers.some((c) => c.id === cId)
      );
      const selectedCount = validIds.filter((cId) => selectedIds.has(cId)).length;
      const total = validIds.length;
      const isAllSelected = total > 0 && selectedCount === total;
      const isPartialSelected = selectedCount > 0 && selectedCount < total;

      return {
        ...g,
        validIds,
        selectedCount,
        total,
        isAllSelected,
        isPartialSelected,
      };
    });
  }, [groups, allCustomers, selectedIds]);

  // Lọc danh sách khách hàng theo từ khóa và theo bộ lọc nhóm đang chọn
  const filteredCustomers = useMemo(() => {
    return allCustomers.filter((c) => {
      // 1. Lọc theo tab nhóm nếu có chọn
      if (selectedGroupFilterId) {
        const targetGroup = groups.find((g) => g.id === selectedGroupFilterId);
        if (targetGroup && !(targetGroup.customerIds || []).includes(c.id)) {
          return false;
        }
      }

      // 2. Lọc theo từ khóa tìm kiếm (hỗ trợ không dấu)
      if (searchKeyword.trim()) {
        const matchName = matchSearch(c.name, searchKeyword);
        const matchPhone = c.phone ? matchSearch(c.phone, searchKeyword) : false;
        const matchAddress = c.address ? matchSearch(c.address, searchKeyword) : false;
        const groupNames = customerGroupsMap[c.id] || [];
        const matchGroup = groupNames.some((gName) => matchSearch(gName, searchKeyword));
        return matchName || matchPhone || matchAddress || matchGroup;
      }

      return true;
    });
  }, [allCustomers, groups, selectedGroupFilterId, searchKeyword, customerGroupsMap]);

  // Xác nhận lựa chọn
  const handleConfirm = () => {
    const selectedCustomers = allCustomers.filter((c) => selectedIds.has(c.id));
    if (onConfirmCallbackRef.current) {
      onConfirmCallbackRef.current(selectedCustomers);
    }
    setVisible(false);
  };

  return (
    <SmoothModal visible={visible} onClose={handleClose}>
      <View style={styles.modalContainer}>
        {/* Header chuẩn Bottom-Sheet */}
        <View style={styles.modalHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>🏪 CHỌN KHÁCH HÀNG CẦN SỬA GIÁ</Text>
            <Text style={styles.modalSubtitle}>
              Đã chọn <Text style={{ fontWeight: '700', color: COLORS.primary }}>{selectedIds.size}</Text> / {allCustomers.length} khách hàng
            </Text>
          </View>
          <TouchableOpacity style={styles.modalCloseIconBtn} onPress={handleClose}>
            <Text style={styles.modalCloseIconText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Ô tìm kiếm khách hàng */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên cửa hàng, số điện thoại, nhóm chuỗi..."
            placeholderTextColor="#94A3B8"
            value={searchKeyword}
            onChangeText={setSearchKeyword}
            clearButtonMode="while-editing"
          />
          {Boolean(searchKeyword) && (
            <TouchableOpacity onPress={() => setSearchKeyword('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* KHỐI CHỌN NHANH THEO NHÓM / CHUỖI KHÁCH HÀNG */}
        {groupStats.length > 0 && (
          <View style={styles.groupSectionWrap}>
            <View style={styles.groupSectionHeader}>
              <Text style={styles.groupSectionTitle}>👥 CHỌN NHANH THEO NHÓM / CHUỖI:</Text>
              {selectedGroupFilterId && (
                <TouchableOpacity
                  onPress={() => setSelectedGroupFilterId(null)}
                  style={styles.clearGroupFilterBtn}
                >
                  <Text style={styles.clearGroupFilterText}>Xem tất cả khách</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              horizontal={true}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.groupScrollContent}
            >
              {groupStats.map((group) => {
                const { id, name, isAllSelected, isPartialSelected, selectedCount, total } = group;
                const isFilterActive = selectedGroupFilterId === id;

                return (
                  <View key={id} style={styles.groupChipWrapper}>
                    <TouchableOpacity
                      style={[
                        styles.groupChipBtn,
                        isAllSelected && styles.groupChipBtnAllSelected,
                        isPartialSelected && styles.groupChipBtnPartial,
                        isFilterActive && styles.groupChipBtnFilterActive,
                      ]}
                      onPress={() => handleToggleGroup(group)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.groupChipText,
                          isAllSelected && styles.groupChipTextAllSelected,
                          isPartialSelected && styles.groupChipTextPartial,
                        ]}
                      >
                        {isAllSelected ? '✓ ' : '👥 '}
                        {name} ({selectedCount}/{total})
                      </Text>
                    </TouchableOpacity>

                    {/* Nút lọc riêng nhóm này */}
                    <TouchableOpacity
                      style={[
                        styles.groupFilterMiniBtn,
                        isFilterActive && styles.groupFilterMiniBtnActive,
                      ]}
                      onPress={() =>
                        setSelectedGroupFilterId(isFilterActive ? null : id)
                      }
                      title={`Lọc xem ${name}`}
                    >
                      <Text
                        style={[
                          styles.groupFilterMiniText,
                          isFilterActive && styles.groupFilterMiniTextActive,
                        ]}
                      >
                        {isFilterActive ? 'Đang lọc' : 'Lọc'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Hàng nút thao tác nhanh: Tất cả / Bỏ chọn */}
        <View style={styles.quickActionRow}>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleSelectAll}>
            <Text style={styles.quickActionBtnText}>✓ Chọn tất cả ({allCustomers.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleDeselectAll}>
            <Text style={styles.quickActionBtnText}>✕ Bỏ chọn tất cả</Text>
          </TouchableOpacity>
          {selectedGroupFilterId && (
            <View style={styles.filterNoticeBadge}>
              <Text style={styles.filterNoticeText}>
                Đang lọc: {groups.find((g) => g.id === selectedGroupFilterId)?.name}
              </Text>
            </View>
          )}
        </View>

        {/* Danh sách chip các khách hàng đã được chọn (kèm dấu ✕ để xóa nhanh) */}
        {selectedIds.size > 0 && (
          <View style={styles.selectedChipsWrap}>
            <ScrollView
              horizontal={true}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectedChipsContent}
            >
              {allCustomers
                .filter((c) => selectedIds.has(c.id))
                .map((c) => (
                  <View key={c.id} style={styles.selectedChipItem}>
                    <Text style={styles.selectedChipName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <TouchableOpacity
                      style={styles.selectedChipRemoveBtn}
                      onPress={() => handleToggleCustomer(c.id)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.selectedChipRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
            </ScrollView>
          </View>
        )}

        {/* Danh sách khách hàng cuộn */}
        <View style={styles.listWrapper}>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
            {filteredCustomers.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Không tìm thấy khách hàng nào phù hợp.</Text>
              </View>
            ) : (
              filteredCustomers.map((cust) => {
                const isChecked = selectedIds.has(cust.id);
                const custGroups = customerGroupsMap[cust.id] || [];

                return (
                  <TouchableOpacity
                    key={cust.id}
                    style={[styles.customerItemRow, isChecked && styles.customerItemRowSelected]}
                    onPress={() => handleToggleCustomer(cust.id)}
                    activeOpacity={0.7}
                  >
                    {/* Checkbox vuông */}
                    <View style={[styles.checkboxSquare, isChecked && styles.checkboxSquareChecked]}>
                      {isChecked && <Text style={styles.checkMark}>✓</Text>}
                    </View>

                    {/* Thông tin khách hàng */}
                    <View style={styles.customerInfoCol}>
                      <View style={styles.customerNameRow}>
                        <Text style={[styles.customerName, isChecked && styles.customerNameSelected]}>
                          {cust.name}
                        </Text>
                        {/* Nhãn nhóm nếu thuộc nhóm chuỗi */}
                        {custGroups.map((gName, idx) => (
                          <View key={idx} style={styles.custGroupTag}>
                            <Text style={styles.custGroupTagText}>🏷️ {gName}</Text>
                          </View>
                        ))}
                      </View>

                      {Boolean(cust.phone || cust.address) && (
                        <Text style={styles.customerMeta} numberOfLines={1}>
                          {[cust.phone, cust.address].filter(Boolean).join(' • ')}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* Footer cố định nút xác nhận */}
        <View style={styles.footerContainer}>
          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm} activeOpacity={0.8}>
            <Text style={styles.confirmButtonText}>
              XÁC NHẬN (ĐÃ CHỌN {selectedIds.size} KHÁCH HÀNG)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default CustomerMultiSelectModal;

const styles = StyleSheet.create({
  modalContainer: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '94%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'web' ? 16 : 24,
    alignSelf: 'center',
    marginHorizontal: 'auto',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    fontSize: 12.5,
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
    fontSize: 15,
    color: '#64748B',
    fontWeight: 'bold',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 8,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      outlineStyle: 'none',
      outlineWidth: 0,
      boxShadow: 'none',
    } : {}),
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  groupSectionWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  groupSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  groupSectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0.3,
  },
  clearGroupFilterBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
  },
  clearGroupFilterText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  groupScrollContent: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  groupChipWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    overflow: 'hidden',
  },
  groupChipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  groupChipBtnAllSelected: {
    backgroundColor: '#2563EB',
  },
  groupChipBtnPartial: {
    backgroundColor: '#EFF6FF',
  },
  groupChipBtnFilterActive: {
    borderRightWidth: 1,
    borderRightColor: '#93C5FD',
  },
  groupChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  groupChipTextAllSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  groupChipTextPartial: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  groupFilterMiniBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderLeftWidth: 1,
    borderLeftColor: '#CBD5E1',
  },
  groupFilterMiniBtnActive: {
    backgroundColor: '#DBEAFE',
    borderLeftColor: '#93C5FD',
  },
  groupFilterMiniText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  groupFilterMiniTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  quickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  quickActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  quickActionBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  filterNoticeBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  filterNoticeText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  selectedChipsWrap: {
    marginBottom: 8,
    maxHeight: 36,
  },
  selectedChipsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  selectedChipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingLeft: 8,
    paddingRight: 5,
    paddingVertical: 3,
    gap: 5,
  },
  selectedChipName: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1D4ED8',
    maxWidth: 150,
  },
  selectedChipRemoveBtn: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedChipRemoveText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  listWrapper: {
    maxHeight: 320,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 10,
    overflow: 'hidden',
  },
  scrollView: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  emptyWrap: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  customerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  customerItemRowSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  checkboxSquare: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },
  checkboxSquareChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  customerInfoCol: {
    flex: 1,
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  customerName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  customerNameSelected: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  custGroupTag: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#DDD6FE',
  },
  custGroupTagText: {
    fontSize: 10.5,
    color: '#7C3AED',
    fontWeight: '600',
  },
  customerMeta: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  footerContainer: {
    marginTop: 12,
  },
  confirmButton: {
    height: 46,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
