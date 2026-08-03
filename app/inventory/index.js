// meat-management-fe/app/inventory/index.js
import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import AddInventoryProductModal from '../../src/components/inventory/AddInventoryProductModal';

import { useAuthStore } from '../../src/store/authStore';

export default function InventoryDashboardScreen() {
  const router = useRouter();
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const modalRef = useRef(null);

  const [search, setSearch] = useState('');

  // 1. Tải danh sách sản phẩm kho bằng React Query
  const { data: responseData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['inventory_products'],
    queryFn: async () => {
      const response = await api.get('/inventory/products');
      return response.data;
    },
    enabled: auth.hasPermission('canManageInventory'),
  });

  const products = responseData?.data?.products || [];
  const totalValue = responseData?.data?.totalValue || 0;

  // Lọc sản phẩm theo ô tìm kiếm
  const filteredProducts = products.filter((item) => {
    const cleanSearch = search.toLowerCase().trim();
    return item.name.toLowerCase().includes(cleanSearch);
  });

  // Định dạng số tiền sang VND
  const formatVND = (num) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  // Định dạng số lượng (bỏ số 0 thừa sau dấu phẩy)
  const formatQuantity = (qty, unit) => {
    const num = parseFloat(qty);
    return `${Number(num.toFixed(3))} ${unit}`;
  };

  // Xử lý Xóa sản phẩm kho
  const handleDeleteProduct = (productId, productName) => {
    Alert.alert(
      'Xác nhận xóa',
      `Bạn có chắc chắn muốn xóa sản phẩm "${productName}" khỏi kho không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa ngay',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await api.delete(`/inventory/products/${productId}`);
              if (res.data && res.data.success) {
                queryClient.invalidateQueries(['inventory_products']);
              } else {
                Alert.alert('Thất bại', res.data.message || 'Không thể xóa sản phẩm.');
              }
            } catch (err) {
              console.error(err);
              Alert.alert('Lỗi', err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
            }
          },
        },
      ]
    );
  };

  // Xử lý khi nhấn giữ sản phẩm kho để sửa hoặc xóa
  const handleProductLongPress = (item) => {
    Alert.alert(
      'Tùy chọn sản phẩm',
      `Bạn muốn làm gì với sản phẩm "${item.name}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Sửa thông tin ✏️',
          onPress: () => modalRef.current?.open(item),
        },
        {
          text: 'Xóa sản phẩm 🗑️',
          style: 'destructive',
          onPress: () => handleDeleteProduct(item.id, item.name),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* HEADER: Nút Quay lại bên trái, Tiêu đề giữa */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace('/')}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Quản Lý Kho 📦</Text>
        <View style={{ width: 80 }} /> {/* Căn chỉnh trống để tiêu đề nằm giữa */}
      </View>

      <View style={styles.content}>
        {/* Thẻ Summary: Hiển thị tổng giá trị kho */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>💰 TỔNG GIÁ TRỊ KHO HÀNG</Text>
          <Text style={styles.summaryValue}>{formatVND(totalValue)}</Text>
        </View>

        {/* Khung chức năng: Thêm mới và Tìm kiếm */}
        <View style={styles.actionRow}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm sản phẩm theo tên..."
            placeholderTextColor="#94A3B8"
          />

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => modalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>+ Thêm sản phẩm</Text>
          </TouchableOpacity>
        </View>

        {/* Danh sách sản phẩm kho */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Đang tải dữ liệu kho...</Text>
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {search.trim() ? 'Không tìm thấy sản phẩm nào khớp.' : 'Kho hàng hiện tại trống.'}
            </Text>
            {!search.trim() && (
              <Text style={styles.emptySubText}>Nhấn nút "Thêm sản phẩm" để nhập kho mới.</Text>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredProducts}
            keyExtractor={(item) => item.id}
            onRefresh={refetch}
            refreshing={isRefetching}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.productCard}
                onLongPress={() => handleProductLongPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productMeta}>
                    Số lượng: {formatQuantity(item.quantity, item.unit)} | Đơn giá: {formatVND(item.price)}
                  </Text>
                </View>

                <View style={styles.productAmountCol}>
                  <Text style={styles.productAmountLabel}>Thành tiền</Text>
                  <Text style={styles.productAmountValue}>{formatVND(item.amount)}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Modal nghiệp vụ Thêm/Sửa sản phẩm kho */}
      <AddInventoryProductModal
        ref={modalRef}
        onSaveSuccess={() => {
          queryClient.invalidateQueries(['inventory_products']);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  backBtn: {
    width: 80,
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
    color: '#64748B',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: '#EFF6FF', // Tông màu xanh dương nhạt cho kho hàng
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    marginBottom: 16,
    ...SHADOWS.card,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  addBtn: {
    height: 40,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContent: {
    gap: 10,
    paddingBottom: 24,
  },
  productCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  productInfo: {
    flex: 1,
    paddingRight: 12,
  },
  productName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  productAmountCol: {
    alignItems: 'flex-end',
  },
  productAmountLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2,
  },
  productAmountValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  emptySubText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
});
