// meat-management-fe/src/utils/lunarCalendar.js
/**
 * Tiện ích chuyển đổi Dương lịch sang Âm lịch Việt Nam (Múi giờ GMT+7)
 * Dựa trên thuật toán thiên văn học của Hồ Ngọc Đức (Jean Meeus "Astronomical Algorithms")
 */

const PI = Math.PI;

function INT(d) {
  return Math.floor(d);
}

/**
 * Tính số ngày Julius từ ngày Dương lịch dd/mm/yyyy
 */
function jdFromDate(dd, mm, yy) {
  let a = INT((14 - mm) / 12);
  let y = yy + 4800 - a;
  let m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  }
  return jd;
}

/**
 * Tính thời điểm trăng mới (sóc) thứ k
 */
function NewMoon(k) {
  let T = k / 1236.85;
  let T2 = T * T;
  let T3 = T2 * T;
  let dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  let M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  let Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  let F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  let deltat;
  if (T < -11) {
    deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
  } else {
    deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
  }
  return Jd1 + C1 - deltat;
}

/**
 * Tính kinh độ mặt trời
 */
function SunLongitude(jdn) {
  let T = (jdn - 2451545.0) / 36525;
  let T2 = T * T;
  let dr = PI / 180;
  let M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  let L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  let L = L0 + DL;
  L = L * dr;
  L = L - PI * 2 * INT(L / (PI * 2));
  return L;
}

function getSunLongitude(dayNumber, timeZone) {
  return INT((SunLongitude(dayNumber - 0.5 - timeZone / 24) / PI) * 6);
}

function getNewMoonDay(k, timeZone) {
  return INT(NewMoon(k) + 0.5 + timeZone / 24);
}

function getLunarMonth11(yy, timeZone) {
  let off = jdFromDate(31, 12, yy) - 2415021;
  let k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  let sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone);
  }
  return nm;
}

function getLeapMonthOffset(a11, timeZone) {
  let k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
}

/**
 * Chuyển đổi ngày Dương lịch sang Âm lịch Việt Nam
 * @param {number} dd - Ngày
 * @param {number} mm - Tháng (1 - 12)
 * @param {number} yy - Năm (Dương lịch)
 * @param {number} [timeZone=7] - Múi giờ (mặc định GMT+7)
 * @returns {[number, number, number, number]} [lunarDay, lunarMonth, lunarYear, lunarLeap]
 */
export function convertSolar2Lunar(dd, mm, yy, timeZone = 7) {
  let dayNumber = jdFromDate(dd, mm, yy);
  let k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone);
  }
  let a11 = getLunarMonth11(yy, timeZone);
  let b11 = a11;
  let lunarYear;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = getLunarMonth11(yy - 1, timeZone);
  } else {
    lunarYear = yy + 1;
    b11 = getLunarMonth11(yy + 1, timeZone);
  }
  let lunarDay = dayNumber - monthStart + 1;
  let diff = INT((monthStart - a11) / 29);
  let lunarLeap = 0;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    let leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) {
        lunarLeap = 1;
      }
    }
  }
  if (lunarMonth > 12) {
    lunarMonth = lunarMonth - 12;
  }
  if (lunarMonth >= 11 && diff < 4) {
    lunarYear -= 1;
  }
  return [lunarDay, lunarMonth, lunarYear, lunarLeap];
}

/**
 * Trích xuất ngày, tháng, năm từ nhiều định dạng đầu vào khác nhau
 * @param {Date|string|number} dateInput - Đối tượng Date, chuỗi ISO, chuỗi DD/MM/YYYY, chuỗi YYYY-MM-DD
 * @returns {{ day: number, month: number, year: number } | null}
 */
export function parseDateInput(dateInput) {
  if (!dateInput) return null;

  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return null;
    return {
      day: dateInput.getDate(),
      month: dateInput.getMonth() + 1,
      year: dateInput.getFullYear(),
    };
  }

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();

    // Định dạng DD/MM/YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmyMatch) {
      return {
        day: parseInt(dmyMatch[1], 10),
        month: parseInt(dmyMatch[2], 10),
        year: parseInt(dmyMatch[3], 10),
      };
    }

    // Định dạng YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymdMatch) {
      return {
        day: parseInt(ymdMatch[3], 10),
        month: parseInt(ymdMatch[2], 10),
        year: parseInt(ymdMatch[1], 10),
      };
    }

    // Parse dạng Date chuẩn
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return {
        day: parsed.getDate(),
        month: parsed.getMonth() + 1,
        year: parsed.getFullYear(),
      };
    }
  }

  return null;
}

/**
 * Lấy đối tượng thông tin ngày Âm lịch từ ngày Dương lịch
 * @param {Date|string|number} dateInput
 * @returns {{ day: number, month: number, year: number, isLeap: boolean } | null}
 */
export function getLunarDate(dateInput) {
  const parsed = parseDateInput(dateInput);
  if (!parsed) return null;
  const [lunarDay, lunarMonth, lunarYear, lunarLeap] = convertSolar2Lunar(parsed.day, parsed.month, parsed.year, 7);
  return {
    day: lunarDay,
    month: lunarMonth,
    year: lunarYear,
    isLeap: lunarLeap === 1,
  };
}

/**
 * Lấy chuỗi hiển thị ngày Âm lịch ngắn gọn (Ví dụ: "17/8" hoặc "17/8N" nếu tháng nhuận)
 * @param {Date|string|number} dateInput
 * @returns {string}
 */
export function getLunarDateString(dateInput) {
  const lunar = getLunarDate(dateInput);
  if (!lunar) return '';
  const leapSuffix = lunar.isLeap ? 'N' : '';
  return `${lunar.day}/${lunar.month}${leapSuffix}`;
}

/**
 * Lấy chuỗi hiển thị ngày Âm lịch kèm nhãn (Ví dụ: "(ÂL: 17/8)")
 * @param {Date|string|number} dateInput
 * @returns {string}
 */
export function getLunarDisplayTag(dateInput) {
  const str = getLunarDateString(dateInput);
  if (!str) return '';
  return `(ÂL: ${str})`;
}
