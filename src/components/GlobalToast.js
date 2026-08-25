// meat-management-fe/src/components/GlobalToast.js
// Component hiển thị thông báo Toast toàn cục (Global Toast) trượt ở góc trên màn hình
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, TouchableOpacity, Platform } from 'react-native';
import { useToastStore } from '../store/toastStore';
import { SHADOWS } from '../theme';

const GlobalToast = () => {
  const toast = useToastStore((state) => state.toast);
  const hideToast = useToastStore((state) => state.hideToast);
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (toast) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -60,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [toast]);

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={hideToast}
        style={[
          styles.toastCard,
          isSuccess && styles.toastSuccess,
          isError && styles.toastError,
        ]}
      >
        <Text style={styles.iconText}>{isSuccess ? '✓' : isError ? '✕' : 'ℹ'}</Text>
        <View style={styles.textContainer}>
          <Text style={styles.titleText}>{toast.title || (isSuccess ? 'Thành công' : 'Thông báo')}</Text>
          <Text style={styles.messageText}>{toast.message}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default GlobalToast;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 44,
    right: 16,
    zIndex: 999999,
    elevation: 999999,
    maxWidth: 380,
    minWidth: 260,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...SHADOWS.large,
    boxShadow: '0px 10px 25px rgba(15, 23, 42, 0.35)',
    borderWidth: 1,
    borderColor: '#334155',
  },
  toastSuccess: {
    backgroundColor: '#065F46',
    borderColor: '#10B981',
  },
  toastError: {
    backgroundColor: '#991B1B',
    borderColor: '#EF4444',
  },
  iconText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 12,
    color: '#F1F5F9',
    fontWeight: '500',
  },
});
