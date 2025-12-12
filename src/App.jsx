import Uploader from './components/Uploader.jsx'

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', padding: 16, maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 8px' }}>Upload video → Google Drive → Google Sheet</h1>
      <p style={{ margin: '0 0 16px', color: '#444' }}>
        Dành cho <b>Google cá nhân</b>: dùng <b>OAuth</b> (không dùng service_account.json). Chọn ngành 0/1/2 → tự append vào tab tương ứng.
      </p>
      <Uploader />
      <footer style={{ marginTop: 28, fontSize: 12, color: '#666' }}>
        Gợi ý: Tabs trong Sheet nên đặt tên <b>0</b>, <b>1</b>, <b>2</b>. App sẽ tự tạo nếu thiếu.
      </footer>
    </div>
  )
}
