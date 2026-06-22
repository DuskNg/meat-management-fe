// meat-management-fe/app/index.js
import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../src/api/client';
import { useAuthStore } from '../src/store/authStore';
import { COLORS, FONTS, SHADOWS } from '../src/theme';
import AddCustomerModal from '../src/components/AddCustomerModal';
import ProductListModal from '../src/components/ProductListModal';
import ProfileModal from '../src/components/ProfileModal';

export default function DashboardScreen() {
  const router = useRouter();
  const auth = useAuthStore();
  const modalRef = useRef(null);
  const productModalRef = useRef(null);
  const profileModalRef = useRef(null);
  const [search, setSearch] = useState('');

  // 1. Dùng React Query tải danh sách khách hàng và cache lại
  const { data: customersResponse, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers');
      return response.data;
    },
  });

  // Xử lý xác nhận xóa khách hàng trực tiếp trên trang chủ
  const confirmDeleteCustomer = (customerId, customerName) => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm(`Bạn có chắc chắn muốn xóa khách hàng "${customerName}" không? Mọi lịch sử giao dịch liên quan sẽ không thể truy cập trực tiếp nữa.`);
      if (confirm) {
        handleDeleteCustomer(customerId);
      }
    } else {
      Alert.alert(
        'Xác nhận xóa',
        `Bạn có chắc chắn muốn xóa khách hàng "${customerName}" không? Mọi lịch sử giao dịch liên quan sẽ không thể truy cập trực tiếp nữa.`,
        [
          { text: 'Hủy bỏ', style: 'cancel' },
          { text: 'Xóa ngay', style: 'destructive', onPress: () => handleDeleteCustomer(customerId) }
        ]
      );
    }
  };

  // Gửi yêu cầu xóa khách hàng lên backend và làm mới danh sách
  const handleDeleteCustomer = async (customerId) => {
    try {
      const response = await api.delete(`/customers/${customerId}`);
      if (response.data.success) {
        alert('Đã xóa khách hàng thành công.');
        refetch(); // Làm mới danh sách
      } else {
        alert(response.data.message || 'Không thể xóa khách hàng.');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ để xóa khách hàng.');
    }
  };

  const customers = customersResponse?.data || [];

  // 2. Tính toán tổng nợ của toàn bộ khách hàng để hiển thị
  const totalDebt = customers.reduce((sum, c) => sum + (c.debt || 0), 0);

  // 3. Bộ lọc tìm kiếm nhanh theo tên hoặc SĐT khách hàng
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search))
  );

  // Định dạng hiển thị tiền VNĐ (Ví dụ: 1.500.000 đ)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  const renderCustomerItem = ({ item }) => {
    const hasDebt = item.debt > 0;
    return (
      <View style={styles.customerCardContainer}>
        <TouchableOpacity
          style={styles.customerCardMain}
          onPress={() => router.push(`/customer/${item.id}`)}
          activeOpacity={0.7}
        >
          <View style={styles.cardInfo}>
            <Text style={styles.customerName}>{item.name}</Text>
            {item.phone ? (
              <Text style={styles.customerPhone}>{item.phone}</Text>
            ) : (
              <Text style={styles.customerPhone}>Không có số điện thoại</Text>
            )}
          </View>

          <View style={styles.cardDebt}>
            {hasDebt ? (
              <View style={styles.debtTag}>
                <Text style={styles.debtTextLabel}>Còn Nợ:</Text>
                <Text style={styles.debtTextValue}>{formatCurrency(item.debt)}</Text>
              </View>
            ) : (
              <View style={[styles.debtTag, styles.noDebtTag]}>
                <Text style={[styles.debtTextValue, styles.noDebtText]}>Hết nợ</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.customerDeleteBtn}
          onPress={() => confirmDeleteCustomer(item.id, item.name)}
          activeOpacity={0.6}
        >
          <Text style={styles.customerDeleteBtnText}>Xóa</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* HEADER: Thiết kế mới sang trọng, gồm Avatar, Thông tin chủ sạp và Nút Đăng xuất */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.merchantProfileCard}
            onPress={() => profileModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {(auth.user?.name || 'Hoa').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.merchantDetails}>
              <Text style={styles.merchantGreeting}>Chủ sạp thịt quản lý 👋</Text>
              <Text style={styles.merchantName}>{auth.user?.name || 'Cô Hoa'}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButtonNew}
            onPress={() => auth.logout()}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutTextNew}>Thoát 🚪</Text>
          </TouchableOpacity>
        </View>

        {/* TỔNG TIỀN NỢ: To rõ, thu hút sự chú ý ngay */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>💰 TỔNG TIỀN NỢ:</Text>
          <Text style={styles.summaryValue}>{formatCurrency(totalDebt)}</Text>
        </View>

        {/* Ô TÌM KIẾM NHANH KHÁCH QUEN */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Gõ tên hoặc SĐT khách quen..."
            placeholderTextColor={COLORS.textLight}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity style={styles.clearSearch} onPress={() => setSearch('')}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.listHeaderContainer}>
          <Text style={styles.listHeader}>👥 SỔ GHI NỢ KHÁCH QUEN ({filteredCustomers.length})</Text>
        </View>

        {/* DANH SÁCH KHÁCH HÀNG */}
        {isLoading ? (
          <ActivityIndicator size="large" color={COLORS.primaryDark} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filteredCustomers}
            renderItem={renderCustomerItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={isRefetching}
            onRefresh={refetch}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Chưa có ai trong danh sách. Hãy nhấn nút phía dưới để thêm!</Text>
              </View>
            }
          />
        )}

        {/* THANH ĐIỀU KHIỂN CỐ ĐỊNH Ở ĐÁY MÀN HÌNH */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.manageProductsButton}
            onPress={() => productModalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.manageProductsButtonText}>🥩 QUẢN LÝ THỊT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addCustomerButton}
            onPress={() => modalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.addCustomerButtonText}>➕ THÊM KHÁCH</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MODAL THÊM KHÁCH MỚI (Ẩn) */}
      <AddCustomerModal ref={modalRef} onRefresh={refetch} />

      {/* MODAL HỒ SƠ CHỦ TÀI KHOẢN (Ẩn) */}
      <ProfileModal ref={profileModalRef} />

      {/* MODAL QUẢN LÝ DANH MỤC THỊT (Ẩn) */}
      <ProductListModal ref={productModalRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: COLORS.background,
    position: 'relative',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9', // Viền siêu mỏng nhạt màu
    ...SHADOWS.card,
  },
  merchantProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5', // Màu xanh bạc hà nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#047857', // Xanh lá đậm sang trọng
  },
  merchantDetails: {
    flexDirection: 'column',
  },
  merchantGreeting: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  merchantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  logoutButtonNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F1', // Nền đỏ hồng pastel siêu nhạt
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutTextNew: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  summaryCard: {
    backgroundColor: COLORS.dangerLight,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    ...SHADOWS.card,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  searchContainer: {
    marginHorizontal: 16,
    marginBottom: 10,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    height: 44, // Giảm chiều cao từ 56 xuống 44
    borderRadius: 10,
    paddingLeft: 14,
    paddingRight: 40,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  clearSearch: {
    position: 'absolute',
    right: 16,
    padding: 6,
  },
  clearSearchText: {
    fontSize: 18,
    color: COLORS.textLight,
    fontWeight: 'bold',
  },
  listHeaderContainer: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  listHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 85, // Giảm khoảng trống đệm đáy do bottomBar nhỏ hơn
  },
  // Container bọc ngoài thẻ khách hàng và nút xóa
  customerCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  // Thẻ thông tin khách hàng chính (đã chuyển sang flex: 1 để nhường không gian cho nút xóa)
  customerCardMain: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  // Nút xóa khách hàng trực tiếp trên trang chủ
  customerDeleteBtn: {
    paddingVertical: 6, // Giảm đệm dọc
    paddingHorizontal: 12, // Giảm đệm ngang cho chữ Xóa
    borderRadius: 8, // Bo tròn nhẹ dạng chữ nhật bo góc
    backgroundColor: '#FFF1F1', // Màu nền đỏ nhạt pastel
    borderColor: '#FECACA', // Viền đỏ nhạt
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerDeleteBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.danger, // Chữ màu đỏ nguy hiểm
  },
  cardInfo: {
    flex: 1,
    paddingRight: 10,
  },
  // Tên khách hàng (giảm cỡ chữ và margin bottom)
  customerName: {
    fontSize: FONTS.subtitle, // Giảm từ title (22) xuống subtitle (18)
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 2,
  },
  // SĐT khách hàng (giảm cỡ chữ xuống caption)
  customerPhone: {
    fontSize: FONTS.caption, // Giảm từ body (16) xuống caption (14)
    color: COLORS.textSecondary,
  },
  cardDebt: {
    alignItems: 'flex-end',
  },
  debtTag: {
    alignItems: 'flex-end',
  },
  debtTextLabel: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
  },
  // Giá trị nợ (giảm size chữ)
  debtTextValue: {
    fontSize: 16, // Giảm từ subtitle (18) xuống 16
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  // Khung báo hết nợ (giảm padding dọc và ngang)
  noDebtTag: {
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  debtTextValueNoCurrency: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
  },
  // Chữ báo hết nợ (giảm cỡ chữ)
  noDebtText: {
    color: COLORS.primary,
    fontSize: 14,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(248, 250, 252, 0.95)', // Bán trong suốt nền xám
    paddingVertical: 10, // Giảm từ 16 xuống 10
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row', // Chuyển sang dạng hàng ngang
    justifyContent: 'space-between',
    gap: 12,
  },
  manageProductsButton: {
    flex: 1,
    backgroundColor: '#FAF8F6', // Nền màu kem lanh nhẹ nhàng, cao cấp
    height: 46, // Giảm từ 60 xuống 46
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#7F1D1D', // Viền Bordeaux đồng màu chữ
    shadowColor: '#7F1D1D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  manageProductsButtonText: {
    color: '#7F1D1D', // Màu đỏ đun Bordeaux sang trọng
    fontSize: 14, // Giảm từ 16 xuống 14
    fontWeight: 'bold',
  },
  addCustomerButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    height: 46, // Giảm từ 60 xuống 46
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  addCustomerButtonText: {
    color: '#FFFFFF',
    fontSize: 14, // Giảm từ 16 xuống 14
    fontWeight: 'bold',
  },
});
