// src/hooks/useMoneyInput.js
// Hook quản lý ô nhập tiền VNĐ, tự động hiển thị ×1000 ngay khi gõ.
// Người dùng nhập theo đơn vị nghìn đồng (ví dụ gõ "130" → hiển thị "130.000").
import { useState, useRef, useCallback } from 'react';

// Định dạng số thành chuỗi có dấu chấm hàng nghìn (VD: 130000 → "130.000")
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);

/**
 * Hook quản lý input tiền VNĐ với tính năng auto ×1000 real-time.
 * 
 * Cơ chế: lưu trữ "raw string" (chuỗi số theo đơn vị nghìn đồng, VD: "130"),
 * hiển thị giá trị ×1000 đã format (VD: "130.000"). Khi so sánh vị trí thay đổi
 * giữa text mới và text cũ để xác định chính xác ký tự nào được thêm/xóa.
 *
 * @returns {{ display: string, valueVND: number, onChange: function, init: function }}
 */
export const useMoneyInput = () => {
  // rawRef: chuỗi số thuần (nghìn đồng), ví dụ "130" đại diện 130.000đ
  const rawRef = useRef('');
  const [display, setDisplay] = useState('');

  // Giá trị VNĐ thực để gửi API (rawStr × 1000)
  const getVND = useCallback(() => {
    return rawRef.current ? parseInt(rawRef.current, 10) * 1000 : 0;
  }, []);

  // Khởi tạo/reset giá trị từ VNĐ (dùng khi mở modal với giá trị sẵn có)
  const init = useCallback((vnd) => {
    const raw = vnd > 0 ? Math.round(vnd / 1000).toString() : '';
    rawRef.current = raw;
    setDisplay(raw ? fmt(parseInt(raw, 10) * 1000) : '');
  }, []);

  // Xử lý thay đổi từ TextInput: tính ngược rawStr từ text người dùng nhập
  const onChange = useCallback((newText) => {
    const newDigs = newText.replace(/[^0-9]/g, '');
    const prevRaw = rawRef.current;
    // prevFullDigs: chuỗi số của giá trị display hiện tại (VD: "130000" khi display="130.000")
    const prevFullDigs = prevRaw ? String(parseInt(prevRaw, 10) * 1000) : '';
    let newRaw;

    if (!newDigs) {
      // Người dùng xóa hết
      newRaw = '';
    } else if (!prevFullDigs) {
      // Ô trống → bắt đầu nhập mới, rawStr = chính xác những gì người dùng gõ
      newRaw = newDigs;
    } else if (newDigs.length > prevFullDigs.length) {
      // Thêm ký tự: tìm vị trí đầu tiên khác nhau để xác định ký tự được thêm
      let i = 0;
      while (i < prevFullDigs.length && prevFullDigs[i] === newDigs[i]) i++;
      const addedDigit = newDigs[i] || newDigs[newDigs.length - 1];
      if (i < prevRaw.length) {
        // Thêm vào giữa phần raw
        newRaw = prevRaw.slice(0, i) + addedDigit + prevRaw.slice(i);
      } else {
        // Thêm vào sau phần raw (kể cả thêm vào phần "000" trailing)
        newRaw = prevRaw + addedDigit;
      }
    } else if (newDigs.length < prevFullDigs.length) {
      // Xóa ký tự: tìm vị trí xóa
      let i = 0;
      while (i < newDigs.length && newDigs[i] === prevFullDigs[i]) i++;
      if (i < prevRaw.length) {
        // Xóa trong phần raw
        newRaw = prevRaw.slice(0, i) + prevRaw.slice(i + 1);
      } else {
        // Xóa trong phần trailing "000" → xóa ký tự cuối của raw
        newRaw = prevRaw.slice(0, -1);
      }
    } else {
      // Thay thế ký tự (cùng độ dài): tìm vị trí thay đổi
      let i = 0;
      while (i < newDigs.length && newDigs[i] === prevFullDigs[i]) i++;
      if (i < prevRaw.length && i < newDigs.length) {
        newRaw = prevRaw.slice(0, i) + newDigs[i] + prevRaw.slice(i + 1);
      } else {
        newRaw = prevRaw; // Không thay đổi
      }
    }

    rawRef.current = newRaw;
    setDisplay(newRaw ? fmt(parseInt(newRaw, 10) * 1000) : '');
  }, []);

  return {
    display,    // Chuỗi hiển thị trong TextInput (VD: "130.000")
    getVND,     // Hàm lấy giá trị VNĐ để gửi API
    onChange,   // Hàm onChangeText cho TextInput
    init,       // Hàm khởi tạo/reset với giá trị VNĐ
  };
};

/**
 * Hàm helper (không phải hook) để dùng trong render callback/loop (VD: render từng dòng bảng).
 * Dùng với useRef map để track rawStr theo từng dòng.
 *
 * @param {string} newText - Text mới từ TextInput
 * @param {string} prevRaw - Raw string trước đó (theo đơn vị nghìn đồng)
 * @returns {string} newRaw - Raw string mới
 */
export const applySmartMoneyChange = (newText, prevRaw) => {
  const newDigs = newText.replace(/[^0-9]/g, '');
  const prevFullDigs = prevRaw ? String(parseInt(prevRaw, 10) * 1000) : '';
  let newRaw;

  if (!newDigs) {
    newRaw = '';
  } else if (!prevFullDigs) {
    newRaw = newDigs;
  } else if (newDigs.length > prevFullDigs.length) {
    let i = 0;
    while (i < prevFullDigs.length && prevFullDigs[i] === newDigs[i]) i++;
    const addedDigit = newDigs[i] || newDigs[newDigs.length - 1];
    newRaw = i < prevRaw.length
      ? prevRaw.slice(0, i) + addedDigit + prevRaw.slice(i)
      : prevRaw + addedDigit;
  } else if (newDigs.length < prevFullDigs.length) {
    let i = 0;
    while (i < newDigs.length && newDigs[i] === prevFullDigs[i]) i++;
    newRaw = i < prevRaw.length
      ? prevRaw.slice(0, i) + prevRaw.slice(i + 1)
      : prevRaw.slice(0, -1);
  } else {
    let i = 0;
    while (i < newDigs.length && newDigs[i] === prevFullDigs[i]) i++;
    newRaw = i < prevRaw.length && i < newDigs.length
      ? prevRaw.slice(0, i) + newDigs[i] + prevRaw.slice(i + 1)
      : prevRaw;
  }

  return newRaw;
};

// Chuyển raw string (nghìn đồng) → chuỗi format display (VD: "130" → "130.000")
export const rawToDisplay = (raw) =>
  raw ? fmt(parseInt(raw, 10) * 1000) : '';

// Chuyển giá trị VNĐ → raw string (nghìn đồng) để init (VD: 130000 → "130")
export const vndToRaw = (vnd) =>
  vnd > 0 ? Math.round(vnd / 1000).toString() : '';
