// meat-management-fe/app/+html.js
import { ScrollViewStyleReset } from 'expo-router/html';

// File này cấu hình cấu trúc HTML gốc trên môi trường Web.
// Nó chỉ được chạy phía Node.js lúc build hoặc SSR.
export default function Root({ children }) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        
        {/* Ngăn chặn tự động thu phóng (auto-zoom) khi bấm vào ô nhập liệu trên điện thoại */}
        <meta 
          name="viewport" 
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" 
        />
        
        <ScrollViewStyleReset />
        
        {/* CSS toàn cục để ép kiểu font chữ của các ô nhập liệu tối thiểu là 16px trên Web, chống zoom của iOS Safari */}
        <style dangerouslySetInnerHTML={{ __html: `
          input, textarea, select {
            font-size: 16px !important;
          }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
