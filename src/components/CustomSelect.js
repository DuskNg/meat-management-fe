// meat-management-fe/src/components/CustomSelect.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { COLORS } from '../theme';
import { matchSearch } from '../utils/searchHelper';

// Render dropdown ra ngoài document.body qua Portal (chỉ trên Web)
// Giải quyết triệt để vấn đề dropdown bị kẹt trong ScrollView/stacking context
let ReactDOM = null;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    ReactDOM = require('react-dom');
  } catch (_) { }
}

/**
 * Component CustomSelect dùng chung cho toàn bộ dự án:
 * - Hỗ trợ gõ tìm kiếm không dấu / tiếng Việt mượt mà.
 * - Trên Web: render dropdown qua Portal ra document.body → luôn đè lên tất cả giao diện (zIndex tối đa).
 * - Trên Mobile: TextInput nhận focus trực tiếp → bàn phím ảo hiển thị ngay lập tức.
 * - Tự động nảy lên trên (Drop Up) khi không đủ khoảng trống phía dưới.
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
  dropdownStyle,
  compact = false,
  hasError = false,
  disabled = false,
  zIndex = 9999,
  dropUp,
  minWidth,
  autoFocus = false,
  openOnFocus = true,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
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
      // Đóng nếu click ra ngoài trigger và ngoài portal riêng của instance này
      const isInsideTrigger = dropdownRef.current?.contains(event.target);
      const isInsidePortal = portalElRef.current?.contains(event.target);
      if (!isInsideTrigger && !isInsidePortal) {
        setOpen(false);
        setSearch('');
        if (onOpenChange) onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
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

  // Tính toán vị trí tuyệt đối của dropdown dựa trên vị trí trigger và độ cuộn trang (scroll)
  const measureAndOpen = useCallback(() => {
    if (Platform.OS !== 'web' || !dropdownRef.current) return;

    const rect = dropdownRef.current.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
    const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft;

    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow = windowHeight - rect.bottom;

    // Quyết định nảy lên trên hay xuống dưới
    let shouldDropUp = dropUp !== undefined ? !!dropUp : (spaceBelow < 220 && rect.top > 220);

    setDropdownPos({
      top: shouldDropUp ? (rect.top + scrollY) : (rect.bottom + scrollY),
      left: rect.left + scrollX,
      width: rect.width,
      isUp: shouldDropUp,
    });
  }, [dropUp]);

  // Lắng nghe sự kiện scroll và resize: khi cuộn danh sách bên ngoài thì tự động bỏ focus và đóng dropdown
  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;

    const handleScroll = (event) => {
      // Nếu sự kiện cuộn xảy ra bên trong chính danh sách tùy chọn của dropdown thì không đóng
      if (portalElRef.current?.contains(event.target)) {
        return;
      }
      // Người dùng cuộn danh sách / modal bên ngoài -> hủy focus và đóng dropdown ngay
      inputRef.current?.blur();
      setOpen(false);
      setSearch('');
      if (onOpenChange) onOpenChange(false);
    };

    const handleResize = () => {
      measureAndOpen();
    };

    // Bắt sự kiện scroll ở bất kỳ container cha/con nào bằng capture phase
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, onOpenChange, measureAndOpen]);

  // Mở dropdown: đo vị trí (Web) và cập nhật state
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
    if (onOpenChange) onOpenChange(false);
  }, [onOpenChange]);

  // Lọc danh sách tùy chọn dựa theo từ khóa tìm kiếm
  const filteredOptions = options.filter((opt) => {
    const label = getOptionLabel(opt);
    return matchSearch(label, search);
  });

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
    if (onOpenChange) onOpenChange(false);
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  // Render nội dung dropdown (dùng chung cho Portal và fallback)
  const dropdownContent = (
    <ScrollView
      style={styles.selectDropdownScroll}
      nestedScrollEnabled={true}
      keyboardShouldPersistTaps="always"
    >
      {filteredOptions.length === 0 ? (
        <Text style={styles.selectEmptyText}>Không tìm thấy kết quả</Text>
      ) : (
        filteredOptions.map((opt, idx) => (
          <TouchableOpacity
            key={opt.id || idx}
            style={[styles.selectOption, compact && styles.selectOptionCompact]}
            activeOpacity={0.7}
            onPress={() => handleSelectOption(opt)}
            // Ngăn mousedown cướp focus và đóng dropdown trên Web
            {...(Platform.OS === 'web'
              ? {
                onMouseDown: (e) => {
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
              <Text style={[styles.selectOptionText, compact && styles.selectTriggerTextCompact]}>
                {getOptionLabel(opt)}
              </Text>
            )}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  // Trên Web: render qua Portal ra ngoài document.body để thoát khỏi mọi stacking context
  const renderDropdownPortal = () => {
    if (!open || Platform.OS !== 'web' || !ReactDOM) return null;
    if (typeof document === 'undefined') return null;

    // Mỗi instance CustomSelect có 1 container riêng, luôn đặt pointer-events: none
    if (!portalElRef.current) {
      const el = document.createElement('div');
      el.id = portalIdRef.current;
      el.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:999999;pointer-events:none;';
      document.body.appendChild(el);
      portalElRef.current = el;
    }

    // Tính vị trí hiển thị dropdown tuyệt đối theo document body (như Antd)
    const effectiveMinWidth = minWidth !== undefined ? minWidth : 260;
    const calculatedWidth = dropdownStyle?.width || Math.max(dropdownPos.width, effectiveMinWidth);

    const dropStyle = {
      position: 'absolute',
      left: dropdownPos.left,
      width: calculatedWidth,
      minWidth: effectiveMinWidth,
      zIndex: 999999,
      backgroundColor: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: 8,
      boxShadow: '0px 6px 16px rgba(0,0,0,0.12)',
      overflow: 'hidden',
      maxHeight: 240,
      pointerEvents: 'auto',
    };

    if (dropdownPos.isUp) {
      dropStyle.top = dropdownPos.top - 4;
      dropStyle.transform = 'translateY(-100%)';
    } else {
      dropStyle.top = dropdownPos.top + 4;
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
      // Đang mở → bấm mũi tên để đóng
      inputRef.current?.blur();
      // Web: blur không đóng dropdown (có outside-click), phải đóng thủ công
      if (Platform.OS === 'web') {
        closeDropdown();
      }
    } else {
      // Đang đóng → focus TextInput và mở dropdown
      inputRef.current?.focus();
      openDropdown();
    }
  };

  return (
    <View
      ref={dropdownRef}
      style={[
        styles.selectWrapper,
        open && { zIndex: 999999, elevation: 999999 },
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
        ]}
        {...(Platform.OS === 'web'
          ? {
              onClick: () => {
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
                if (onOpenChange) onOpenChange(false);
                blurTimeoutRef.current = null;
              }, 200);
            }
          }}
          onChangeText={(text) => {
            setSearch(text);
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

      {/* Dropdown cho Mobile (React Native thuần) */}
      {open && Platform.OS !== 'web' && (
        <View
          style={[
            styles.selectDropdown,
            dropdownPos.isUp && styles.selectDropdownUp,
            { zIndex: 999999, elevation: 999999 },
            dropdownStyle,
          ]}
        >
          {dropdownContent}
        </View>
      )}

      {/* Dropdown cho Web: render qua Portal ra document.body */}
      {renderDropdownPortal()}
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
    ...(Platform.OS === 'web' ? { cursor: 'text' } : {}),
  },
  selectTriggerCompact: {
    height: 34,
    paddingLeft: 8,
    paddingRight: 4,
    borderColor: '#CBD5E1',
    borderRadius: 6,
  },
  selectTriggerOpen: {
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
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
    ...(Platform.OS === 'web' ? {
      outlineStyle: 'none',
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
  // Dùng cho Mobile (React Native)
  selectDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    minWidth: 260,
    maxHeight: 240,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
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
    marginBottom: 4,
    ...(Platform.OS !== 'web' ? { shadowOffset: { width: 0, height: -4 } } : {}),
  },
  selectDropdownScroll: {
    maxHeight: 235,
  },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  selectOptionCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  selectOptionText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  selectEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
    padding: 10,
    textAlign: 'center',
  },
});
