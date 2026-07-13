import React, { forwardRef, useRef } from 'react';
import {
  Animated,
  Pressable,
  Platform,
} from 'react-native';

const PRESS_SCALE = 0.97;

/**
 * Press feedback dùng chung cho web, Android và iOS.
 * Không phụ thuộc Reanimated nên hoạt động ổn định trên Expo web lẫn native.
 */
const AnimatedPressable = forwardRef(({
  children,
  disabled = false,
  onPressIn,
  onPressOut,
  activeOpacity: _activeOpacity,
  style,
  ...props
}, ref) => {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value) => {
    Animated.spring(scale, {
      toValue: value,
      friction: 8,
      tension: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const handlePressIn = (event) => {
    if (!disabled) animateTo(PRESS_SCALE);
    onPressIn?.(event);
  };

  const handlePressOut = (event) => {
    animateTo(1);
    onPressOut?.(event);
  };

  const animatedStyle = (state) => [
    typeof style === 'function' ? style(state) : style,
    disabled && { opacity: 0.55 },
    { transform: [{ scale }] },
  ];

  return (
    <Pressable
      ref={ref}
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={animatedStyle}
    >
      {children}
    </Pressable>
  );
});

AnimatedPressable.displayName = 'AnimatedPressable';

export default AnimatedPressable;
