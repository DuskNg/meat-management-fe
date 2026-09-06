// meat-management-fe/src/components/DailyPriceManagementModal.js
import React, { useState, forwardRef, useImperativeHandle, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { matchItemSearch } from '../utils/searchHelper';
import DatePickerInput from './DatePickerInput';
import MoneyInput from './MoneyInput';
import AnimatedPressable from './AnimatedPressable';
import { showGlobalToast } from '../store/toastStore';

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

// Định dạng ngày sang DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Helper: Cộng / trừ ngày từ chuỗi DD/MM/YYYY
const addDaysToFormatted = (dateStr, days) => {
  if (!dateStr || !dateStr.includes('/')) return getTodayFormatted();
  const [d, m, y] = dateStr.split('/').map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + days);
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Helper: Lấy ngày đầu tháng hiện tại dạng DD/MM/YYYY
const getFirstDayOfMonth = () => {
  const today = new Date();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `01/${m}/${y}`;
};

// Helper: Định dạng ngày hiển thị từ chuỗi Date ISO
const formatDisplayDateOnly = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const DailyPriceManagementModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Bộ lọc theo ngày (mặc định hôm nay)
  const [fromDate, setFromDate] = useState(getTodayFormatted());
  const [toDate, setToDate] = useState(getTodayFormatted());
  const selectedDate = fromDate;
  const setSelectedDate = (val) => {
    setFromDate(val);
    setToDate(val);
  };

  // Dữ liệu từ backend
  const [data, setData] = useState({
    fromDate: '',
    toDate: '',
    totalUpdates: 0,
    totalCustomers: 0,
    increasedCount: 0,
    decreasedCount: 0,
    uniqueProductsCount: 0,
    uniqueProductsList: [],
    customers: [],
    allChanges: [],
  });

  const [search, setSearch] = useState('');
  const [selectedProductFilter, setSelectedProductFilter] = useState(''); // Lọc theo loại thịt

  // State cho modal con sửa nhanh giá
  const [editPriceModalVisible, setEditPriceModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newPrice, setNewPrice] = useState(0);
  const [savingPrice, setSavingPrice] = useState(false);

  // Phơi bày các hàm điều khiển ra bên ngoài qua ref
  useImperativeHandle(ref, () => ({
    open: (initFrom, initTo) => {
      const targetFrom = initFrom || getTodayFormatted();
      const targetTo = initTo || targetFrom;
      setFromDate(targetFrom);
      setToDate(targetTo);
      setVisible(true);
      setSearch('');
      setSelectedProductFilter('');
      fetchPriceChanges(targetFrom, targetTo);
    },
    close: () => {
      setVisible(false);
    },
    refresh: () => {
      fetchPriceChanges(fromDate, toDate);
    },
  }));

  // Gọi API tải danh sách biến động giá thịt qua các đơn nợ
  const fetchPriceChanges = async (fromStr, toStr) => {
    setLoading(true);
    try {
      const res = await api.get('/products/daily-price-updates', {
        params: {
          fromDate: fromStr || fromDate,
          toDate: toStr || toDate,
        },
      });

      if (res.data && res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách biến động giá thịt:', err);
      Alert.alert('Lỗi', 'Không thể tải danh sách thịt được cập nhật giá.');
    } finally {
      setLoading(false);
    }
  };

  // Xử lý chọn ngày mới và tải lại biến động giá
  const handleSelectDate = (dateVal) => {
    if (!dateVal) return;
    setFromDate(dateVal);
    setToDate(dateVal);
    fetchPriceChanges(dateVal, dateVal);
  };

  // Xử lý lùi / tiến ngày qua các nút mũi tên
  const handleChangeDateBy = (offsetDays) => {
    const nextDate = addDaysToFormatted(selectedDate, offsetDays);
    handleSelectDate(nextDate);
  };

  // Xử lý áp dụng khoảng ngày nhanh
  const handlePresetDate = (type) => {
    const today = getTodayFormatted();
    let newFrom = today;
    let newTo = today;

    if (type === 'TODAY') {
      newFrom = today;
      newTo = today;
    } else if (type === 'YESTERDAY') {
      newFrom = addDaysToFormatted(today, -1);
      newTo = newFrom;
    } else if (type === 'THREE_DAYS') {
      newFrom = addDaysToFormatted(today, -2);
      newTo = today;
    } else if (type === 'SEVEN_DAYS') {
      newFrom = addDaysToFormatted(today, -6);
      newTo = today;
    } else if (type === 'THIS_MONTH') {
      newFrom = getFirstDayOfMonth();
      newTo = today;
    }

    setFromDate(newFrom);
    setToDate(newTo);
    fetchPriceChanges(newFrom, newTo);
  };

  // Mở modal sửa giá nhanh
  const handleOpenEditPrice = (customer, changeItem) => {
    setEditingItem({
      customerId: customer.customerId,
      customerName: customer.customerName,
      productId: changeItem.productId,
      productName: changeItem.productName,
      unit: changeItem.unit,
      currentPrice: changeItem.newPrice,
    });
    setNewPrice(changeItem.newPrice || 0);
    setEditPriceModalVisible(true);
  };

  // Lưu đơn giá mới vào bảng giá riêng của khách
  const handleSavePrice = async () => {
    if (!editingItem || !newPrice || newPrice <= 0) {
      Alert.alert('Lỗi', 'Vui lòng nhập đơn giá hợp lệ lớn hơn 0.');
      return;
    }

    setSavingPrice(true);
    try {
      const res = await api.post('/products/customer-price', {
        customerId: editingItem.customerId,
        productId: editingItem.productId,
        price: newPrice,
      });

      if (res.data && res.data.success) {
        showGlobalToast(`Đã đổi giá ${editingItem.productName} cho ${editingItem.customerName}!`, 'success');
        setEditPriceModalVisible(false);
        fetchPriceChanges(fromDate, toDate);
        if (onRefresh) onRefresh();
      } else {
        Alert.alert('Thất bại', res.data?.message || 'Không thể lưu giá thịt mới.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', err.response?.data?.message || 'Lỗi kết nối khi lưu đơn giá.');
    } finally {
      setSavingPrice(false);
    }
  };

  // Danh sách các loại thịt có biến động giá để làm filter chip
  const productFilterChips = useMemo(() => {
    const map = new Map();
    (data.allChanges || []).forEach((c) => {
      const count = map.get(c.productName) || 0;
      map.set(c.productName, count + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [data.allChanges]);

  // Lọc danh sách khách hàng và các loại thịt đổi giá
  const filteredCustomers = useMemo(() => {
    if (!data.customers || data.customers.length === 0) return [];

    let list = data.customers;

    // Lọc theo từ khóa tìm kiếm (tên khách, SĐT, hoặc tên thịt)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list
        .map((c) => {
          const matchCustomer = matchItemSearch(c, q, ['customerName', 'customerPhone']);
          const matchedChanges = (c.changes || []).filter((ch) =>
            ch.productName.toLowerCase().includes(q)
          );

          if (matchCustomer) {
            return c;
          }
          if (matchedChanges.length > 0) {
            return {
              ...c,
              changes: matchedChanges,
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    // Lọc theo loại thịt được chọn trên chip
    if (selectedProductFilter) {
      list = list
        .map((c) => {
          const matchedChanges = (c.changes || []).filter(
            (ch) => ch.productName.toLowerCase() === selectedProductFilter.toLowerCase()
          );
          if (matchedChanges.length > 0) {
            return {
              ...c,
              changes: matchedChanges,
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    return list;
  }, [data.customers, search, selectedProductFilter]);

  // Render thẻ của từng khách hàng kèm các dòng thịt đổi giá (gọn gàng, tối ưu chiều cao)
  const renderCustomerItem = ({ item }) => {
    const firstLetter = (item.customerName || 'K').trim().charAt(0).toUpperCase();

    return (
      <View style={styles.customerCard}>
        {/* Header thông tin khách hàng */}
        <View style={styles.customerHeader}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{firstLetter}</Text>
          </View>

          <View style={styles.customerInfoCol}>
            <Text style={styles.customerNameText} numberOfLines={1}>
              {item.customerName}
            </Text>
            {item.customerPhone ? (
              <Text style={styles.customerPhoneText}>• 📞 {item.customerPhone}</Text>
            ) : null}
          </View>

          <View style={styles.changesCountBadge}>
            <Text style={styles.changesCountBadgeText}>
              {item.changes?.length || 0} loại thịt đổi giá
            </Text>
          </View>
        </View>

        {/* Danh sách các loại thịt có giá thay đổi so với đơn trước (dạng hàng ngang gọn) */}
        <View style={styles.changesListWrapper}>
          {(item.changes || []).map((ch, idx) => {
            const isIncrease = ch.diff > 0;
            const diffSign = isIncrease ? '+' : '';
            const diffAmountStr = `${diffSign}${formatCurrency(ch.diff)}`;
            const diffPercentStr = `${diffSign}${ch.diffPercent}%`;

            return (
              <View
                key={ch.id || idx}
                style={[
                  styles.changeRowItem,
                  idx === item.changes.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                {/* Cột trái: Tên thịt + đơn vị */}
                <View style={styles.changeLeftCol}>
                  <Text style={styles.productNameText} numberOfLines={1}>
                    {ch.productName}
                  </Text>
                  <View style={styles.unitBadge}>
                    <Text style={styles.unitBadgeText}>{ch.unit || 'kg'}</Text>
                  </View>
                </View>

                {/* Cột phải: Giá cũ ➔ Giá mới + Huy hiệu tăng/giảm + Nút đổi giá */}
                <View style={styles.changeRightCol}>
                  <View style={styles.priceFlowRow}>
                    <Text style={styles.oldPriceText}>
                      {formatCurrency(ch.oldPrice)}
                    </Text>
                    <Text style={styles.arrowIcon}>➔</Text>
                    <Text style={styles.newPriceText}>
                      {formatCurrency(ch.newPrice)}
                    </Text>
                  </View>

                  {/* Huy hiệu tăng / giảm giá */}
                  <View
                    style={[
                      styles.diffBadge,
                      isIncrease ? styles.diffBadgeUp : styles.diffBadgeDown,
                    ]}
                  >
                    <Text
                      style={[
                        styles.diffBadgeText,
                        isIncrease ? styles.diffTextUp : styles.diffTextDown,
                      ]}
                    >
                      {isIncrease ? '▲ +' : '▼ '}{diffAmountStr} ({diffPercentStr})
                    </Text>
                  </View>

                  {/* Nút sửa giá nhanh */}
                  <TouchableOpacity
                    style={styles.btnQuickEdit}
                    onPress={() => handleOpenEditPrice(item, ch)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.btnQuickEditText}>✏️ Đổi</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalCard}>
        {/* HEADER MODAL */}
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrapper}>
              <Text style={styles.headerIcon}>🏷️</Text>
            </View>
            <View style={styles.headerTitleCol}>
              <Text style={styles.headerTitle}>QUẢN LÝ CẬP NHẬT GIÁ THỊT</Text>
              <Text style={styles.headerSubtitle}>
                Theo dõi các loại thịt được cập nhật giá qua đơn nợ
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => fetchPriceChanges(selectedDate)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.iconBtnText}>{loading ? '⏳' : '🔄'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.iconBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* THANH CHỌN NGÀY SIÊU GỌN */}
        <View style={styles.topControlSection}>
          <View style={styles.dateSelectorRow}>
            <Text style={styles.dateLabelSmall}>📅 Chọn ngày:</Text>
            <View style={styles.dateNavigationRow}>
              <TouchableOpacity
                style={styles.dateNavBtn}
                onPress={() => handleChangeDateBy(-1)}
                activeOpacity={0.7}
              >
                <Text style={styles.dateNavBtnText}>◀</Text>
              </TouchableOpacity>

              <View style={styles.dateInputWrapper}>
                <DatePickerInput
                  compact={true}
                  allowFuture={true}
                  value={selectedDate}
                  onChange={(val) => handleSelectDate(val)}
                  style={styles.datePickerInputCustom}
                />
              </View>

              <TouchableOpacity
                style={styles.dateNavBtn}
                onPress={() => handleChangeDateBy(1)}
                activeOpacity={0.7}
              >
                <Text style={styles.dateNavBtnText}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* THANH TÌM KIẾM & LỌC NHANH THEO LOẠI THỊT */}
        <View style={styles.searchSection}>
          <View style={styles.searchBarWrapper}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Tìm tên khách hàng hoặc tên thịt..."
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearch('')}>
                <Text style={styles.clearSearchBtnText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Chips lọc theo loại thịt */}
          {productFilterChips.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  !selectedProductFilter && styles.filterChipActive,
                ]}
                onPress={() => setSelectedProductFilter('')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    !selectedProductFilter && styles.filterChipTextActive,
                  ]}
                >
                  Tất cả ({data.totalUpdates})
                </Text>
              </TouchableOpacity>

              {productFilterChips.map((chip) => {
                const isActive = selectedProductFilter.toLowerCase() === chip.name.toLowerCase();
                return (
                  <TouchableOpacity
                    key={chip.name}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() =>
                      setSelectedProductFilter(isActive ? '' : chip.name)
                    }
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                    >
                      {chip.name} ({chip.count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* DANH SÁCH KHÁCH HÀNG & CÁC LOẠI THỊT ĐỔI GIÁ */}
        {loading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Đang phân tích các đơn nợ để tìm biến động giá...</Text>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={filteredCustomers}
            renderItem={renderCustomerItem}
            keyExtractor={(item) => item.customerId}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrapper}>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={styles.emptyTitle}>
                  Không có thịt nào thay đổi giá trong ngày này!
                </Text>
                <Text style={styles.emptySubtitle}>
                  Tất cả các đơn nợ ngày {selectedDate} đều giữ nguyên đơn giá so với đơn trước đó.
                </Text>
              </View>
            }
          />
        )}

        {/* MODAL CON: SỬA NHANH GIÁ THỊT CỦA KHÁCH */}
        {editPriceModalVisible && editingItem && (
          <SmoothModal
            centered={true}
            visible={editPriceModalVisible}
            onClose={() => setEditPriceModalVisible(false)}
          >
            <View style={styles.editModalCard}>
              <View style={styles.editModalHeader}>
                <Text style={styles.editModalTitle}>✏️ Điều chỉnh giá thịt</Text>
                <TouchableOpacity onPress={() => setEditPriceModalVisible(false)}>
                  <Text style={styles.editModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.editModalBody}>
                <View style={styles.editMetaBox}>
                  <Text style={styles.editMetaCustomer}>
                    Khách hàng: <Text style={styles.editMetaHighlight}>{editingItem.customerName}</Text>
                  </Text>
                  <Text style={styles.editMetaProduct}>
                    Mặt hàng: <Text style={styles.editMetaHighlight}>{editingItem.productName}</Text>
                  </Text>
                </View>

                <Text style={styles.inputLabel}>Nhập đơn giá mới (VNĐ/{editingItem.unit}):</Text>
                <MoneyInput
                  value={newPrice}
                  onChangeValue={setNewPrice}
                  placeholder="Ví dụ: 140000"
                />

                {/* Nút lưu */}
                <View style={styles.editModalActions}>
                  <TouchableOpacity
                    style={styles.btnCancelEdit}
                    onPress={() => setEditPriceModalVisible(false)}
                    disabled={savingPrice}
                  >
                    <Text style={styles.btnCancelEditText}>Hủy</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnSaveEdit}
                    onPress={handleSavePrice}
                    disabled={savingPrice}
                  >
                    {savingPrice ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.btnSaveEditText}>💾 Cập nhật giá</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </SmoothModal>
        )}
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 750,
    height: '92%',
    maxHeight: '92%',
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    ...SHADOWS.large,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F0FDF4', // Xanh ngọc nhẹ
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#065F46',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#047857',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
  },
  topControlSection: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dateLabelSmall: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  dateNavigationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all 0.15s ease',
      },
    }),
  },
  dateNavBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  dateInputWrapper: {
    width: 125,
    justifyContent: 'center',
  },
  datePickerInputCustom: {
    height: 32,
    marginBottom: 0,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  searchBarWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    backgroundColor: '#F1F5F9',
    height: 38,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 36,
    fontSize: 12.5,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CBD5E1',
  },
  clearSearchBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  filterChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  filterChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#065F46',
    borderColor: '#047857',
  },
  filterChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 8,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    ...SHADOWS.card,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  avatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4338CA',
  },
  customerInfoCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerNameText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  customerPhoneText: {
    fontSize: 11,
    color: '#64748B',
  },
  changesCountBadge: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  changesCountBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#B45309',
  },
  changesListWrapper: {
    marginTop: 4,
  },
  changeRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderColor: '#F8FAFC',
    gap: 8,
  },
  changeLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  productNameText: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  unitBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  unitBadgeText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  changeRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  priceFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  oldPriceText: {
    fontSize: 10.5,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  arrowIcon: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: 'bold',
    marginHorizontal: 1,
  },
  newPriceText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  diffBadge: {
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    borderRadius: 5,
  },
  diffBadgeUp: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  diffBadgeDown: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  diffBadgeText: {
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  diffTextUp: {
    color: '#059669',
  },
  diffTextDown: {
    color: '#DC2626',
  },
  btnQuickEdit: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnQuickEditText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#334155',
  },
  loadingWrapper: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyWrapper: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14.5,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  // Style cho modal sửa nhanh giá
  editModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    width: '90%',
    maxWidth: 420,
    alignSelf: 'center',
    ...SHADOWS.large,
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  editModalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  editModalCloseText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748B',
  },
  editModalBody: {
    marginTop: 12,
  },
  editMetaBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 4,
  },
  editMetaCustomer: {
    fontSize: 12.5,
    color: '#475569',
  },
  editMetaProduct: {
    fontSize: 12.5,
    color: '#475569',
  },
  editMetaHighlight: {
    fontWeight: 'bold',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  editModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btnCancelEdit: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelEditText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
  btnSaveEdit: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSaveEditText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

export default DailyPriceManagementModal;
