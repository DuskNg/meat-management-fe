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

/**
 * Chuyển đối tượng Date thành chuỗi "DD/MM/YYYY"
 */
const formatDateToDisplay = (date) => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

/**
 * Chuyển đối tượng Date thành chuỗi "YYYY-MM-DD" (dùng cho HTML input[type=date])
 */
const formatDateToISO = (date) => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
};

/**
 * Chuyển chuỗi "YYYY-MM-DD" từ HTML input thành Date object
 */
const parseISOToDate = (isoStr) => {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Component chọn ngày xuyên nền tảng:
 * - Mobile (iOS/Android): hiển thị native DateTimePicker khi bấm
 * - Web: hiển thị HTML input[type="date"] native của trình duyệt
 *
 * Props:
 *   - value: string, định dạng "DD/MM/YYYY"
 *   - onChange: function(newDateStr: string) => void
 */
const DatePickerInput = ({ value, onChange }) => {
  // Trạng thái mở/đóng picker chỉ dùng trên mobile
  const [showPicker, setShowPicker] = useState(false);

  // Chuyển chuỗi hiển thị "DD/MM/YYYY" → Date object để truyền cho picker
  const parsedDate = (() => {
    if (!value) return new Date();
    const parts = value.split('/');
    if (parts.length !== 3) return new Date();
    const [d, m, y] = parts.map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? new Date() : date;
  })();

  // Xử lý khi người dùng chọn ngày trên mobile picker
  const handleMobileChange = (event, selectedDate) => {
    setShowPicker(false); // Đóng picker sau khi chọn
    if (event.type === 'dismissed') return; // Người dùng bấm cancel
    if (selectedDate) {
      onChange(formatDateToDisplay(selectedDate));
    }
  };

  // ─── Giao diện cho WEB ───────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <Text style={styles.webCalendarIcon}>📅</Text>
        <input
          type="date"
          value={formatDateToISO(parsedDate)}
          onChange={(e) => {
            if (e.target.value) {
              const date = parseISOToDate(e.target.value);
              onChange(formatDateToDisplay(date));
            }
          }}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: FONTS.body,
            color: COLORS.text,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        />
      </View>
    );
  }

  // ─── Giao diện cho MOBILE (iOS / Android) ────────────────────────────────
  return (
    <View>
      {/* Nút bấm hiển thị ngày hiện tại, bấm để mở picker */}
      <TouchableOpacity
        style={styles.mobileButton}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.calendarIcon}>📅</Text>
        <Text style={styles.dateText}>{value || formatDateToDisplay(new Date())}</Text>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      {/* Native DateTimePicker xuất hiện khi showPicker = true */}
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
  // Nút bấm ngày trên mobile
  mobileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    height: 56,
    borderRadius: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  calendarIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  dateText: {
    flex: 1,
    fontSize: FONTS.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  chevron: {
    fontSize: 12,
    color: COLORS.textLight,
  },

  // Container cho web input
  webContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    height: 56,
    borderRadius: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  webCalendarIcon: {
    fontSize: 22,
    marginRight: 10,
  },
});
