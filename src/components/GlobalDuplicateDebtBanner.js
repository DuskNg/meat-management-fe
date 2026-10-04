// meat-management-fe/src/components/GlobalDuplicateDebtBanner.js
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AnimatedPressable from './AnimatedPressable';

const TouchableOpacity = AnimatedPressable;

/**
 * Component Banner cảnh báo trùng lặp đơn hàng trong ngày
 * - Hiển thị ghim trên đầu danh sách khách hàng khi phát hiện có khách bị trùng đơn thịt trong ngày.
 * - Nhấp vào để mở PopupModal xem chi tiết từng khách và món bị trùng.
 */
const GlobalDuplicateDebtBanner = ({ duplicates = [], onPress = null }) => {
  if (!duplicates || duplicates.length === 0) return null;

  return (
    <TouchableOpacity
      style={styles.bannerContainer}
      onPress={() => {
        if (typeof onPress === 'function') {
          onPress();
        }
      }}
      activeOpacity={0.85}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.iconText}>⚠️</Text>
      </View>
      <View style={styles.contentWrap}>
        <Text style={styles.titleText}>
          Phát hiện {duplicates.length} khách hàng có đơn nghi trùng hôm nay!
        </Text>
        <Text style={styles.subText}>
          Trùng tên thịt và số kg lệch &lt; 0.2kg • Bấm để xem chi tiết
        </Text>
      </View>
      <View style={styles.btnBadge}>
        <Text style={styles.btnText}>Xem ngay ➔</Text>
      </View>
    </TouchableOpacity>
  );
};

export default GlobalDuplicateDebtBanner;

const styles = StyleSheet.create({
  bannerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    marginHorizontal: 16,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconText: {
    fontSize: 16,
  },
  contentWrap: {
    flex: 1,
  },
  titleText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 2,
  },
  subText: {
    fontSize: 11,
    color: '#B45309',
  },
  btnBadge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
