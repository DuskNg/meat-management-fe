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
  } catch (_) {}
}

/**
 * Component CustomSelect dùng chung cho toàn bộ dự án:
 * - Hỗ trợ gõ tìm kiếm không dấu / tiếng Việt mượt mà.
 * - Trên Web: render dropdown qua Portal ra document.body → luôn đè lên tất cả giao diện (zIndex tối đa).
 * - Trên Mobile: dùng zIndex/elevation chuẩn React Native.
 * - Tự động nảy lên trên (Drop Up) khi không đủ khoảng trống phía dưới.
 * - Bấm lần 2 vào ô select để thu gọn menu.
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
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, isUp: false });
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  // ID portal riêng biệt cho mỗi instance tránh xung đột key
  const portalIdRef = useRef(`csp-${Math.random().toString(36).slice(2)}`);
  const portalElRef = useRef(null);

  // Nhãn hiển thị của mục đã chọn
  const valueLabel = value ? (renderSelected ? renderSelected(value) : getOptionLabel(value)) : '';

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
        if (portalElRef.current) portalElRef.current.style.pointerEvents = 'none';
        if (onOpenChange) onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open, onOpenChange]);

  // Cleanup: xóa DOM portal khi component bị unmount
  useEffect(() => {
    return () => {
      if (portalElRef.current && document.body.contains(portalElRef.current)) {
        document.body.removeChild(portalElRef.current);
        portalElRef.current = null;
      }
    };
  }, []);

  // Tính toán vị trí tuyệt đối của dropdown dựa trên vị trí trigger trên màn hình
  const measureAndOpen = useCallback(() => {
    if (Platform.OS !== 'web' || !dropdownRef.current) return;

    const rect = dropdownRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow = windowHeight - rect.bottom;

    // Quyết định nảy lên trên hay xuống dưới
    let shouldDropUp = dropUp !== undefined ? !!dropUp : (spaceBelow < 220 && rect.top > 220);

    setDropdownPos({
      top: shouldDropUp ? rect.top : rect.bottom,
      left: rect.left,
      width: rect.width,
      isUp: shouldDropUp,
    });
  }, [dropUp]);

  const toggleOpen = useCallback((nextOpen) => {
    if (nextOpen && !disabled) {
      measureAndOpen();
      setOpen(true);
      setSearch('');
      if (onOpenChange) onOpenChange(true);
    } else {
      setOpen(false);
      setSearch('');
      if (onOpenChange) onOpenChange(false);
    }
  }, [disabled, measureAndOpen, onOpenChange]);

  // Lọc danh sách tùy chọn dựa theo từ khóa tìm kiếm
  const filteredOptions = options.filter((opt) => {
    const label = getOptionLabel(opt);
    return matchSearch(label, search);
  });

  const handleSelectOption = (opt) => {
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

    // Mỗi instance CustomSelect có 1 container riêng → không bao giờ bị duplicate key
    if (!portalElRef.current) {
      const el = document.createElement('div');
      el.id = portalIdRef.current;
      el.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:999999;pointer-events:none;';
      document.body.appendChild(el);
      portalElRef.current = el;
    }
    // Bật pointer-events khi mở để có thể click vào option
    portalElRef.current.style.pointerEvents = 'auto';

    // Tính vị trí hiển thị dropdown cố định theo màn hình
    const dropStyle = {
      position: 'fixed',
      left: dropdownPos.left,
      width: Math.max(dropdownPos.width, 280),
      zIndex: 999999,
      backgroundColor: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: 8,
      boxShadow: '0px 4px 12px rgba(0,0,0,0.08)',
      overflow: 'hidden',
      maxHeight: 200,
    };

    if (dropdownPos.isUp) {
      dropStyle.bottom = window.innerHeight - dropdownPos.top + 4;
    } else {
      dropStyle.top = dropdownPos.top + 4;
    }

    return ReactDOM.createPortal(
      <div style={dropStyle}>
        {dropdownContent}
      </div>,
      portalElRef.current
    );
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
      {/* Ô bấm mở / thu gọn Dropdown */}
      <TouchableOpacity
        style={[
          styles.selectTrigger,
          compact && styles.selectTriggerCompact,
          open && styles.selectTriggerOpen,
          hasError && styles.selectTriggerError,
          disabled && styles.selectTriggerDisabled,
        ]}
        activeOpacity={0.85}
        onPress={() => {
          if (!disabled) {
            const nextOpen = !open;
            toggleOpen(nextOpen);
            if (nextOpen) {
              setTimeout(() => {
                inputRef.current?.focus();
              }, 50);
            } else {
              inputRef.current?.blur();
            }
          }
        }}
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
          pointerEvents={open ? 'auto' : 'none'}
          onChangeText={(text) => {
            setSearch(text);
            if (onInputChange) onInputChange(text);
          }}
          onSubmitEditing={() => toggleOpen(false)}
          blurOnSubmit={false}
        />
        <View style={styles.arrowContainer}>
          <Text style={styles.selectArrow}>{open ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

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
    paddingHorizontal: 10,
    height: 38,
    cursor: 'pointer',
  },
  selectTriggerCompact: {
    height: 28,
    paddingHorizontal: 6,
    borderColor: '#94A3B8',
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
  },
  selectTriggerInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  selectTriggerTextCompact: {
    fontSize: 12,
  },
  selectPlaceholder: {
    color: '#94A3B8',
    fontWeight: '400',
  },
  arrowContainer: {
    paddingLeft: 4,
    paddingVertical: 6,
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
    minWidth: 280,
    maxHeight: 200,
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
    maxHeight: 195,
  },
  selectOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    cursor: 'pointer',
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
