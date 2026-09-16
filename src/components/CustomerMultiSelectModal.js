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
 * Cho phép chọn 1, nhiều hoặc tất cả khách hàng cùng lúc
 */
const CustomerMultiSelectModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [allCustomers, setAllCustomers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');
  const onConfirmCallbackRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: ({ customers = [], currentSelectedIds = [], onConfirm }) => {
      setAllCustomers(customers);
      setSelectedIds(new Set(currentSelectedIds));
      setSearchKeyword('');
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

  // Chọn tất cả khách hàng
  const handleSelectAll = () => {
    const allIds = allCustomers.map((c) => c.id);
    setSelectedIds(new Set(allIds));
  };

  // Bỏ chọn tất cả
  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Lọc theo từ khóa tìm kiếm (hỗ trợ không dấu)
  const filteredCustomers = useMemo(() => {
    if (!searchKeyword.trim()) return allCustomers;
    return allCustomers.filter((c) => {
      const matchName = matchSearch(c.name, searchKeyword);
      const matchPhone = c.phone ? matchSearch(c.phone, searchKeyword) : false;
      const matchAddress = c.address ? matchSearch(c.address, searchKeyword) : false;
      return matchName || matchPhone || matchAddress;
    });
  }, [allCustomers, searchKeyword]);

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
            placeholder="Tìm theo tên cửa hàng, số điện thoại, địa chỉ..."
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

        {/* Hàng nút thao tác nhanh: Tất cả / Bỏ chọn */}
        <View style={styles.quickActionRow}>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleSelectAll}>
            <Text style={styles.quickActionBtnText}>✓ Chọn tất cả ({allCustomers.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleDeselectAll}>
            <Text style={styles.quickActionBtnText}>✕ Bỏ chọn tất cả</Text>
          </TouchableOpacity>
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
                      <Text style={[styles.customerName, isChecked && styles.customerNameSelected]}>
                        {cust.name}
                      </Text>
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
    maxWidth: 600,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'web' ? 16 : 24,
    alignSelf: 'center',
    marginHorizontal: 'auto',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
    height: 42,
    marginBottom: 10,
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
  quickActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  quickActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  quickActionBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  selectedChipsWrap: {
    marginBottom: 8,
    maxHeight: 38,
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
    borderRadius: 14,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4,
    gap: 6,
  },
  selectedChipName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
    maxWidth: 160,
  },
  selectedChipRemoveBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedChipRemoveText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  listWrapper: {
    maxHeight: 340,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 10,
    overflow: 'hidden',
  },
  scrollView: {
    paddingHorizontal: 6,
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
    paddingVertical: 10,
    paddingHorizontal: 10,
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
    marginRight: 12,
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
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  customerNameSelected: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  customerMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  footerContainer: {
    marginTop: 14,
  },
  confirmButton: {
    height: 48,
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
