# gdrive-video-sheet-uploader

Website (React + Vite) cho phép:
- Người dùng đăng nhập Google (OAuth)
- Upload **video** lên Google Drive (My Drive)
- Chọn **ngành nghề 0/1/2** → tự append dòng vào **Google Sheet** (tab `0`/`1`/`2`)
- (Tuỳ chọn) tự tạo folder Drive theo ngành + set file public.

## 1) Chuẩn bị trên Google Cloud
1. Vào Google Cloud Console → chọn Project
2. Enable APIs:
   - Google Drive API
   - Google Sheets API
3. Credentials → Create Credentials → OAuth client ID → Web application
4. Thêm Authorized JavaScript origins:
   - http://localhost:5173
5. Copy **Client ID**

## 2) Cấu hình môi trường
Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Mở `.env` và set:

```env
VITE_GOOGLE_CLIENT_ID=PASTE_YOUR_CLIENT_ID
```

## 3) Chạy project
```bash
npm install
npm run dev
```

Mở: http://localhost:5173

## 4) Cách dùng
1. Đăng nhập Google
2. Tải danh sách Sheets (hoặc dán Spreadsheet URL/ID)
3. Chọn video + ngành 0/1/2 + content
4. Upload & Update

## Ghi chú
- App sẽ tự tạo tabs `0`, `1`, `2` nếu sheet chưa có.
- Nếu không bật “public”, người khác mở link có thể bị yêu cầu xin quyền.
