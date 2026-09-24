// meat-management-fe/src/components/EditDailyPriceModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import MoneyInput from './MoneyInput';
import { api } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

// Định dạng ngày hiển thị DD/MM/YYYY
const formatDisplayDateOnly = (dateStr) => {
  if (!dateStr) return '';
  if (typeof dateStr === 'string' && dateStr.includes('/')) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const EditDailyPriceModal = forwardRef(({ onSaveSuccess }, ref) => {
  const [visible, setVisible] = useState(false);
  const [item, setItem] = useState(null);
  const [newPrice, setNewPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  // Phơi bày các hàm điều khiển qua ref
  useImperativeHandle(ref, () => ({
    open: (editPayload) => {
      setItem(editPayload);
      setNewPrice(editPayload?.currentPrice || 0);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const handleClose = () => {
    if (saving) return;
    setVisible(false);
  };

  // Nút bấm tiện ích: đặt giá mới bằng đúng giá cũ
  const handleQuickRestoreOldPrice = () => {
    if (item && item.oldPrice !== undefined) {
      setNewPrice(Number(item.oldPrice) || 0);
    }
  };

  // Lưu đơn giá mới và nhân lại đơn nợ
  const handleSave = async () => {
    if (!item) return;

    const numericPrice = Number(newPrice);
    if (!numericPrice || numericPrice <= 0) {
      showGlobalToast('Vui lòng nhập đơn giá hợp lệ lớn hơn 0.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('/products/customer-price', {
        customerId: item.customerId,
        productId: item.productId,
        price: numericPrice,
        transactionId: item.transactionId,
        date: item.date,
        recalculateOrder: true,
      });

      if (res.data && res.data.success) {
        const isSameAsOld = Math.abs(numericPrice - Number(item.oldPrice || 0)) <= 0.01;
        if (isSameAsOld) {
          showGlobalToast(
            `Đã khôi phục giá cũ ${formatCurrency(item.oldPrice)} cho ${item.customerName} và bỏ khỏi danh sách đổi giá!`,
            'success'
          );
        } else {
          showGlobalToast(
            `Đã cập nhật giá ${item.productName} thành ${formatCurrency(numericPrice)} và tính lại đơn nợ!`,
            'success'
          );
        }

        setVisible(false);
        if (onSaveSuccess) {
          onSaveSuccess({
            customerId: item.customerId,
            productId: item.productId,
            oldPrice: Number(item.oldPrice || 0),
            newPrice: numericPrice,
            transactionId: item.transactionId,
            date: item.date,
          });
        }
      } else {
        showGlobalToast(res.data?.message || 'Không thể lưu giá thịt mới.', 'error');
      }
    } catch (err) {
      console.error('Lỗi khi lưu đơn giá thịt:', err);
      showGlobalToast(
        err.response?.data?.message || 'Lỗi kết nối khi cập nhật đơn giá.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  const isSameAsOld = Math.abs(Number(newPrice) - Number(item.oldPrice || 0)) <= 0.01;

  return (
    <SmoothModal visible={visible} onClose={handleClose}>
      <View style={styles.modalView}>
        {/* HEADER MODAL CHUẨN BOTTOM-SHEET */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.iconCircle}>
              <Text style={styles.headerIconText}>✏️</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>ĐIỀU CHỈNH GIÁ THỊT</Text>
              <Text style={styles.headerSubtitle}>
                Cập nhật đơn giá & nhân lại đơn nợ ngày {formatDisplayDateOnly(item.date)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* NỘI DUNG CUỘN */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.bodyContent}
        >
          {/* THẺ THÔNG TIN KHÁCH HÀNG & MẶT HÀNG */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Khách hàng:</Text>
              <Text style={styles.infoValueHighlight}>{item.customerName}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Mặt hàng thịt:</Text>
              <Text style={styles.infoValue}>
                {item.productName} ({item.unit || 'kg'})
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Đơn nợ ngày:</Text>
              <Text style={styles.infoValueBadge}>{formatDisplayDateOnly(item.date)}</Text>
            </View>
          </View>

          {/* SO SÁNH GIÁ CŨ & GIÁ HIỆN TẠI TRÊN ĐƠN */}
          <View style={styles.priceCompareBox}>
            <View style={styles.priceCompareCol}>
              <Text style={styles.priceCompareLabel}>Giá cũ (lần trước)</Text>
              <Text style={styles.oldPriceText}>{formatCurrency(item.oldPrice)}</Text>
            </View>
            <Text style={styles.compareArrow}>➔</Text>
            <View style={styles.priceCompareCol}>
              <Text style={styles.priceCompareLabel}>Giá ghi nhận trên đơn</Text>
              <Text style={styles.currentPriceText}>{formatCurrency(item.currentPrice)}</Text>
            </View>
          </View>

          {/* NÚT KHÔI PHỤC GIÁ CŨ 1-CHẠM */}
          {Number(item.oldPrice) > 0 && !isSameAsOld && (
            <TouchableOpacity
              style={styles.quickRestoreBtn}
              onPress={handleQuickRestoreOldPrice}
              activeOpacity={0.7}
            >
              <Text style={styles.quickRestoreBtnText}>
                ⚡ Đặt bằng giá cũ ({formatCurrency(item.oldPrice)})
              </Text>
            </TouchableOpacity>
          )}

          {/* Ô NHẬP ĐƠN GIÁ MỚI */}
          <View style={styles.inputSection}>
            <Text style={styles.inputSectionLabel}>
              Nhập đơn giá mới (VNĐ/{item.unit || 'kg'}):
            </Text>
            <MoneyInput
              value={newPrice}
              onChangeValue={setNewPrice}
              placeholder="Nhập giá mới..."
            />
          </View>

          {/* THÔNG BÁO HƯỚNG DẪN TRỰC QUAN THEO LOGIC NGHIỆP VỤ */}
          {isSameAsOld ? (
            <View style={styles.noticeBoxSame}>
              <Text style={styles.noticeIconSame}>💡</Text>
              <Text style={styles.noticeTextSame}>
                Giá mới trùng với giá cũ (<Text style={styles.boldText}>{formatCurrency(item.oldPrice)}</Text>).
                Khi lưu, loại thịt này sẽ được <Text style={styles.boldText}>BỎ KHỎI DANH SÁCH ĐỔI GIÁ</Text> và{' '}
                đơn nợ ngày {formatDisplayDateOnly(item.date)} sẽ được nhân lại theo giá cũ!
              </Text>
            </View>
          ) : (
            <View style={styles.noticeBoxDiff}>
              <Text style={styles.noticeIconDiff}>ℹ️</Text>
              <Text style={styles.noticeTextDiff}>
                Khi bấm lưu, giá mới <Text style={styles.boldText}>{formatCurrency(newPrice)}</Text> sẽ được{' '}
                cập nhật vào danh sách và <Text style={styles.boldText}>nhân lại toàn bộ đơn nợ ngày {formatDisplayDateOnly(item.date)}</Text> của khách hàng.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* CHÂN MODAL: NÚT THAO TÁC */}
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={styles.btnCancel}
            onPress={handleClose}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={styles.btnCancelText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnSubmit, isSameAsOld && styles.btnSubmitRestore]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.btnSubmitText}>
                {isSameAsOld ? '⚡ KHÔI PHỤC & BỎ ĐỔI GIÁ' : '💾 LƯU GIÁ THỊT & NHÂN ĐƠN'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    ...SHADOWS.large,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerIconText: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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
  bodyContent: {
    paddingVertical: 14,
  },
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
  },
  infoValueHighlight: {
    fontSize: 14,
    color: '#059669',
    fontWeight: 'bold',
  },
  infoValueBadge: {
    fontSize: 12,
    color: '#2563EB',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  priceCompareBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  priceCompareCol: {
    alignItems: 'center',
  },
  priceCompareLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 3,
  },
  oldPriceText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  currentPriceText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#D97706',
  },
  compareArrow: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  quickRestoreBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  quickRestoreBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  inputSection: {
    marginBottom: 12,
  },
  inputSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  noticeBoxSame: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  noticeIconSame: {
    fontSize: 16,
    marginRight: 6,
    marginTop: 1,
  },
  noticeTextSame: {
    flex: 1,
    fontSize: 12,
    color: '#166534',
    lineHeight: 18,
  },
  noticeBoxDiff: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 10,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  noticeIconDiff: {
    fontSize: 16,
    marginRight: 6,
    marginTop: 1,
  },
  noticeTextDiff: {
    flex: 1,
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
  },
  boldText: {
    fontWeight: 'bold',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  btnCancel: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B',
  },
  btnSubmit: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  btnSubmitRestore: {
    backgroundColor: '#0284C7',
  },
  btnSubmitText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

export default EditDailyPriceModal;
