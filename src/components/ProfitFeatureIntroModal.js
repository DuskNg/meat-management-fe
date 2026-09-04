// meat-management-fe/src/components/ProfitFeatureIntroModal.js
import React, { useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import SmoothModal from './SmoothModal';
import { COLORS, SHADOWS } from '../theme';

const STORAGE_KEY_SEEN_PROFIT_INTRO = 'HAS_SEEN_PROFIT_FEATURE_INTRO_V1';
const isWeb = Platform.OS === 'web';

const setStorageItem = async (key, value) => {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const getStorageItem = async (key) => {
  if (isWeb) {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

/**
 * Modal giới thiệu tính năng Tính Lợi Nhuận mới:
 * 1. Ghi nợ nhanh: Tự ước lượng % Lãi.
 * 2. Ghi nợ thủ công: Nhập giá nhập ở Danh mục thịt để hệ thống tự động tính lãi.
 */
const ProfitFeatureIntroModal = forwardRef(({ onOpenProductList }, ref) => {
  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Đóng modal và lưu trạng thái "Không hiển thị lại" nếu người dùng tích chọn
  const handleClose = useCallback(async () => {
    setVisible(false);
    if (dontShowAgain) {
      try {
        await setStorageItem(STORAGE_KEY_SEEN_PROFIT_INTRO, 'true');
      } catch (err) {
        console.error('Lỗi khi lưu cờ không hiển thị lại popup:', err);
      }
    }
  }, [dontShowAgain]);

  // Expose các action open, close, submit qua ref cho component cha
  useImperativeHandle(ref, () => ({
    open: (force = false) => {
      if (force) {
        setVisible(true);
        return;
      }
      // Kiểm tra xem người dùng đã chọn không hiển thị lại hay chưa
      getStorageItem(STORAGE_KEY_SEEN_PROFIT_INTRO).then((val) => {
        if (!val) {
          setVisible(true);
        }
      }).catch(() => {
        setVisible(true);
      });
    },
    close: () => handleClose(),
    submit: () => handleClose(),
  }));

  const handleGoToProductList = () => {
    handleClose();
    if (onOpenProductList) {
      setTimeout(() => {
        onOpenProductList();
      }, 250);
    }
  };

  return (
    <SmoothModal visible={visible} onClose={handleClose}>
      <View style={styles.modalContainer}>
        {/* Thanh gạt modal */}
        <View style={styles.dragBar} />

        {/* Header giới thiệu */}
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>🎉 TÍNH NĂNG MỚI</Text>
        </View>

        <Text style={styles.modalTitle}>💰 TÍNH TOÁN LỢI NHUẬN</Text>
        <Text style={styles.modalSubtitle}>
          Hệ thống đã hỗ trợ quản lý giá vốn và tự động tính tiền lãi theo 2 hình thức ghi nợ:
        </Text>

        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* PHẦN 1: GHI NỢ NHANH */}
          <View style={[styles.featureCard, styles.cardQuick]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconCircle, styles.iconCircleQuick]}>
                <Text style={styles.cardIcon}>⚡</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleQuick}>1. Ghi nợ nhanh</Text>
                <Text style={styles.cardTagQuick}>Tự ước lượng % Lãi</Text>
              </View>
            </View>

            <Text style={styles.cardDesc}>
              Áp dụng khi ghi nợ nhanh theo tổng số tiền (không chọn danh mục thịt chi tiết).
            </Text>

            <View style={styles.formulaBoxQuick}>
              <Text style={styles.formulaTitleQuick}>💡 Cách thức hoạt động:</Text>
              <Text style={styles.formulaTextQuick}>
                • Bạn chỉ cần nhập ô <Text style={styles.boldText}>"% Lãi"</Text> (ví dụ: 10%, 15%).
              </Text>
              <Text style={styles.formulaTextQuick}>
                • Hệ thống tự động tính: <Text style={styles.boldText}>Tiền lãi = Số tiền nợ × % Lãi</Text>.
              </Text>
            </View>
          </View>

          {/* PHẦN 2: GHI NỢ THỦ CÔNG */}
          <View style={[styles.featureCard, styles.cardManual]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconCircle, styles.iconCircleManual]}>
                <Text style={styles.cardIcon}>🥩</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleManual}>2. Ghi nợ thủ công</Text>
                <Text style={styles.cardTagManual}>Tính tự động theo Giá nhập & Giá bán</Text>
              </View>
            </View>

            <Text style={styles.cardDesc}>
              Áp dụng khi ghi nợ chi tiết từng món thịt (Bắp bò, Ba chỉ, Sườn non...).
            </Text>

            <View style={styles.formulaBoxManual}>
              <Text style={styles.formulaTitleManual}>💡 Cách thức hoạt động:</Text>
              <Text style={styles.formulaTextManual}>
                • Bạn vào <Text style={styles.boldText}>"Danh mục thịt"</Text> để cài đặt <Text style={styles.boldText}>Giá nhập</Text> cho từng loại thịt.
              </Text>
              <Text style={styles.formulaTextManual}>
                • Hệ thống tự động tính: <Text style={styles.boldText}>Tiền lãi = (Giá bán - Giá nhập) × Số kg</Text>.
              </Text>
              <Text style={styles.formulaTextManual}>
                • Toàn bộ đơn cũ từ trước đến nay sẽ tự động được tính lãi đầy đủ!
              </Text>
            </View>
          </View>

          {/* Tuỳ chọn không hiển thị lại */}
          <TouchableOpacity
            style={styles.dontShowAgainRow}
            onPress={() => setDontShowAgain((prev) => !prev)}
            activeOpacity={0.75}
          >
            <View style={[styles.checkboxSquare, dontShowAgain && styles.checkboxSquareChecked]}>
              {dontShowAgain && <Text style={styles.checkboxCheckmark}>✓</Text>}
            </View>
            <Text style={styles.dontShowAgainText}>Không hiển thị lại hướng dẫn này</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Nút hành động dưới chân popup */}
        <View style={styles.actionButtonContainer}>
          {onOpenProductList && (
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={handleGoToProductList}
              activeOpacity={0.85}
            >
              <Text style={styles.btnSecondaryText}>🥩 Cài giá nhập thịt</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handleClose}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>Đã hiểu & Bắt đầu</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default ProfitFeatureIntroModal;

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
    paddingHorizontal: 18,
    maxHeight: '88%',
  },
  dragBar: {
    width: 40,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerBadge: {
    alignSelf: 'center',
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginBottom: 8,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  contentScroll: {
    maxHeight: 400,
  },
  contentContainer: {
    paddingBottom: 10,
    gap: 12,
  },
  featureCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    ...SHADOWS.card,
  },
  cardQuick: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  cardManual: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleQuick: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  iconCircleManual: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#7DD3FC',
  },
  cardIcon: {
    fontSize: 18,
  },
  cardTitleQuick: {
    fontSize: 15,
    fontWeight: '800',
    color: '#166534',
  },
  cardTagQuick: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  cardTitleManual: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0369A1',
  },
  cardTagManual: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
  },
  cardDesc: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 8,
  },
  formulaBoxQuick: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    gap: 4,
  },
  formulaTitleQuick: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 2,
  },
  formulaTextQuick: {
    fontSize: 12,
    color: '#1E293B',
    lineHeight: 17,
  },
  formulaBoxManual: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E0F2FE',
    gap: 4,
  },
  formulaTitleManual: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
    marginBottom: 2,
  },
  formulaTextManual: {
    fontSize: 12,
    color: '#1E293B',
    lineHeight: 17,
  },
  boldText: {
    fontWeight: 'bold',
  },
  dontShowAgainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 8,
    marginTop: 4,
  },
  checkboxSquare: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSquareChecked: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  checkboxCheckmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  dontShowAgainText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
  },
  actionButtonContainer: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderWidth: 1.5,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  btnSecondaryText: {
    color: '#166534',
    fontSize: 13.5,
    fontWeight: '800',
  },
  btnPrimary: {
    flex: 1.2,
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
