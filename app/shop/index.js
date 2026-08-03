// meat-management-fe/app/shop/index.js
import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  TextInput,
  ScrollView,
  FlatList,
  RefreshControl,
  Platform,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import AddShopTableModal from '../../src/components/shop/AddShopTableModal';
import ShopSessionModal from '../../src/components/shop/ShopSessionModal';
import PopupModal from '../../src/components/PopupModal';
import SmoothModal from '../../src/components/SmoothModal';
import ProfileModal from '../../src/components/ProfileModal';
import { useAuthStore } from '../../src/store/authStore';

export default function ShopDashboardScreen() {
  const router = useRouter();
  const auth = useAuthStore();
  const { width: windowWidth } = useWindowDimensions();

  // Tính toán kích thước ô vuông cho grid bàn chơi
  const containerWidth = Math.min(windowWidth, 600);
  const cardSize = Math.floor((containerWidth - 32 - 18) / 4);

  const [searchQuery, setSearchQuery] = useState('');
  const [showDailyRevModal, setShowDailyRevModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  
  // Ticker state để ép màn hình re-render cập nhật thời gian động
  const [tick, setTick] = useState(0);

  // Refs các modal
  const addShopTableModalRef = useRef(null);
  const shopSessionModalRef = useRef(null);
  const popupModalRef = useRef(null);
  const profileModalRef = useRef(null);

  // 1. Tải danh sách bàn chơi từ API
  const {
    data: tablesResponse,
    isLoading: isLoadingTables,
    refetch: refetchTables,
    isRefetching: isRefetchingTables,
  } = useQuery({
    queryKey: ['shop_tables'],
    queryFn: async () => {
      const response = await api.get('/shop/tables');
      return response.data;
    },
    enabled: auth.hasPermission('canManageShop'),
  });

  // 2. Tải tổng doanh thu
  const { data: totalRevResponse, refetch: refetchTotalRev } = useQuery({
    queryKey: ['shop_total_revenue'],
    queryFn: async () => {
      const response = await api.get('/shop/revenue/total');
      return response.data;
    },
    enabled: auth.hasPermission('canManageShop'),
  });

  // 3. Tải doanh thu theo ngày
  const { data: dailyRevResponse, refetch: refetchDailyRev } = useQuery({
    queryKey: ['shop_daily_revenue'],
    queryFn: async () => {
      const response = await api.get('/shop/revenue/daily');
      return response.data;
    },
    enabled: showDailyRevModal && auth.hasPermission('canManageShop'),
  });

  const tables = tablesResponse?.data || [];
  const totalRevenue = totalRevResponse?.data?.totalRevenue || 0;
  const dailyRevenues = dailyRevResponse?.data || [];

  // Tự động kích hoạt đếm giờ re-render mỗi 10 giây
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Lọc danh sách bàn theo ô tìm kiếm
  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    const q = searchQuery.toLowerCase().trim();
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, searchQuery]);

  const handleRefresh = () => {
    refetchTables();
    refetchTotalRev();
    if (showDailyRevModal) refetchDailyRev();
  };

  // Định dạng tiền tệ giống bên chi tiết (vi-VN, thêm chữ đ ở cuối)
  const formatCurrency = (val) => {
    if (!val && val !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(val) + 'đ';
  };

  const formatShortAmount = (val) => {
    const num = parseFloat(val) || 0;
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1).replace('.0', '')}Tr`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}k`;
    }
    return `${num}`;
  };

  const convertIsoToDisplay = (isoStr) => {
    if (!isoStr) return '';
    const parts = isoStr.split('T')[0].split('-');
    if (parts.length !== 3) return isoStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Tính thời gian chơi & tiền chơi trực tiếp (real-time ticker) cho giao diện lưới
  const getLiveSessionDetails = (tableItem) => {
    const activeSession = tableItem.sessions?.[0];
    if (!activeSession) return null;

    const start = new Date(activeSession.startTime);
    const end = activeSession.endTime ? new Date(activeSession.endTime) : new Date();
    const diffMs = Math.max(0, end - start);

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = diffMs / (1000 * 60 * 60);
    const playAmount = Math.round(hours * tableItem.pricePerHour);
    const totalPlayAmount = playAmount + activeSession.extraAmount;

    const hr = Math.floor(totalMinutes / 60);
    const mn = totalMinutes % 60;
    const timeStr = hr > 0 ? `${hr}h${mn}m` : `${mn}m`;

    return {
      timeStr,
      liveAmount: totalPlayAmount,
      isEnded: !!activeSession.endTime,
    };
  };

  // Xử lý khi nhấn vào bàn chơi
  const handleTablePress = (item) => {
    const activeSession = item.sessions?.[0];
    if (activeSession) {
      // Mở modal chi tiết phiên chơi
      shopSessionModalRef.current?.open(item, activeSession);
    } else {
      // Mở hộp thoại xác nhận bắt đầu phiên chơi mới
      popupModalRef.current?.show({
        title: `🏪 Bắt đầu phiên chơi?`,
        message: `Bạn muốn mở bàn chơi mới cho "${item.name}"? Giờ bắt đầu sẽ được ghi nhận ngay lập tức.`,
        type: 'confirm',
        confirmText: 'BẮT ĐẦU CHƠI',
        cancelText: 'HỦY',
        onConfirm: async () => {
          try {
            const response = await api.post('/shop/sessions/start', { tableId: item.id });
            if (response.data.success) {
              handleRefresh();
            }
          } catch (err) {
            Alert.alert('Thất bại', err.response?.data?.message || 'Không thể bắt đầu phiên chơi.');
          }
        },
      });
    }
  };

  // Đổi tên hoặc sửa giá bàn
  const handleEditTable = (item) => {
    addShopTableModalRef.current?.open(item);
  };

  // Xóa bàn chơi
  const handleDeleteTable = (item) => {
    popupModalRef.current?.show({
      title: '🗑️ XÁC NHẬN XÓA BÀN',
      message: `Bạn có chắc chắn muốn xóa bàn chơi "${item.name}" không?`,
      type: 'confirm',
      confirmText: 'XÓA NGAY',
      cancelText: 'HỦY',
      onConfirm: async () => {
        try {
          const response = await api.delete(`/shop/tables/${item.id}`);
          if (response.data.success) {
            handleRefresh();
          }
        } catch (err) {
          Alert.alert('Lỗi', err.response?.data?.message || 'Không thể xóa bàn chơi.');
        }
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.contentWrapper}>
        {/* Header điều hướng */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/')}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>← Quay lại</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.profileCard}
            onPress={() => profileModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(auth.user?.name || 'Shop').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileDetails}>
              <Text style={styles.profileGreeting}>Chủ cửa hàng 👋</Text>
              <Text style={styles.profileName}>{auth.user?.name || 'Chủ quán'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Tổng doanh thu */}
        <View style={styles.summaryCard}>
          <TouchableOpacity
            style={styles.summaryMain}
            onPress={() => setShowDailyRevModal(true)}
            activeOpacity={0.85}
          >
            <View>
              <Text style={styles.summaryLabel}>💰 DOANH THU CỬA HÀNG (GIỜ CHƠI):</Text>
              <Text style={styles.summaryHint}>Bấm để xem thống kê theo ngày</Text>
            </View>
            <Text style={styles.summaryValue}>{formatCurrency(totalRevenue)}</Text>
          </TouchableOpacity>
        </View>

        {/* Thống kê doanh thu theo ngày */}
        <TouchableOpacity
          style={styles.dailyReportBtn}
          onPress={() => setShowDailyRevModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.dailyReportBtnText}>📈 XEM DOANH THU THEO NGÀY</Text>
        </TouchableOpacity>

        {/* Thanh công cụ quản lý */}
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.addTableBtn}
            onPress={() => addShopTableModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <Text style={styles.addTableBtnText}>🏪 Thêm bàn chơi mới</Text>
          </TouchableOpacity>
        </View>

        {/* Ô Tìm Kiếm */}
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm bàn hoặc phòng..."
              placeholderTextColor={COLORS.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Danh sách bàn */}
        <View style={styles.listSectionHeader}>
          <Text style={styles.listTitle}>📋 DANH SÁCH BÀN CHƠI ({tables.length})</Text>
          <Text style={styles.legendText}>🟢 Xanh: còn trống  |  🔴 Đỏ: đang chơi  |  🟡 Vàng: chờ thanh toán</Text>
        </View>

        <FlatList
          style={{ flex: 1 }}
          data={filteredTables}
          keyExtractor={(item) => item.id}
          numColumns={4}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingTables}
              onRefresh={handleRefresh}
              colors={['#0F766E']}
            />
          }
          ListEmptyComponent={
            isLoadingTables ? (
              <ActivityIndicator size="large" color="#0F766E" style={{ marginTop: 40 }} />
            ) : (
              <Text style={styles.emptyText}>Chưa có bàn chơi nào được tạo.</Text>
            )
          }
          renderItem={({ item }) => {
            const liveDetails = getLiveSessionDetails(item);
            const isOccupied = !!liveDetails;
            const isWaitingPayment = liveDetails?.isEnded;

            let cardStyle = styles.tableEmpty;
            let textNameStyle = styles.tableNameEmpty;
            let statusDotColor = '#10B981';

            if (isWaitingPayment) {
              cardStyle = styles.tableWaitingPayment;
              textNameStyle = styles.tableNameWaiting;
              statusDotColor = '#F59E0B';
            } else if (isOccupied) {
              cardStyle = styles.tableOccupied;
              textNameStyle = styles.tableNameOccupied;
              statusDotColor = '#EF4444';
            }

            return (
              <TouchableOpacity
                style={[
                  styles.tableSquareCard,
                  { width: cardSize, height: cardSize },
                  cardStyle,
                ]}
                onPress={() => handleTablePress(item)}
                onLongPress={() => {
                  popupModalRef.current?.show({
                    title: `Thao tác với ${item.name}`,
                    message: `Bạn muốn thực hiện thao tác nào với ${item.name}?`,
                    type: 'confirm',
                    confirmText: 'Chỉnh sửa',
                    cancelText: 'Xóa bàn',
                    onConfirm: () => handleEditTable(item),
                    onCancel: () => handleDeleteTable(item),
                  });
                }}
                delayLongPress={500}
                activeOpacity={0.7}
              >
                {/* Dấu chấm trạng thái */}
                <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />

                {liveDetails ? (
                  <>
                    <Text style={[styles.tableName, textNameStyle]} numberOfLines={1}>
                      {item.name} ({formatShortAmount(item.pricePerHour)}/h)
                    </Text>
                    <View style={styles.liveMeta}>
                      <Text style={styles.liveTime}>{liveDetails.timeStr}</Text>
                      <Text style={styles.liveBillDetail}>{formatCurrency(liveDetails.liveAmount)}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.tableName, textNameStyle]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.tablePrice} numberOfLines={1}>
                      {formatShortAmount(item.pricePerHour)}/h
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Modal báo cáo doanh thu ngày */}
      <SmoothModal visible={showDailyRevModal} onClose={() => setShowDailyRevModal(false)}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>📈 DOANH THU THEO NGÀY</Text>
          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {dailyRevenues.map((item) => (
              <View key={item.dateKey} style={styles.revenueItemRow}>
                <Text style={styles.revenueItemDate}>{convertIsoToDisplay(item.dateKey)}</Text>
                <Text style={styles.revenueItemAmount}>{formatCurrency(item.amount)}</Text>
              </View>
            ))}
            {dailyRevenues.length === 0 && (
              <Text style={styles.emptyText}>Chưa có doanh thu phát sinh.</Text>
            )}
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setShowDailyRevModal(false)}>
            <Text style={styles.closeBtnText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>

      {/* Đăng ký các modal */}
      <AddShopTableModal ref={addShopTableModalRef} onRefresh={handleRefresh} />
      <ShopSessionModal ref={shopSessionModalRef} onRefresh={handleRefresh} />
      <PopupModal ref={popupModalRef} />
      <ProfileModal ref={profileModalRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: '#F8FAFC',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.card,
  },
  backBtn: {
    width: 90,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#CCFBF1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#99F6E4',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  profileDetails: {
    alignItems: 'flex-start',
  },
  profileGreeting: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  profileName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    maxWidth: 150,
  },
  summaryCard: {
    backgroundColor: '#F0FDFA', // Xanh teal nhạt
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#99F6E4',
    ...SHADOWS.card,
  },
  summaryMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  summaryHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0D9488',
    textAlign: 'right',
    flexShrink: 0,
  },
  dailyReportBtn: {
    height: 40,
    backgroundColor: '#CCFBF1',
    borderWidth: 1,
    borderColor: '#99F6E4',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  dailyReportBtnText: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  toolsRow: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  addTableBtn: {
    backgroundColor: '#0F766E',
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0D9488',
    ...SHADOWS.card,
  },
  addTableBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchSection: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
    }),
  },
  listSectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  gridContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  gridRow: {
    gap: 6,
    marginBottom: 6,
  },
  tableSquareCard: {
    borderRadius: 12,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    position: 'relative',
    ...SHADOWS.card,
  },
  tableEmpty: {
    backgroundColor: '#F0FDF4', // Màu xanh lục nhạt
    borderColor: '#BBF7D0',
  },
  tableOccupied: {
    backgroundColor: '#FEF2F2', // Màu đỏ hồng nhạt
    borderColor: '#FCA5A5',
  },
  tableWaitingPayment: {
    backgroundColor: '#FEF3C7', // Màu vàng nhạt
    borderColor: '#FDE68A',
  },
  statusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tableName: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tableNameEmpty: {
    color: '#059669',
  },
  tableNameOccupied: {
    color: '#DC2626',
  },
  tableNameWaiting: {
    color: '#D97706',
  },
  tablePrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  liveMeta: {
    alignItems: 'center',
  },
  liveTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  liveTimeEmpty: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  liveBill: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 2,
  },
  liveBillDetail: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 2,
  },
  liveBillEmpty: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginTop: 40,
    fontSize: 14,
  },
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: FONTS.weightBold,
    color: '#0F766E',
    textAlign: 'center',
    marginBottom: 15,
  },
  modalList: {
    maxHeight: 250,
    marginBottom: 15,
  },
  revenueItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  revenueItemDate: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  revenueItemAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0D9488',
  },
  closeBtn: {
    backgroundColor: '#0F766E',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
