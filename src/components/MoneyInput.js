// meat-management-fe/src/components/MoneyInput.js
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, TextInput, Platform, Pressable } from 'react-native';
import { COLORS } from '../theme';

/**
 * Component MoneyInput:
 * Tự động gắn đuôi ".000" mặc định cho các ô nhập tiền VNĐ.
 * Đuôi ".000" nằm trực tiếp trong chuỗi hiển thị của ô nhập -> 100% không bị hở khoảng trắng.
 * Con trỏ chuột nằm tự nhiên ở phần số người dùng nhập (trước .000).
 * Tự động đồng bộ vị trí thêm/xóa số, không bao giờ bị nhảy thêm đuôi 3 số 0 sau mỗi lần gõ.
 */
const MoneyInput = ({
  value,            // Số VNĐ (number: 130000) hoặc chuỗi nghìn/chuỗi VNĐ
  onChangeValue,    // Callback nhận giá trị VNĐ thực (number: 130000)
  onChangeText,     // Callback nhận chuỗi VNĐ đầy đủ (string: "130.000")
  placeholder = '0',
  style,
  inputStyle,
  suffixStyle,
  disabled = false,
  error = false,
  textAlign = 'left',
  ...props
}) => {
  const inputRef = useRef(null);

  // Chuyển đổi input value thành thông tin hiển thị (hỗ trợ cả tròn nghìn và số lẻ chính xác)
  const parseValue = (val) => {
    if (val === undefined || val === null || val === '') return { raw: '', isOdd: false, fullText: '' };
    const clean = String(val).replace(/[^0-9]/g, '');
    if (!clean) return { raw: '', isOdd: false, fullText: '' };
    const num = parseInt(clean, 10);
    if (isNaN(num) || num === 0) return { raw: '', isOdd: false, fullText: '' };
    if (num % 1000 !== 0) {
      return {
        raw: '',
        isOdd: true,
        fullText: new Intl.NumberFormat('vi-VN').format(num),
      };
    }
    const thousands = num >= 1000 ? Math.floor(num / 1000) : num;
    return {
      raw: String(thousands),
      isOdd: false,
      fullText: '',
    };
  };

  const initialParsed = parseValue(value);
  const [parsed, setParsed] = useState(() => initialParsed);
  const rawRef = useRef(initialParsed.raw);

  useEffect(() => {
    const p = parseValue(value);
    setParsed(p);
    rawRef.current = p.raw;
  }, [value]);

  const handleChangeText = (text) => {
    const newDigs = text.replace(/[^0-9]/g, '');
    if (!newDigs) {
      rawRef.current = '';
      setParsed({ raw: '', isOdd: false, fullText: '' });
      if (onChangeValue) onChangeValue(0);
      if (onChangeText) onChangeText('');
      return;
    }

    const prevRaw = rawRef.current;
    const prevFullDigs = prevRaw ? String(parseInt(prevRaw, 10) * 1000) : '';
    let newRaw = '';

    if (!prevFullDigs) {
      newRaw = newDigs;
    } else if (prevFullDigs.length - newDigs.length > 1) {
      // Người dùng bôi đen nhiều ký tự hoặc chọn toàn bộ rồi gõ đè số mới
      newRaw = newDigs;
    } else if (newDigs.length > prevFullDigs.length) {
      // Thêm ký tự: xác định vị trí thêm so với prevFullDigs
      let i = 0;
      while (i < prevFullDigs.length && prevFullDigs[i] === newDigs[i]) i++;
      const addedDigit = newDigs[i] || newDigs[newDigs.length - 1];
      newRaw = i < prevRaw.length
        ? prevRaw.slice(0, i) + addedDigit + prevRaw.slice(i)
        : prevRaw + addedDigit;
    } else if (newDigs.length < prevFullDigs.length) {
      // Xóa ký tự: xác định vị trí xóa
      let i = 0;
      while (i < newDigs.length && newDigs[i] === prevFullDigs[i]) i++;
      newRaw = i < prevRaw.length
        ? prevRaw.slice(0, i) + prevRaw.slice(i + 1)
        : prevRaw.slice(0, -1);
    } else {
      // Thay thế ký tự cùng độ dài
      let i = 0;
      while (i < newDigs.length && newDigs[i] === prevFullDigs[i]) i++;
      newRaw = (i < prevRaw.length && i < newDigs.length)
        ? prevRaw.slice(0, i) + newDigs[i] + prevRaw.slice(i + 1)
        : prevRaw;
    }

    rawRef.current = newRaw;
    const numThousands = parseInt(newRaw, 10) || 0;
    const formattedThousands = numThousands > 0 ? new Intl.NumberFormat('vi-VN').format(numThousands) : '';
    const numericVND = numThousands * 1000;
    const formattedVND = numThousands > 0 ? new Intl.NumberFormat('vi-VN').format(numericVND) : '';

    setParsed({
      raw: newRaw,
      isOdd: false,
      fullText: '',
    });

    if (Platform.OS === 'web') {
      const newPos = formattedThousands.length;
      requestAnimationFrame(() => {
        try {
          const el = inputRef.current;
          const domInput = el?.tagName === 'INPUT' ? el : (el?.querySelector?.('input') || el);
          if (domInput && typeof domInput.setSelectionRange === 'function') {
            domInput.setSelectionRange(newPos, newPos);
          }
        } catch (_) {}
      });
    }

    if (onChangeValue) onChangeValue(numericVND);
    if (onChangeText) onChangeText(formattedVND);
  };

  const displayValue = parsed.isOdd
    ? parsed.fullText
    : (parsed.raw ? `${new Intl.NumberFormat('vi-VN').format(parseInt(parsed.raw, 10) || 0)}.000` : '');

  // Lấy thuộc tính kiểu dáng để tách riêng cho Container và TextInput
  const flatStyle = StyleSheet.flatten(style) || {};
  const flatInputStyle = StyleSheet.flatten(inputStyle) || {};

  const fontSize = flatInputStyle.fontSize || flatStyle.fontSize || 16;
  const fontWeight = flatInputStyle.fontWeight || flatStyle.fontWeight || '600';
  const textColor = flatInputStyle.color || flatStyle.color || COLORS.text || '#0F172A';

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={[
        styles.container,
        {
          height: flatStyle.height || flatInputStyle.height || 44,
          backgroundColor: flatStyle.backgroundColor || flatInputStyle.backgroundColor || COLORS.inputBg || '#F8FAFC',
          borderRadius: flatStyle.borderRadius !== undefined ? flatStyle.borderRadius : (flatInputStyle.borderRadius !== undefined ? flatInputStyle.borderRadius : 10),
          borderWidth: flatStyle.borderWidth !== undefined ? flatStyle.borderWidth : (flatInputStyle.borderWidth !== undefined ? flatInputStyle.borderWidth : 1),
          borderColor: error
            ? (COLORS.danger || '#EF4444')
            : (flatStyle.borderColor || flatInputStyle.borderColor || COLORS.border || '#E2E8F0'),
          paddingHorizontal: flatStyle.paddingHorizontal !== undefined ? flatStyle.paddingHorizontal : (flatInputStyle.paddingHorizontal !== undefined ? flatInputStyle.paddingHorizontal : 10),
          justifyContent: textAlign === 'right' ? 'flex-end' : 'flex-start',
          cursor: 'text',
        },
        style,
      ]}
    >
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          {
            fontSize,
            fontWeight,
            color: textColor,
            textAlign: textAlign === 'right' ? 'right' : 'left',
            width: '100%',
            height: '100%',
          },
        ]}
        value={displayValue}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textLight || '#94A3B8'}
        keyboardType="number-pad"
        editable={!disabled}
        selectTextOnFocus={true}
        onFocus={(e) => {
          if (Platform.OS === 'web' && e?.target?.select) {
            try {
              e.target.select();
            } catch (_) {}
          }
          if (props.onFocus) props.onFocus(e);
        }}
        {...props}
      />
    </Pressable>
  );
};

export default MoneyInput;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    boxSizing: 'border-box',
  },
  input: {
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    outlineWidth: 0,
    outlineColor: 'transparent',
    outlineStyle: 'none',
    shadowOpacity: 0,
    height: '100%',
    flex: 1,
  },
});
