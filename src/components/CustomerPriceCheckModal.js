// meat-management-fe/src/components/CustomerPriceCheckModal.js
import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { SHADOWS } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Định dạng tiền tệ VND
const formatCurrency = (val) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(val || 0)
    .replace('₫', 'đ');

/**
 * Modal Kiểm Tra Giá Thịt:
 * - Hiển thị danh sách bảng giá thịt đơn giản, trực quan, dễ nhìn.
 * - Không màu mè, phân cột rõ ràng: TÊN THỊT | ĐƠN GIÁ | PHẢN ÁNH.
 * - Cho phép tìm kiếm nhanh loại thịt.
 */
const CustomerPriceCheckModal = forwardRef(({ onOpenFeedback }, ref) => {
  const [visible, setVisible] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Cung cấp các hành động ra bên ngoài qua useImperativeHandle
  useImperativeHandle(ref, () => ({
    open: (opts = {}) => {
      setCustomerName(opts.customerName || '');
      setItems(opts.items || []);
      setSearchQuery('');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Lọc danh sách thịt theo từ khóa tìm kiếm
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter((it) => (it.name || '').toLowerCase().includes(q));
  }, [items, searchQuery]);

  // Xử lý khi bấm nút "Phản ánh" cho một mặt hàng cụ thể
  const handleFeedbackItem = (item) => {
    setVisible(false);
    if (onOpenFeedback) {
      const priceStr = formatCurrency(item.price);
      const defaultContent = `[Phản ánh giá] Mặt hàng: ${item.name} (${priceStr}/${item.unit || 'kg'}). Vấn đề cần phản ánh: `;
      onOpenFeedback({ defaultContent });
    }
  };

  // Xử lý khi bấm nút phản ánh chung
  const handleGeneralFeedback = () => {
    setVisible(false);
    if (onOpenFeedback) {
      onOpenFeedback({ defaultContent: '[Phản ánh giá] Nội dung phản ánh về giá thịt: ' });
    }
  };

  return (
    <SmoothModal
      visible={visible}
      onClose={() => setVisible(false)}
      centered={Platform.OS === 'web'}
    >
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.modalHeaderRow}>
          <View style={styles.headerTitleCol}>
            <View style={styles.headerIconTitleWrap}>
              <Text style={styles.headerIcon}>🥩</Text>
              <Text style={styles.modalTitle}>BẢNG GIÁ THỊT</Text>
            </View>
            {customerName ? (
              <Text style={styles.modalSubTitle}>Khách hàng: {customerName}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Ô tìm kiếm mặt hàng nhanh */}
        {items.length > 5 && (
          <View style={styles.searchBoxWrap}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm loại thịt..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Bảng giá thịt đơn giản, phẳng, dễ hiểu */}
        <View style={styles.tableWrapper}>
          {/* Header các cột */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thCell, styles.thName]}>TÊN THỊT</Text>
            <Text style={[styles.thCell, styles.thPrice]}>ĐƠN GIÁ</Text>
            <Text style={[styles.thCell, styles.thAction]}></Text>
          </View>

          {/* Danh sách các dòng mặt hàng */}
          <ScrollView
            style={styles.listScrollView}
            contentContainerStyle={styles.listContentContainer}
            showsVerticalScrollIndicator={true}
          >
            {filteredItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {searchQuery
                    ? `Không tìm thấy loại thịt nào khớp với "${searchQuery}"`
                    : 'Chưa có thông tin bảng giá cho khách hàng này.'}
                </Text>
              </View>
            ) : (
              filteredItems.map((item, index) => {
                const formattedPrice = formatCurrency(item.price);
                const isEven = index % 2 === 1;

                return (
                  <View
                    key={item.id || `${item.name}-${index}`}
                    style={[styles.tableRow, isEven && styles.tableRowAlt]}
                  >
                    <Text style={styles.tdName} numberOfLines={2}>
                      {item.name}
                    </Text>

                    <Text style={styles.tdPrice}>
                      {formattedPrice}
                      <Text style={styles.tdUnit}>/{item.unit || 'kg'}</Text>
                    </Text>

                    <TouchableOpacity
                      style={styles.tdActionBtn}
                      onPress={() => handleFeedbackItem(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.tdActionBtnText}>Phản ánh</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* Footer: Nút phản ánh khác và đóng */}
        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={styles.generalFeedbackBtn}
            onPress={handleGeneralFeedback}
            activeOpacity={0.7}
          >
            <Text style={styles.generalFeedbackBtnText}>💬 Phản ánh giá khác</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeFooterBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeFooterBtnText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default CustomerPriceCheckModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: Platform.OS === 'web' ? Math.min(480, SCREEN_WIDTH - 24) : '95%',
    maxHeight: Platform.OS === 'web' ? Math.min(580, SCREEN_HEIGHT - 60) : SCREEN_HEIGHT * 0.82,
    padding: 14,
    ...SHADOWS.large,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitleCol: {
    flex: 1,
  },
  headerIconTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIcon: {
    fontSize: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#065F46',
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },
  searchBoxWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    marginTop: 8,
    height: 34,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  tableWrapper: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thCell: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  thName: {
    flex: 1,
  },
  thPrice: {
    width: 115,
    textAlign: 'right',
    paddingRight: 8,
  },
  thAction: {
    width: 68,
    textAlign: 'center',
  },
  listScrollView: {
    maxHeight: 360,
  },
  listContentContainer: {},
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  tdName: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  tdPrice: {
    width: 115,
    textAlign: 'right',
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#0F172A',
    paddingRight: 8,
  },
  tdUnit: {
    fontSize: 11,
    fontWeight: 'normal',
    color: '#64748B',
  },
  tdActionBtn: {
    width: 68,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tdActionBtnText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 4,
    gap: 8,
  },
  generalFeedbackBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generalFeedbackBtnText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  closeFooterBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
});
