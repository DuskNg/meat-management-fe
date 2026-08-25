// meat-management-fe/src/components/CustomSelect.js
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { matchSearch } from '../utils/searchHelper';

/**
 * Component CustomSelect dùng chung cho toàn bộ dự án:
 * - Hỗ trợ gõ tìm kiếm không dấu / tiếng Việt mượt mà.
 * - Tự động đóng khi click ra ngoài trên giao diện Web.
 * - Xử lý mượt mà sự kiện bấm chọn mục (ngăn mousedown cướp sự kiện trên Web).
 */
const CustomSelect = ({
  value,
  placeholder = 'Chọn một mục...',
  options = [],
  onSelect,
  onInputChange,
  renderOption,
  renderSelected,
  getOptionLabel = (opt) => (typeof opt === 'string' ? opt : opt?.name || ''),
  style,
  compact = false,
  hasError = false,
  disabled = false,
  zIndex = 9999,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Nhãn hiển thị của mục đã chọn
  const valueLabel = value ? (renderSelected ? renderSelected(value) : getOptionLabel(value)) : '';

  // Lắng nghe sự kiện click ngoài ô select để tự động đóng dropdown trên Web
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;

    const closeOnOutsideClick = (event) => {
      // Nếu click bên ngoài container dropdown thì mới đóng
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  // Lọc danh sách tùy chọn dựa theo từ khóa tìm kiếm
  const filteredOptions = options.filter((opt) => {
    const label = getOptionLabel(opt);
    return matchSearch(label, search);
  });

  const handleSelectOption = (opt) => {
    onSelect(opt);
    setOpen(false);
    setSearch('');
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  return (
    <View
      ref={dropdownRef}
      style={[
        styles.selectWrapper,
        open && { zIndex: zIndex + 100, elevation: zIndex + 100 },
        style,
      ]}
    >
      {/* Nút bấm / Ô nhập liệu chính */}
      <View
        style={[
          styles.selectTrigger,
          compact && styles.selectTriggerCompact,
          open && styles.selectTriggerOpen,
          hasError && styles.selectTriggerError,
          disabled && styles.selectTriggerDisabled,
        ]}
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
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setSearch('');
            }
          }}
          onPressIn={() => {
            if (!disabled && !open) {
              setOpen(true);
              setSearch('');
            }
          }}
          onChangeText={(text) => {
            setSearch(text);
            if (onInputChange) onInputChange(text);
          }}
          onSubmitEditing={() => setOpen(false)}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={styles.arrowContainer}
          onPress={() => {
            if (!disabled) {
              const nextOpen = !open;
              setOpen(nextOpen);
              setSearch('');
              if (nextOpen && inputRef.current) {
                inputRef.current.focus();
              }
            }
          }}
          activeOpacity={0.7}
          disabled={disabled}
        >
          <Text style={styles.selectArrow}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>

      {/* Danh sách thả xuống Dropdown Menu */}
      {open && (
        <View style={[styles.selectDropdown, { zIndex, elevation: zIndex }]}>
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
                  // Ngăn mousedown cướp focus trên Web
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
        </View>
      )}
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
  },
  selectArrow: {
    fontSize: 10,
    color: '#94A3B8',
  },
  selectDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    minWidth: 190,
    maxHeight: 200,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    marginTop: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 25,
    boxShadow: '0px 10px 30px rgba(15, 23, 42, 0.22)',
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
