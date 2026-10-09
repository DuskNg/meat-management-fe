import React, { useState, useEffect, useRef, useCallback, useMemo, useTransition } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { COLORS } from '../theme';
import { matchSearch } from '../utils/searchHelper';
import { isMobileDevice } from '../utils/imageShareHelper';

// Render dropdown ra ngoài document.body qua Portal (chỉ trên Desktop Web)
// Giải quyết triệt để vấn đề dropdown bị kẹt trong ScrollView/stacking context trên PC
let ReactDOM = null;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    ReactDOM = require('react-dom');
  } catch (_) { }
}

/**
 * Component CustomSelect dùng chung cho toàn bộ dự án:
 * - Hỗ trợ gõ tìm kiếm không dấu / tiếng Việt mượt mà.
 * - Trên Desktop Web: render dropdown qua Portal ra document.body → luôn đè lên tất cả giao diện (zIndex tối đa).
 * - Trên Mobile (cả Native và Web Mobile): render inline bám sát ô chọn → đồng bộ với bàn phím ảo và cuộn trang ScrollView mượt mà.
 * - Tự động nảy lên trên (Drop Up) khi không đủ khoảng trống phía dưới (tính cả visualViewport khi bàn phím bật).
 * - Nút mũi tên riêng biệt để toggle đóng/mở dropdown.
 * - Tự động đóng khi click ra ngoài trên Web.
 */
const CustomSelect = ({
  value,
  placeholder = 'Chọn một mục...',
  options = [],
  onSelect,
  onInputChange,
  onOpenChange,
  renderOption,
  renderSelected,
  getOptionLabel = (opt) => (typeof opt === 'string' ? opt : opt?.name || ''),
  style,
  triggerStyle,
  dropdownStyle,
  inputStyle,
  compact = false,
  hasError = false,
  disabled = false,
  zIndex = 9999999,
  dropUp,
  minWidth,
  autoFocus = false,
  openOnFocus = true,
}) => {
  const { width } = useWindowDimensions();
  // Nhận diện thiết bị di động (React Native thuần, màn hình nhỏ hoặc trình duyệt điện thoại di động)
  const isMobile = Platform.OS !== 'web' || width < 768 || isMobileDevice();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // deferredSearch: cập nhật chậm hơn search → tải lại danh sách không block UI khi gõ nhanh
  const [deferredSearch, setDeferredSearch] = useState('');
  const [, startTransition] = useTransition();
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, isUp: false });
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const isAutoFocusingRef = useRef(false);
  // ID portal riêng biệt cho mỗi instance tránh xung đột key
  const portalIdRef = useRef(`csp-${Math.random().toString(36).slice(2)}`);
  const portalElRef = useRef(null);
  // Ref để hủy timeout đóng dropdown từ onBlur khi người dùng bấm chọn option
  const blurTimeoutRef = useRef(null);

  // Nhãn hiển thị của mục đã chọn
  const valueLabel = value ? (renderSelected ? renderSelected(value) : getOptionLabel(value)) : '';

  // Tự động focus vào input khi autoFocus = true (không tự bung dropdown để không che nút bấm)
  useEffect(() => {
    if (autoFocus && !disabled) {
      isAutoFocusingRef.current = true;
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
        // Giải phóng cờ sau khi focus hoàn tất
        setTimeout(() => {
          isAutoFocusingRef.current = false;
        }, 150);
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled]);

  // Lắng nghe sự kiện click ngoài ô select để tự động đóng dropdown trên Web
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;

    const closeOnOutsideClick = (event) => {
      // Đóng nếu click/touch ra ngoài trigger và ngoài portal riêng của instance này
      const isInsideTrigger = dropdownRef.current?.contains(event.target);
      const isInsidePortal = portalElRef.current?.contains(event.target);
      if (!isInsideTrigger && !isInsidePortal) {
        setOpen(false);
        setSearch('');
        if (onOpenChange) onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('touchstart', closeOnOutsideClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('touchstart', closeOnOutsideClick);
    };
  }, [open, onOpenChange]);

  // Cleanup: xóa DOM portal và hủy timeout khi component bị unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      if (portalElRef.current && typeof document !== 'undefined' && document.body.contains(portalElRef.current)) {
        document.body.removeChild(portalElRef.current);
        portalElRef.current = null;
      }
    };
  }, []);

  // Tính toán vị trí hiển thị dropdown:
  // - Tự động phát hiện khi nào cần nảy lên trên (Drop Up): khi không đủ khoảng trống phía dưới (bàn phím ảo bật hoặc ô chọn ở đáy màn hình).
  // - Trên Mobile: render inline bám sát mép trên (top) của ô select bằng bottom: 100% khi nảy lên trên.
  // - Trên Desktop Web: render qua Portal theo toạ độ document body để vượt qua mọi stacking context.
  const measureAndOpen = useCallback(() => {
    if (Platform.OS !== 'web' || !dropdownRef.current) return;

    let rect = null;
    if (dropdownRef.current.getBoundingClientRect) {
      rect = dropdownRef.current.getBoundingClientRect();
    }
    if (!rect) return;

    const vv = (typeof window !== 'undefined' && window.visualViewport) ? window.visualViewport : null;
    const viewportHeight = vv ? vv.height : (typeof window !== 'undefined' ? window.innerHeight : 800);
    const vvOffsetTop = vv ? vv.offsetTop : 0;
    const scrollX = typeof window !== 'undefined' ? (window.pageXOffset || document.documentElement.scrollLeft || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.pageYOffset || document.documentElement.scrollTop || 0) : 0;

    // Khoảng trống nhìn thấy thực tế (đã trừ bàn phím ảo hoặc thanh công cụ theo visualViewport)
    const spaceBelow = (vvOffsetTop + viewportHeight) - rect.bottom;
    const spaceAbove = rect.top - vvOffsetTop;

    // Xác định có nảy lên trên (Drop Up) hay không:
    // 1. Nếu prop dropUp được truyền rõ ràng: tuân thủ prop dropUp
    // 2. Tự động nảy lên trên nếu khoảng trống bên dưới nhỏ hơn 200px VÀ khoảng trống bên trên rộng hơn bên dưới
    let shouldDropUp = false;
    if (dropUp !== undefined) {
      shouldDropUp = Boolean(dropUp);
    } else {
      shouldDropUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    }

    const next = {
      // Toạ độ theo viewport (dùng để tính khoảng trống trên/dưới)
      viewTop: rect.top,
      viewBottom: rect.bottom,
      // Toạ độ theo document (dùng để định vị absolute trong portal Desktop)
      top: (shouldDropUp ? rect.top : rect.bottom) + scrollY,
      left: rect.left + scrollX,
      viewLeft: rect.left,
      width: rect.width,
      isUp: shouldDropUp,
      viewportHeight,
      vvOffsetTop,
      spaceAbove,
      spaceBelow,
    };

    // Chỉ cập nhật state khi vị trí thực sự thay đổi để tránh re-render thừa
    setDropdownPos((prev) => {
      if (
        prev
        && Math.abs((prev.top || 0) - next.top) < 0.5
        && Math.abs((prev.left || 0) - next.left) < 0.5
        && Math.abs((prev.width || 0) - next.width) < 0.5
        && Math.abs((prev.viewportHeight || 0) - next.viewportHeight) < 0.5
        && Math.abs((prev.vvOffsetTop || 0) - next.vvOffsetTop) < 0.5
        && prev.isUp === next.isUp
        && Math.abs((prev.spaceAbove || 0) - next.spaceAbove) < 1
        && Math.abs((prev.spaceBelow || 0) - next.spaceBelow) < 1
      ) {
        return prev;
      }
      return next;
    });
  }, [dropUp]);

  // Khi đang mở trên Web: đo lại vị trí MỖI FRAME bằng requestAnimationFrame.
  // Bắt được mọi trường hợp di chuyển: bàn phím iOS trồi lên làm co viewport, cuộn ScrollView...
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof requestAnimationFrame === 'undefined') return undefined;

    let rafId = null;
    const loop = () => {
      measureAndOpen();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [open, measureAndOpen]);

  // Mở dropdown: đo vị trí và cập nhật state
  const openDropdown = useCallback(() => {
    if (disabled) return;
    if (Platform.OS === 'web') measureAndOpen();
    setOpen(true);
    if (onOpenChange) onOpenChange(true);
  }, [disabled, measureAndOpen, onOpenChange]);

  // Đóng dropdown
  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearch('');
    setDeferredSearch('');
    if (onOpenChange) onOpenChange(false);
  }, [onOpenChange]);

  // Lọc danh sách tùy chọn dựa theo từ khóa tìm kiếm (memo hóa để không tính lại khi re-render không liên quan)
  const filteredOptions = useMemo(() => {
    return options.filter((opt) => {
      const label = getOptionLabel(opt);
      return matchSearch(label, deferredSearch);
    });
  }, [options, deferredSearch, getOptionLabel]);

  // Xử lý khi người dùng chọn 1 option:
  // Phải hủy blur-timeout trước để tránh dropdown bị đóng trước khi select kịp xử lý
  const handleSelectOption = (opt) => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    onSelect(opt);
    setOpen(false);
    setSearch('');
    setDeferredSearch('');
    if (onOpenChange) onOpenChange(false);
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  // Render nội dung dropdown (chuẩn phong cách Ant Design)
  const dropdownContent = (
    <ScrollView
      style={styles.selectDropdownScroll}
      nestedScrollEnabled={true}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={true}
    >
      {filteredOptions.length === 0 ? (
        <Text style={styles.selectEmptyText}>Không có dữ liệu</Text>
      ) : (
        filteredOptions.map((opt, idx) => (
          <TouchableOpacity
            key={opt.id || idx}
            style={[
              styles.selectOption,
              compact && styles.selectOptionCompact,
            ]}
            activeOpacity={0.7}
            onPress={() => handleSelectOption(opt)}
            {...(Platform.OS === 'web'
              ? {
                onMouseDown: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectOption(opt);
                },
                onTouchEnd: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectOption(opt);
                },
              }
              : {})}
          >
            {renderOption ? (
              renderOption(opt)
            ) : (
              <Text
                style={[
                  styles.selectOptionText,
                  compact && styles.selectTriggerTextCompact,
                ]}
                numberOfLines={1}
              >
                {getOptionLabel(opt)}
              </Text>
            )}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  // Trên Desktop Web: luôn render qua Portal ra ngoài document.body chuẩn Ant Design để thoát khỏi mọi stacking context, modal và ScrollView
  const renderDropdownPortal = () => {
    if (!open || Platform.OS !== 'web' || !ReactDOM || isMobile) return null;
    if (typeof document === 'undefined') return null;

    const effectiveZIndex = Math.max(Number(zIndex) || 999999, 99999999);
    if (!portalElRef.current) {
      const el = document.createElement('div');
      el.id = portalIdRef.current;
      // Container absolute tại gốc document → con bên trong định vị theo toạ độ document
      el.style.cssText = `position:absolute;top:0;left:0;width:0;height:0;z-index:${effectiveZIndex};pointer-events:none;`;
      document.body.appendChild(el);
      portalElRef.current = el;
    } else {
      portalElRef.current.style.setProperty('z-index', String(effectiveZIndex), 'important');
    }

    const effectiveMinWidth = minWidth !== undefined ? minWidth : 220;
    const calculatedWidth = dropdownStyle?.width || Math.max(dropdownPos.width, effectiveMinWidth);

    // Tính toán khoảng trống bên dưới để dropdown không vượt quá viewport
    const dynamicMaxHeight = dropdownPos.isUp
      ? Math.min(240, Math.max(100, (dropdownPos.spaceAbove || 240) - 8))
      : Math.min(240, Math.max(130, (dropdownPos.spaceBelow || 240) - 8));

    // Đảm bảo dropdown không bị tràn ra ngoài cạnh phải màn hình (tính theo viewport rồi cộng lại scrollX)
    const windowW = typeof window !== 'undefined' ? window.innerWidth : 400;
    const scrollXOffset = (dropdownPos.left || 0) - (dropdownPos.viewLeft || 0);
    const clampedLeft = Math.max(4, Math.min(dropdownPos.viewLeft || 0, windowW - calculatedWidth - 4)) + scrollXOffset;

    const dropStyle = {
      position: 'absolute',
      left: clampedLeft,
      width: calculatedWidth,
      minWidth: effectiveMinWidth,
      zIndex: effectiveZIndex,
      backgroundColor: '#FFFFFF',
      border: '1px solid #CBD5E1',
      borderRadius: 8,
      boxShadow: '0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12), 0 9px 28px 8px rgba(0,0,0,0.05)',
      overflow: 'hidden',
      maxHeight: dynamicMaxHeight,
      pointerEvents: 'auto',
      padding: 4,
      boxSizing: 'border-box',
    };

    if (dropdownPos.isUp) {
      dropStyle.top = dropdownPos.top - 2;
      dropStyle.transform = 'translateY(-100%)';
    } else {
      dropStyle.top = dropdownPos.top + 2;
      dropStyle.transform = 'none';
    }

    return ReactDOM.createPortal(
      <div style={dropStyle}>
        {dropdownContent}
      </div>,
      portalElRef.current
    );
  };

  // Xử lý khi nút mũi tên được bấm: toggle đóng/mở dropdown
  const handleArrowPress = (e) => {
    if (disabled) return;
    if (e && e.stopPropagation) e.stopPropagation();
    if (open) {
      inputRef.current?.blur();
      if (Platform.OS === 'web') {
        closeDropdown();
      }
    } else {
      inputRef.current?.focus();
      openDropdown();
    }
  };

  return (
    <View
      ref={dropdownRef}
      style={[
        styles.selectWrapper,
        open && { zIndex: 9999999, elevation: 9999999 },
        style,
      ]}
    >
      {/* Trigger: dùng View thường thay vì TouchableOpacity
          để TextInput nhận sự kiện chạm trực tiếp → bàn phím ảo mobile hoạt động */}
      <View
        style={[
          styles.selectTrigger,
          compact && styles.selectTriggerCompact,
          open && styles.selectTriggerOpen,
          hasError && styles.selectTriggerError,
          disabled && styles.selectTriggerDisabled,
          triggerStyle,
        ]}
        {...(Platform.OS === 'web'
          ? {
              onClick: () => {
                if (!disabled && !open) {
                  inputRef.current?.focus();
                  openDropdown();
                }
              },
              onTouchEnd: () => {
                if (!disabled && !open) {
                  inputRef.current?.focus();
                  openDropdown();
                }
              },
            }
          : {})}
      >
        <TextInput
          ref={inputRef}
          style={[
            styles.selectTriggerInput,
            compact && styles.selectTriggerTextCompact,
            !valueLabel && styles.selectPlaceholder,
            inputStyle,
          ]}
          value={open ? search : valueLabel}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textLight}
          editable={!disabled}
          // onFocus: chỉ tự động mở dropdown khi openOnFocus = true
          onFocus={() => {
            if (!disabled && !open && !isAutoFocusingRef.current) {
              openDropdown();
            }
          }}
          // onBlur trên Mobile: đóng dropdown sau delay 200ms để option press kịp fire trước
          onBlur={() => {
            if (Platform.OS !== 'web') {
              blurTimeoutRef.current = setTimeout(() => {
                setOpen(false);
                setSearch('');
                setDeferredSearch('');
                if (onOpenChange) onOpenChange(false);
                blurTimeoutRef.current = null;
              }, 200);
            }
          }}
          onChangeText={(text) => {
            setSearch(text);
            startTransition(() => {
              setDeferredSearch(text);
            });
            if (!open && !disabled) {
              if (Platform.OS === 'web') measureAndOpen();
              setOpen(true);
              if (onOpenChange) onOpenChange(true);
            }
            if (onInputChange) onInputChange(text);
          }}
          onSubmitEditing={() => inputRef.current?.blur()}
          blurOnSubmit={false}
          returnKeyType="done"
        />

        {/* Nút mũi tên riêng biệt để toggle dropdown */}
        <TouchableOpacity
          onPress={handleArrowPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.arrowContainer}
          activeOpacity={0.6}
        >
          <Text style={styles.selectArrow}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>

      {/* Dropdown cho Mobile (cả React Native thuần và Web Mobile):
          Render INLINE bám sát ô input.
          - Khi mở xuống dưới: bám sát mép đáy của ô select (top: 100%, marginTop: 2).
          - Khi bàn phím bật / nảy lên trên (Drop Up): bám sát mép trên (top) của ô select (bottom: 100%, marginBottom: 2).
          Nhờ render inline, dropdown luôn đồng bộ 100% với ScrollView và bàn phím ảo, không bao giờ bị lệch vị trí. */}
      {open && isMobile && (
        <View
          style={[
            styles.selectDropdown,
            dropdownPos.isUp && styles.selectDropdownUp,
            dropdownPos.isUp && {
              maxHeight: Math.min(240, Math.max(120, (dropdownPos.spaceAbove || 240) - 8)),
            },
            { zIndex: 9999999, elevation: 9999999 },
            dropdownStyle,
          ]}
        >
          {dropdownContent}
        </View>
      )}

      {/* Dropdown cho Desktop Web: render qua Portal ra document.body chuẩn Ant Design */}
      {open && !isMobile && renderDropdownPortal()}
    </View>
  );
};

export default CustomSelect;

const styles = StyleSheet.create({
  selectWrapper: {
    position: 'relative',
    width: '100%',
    minWidth: 0,
    zIndex: 100,
    elevation: 100,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingLeft: 8,
    paddingRight: 4,
    height: 38,
    width: '100%',
    minWidth: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      cursor: 'text',
      outlineStyle: 'none',
      outlineWidth: 0,
      boxShadow: 'none',
    } : {}),
  },
  selectTriggerCompact: {
    height: 34,
    paddingLeft: 8,
    paddingRight: 4,
    borderColor: '#CBD5E1',
    borderRadius: 6,
  },
  selectTriggerOpen: {
    borderColor: '#CBD5E1', // CẤM hiện border / đổi màu border khi focus/mở theo rule
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? {
      outlineStyle: 'none',
      outlineWidth: 0,
      boxShadow: 'none',
    } : {}),
  },
  selectTriggerError: {
    borderColor: '#EF4444',
  },
  selectTriggerDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    ...(Platform.OS === 'web' ? { cursor: 'not-allowed' } : {}),
  },
  selectTriggerInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
    margin: 0,
    height: '100%',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      outlineStyle: 'none',
      outlineWidth: 0,
      boxShadow: 'none',
      cursor: 'text',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    } : {}),
  },
  selectTriggerTextCompact: {
    fontSize: 12.5,
  },
  selectPlaceholder: {
    color: '#94A3B8',
    fontWeight: '400',
  },
  arrowContainer: {
    paddingLeft: 2,
    paddingRight: 4,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  selectArrow: {
    fontSize: 10,
    color: '#94A3B8',
  },
  // Dùng cho Mobile (cả Native và Web Mobile)
  selectDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    width: '100%',
    minWidth: 260,
    maxHeight: 240,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    marginTop: 2,
    overflow: 'hidden',
    zIndex: 9999999,
    elevation: 9999999,
    boxShadow: '0px 8px 24px rgba(0,0,0,0.18)',
    ...(Platform.OS !== 'web'
      ? {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
      }
      : {}),
  },
  selectDropdownUp: {
    top: 'auto',
    bottom: '100%',
    marginTop: 0,
    marginBottom: 2,
    ...(Platform.OS !== 'web' ? { shadowOffset: { width: 0, height: -4 } } : {}),
  },
  selectDropdownScroll: {
    maxHeight: 235,
  },
  selectOption: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 4,
    marginBottom: 2,
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      transition: 'background-color 0.1s ease',
    } : {}),
  },
  selectOptionSelected: {
    backgroundColor: '#E6F4FF',
  },
  selectOptionCompact: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  selectOptionText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  selectOptionTextSelected: {
    color: '#1677FF',
    fontWeight: '600',
  },
  selectEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    padding: 14,
    textAlign: 'center',
  },
});
