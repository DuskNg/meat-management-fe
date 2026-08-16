// meat-management-fe/src/components/ResourceLockBadge.js
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { FONTS } from '../theme';

/**
 * Badge hiển thị khi có người khác đang thao tác với đối tượng này.
 * Có hiệu ứng pulse animation để thu hút sự chú ý.
 *
 * @param {object} lockInfo - Thông tin người đang khóa (userId, userName, userColor)
 * @param {string} style - Style bổ sung cho container
 */
const ResourceLockBadge = ({ lockInfo, style }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Hiệu ứng nhịp đập (pulse) lặp lại để thu hút sự chú ý
  useEffect(() => {
    if (!lockInfo) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [lockInfo]);

  if (!lockInfo) return null;

  // Lấy chữ cái đầu từ tên hiển thị để làm avatar
  const initials = (lockInfo.userName || 'U')
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={[styles.container, style]}>
      {/* Chấm nhịp đập báo hiệu đang hoạt động */}
      <Animated.View style={[styles.dot, { opacity: pulseAnim, backgroundColor: lockInfo.userColor || '#E74C3C' }]} />

      {/* Avatar tròn với chữ cái đầu + màu unique */}
      <View style={[styles.avatar, { backgroundColor: lockInfo.userColor || '#E74C3C' }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      {/* Tên và trạng thái */}
      <View style={styles.textContainer}>
        <Text style={styles.userName} numberOfLines={1}>
          {lockInfo.userName}
        </Text>
        <Text style={styles.statusText}>đang xử lý...</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: FONTS.weightBold,
    lineHeight: 12,
  },
  textContainer: {
    flexShrink: 1,
  },
  userName: {
    fontSize: 11,
    fontWeight: FONTS.weightMedium,
    color: '#92400E',
    lineHeight: 14,
  },
  statusText: {
    fontSize: 10,
    color: '#B45309',
    lineHeight: 13,
  },
});

export default ResourceLockBadge;
