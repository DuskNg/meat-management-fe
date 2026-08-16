// meat-management-fe/src/components/ResourceLockOverlay.js
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { FONTS } from '../theme';

/**
 * Lớp phủ Overlay khóa đối tượng khi có người dùng khác đang thao tác.
 * Chặn toàn bộ tương tác nhấn/click vào đối tượng bị khóa và hiển thị người đang xử lý.
 *
 * @param {object} lockInfo - Thông tin người đang khóa { userId, userName, userColor }
 * @param {object} style - Style tùy chỉnh cho overlay
 * @param {number} borderRadius - Bo góc cho overlay khớp với card (mặc định 12)
 */
const ResourceLockOverlay = ({ lockInfo, style, borderRadius = 12 }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Hiệu ứng nhịp đập cho biểu tượng khóa
  useEffect(() => {
    if (!lockInfo) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [lockInfo]);

  if (!lockInfo) return null;

  // Lấy 2 chữ cái đầu của tên hiển thị
  const initials = (lockInfo.userName || 'U')
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Pressable
      style={[styles.overlay, { borderRadius }, style]}
      onPress={(e) => {
        // Chặn hoàn toàn sự kiện bấm lây lan xuống đối tượng bên dưới
        if (e && e.stopPropagation) e.stopPropagation();
      }}
    >
      <View style={styles.badgeCard}>
        {/* Avatar hiển thị chữ cái đầu với màu unique */}
        <Animated.View
          style={[
            styles.avatar,
            {
              backgroundColor: lockInfo.userColor || '#EF4444',
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </Animated.View>

        {/* Nội dung thông báo người dùng đang thao tác */}
        <View style={styles.infoContainer}>
          <Text style={styles.userNameText} numberOfLines={1}>
            🔒 {lockInfo.userName}
          </Text>
          <Text style={styles.statusText}>đang xử lý đối tượng này...</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)', // Nền tối làm mờ mờ đối tượng bên dưới
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999, // Đảm bảo đè lên trên tất cả các nút trong card
    padding: 8,
  },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
    maxWidth: '90%',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: FONTS.weightBold,
  },
  infoContainer: {
    flexShrink: 1,
  },
  userNameText: {
    fontSize: 12,
    fontWeight: FONTS.weightBold,
    color: '#0F172A',
  },
  statusText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
});

export default ResourceLockOverlay;
