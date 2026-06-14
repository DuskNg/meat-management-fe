// meat-management-fe/src/components/DatePickerInput.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
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
const DatePickerInput = ({ value, onChange }) => {
  // Trạng thái mở/đóng picker trên mobile
  const [showPicker, setShowPicker] = useState(false);
  // Trạng thái hover/press để đổi màu viền
  const [pressed, setPressed] = useState(false);

  // Chuyển chuỗi hiển thị thành Date object
  const parsedDate = parseDisplayToDate(value);

  // Tên thứ trong tuần bằng tiếng Việt
  const weekday = getWeekdayVi(parsedDate);

  // Xử lý khi mobile picker thay đổi
  const handleMobileChange = (event, selectedDate) => {
    setShowPicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      onChange(formatDateToDisplay(selectedDate));
    }
  };

  // ─── Giao diện Web ────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    injectWebStyles();
    return (
      <View style={[styles.container, pressed && styles.containerFocused]}>
        {/* Icon lịch bên trái */}
        <View style={styles.iconWrapper}>
          <Text style={styles.icon}>📅</Text>
        </View>

        {/* Phần nội dung ngày */}
        <View style={styles.dateContent}>
          <Text style={styles.weekdayText}>{weekday}</Text>
          <Text style={styles.dateDisplayText}>{value || formatDateToDisplay(new Date())}</Text>
        </View>

        {/* Nhãn "Thay đổi" bên phải */}
        <View style={styles.changeTag}>
          <Text style={styles.changeTagText}>Đổi ngày</Text>
        </View>

        {/* HTML date input phủ toàn bộ container, ẩn giao diện mặc định */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <input
            className="date-picker-input"
            type="date"
            value={formatDateToISO(parsedDate)}
            max={formatDateToISO(new Date())} // Chặn chọn ngày tương lai
            onChange={(e) => {
              if (e.target.value) {
                const date = parseISOToDate(e.target.value);
                onChange(formatDateToDisplay(date));
              }
            }}
            onFocus={() => setPressed(true)}
            onBlur={() => setPressed(false)}
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              opacity: 0,
              width: '100%',
              height: '100%',
              cursor: 'pointer',
            }}
          />
        </View>
      </View>
    );
  }

  // ─── Giao diện Mobile (iOS / Android) ────────────────────────────────────
  return (
    <View>
      <TouchableOpacity
        style={[styles.container, (pressed || showPicker) && styles.containerFocused]}
        onPress={() => setShowPicker(true)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        activeOpacity={0.8}
      >
        {/* Icon lịch */}
        <View style={styles.iconWrapper}>
          <Text style={styles.icon}>📅</Text>
        </View>

        {/* Nội dung ngày */}
        <View style={styles.dateContent}>
          <Text style={styles.weekdayText}>{weekday}</Text>
          <Text style={styles.dateDisplayText}>{value || formatDateToDisplay(new Date())}</Text>
        </View>

        {/* Nhãn "Đổi ngày" */}
        <View style={styles.changeTag}>
          <Text style={styles.changeTagText}>Đổi ngày</Text>
        </View>
      </TouchableOpacity>

      {/* Native calendar picker */}
      {showPicker && DateTimePicker ? (
        <DateTimePicker
          value={parsedDate}
          mode="date"
          display="default"
          maximumDate={new Date()} // Không cho chọn ngày tương lai
          onChange={handleMobileChange}
          locale="vi-VN"
        />
      ) : null}
    </View>
  );
};

export default DatePickerInput;

const styles = StyleSheet.create({
  // Container chính — giống style input trong app
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    height: 64,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  // Viền đổi màu khi đang focus/pressed
  containerFocused: {
    borderColor: COLORS.danger,
    backgroundColor: '#FFF5F5',
  },

  // Vùng icon lịch bên trái
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FEE2E2', // Nền đỏ nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },

  // Vùng hiển thị thứ + ngày
  dateContent: {
    flex: 1,
    justifyContent: 'center',
  },
  weekdayText: {
    fontSize: FONTS.caption,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 1,
  },
  dateDisplayText: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    color: COLORS.text,
    letterSpacing: 0.5,
  },

  // Tag "Đổi ngày" bên phải
  changeTag: {
    backgroundColor: COLORS.dangerLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  changeTagText: {
    fontSize: FONTS.caption,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
});
