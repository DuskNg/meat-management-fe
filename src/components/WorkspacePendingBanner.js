// meat-management-fe/src/components/WorkspacePendingBanner.js
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

const POLL_INTERVAL = 30000; // Polling mỗi 30 giây

// Banner nổi hiển thị cho chủ Workspace khi có yêu cầu đang chờ
// Tự động polling mỗi 30 giây, chỉ hiển thị khi có yêu cầu mới
export default function WorkspacePendingBanner({ onPress }) {
  const { user } = useAuthStore();
  const [pendingCount, setPendingCount] = useState(0);
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const intervalRef = useRef(null);

  // Chỉ poll nếu user là chủ workspace
  const isOwner = user?.isWorkspaceOwner;

  const fetchPendingCount = async () => {
    if (!isOwner) return;
    try {
      const res = await api.get('/workspace/pending-requests');
      if (res.data?.success) {
        const count = res.data.count || 0;
        setPendingCount(count);
        if (count > 0) {
          // Hiển thị banner khi có yêu cầu
          Animated.spring(slideAnim, {
            toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
          }).start();
        } else {
          // Ẩn banner khi không có
          Animated.timing(slideAnim, {
            toValue: -80, duration: 300, useNativeDriver: true,
          }).start();
        }
      }
    } catch (e) {
      // Bỏ qua lỗi polling
    }
  };

  useEffect(() => {
    if (!isOwner) return;

    // Fetch ngay khi mount
    fetchPendingCount();

    // Setup polling
    intervalRef.current = setInterval(fetchPendingCount, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOwner]);

  if (!isOwner || pendingCount === 0) return null;

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.content} onPress={onPress} activeOpacity={0.85}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>👥</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Yêu cầu tham gia Workspace</Text>
          <Text style={styles.subtitle}>
            {pendingCount} người đang chờ phê duyệt — Nhấn để xem
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pendingCount}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48, // Cho phép hiển thị phía dưới status bar
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  icon: { fontSize: 20 },
  textContainer: { flex: 1 },
  title: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  badge: {
    backgroundColor: '#FFFFFF',
    minWidth: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 8,
  },
  badgeText: { fontSize: 12, fontWeight: 'bold', color: '#7C3AED' },
});
