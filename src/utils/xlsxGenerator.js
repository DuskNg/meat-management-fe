// meat-management-fe/src/utils/xlsxGenerator.js
// Bộ tạo tệp Excel (.xlsx chuẩn OpenXML) trực tiếp trên trình duyệt không cần thư viện ngoài, hỗ trợ thiết lập độ rộng cột (Auto-fit Column Width) và định dạng font/màu sắc/số tiền.

// Bảng tính CRC32 chuẩn cho định dạng ZIP
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

// Đóng gói danh sách file [{ name, content }] thành Uint8Array định dạng ZIP (Store method 0)
const buildZipArchive = (files) => {
  const encoder = new TextEncoder();
  const entries = files.map((f) => {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = typeof f.content === 'string' ? encoder.encode(f.content) : f.content;
    const crc = crc32(dataBytes);
    return {
      nameBytes,
      dataBytes,
      crc,
      size: dataBytes.length,
    };
  });

  let localTotalSize = 0;
  let centralTotalSize = 0;

  entries.forEach((e) => {
    localTotalSize += 30 + e.nameBytes.length + e.size;
    centralTotalSize += 46 + e.nameBytes.length;
  });

  const totalSize = localTotalSize + centralTotalSize + 22;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  let offset = 0;

  // 1. Ghi các Local File Headers + File Data
  entries.forEach((e) => {
    e.localOffset = offset;
    view.setUint32(offset, 0x04034b50, true); // Local file header signature
    view.setUint16(offset + 4, 20, true); // Version needed to extract (2.0)
    view.setUint16(offset + 6, 0x0800, true); // General purpose bit flag (UTF-8 filename)
    view.setUint16(offset + 8, 0, true); // Compression method (0 = Store)
    view.setUint16(offset + 10, 0, true); // File last modification time
    view.setUint16(offset + 12, 0x21, true); // File last modification date
    view.setUint32(offset + 14, e.crc, true); // CRC-32
    view.setUint32(offset + 18, e.size, true); // Compressed size
    view.setUint32(offset + 22, e.size, true); // Uncompressed size
    view.setUint16(offset + 26, e.nameBytes.length, true); // File name length
    view.setUint16(offset + 28, 0, true); // Extra field length
    offset += 30;

    out.set(e.nameBytes, offset);
    offset += e.nameBytes.length;

    out.set(e.dataBytes, offset);
    offset += e.size;
  });

  const centralDirOffset = offset;

  // 2. Ghi Central Directory Headers
  entries.forEach((e) => {
    view.setUint32(offset, 0x02014b50, true); // Central directory file header signature
    view.setUint16(offset + 4, 20, true); // Version made by
    view.setUint16(offset + 6, 20, true); // Version needed to extract
    view.setUint16(offset + 8, 0x0800, true); // General purpose bit flag (UTF-8)
    view.setUint16(offset + 10, 0, true); // Compression method (0 = Store)
    view.setUint16(offset + 12, 0, true); // Last mod file time
    view.setUint16(offset + 14, 0x21, true); // Last mod file date
    view.setUint32(offset + 16, e.crc, true); // CRC-32
    view.setUint32(offset + 20, e.size, true); // Compressed size
    view.setUint32(offset + 24, e.size, true); // Uncompressed size
    view.setUint16(offset + 28, e.nameBytes.length, true); // File name length
    view.setUint16(offset + 30, 0, true); // Extra field length
    view.setUint16(offset + 32, 0, true); // File comment length
    view.setUint16(offset + 34, 0, true); // Disk number start
    view.setUint16(offset + 36, 0, true); // Internal file attributes
    view.setUint32(offset + 38, 0, true); // External file attributes
    view.setUint32(offset + 42, e.localOffset, true); // Relative offset of local header
    offset += 46;

    out.set(e.nameBytes, offset);
    offset += e.nameBytes.length;
  });

  const centralDirSize = offset - centralDirOffset;

  // 3. Ghi End of Central Directory Record (EOCD)
  view.setUint32(offset, 0x06054b50, true); // EOCD signature
  view.setUint16(offset + 4, 0, true); // Number of this disk
  view.setUint16(offset + 6, 0, true); // Disk where central directory starts
  view.setUint16(offset + 8, entries.length, true); // Number of central directory records on this disk
  view.setUint16(offset + 10, entries.length, true); // Total number of central directory records
  view.setUint32(offset + 12, centralDirSize, true); // Size of central directory
  view.setUint32(offset + 16, centralDirOffset, true); // Offset of start of central directory
  view.setUint16(offset + 20, 0, true); // Comment length

  return out;
};

// Chuyển chỉ số cột (0-based) thành chữ cái cột Excel (0 -> A, 1 -> B, 10 -> K, 11 -> L...)
const getExcelColLetter = (colIndex) => {
  let temp;
  let letter = '';
  let idx = colIndex + 1;
  while (idx > 0) {
    temp = (idx - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    idx = (idx - temp - 1) / 26;
  }
  return letter;
};

// Escape ký tự đặc biệt trong XML
const escapeXml = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Tạo Blob file Excel (.xlsx) với độ rộng cột tự động căn chỉnh (Auto-fit Column Width)
 * Các mã style (styleIndex) hỗ trợ:
 * 0: Mặc định (Chữ thường, căn trái)
 * 1: Tiêu đề lớn báo cáo (In đậm, cỡ 13)
 * 2: Header bảng (In đậm, nền xám nhạt #F1F5F9, có viền)
 * 3: Ô dữ liệu chữ (Căn trái, có viền mảnh)
 * 4: Ô số lượng kg (Căn phải, có viền mảnh)
 * 5: Ô tiền tệ (Căn phải, định dạng #,##0 hiển thị dấu chấm đầy đủ số 0, có viền mảnh)
 * 6: Ô dòng TỔNG ngày - Nhãn (In đậm, nền #F8FAFC, có viền)
 * 7: Ô dòng TỔNG ngày - Số tiền (In đậm, căn phải, nền #F8FAFC, có viền)
 * 8: Ô Tổng kết Cột K - Nhãn thường (In đậm, có viền)
 * 9: Ô Tổng kết Cột L - Số tiền (In đậm, căn phải, có viền)
 * 10: Ô Còn lại phải thanh toán - Nhãn & Số tiền nổi bật (In đậm, chữ đỏ #DC2626, nền vàng nhạt #FEF2F2, có viền)
 * 11: Ô Ngày dương lịch (Căn giữa, in đậm, có viền mảnh)
 * 12: Ô Ngày âm lịch (Căn giữa, chữ nghiêng nhỏ, có viền mảnh)
 * 13: Ô Còn lại phải thanh toán - Nhãn Cột K (In đậm, chữ đỏ #DC2626, căn trái, nền #FEF2F2)
 * 14: Ô dữ liệu chữ cuối ngày (Căn trái, kẻ đường line đậm phân cách ngày ở đáy)
 * 15: Ô số lượng kg cuối ngày (Căn phải, kẻ đường line đậm phân cách ngày ở đáy)
 * 16: Ô tiền tệ cuối ngày (Căn phải, kẻ đường line đậm phân cách ngày ở đáy)
 * 17: Ô Ngày dương lịch cuối ngày (Căn giữa, in đậm, kẻ đường line đậm phân cách ngày ở đáy)
 * 18: Ô Ngày âm lịch cuối ngày (Căn giữa, chữ nghiêng, kẻ đường line đậm phân cách ngày ở đáy)
 * 19: Ô Ngày âm lịch rơi vào dòng TỔNG cuối ngày (Căn giữa, chữ nghiêng, nền #F8FAFC, kẻ đường line đậm ở đáy)
 * 20: Ô dòng TỔNG trung gian trong ngày - Nhãn (In đậm, nền #F8FAFC, viền mảnh)
 * 21: Ô dòng TỔNG trung gian trong ngày - Số tiền (In đậm, căn phải, nền #F8FAFC, viền mảnh)
 * 22: Ô dòng Tổng đơn từng cơ sở - Nhãn (In đậm xanh đậm #1E3A8A, nền #F8FAFC, viền phân cách cơ sở)
 * 23: Ô dòng Tổng đơn từng cơ sở - Số tiền (In đậm xanh đậm #1E3A8A, căn phải, nền #F8FAFC, viền phân cách cơ sở)
 * 24: Ô Ngày âm lịch rơi vào dòng Tổng đơn cơ sở (Chữ nghiêng, căn giữa, nền #F8FAFC, viền phân cách cơ sở)
 */
export const generateAutoFitXlsxBlob = ({
  sheetName = 'CongNo',
  rows = [],
  colWidths = [],
  autoFilterRef = null,
}) => {
  // Quét các ô trên Sheet 1 xem có chứa ảnh nhúng tại chỗ (commentImage) hoặc liên kết (hyperlink) hay không
  const cellHyperlinks = [];
  const cellCommentImages = [];

  rows.forEach((rowCells, rIdx) => {
    const rowNum = rIdx + 1;
    (rowCells || []).forEach((cell, cIdx) => {
      if (!cell || typeof cell !== 'object') return;
      const colRef = `${getExcelColLetter(cIdx)}${rowNum}`;
      if (cell.hyperlink) {
        cellHyperlinks.push({
          ref: colRef,
          url: String(cell.hyperlink),
          tooltip: cell.tooltip || 'Bấm để mở xem ảnh hóa đơn gốc',
        });
      }
      if (cell.commentImage && cell.commentImage.bytes) {
        cellCommentImages.push({
          ref: colRef,
          rIdx,
          cIdx,
          bytes: cell.commentImage.bytes,
          ext: cell.commentImage.ext === 'png' ? 'png' : 'jpeg',
        });
      }
    });
  });

  const hasHyperlinks = cellHyperlinks.length > 0;
  const hasCommentImages = cellCommentImages.length > 0;

  const vmlDefaultXml = hasCommentImages
    ? `\n  <Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>\n  <Default Extension="jpeg" ContentType="image/jpeg"/>\n  <Default Extension="jpg" ContentType="image/jpeg"/>\n  <Default Extension="png" ContentType="image/png"/>`
    : '';
  const commentsOverrideXml = hasCommentImages
    ? `\n  <Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`
    : '';

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>${vmlDefaultXml}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${commentsOverrideXml}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const safeSheetName = escapeXml(sheetName.substring(0, 31));

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/>
  </sheets>
  <calcPr fullCalcOnLoad="1"/>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Quét các ô có thuộc tính displayAs (ví dụ: hiển thị lịch âm "(22/9 âm)" nhưng giữ nguyên giá trị gốc là ngày dương "31/10" để lọc AutoFilter)
  const customNumFmts = [
    { id: 164, code: '#,##0' },
    { id: 165, code: ';;;' },
  ];
  const extraCellXfs = [];
  const displayAsStyleMap = new Map();
  let nextNumFmtId = 166;
  const baseXfCount = 29;

  rows.forEach((rowCells) => {
    (rowCells || []).forEach((cell) => {
      if (cell && typeof cell === 'object' && cell.displayAs) {
        const baseStyle = cell.s != null ? cell.s : 12;
        const mapKey = `${baseStyle}__${cell.displayAs}`;
        if (!displayAsStyleMap.has(mapKey)) {
          const fmtId = nextNumFmtId++;
          const safeCode = `;;;&quot;${escapeXml(cell.displayAs)}&quot;`;
          customNumFmts.push({ id: fmtId, code: safeCode });

          // Xác định borderId tương ứng với dòng hiện tại (0: thường, 2: cuối ngày, 3: Cộng đơn cơ sở)
          let borderId = 0;
          if (baseStyle === 17 || baseStyle === 18 || baseStyle === 19 || baseStyle === 6) {
            borderId = 2;
          } else if (baseStyle === 24 || baseStyle === 22) {
            borderId = 3;
          }
          const applyBorderAttr = borderId > 0 ? ' applyBorder="1"' : '';
          const xfXml = `    <xf numFmtId="${fmtId}" fontId="7" fillId="0" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1"${applyBorderAttr}/>`;
          const newStyleIdx = baseXfCount + extraCellXfs.length;
          extraCellXfs.push(xfXml);
          displayAsStyleMap.set(mapKey, newStyleIdx);
        }
      }
    });
  });

  const numFmtsXml = customNumFmts
    .map((f) => `    <numFmt numFmtId="${f.id}" formatCode="${f.code}"/>`)
    .join('\n');
  const extraXfsXml = extraCellXfs.length > 0 ? `\n${extraCellXfs.join('\n')}` : '';

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="${customNumFmts.length}">
${numFmtsXml}
  </numFmts>
  <fonts count="9">
    <font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
    <font><b/><sz val="12"/><color rgb="FF000000"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFDC2626"/><name val="Calibri"/></font>
    <font><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF047857"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF1E3A8A"/><name val="Calibri"/></font>
    <font><sz val="10.5"/><color rgb="FF475569"/><name val="Calibri"/></font>
    <font><b/><u/><sz val="11"/><color rgb="FF2563EB"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="4">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left/>
      <right/>
      <top/>
      <bottom style="thin"><color rgb="FF000000"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left/>
      <right/>
      <top/>
      <bottom style="dotted"><color rgb="FF94A3B8"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="${baseXfCount + extraCellXfs.length}">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: Report Title (Bold 12pt) -->
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 2: Table Header (Bold, Bottom Line) -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
    <!-- 3: Normal Text Cell -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 4: Quantity Cell (Right Align) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="right"/>
    </xf>
    <!-- 5: Money Cell (Right Align, #,##0) -->
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1">
      <alignment horizontal="right"/>
    </xf>
    <!-- 6: Day Total Label - End of Day (Bold, Bottom Line) -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
    <!-- 7: Day Total Value - End of Day (Bold, Right Align, #,##0, Bottom Line) -->
    <xf numFmtId="164" fontId="2" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right"/>
    </xf>
    <!-- 8: Summary Label Col K (Bold) -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 9: Summary Value Col L (Bold, Right Align, #,##0) -->
    <xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1">
      <alignment horizontal="right"/>
    </xf>
    <!-- 10: Final Debt Highlight (Bold Red, Right Align, #,##0) -->
    <xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1">
      <alignment horizontal="right"/>
    </xf>
    <!-- 11: Solar Date Cell (Visible on 1st row of day) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 12: Hidden Solar Date Cell for AutoFilter on normal rows (;;;) -->
    <xf numFmtId="165" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
    <!-- 13: Final Debt Label Highlight (Bold Red, Left Align) -->
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 14: Normal Text Cell - End of Day (Bottom Line) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
    <!-- 15: Quantity Cell - End of Day (Right Align, Bottom Line) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right"/>
    </xf>
    <!-- 16: Money Cell - End of Day (Right Align, #,##0, Bottom Line) -->
    <xf numFmtId="164" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right"/>
    </xf>
    <!-- 17: Solar Date Cell - End of Day (Visible, Bottom Line) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
    <!-- 18: Hidden Solar Date Cell - End of Day (;;;, Bottom Line) -->
    <xf numFmtId="165" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
    <!-- 19: Hidden Solar Date Cell on Summary Row - End of Day (;;;, Bottom Line) -->
    <xf numFmtId="165" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
    <!-- 20: Day Summary Label - Intermediate Row (Bold) -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 21: Day Summary Value - Intermediate Row (Bold, Right Align, #,##0) -->
    <xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1">
      <alignment horizontal="right"/>
    </xf>
    <!-- 22: Branch Subtotal Label (Bold Navy, Subtle Dotted Bottom Line) -->
    <xf numFmtId="0" fontId="6" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1"/>
    <!-- 23: Branch Subtotal Value (Bold Navy, Right Align, #,##0, Subtle Dotted Bottom Line) -->
    <xf numFmtId="164" fontId="6" fillId="0" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right"/>
    </xf>
    <!-- 24: Hidden Solar Date Cell on Branch Subtotal Row (;;;, Subtle Dotted Bottom Line) -->
    <xf numFmtId="165" fontId="4" fillId="0" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
    <!-- 25: Hyperlink Cell - Normal Row (Blue Bold Underlined, Centered) -->
    <xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="center"/>
    </xf>
    <!-- 26: Hyperlink Cell - End of Day (Blue Bold Underlined, Centered, Bottom Line) -->
    <xf numFmtId="0" fontId="8" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center"/>
    </xf>
    <!-- 27: Hyperlink Cell - Branch Subtotal Row (Blue Bold Underlined, Centered, Subtle Dotted Bottom Line) -->
    <xf numFmtId="0" fontId="8" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center"/>
    </xf>
    <!-- 28: Hyperlink Cell - Back Link on Sheet 2 (Blue Bold Underlined, Left Align, Bottom Line) -->
    <xf numFmtId="0" fontId="8" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>${extraXfsXml}
  </cellXfs>
</styleSheet>`;

  // Hàm dựng XML cho Sheet 1 (tích hợp AutoFilter, Hyperlink mở ảnh gốc và VML Comment hiện ảnh hóa đơn nổi ngay tại Sheet 1)
  const buildSheet1Xml = (wsRows, wsColWidths, wsAutoFilterRef) => {
    let colsXml = '';
    if (wsColWidths && wsColWidths.length > 0) {
      const colItems = wsColWidths
        .map((w, idx) => {
          const widthVal = w && w > 0 ? w : 10;
          return `<col min="${idx + 1}" max="${idx + 1}" width="${widthVal}" customWidth="1"/>`;
        })
        .join('');
      colsXml = `<cols>${colItems}</cols>`;
    }

    let sheetDataXml = '<sheetData>';
    (wsRows || []).forEach((rowCells, rIdx) => {
      const rowNum = rIdx + 1;
      let rowXml = `<row r="${rowNum}">`;
      (rowCells || []).forEach((cell, cIdx) => {
        if (cell == null) return;
        const isObj = typeof cell === 'object';
        const val = isObj ? cell.v : cell;
        let styleIdx = isObj && cell.s != null ? cell.s : 0;
        if (isObj && cell.displayAs) {
          const mapKey = `${styleIdx}__${cell.displayAs}`;
          if (displayAsStyleMap.has(mapKey)) {
            styleIdx = displayAsStyleMap.get(mapKey);
          }
        }
        const cellType = isObj && cell.t ? cell.t : 'str';
        const formula = isObj && cell.f ? cell.f : null;

        if (val === '' && !formula && styleIdx === 0) return;

        const colRef = `${getExcelColLetter(cIdx)}${rowNum}`;
        if (formula) {
          const isNumericVal =
            cellType === 'n' || (val !== '' && val != null && typeof val === 'number' && !isNaN(val));
          if (isNumericVal) {
            const numVal = val !== '' && val != null && !isNaN(val) ? `<v>${Number(val)}</v>` : '';
            rowXml += `<c r="${colRef}" s="${styleIdx}"><f>${escapeXml(formula)}</f>${numVal}</c>`;
          } else {
            const strVal = val != null && val !== '' ? `<v>${escapeXml(val)}</v>` : '';
            rowXml += `<c r="${colRef}" t="str" s="${styleIdx}"><f>${escapeXml(formula)}</f>${strVal}</c>`;
          }
        } else if (cellType === 'n' && val !== '' && val != null && !isNaN(val)) {
          rowXml += `<c r="${colRef}" s="${styleIdx}"><v>${Number(val)}</v></c>`;
        } else {
          rowXml += `<c r="${colRef}" t="inlineStr" s="${styleIdx}"><is><t xml:space="preserve">${escapeXml(val)}</t></is></c>`;
        }
      });
      rowXml += '</row>';
      sheetDataXml += rowXml;
    });
    sheetDataXml += '</sheetData>';

    const autoFilterXml = wsAutoFilterRef
      ? `<autoFilter ref="${escapeXml(wsAutoFilterRef)}"/>`
      : '';

    const hyperlinksXml = hasHyperlinks
      ? `<hyperlinks>${cellHyperlinks
          .map(
            (h, idx) =>
              `<hyperlink ref="${h.ref}" r:id="rId_hl${idx + 1}" tooltip="${escapeXml(h.tooltip)}"/>`
          )
          .join('')}</hyperlinks>`
      : '';

    const legacyDrawingXml = hasCommentImages ? '<legacyDrawing r:id="rId_vml1"/>' : '';

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${colsXml}
  ${sheetDataXml}
  ${autoFilterXml}
  ${hyperlinksXml}
  ${legacyDrawingXml}
</worksheet>`;
  };

  const sheet1Xml = buildSheet1Xml(rows, colWidths, autoFilterRef);

  const zipFiles = [
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheet1Xml },
  ];

  // Tạo file liên kết cho Sheet 1 (chứa các hyperlink mở ảnh và liên kết tới VML Comment nhúng ảnh trên Sheet 1)
  if (hasHyperlinks || hasCommentImages) {
    const sheet1RelEntries = [];
    cellHyperlinks.forEach((h, idx) => {
      sheet1RelEntries.push(
        `  <Relationship Id="rId_hl${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(h.url)}" TargetMode="External"/>`
      );
    });
    if (hasCommentImages) {
      sheet1RelEntries.push(
        `  <Relationship Id="rId_vml1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/>`
      );
      sheet1RelEntries.push(
        `  <Relationship Id="rId_comments1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/>`
      );
    }
    const sheet1RelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheet1RelEntries.join('\n')}
</Relationships>`;
    zipFiles.push({ name: 'xl/worksheets/_rels/sheet1.xml.rels', content: sheet1RelsXml });
  }

  // Tạo VML Comment (Ghi chú kèm nền ảnh hóa đơn) hiển thị trực tiếp ngay trên Sheet 1
  if (hasCommentImages) {
    const commentItemsXml = cellCommentImages
      .map(
        (c) => `    <comment ref="${c.ref}" authorId="0">
      <text>
        <r>
          <rPr><sz val="9"/><color rgb="FF000000"/><rFont val="Calibri"/></rPr>
          <t xml:space="preserve"> </t>
        </r>
      </text>
    </comment>`
      )
      .join('\n');

    const comments1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <authors>
    <author>HoaDon</author>
  </authors>
  <commentList>
${commentItemsXml}
  </commentList>
</comments>`;
    zipFiles.push({ name: 'xl/comments1.xml', content: comments1Xml });

    const vmlShapesXml = [];
    const vmlRelsEntries = [];

    cellCommentImages.forEach((c, idx) => {
      const imgNum = idx + 1;
      const shapeId = `_x0000_s${1025 + idx}`;
      const relId = `rId_img${imgNum}`;
      const mediaFileName = `image${imgNum}.${c.ext}`;

      // Đặt khung ảnh hóa đơn bật ra ngay bên cạnh ô "📷 Xem ảnh" trên Sheet 1 (rộng 260pt ~ 346px, cao 350pt ~ 466px)
      const marginLeftPt = (c.cIdx + 1) * 68;
      const marginTopPt = Math.max(4, c.rIdx * 15);

      vmlShapesXml.push(`  <v:shape id="${shapeId}" type="#_x0000_t202" style="position:absolute;margin-left:${marginLeftPt}pt;margin-top:${marginTopPt}pt;width:260pt;height:350pt;z-index:${idx + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto">
    <v:fill o:relid="${relId}" o:title="HoaDon_${imgNum}" type="frame" recolor="t"/>
    <v:shadow on="t" color="black" obscured="t"/>
    <v:path o:connecttype="none"/>
    <v:textbox style="mso-direction-alt:auto">
      <div style="text-align:left"></div>
    </v:textbox>
    <x:ClientData ObjectType="Note">
      <x:MoveWithCells/>
      <x:SizeWithCells/>
      <x:AutoFill>False</x:AutoFill>
      <x:Row>${c.rIdx}</x:Row>
      <x:Column>${c.cIdx}</x:Column>
    </x:ClientData>
  </v:shape>`);

      vmlRelsEntries.push(
        `  <Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaFileName}"/>`
      );

      zipFiles.push({
        name: `xl/media/${mediaFileName}`,
        content: c.bytes,
      });
    });

    const vmlDrawing1Xml = `<xml xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel">
  <o:shapelayout v:ext="edit">
    <o:idmap v:ext="edit" data="1"/>
  </o:shapelayout>
  <v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe">
    <v:stroke joinstyle="miter"/>
    <v:path gradientshapeok="t" o:connecttype="rect"/>
  </v:shapetype>
${vmlShapesXml.join('\n')}
</xml>`;

    const vmlDrawing1RelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${vmlRelsEntries.join('\n')}
</Relationships>`;

    zipFiles.push({ name: 'xl/drawings/vmlDrawing1.vml', content: vmlDrawing1Xml });
    zipFiles.push({ name: 'xl/drawings/_rels/vmlDrawing1.vml.rels', content: vmlDrawing1RelsXml });
  }

  const zipBytes = buildZipArchive(zipFiles);

  return new Blob([zipBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};
