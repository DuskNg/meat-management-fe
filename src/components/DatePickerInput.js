// meat-management-fe/src/components/DatePickerInput.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
  Modal,
} from 'react-native';
import { COLORS, FONTS } from '../theme';

// Import DateTimePicker chỉ cho mobile (iOS / Android)
let DateTimePicker = null;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

// ─── Các hàm tiện ích chuyển đổi định dạng ngày ──────────────────────────────

/**
 * Chuyển Date object → chuỗi hiển thị "DD/MM/YYYY"
 */
const formatDateToDisplay = (date) => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

/**
 * Chuyển Date object → chuỗi "YYYY-MM-DD" dùng cho HTML input[type=date]
 */
const formatDateToISO = (date) => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
};

/**
 * Chuyển chuỗi "YYYY-MM-DD" từ HTML input → Date object
 */
const parseISOToDate = (isoStr) => {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Chuyển chuỗi hiển thị "DD/MM/YYYY" → Date object
 */
const parseDisplayToDate = (displayStr) => {
  if (!displayStr) return new Date();
  const parts = displayStr.split('/');
  if (parts.length !== 3) return new Date();
  const [d, m, y] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? new Date() : date;
};

/**
 * Lấy tên thứ trong tuần bằng tiếng Việt
 */
const getWeekdayVi = (date) => {
  const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return days[date.getDay()];
};

/**
 * Chuyển đổi linh hoạt giá trị ngày bất kỳ thành đối tượng Date
 */
const convertToDateObj = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val !== 'string') return null;
  
  // Dạng YYYY-MM-DD
  if (val.includes('-')) {
    const parts = val.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      return new Date(y, m - 1, d);
    }
  }
  // Dạng DD/MM/YYYY
  if (val.includes('/')) {
    const parts = val.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      return new Date(y, m - 1, d);
    }
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// ─── Inline CSS inject cho web (chỉ chạy 1 lần) ─────────────────────────────
let webStyleInjected = false;
const injectWebStyles = () => {
  if (webStyleInjected || Platform.OS !== 'web') return;
  webStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .date-picker-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font-size: 16px;
      font-weight: 600;
      color: #0F172A;
      font-family: inherit;
      cursor: pointer;
      min-width: 0;
    }
    .date-picker-input::-webkit-calendar-picker-indicator {
      opacity: 0;
      position: absolute;
      right: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Component chọn ngày xuyên nền tảng — thiết kế đồng nhất với design system.
 *
 * Props:
 *   - value:    string, định dạng "DD/MM/YYYY"
 *   - onChange: function(newDateStr: string) => void
 *   - label:    string (tuỳ chọn), nhãn hiển thị bên trên
 */
const DatePickerInput = ({
  value,
  onChange,
  allowFuture = false,
  disabled = false,
  minDate = null,
  maxDate = null,
}) => {
  // Trạng thái mở/đóng picker trên mobile (cho lịch native thông thường)
  const [showPicker, setShowPicker] = useState(false);
  // Trạng thái mở/đóng picker lưới lịch Grid custom (cho tháng bị giới hạn)
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  // Trạng thái hover/press để đổi màu viền
  const [pressed, setPressed] = useState(false);

  // Chuyển chuỗi hiển thị thành Date object
  const parsedDate = parseDisplayToDate(value);

  // Tên thứ trong tuần bằng tiếng Việt
  const weekday = getWeekdayVi(parsedDate);

  // Chuẩn hóa minDate và maxDate sang đối tượng Date
  const parsedMinDate = convertToDateObj(minDate);
  const parsedMaxDate = convertToDateObj(maxDate) || (allowFuture ? null : new Date());

  // Kiểm tra xem có giới hạn trong phạm vi duy nhất 1 tháng hay không
  const isSingleMonthLimit = parsedMinDate && parsedMaxDate &&
    parsedMinDate.getMonth() === parsedMaxDate.getMonth() &&
    parsedMinDate.getFullYear() === parsedMaxDate.getFullYear();

  // Tính toán lưới lịch Grid custom cho tháng đó
  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0: CN, 1: T2, ..., 6: T7
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // startOffset để căn ngày mùng 1 vào đúng thứ trong tuần (T2 ở đầu, CN ở cuối)
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const cells = [];
  // Thêm các ô trống đầu tháng
  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: null, key: `empty-${i}` });
  }
  // Thêm các ngày của tháng
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, key: `day-${d}` });
  }

  // Xử lý khi mobile picker thay đổi (cho trường hợp lịch native)
  const handleMobileChange = (event, selectedDate) => {
    setShowPicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      onChange(formatDateToDisplay(selectedDate));
    }
  };

  // Xử lý sự kiện nhấn vào trường chọn ngày
  const handlePressInput = () => {
    if (disabled) return;
    if (isSingleMonthLimit) {
      setShowCustomPicker(true);
    } else {
      if (Platform.OS !== 'web') {
        setShowPicker(true);
      }
    }
  };

  const renderInputBody = () => {
    return (
      <TouchableOpacity
        style={[
          styles.container,
          disabled && styles.containerDisabled,
          (pressed || showPicker || showCustomPicker) && !disabled && styles.containerFocused
        ]}
        onPress={handlePressInput}
        onPressIn={() => !disabled && setPressed(true)}
        onPressOut={() => setPressed(false)}
        activeOpacity={disabled ? 1 : 0.8}
        disabled={disabled || (Platform.OS === 'web' && !isSingleMonthLimit)}
      >
        {/* Icon lịch bên trái */}
        <View style={styles.iconWrapper}>
          <Text style={styles.icon}>📅</Text>
        </View>

        {/* Phần nội dung ngày */}
        <View style={styles.dateContent}>
          <Text style={styles.weekdayText}>{weekday}</Text>
          <Text style={styles.dateDisplayText}>{value || formatDateToDisplay(new Date())}</Text>
        </View>

        {/* Nhãn "Đổi ngày" / "Cố định" */}
        {disabled ? (
          <View style={[styles.changeTag, styles.disabledTag]}>
            <Text style={[styles.changeTagText, styles.disabledTagText]}>Cố định 🔒</Text>
          </View>
        ) : (
          <View style={styles.changeTag}>
            <Text style={styles.changeTagText}>Đổi ngày</Text>
          </View>
        )}

        {/* HTML date input cho Web (chỉ khi không có giới hạn 1 tháng cụ thể) */}
        {Platform.OS === 'web' && !isSingleMonthLimit && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
            <input
              className="date-picker-input"
              type="date"
              disabled={disabled}
              value={formatDateToISO(parsedDate)}
              min={parsedMinDate ? formatDateToISO(parsedMinDate) : undefined}
              max={parsedMaxDate ? formatDateToISO(parsedMaxDate) : undefined}
              onChange={(e) => {
                if (e.target.value) {
                  const date = parseISOToDate(e.target.value);
                  if (parsedMinDate && date < parsedMinDate) return;
                  if (parsedMaxDate && date > parsedMaxDate) return;
                  onChange(formatDateToDisplay(date));
                }
              }}
              onFocus={() => !disabled && setPressed(true)}
              onBlur={() => setPressed(false)}
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                opacity: 0,
                width: '100%',
                height: '100%',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View>
      {renderInputBody()}

      {/* Lịch Grid chọn ngày custom tự chế (Chỉ khi giới hạn 1 tháng duy nhất) */}
      {isSingleMonthLimit && (
        <Modal
          visible={showCustomPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowCustomPicker(false)}
        >
          <TouchableOpacity
            style={styles.customBackdrop}
            activeOpacity={1}
            onPress={() => setShowCustomPicker(false)}
          >
            <TouchableOpacity
              style={styles.customModalView}
              activeOpacity={1}
            >
              {/* Header */}
              <View style={styles.customModalHeader}>
                <Text style={styles.customModalTitle}>Chọn ngày trong {value.substring(3)}</Text>
                <TouchableOpacity
                  style={styles.customCloseBtn}
                  onPress={() => setShowCustomPicker(false)}
                >
                  <Text style={styles.customCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Lịch grid */}
              <View style={styles.calendarGrid}>
                {/* Thứ trong tuần */}
                <View style={styles.weekdayRow}>
                  {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w) => (
                    <Text key={w} style={styles.weekdayGridText}>{w}</Text>
                  ))}
                </View>

                {/* Lưới các ô ngày */}
                <View style={styles.daysGrid}>
                  {cells.map((cell) => {
                    if (!cell.day) {
                      return <View key={cell.key} style={styles.gridCellEmpty} />;
                    }

                    const isSelected = parsedDate.getDate() === cell.day;
                    const cellDate = new Date(year, month, cell.day);

                    // Kiểm tra xem ngày có nằm ngoài giới hạn min/max hay không (dự phòng)
                    let isCellDisabled = false;
                    if (parsedMinDate && cellDate < parsedMinDate) isCellDisabled = true;
                    if (parsedMaxDate && cellDate > parsedMaxDate) isCellDisabled = true;

                    return (
                      <TouchableOpacity
                        key={cell.key}
                        style={[
                          styles.gridCellDay,
                          isSelected && styles.gridCellSelected,
                          isCellDisabled && styles.gridCellDisabled
                        ]}
                        disabled={isCellDisabled}
                        onPress={() => {
                          onChange(formatDateToDisplay(cellDate));
                          setShowCustomPicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.gridCellText,
                          isSelected && styles.gridCellTextSelected,
                          isCellDisabled && styles.gridCellTextDisabled
                        ]}>
                          {cell.day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Native calendar picker (Chỉ khi không giới hạn tháng duy nhất) */}
      {!isSingleMonthLimit && showPicker && DateTimePicker && (
        <DateTimePicker
          value={parsedDate}
          mode="date"
          display="default"
          minimumDate={parsedMinDate || undefined}
          maximumDate={parsedMaxDate || undefined}
          onChange={handleMobileChange}
          locale="vi-VN"
        />
      )}
    </View>
  );
};

export default DatePickerInput;

const styles = StyleSheet.create({
  // Container chính — giống style input trong app (đã thu gọn chiều cao)
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  // Viền đổi màu khi đang focus/pressed
  containerFocused: {
    borderColor: COLORS.danger,
    backgroundColor: '#FFF5F5',
  },
  // Style cho trạng thái disabled
  containerDisabled: {
    backgroundColor: '#F1F5F9', // Xám nhạt Slate 100
    borderColor: '#E2E8F0', // Viền xám nhạt Slate 200
  },

  // Vùng icon lịch bên trái (thu nhỏ kích thước)
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEE2E2', // Nền đỏ nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  icon: {
    fontSize: 16,
  },

  // Vùng hiển thị thứ + ngày (thu gọn font size)
  dateContent: {
    flex: 1,
    justifyContent: 'center',
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 0,
  },
  dateDisplayText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    letterSpacing: 0.5,
  },

  // Tag "Đổi ngày" bên phải (thu nhỏ padding và text)
  changeTag: {
    backgroundColor: COLORS.dangerLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  changeTagText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  // Tag cố định khi disabled
  disabledTag: {
    backgroundColor: '#E2E8F0',
    borderColor: '#CBD5E1',
  },
  disabledTagText: {
    color: '#64748B',
  },
  // Modal chọn ngày Grid custom tự chế
  customBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customModalView: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    width: 320,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  customModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
  },
  customModalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  customCloseBtn: {
    padding: 4,
  },
  customCloseText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  calendarGrid: {
    width: '100%',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayGridText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCellEmpty: {
    width: '14.28%',
    height: 40,
  },
  gridCellDay: {
    width: '14.28%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCellSelected: {
    backgroundColor: COLORS.danger,
    borderRadius: 20,
  },
  gridCellDisabled: {
    opacity: 0.3,
  },
  gridCellText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  gridCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  gridCellTextDisabled: {
    color: COLORS.textLight,
  },
});
