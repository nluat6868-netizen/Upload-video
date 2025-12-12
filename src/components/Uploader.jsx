import { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import axios from 'axios'
import {
  Button,
  Card,
  Upload,
  Select,
  Input,
  Typography,
  Space,
  message,
  Checkbox,
  Table,
  Tag,
  Modal,
  Divider
} from 'antd'
import {
  UploadOutlined,
  GoogleOutlined,
  PlusOutlined,
  ReloadOutlined,
  FileAddOutlined
} from '@ant-design/icons'
import {
  SCOPES,
  appendRow,
  ensureSheetHeader,
  listSpreadsheets,
  uploadVideoMultipart,
  makeFilePublic,
  findOrCreateFolder,
  listDriveFolders,
  loadAffiliateItems
} from '../lib/google.js'

const { Title, Text } = Typography
const { TextArea } = Input

const ls = {
  get(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)) } catch {}
  }
}

export default function Uploader() {
  const [accessToken, setAccessToken] = useState('')
  const [userEmail, setUserEmail] = useState('')

  /* ===== Drive Folder ===== */
  const [folders, setFolders] = useState([])
  const [selectedFolderId, setSelectedFolderId] = useState(ls.get('driveFolderId', ''))
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  /* ===== Spreadsheet list ===== */
  const [sheets, setSheets] = useState([])

  /* ===== VIDEO SHEET (destination) ===== */
  const [videoSheetId, setVideoSheetId] = useState('')
  const [videoTabs, setVideoTabs] = useState([])
  const [videoTab, setVideoTab] = useState('')
  const videoSheetLink = videoSheetId ? `https://docs.google.com/spreadsheets/d/${videoSheetId}/edit` : ''

  /* ===== AFFILIATE SHEET (source) ===== */
  const [affSheetId, setAffSheetId] = useState('')
  const [affTabs, setAffTabs] = useState([])
  const [affTab, setAffTab] = useState('')
  const [affItems, setAffItems] = useState([]) // [{name, productId}]
  const [selectedAffName, setSelectedAffName] = useState('')

  /* ===== Upload ===== */
  const [fileList, setFileList] = useState([])
  const [content, setContent] = useState('')
  const [makePublic, setMakePublic] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [rows, setRows] = useState([])

  /* ===== Login ===== */
  const login = useGoogleLogin({
    scope: SCOPES,
    prompt: 'consent',
    onSuccess: async ({ access_token }) => {
      setAccessToken(access_token)
      try {
        const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` }
        }).then(r => r.json())
        setUserEmail(me?.email || '')
      } catch {}
      message.success('Đăng nhập Google thành công')
    },
    onError: () => message.error('Đăng nhập Google lỗi')
  })

  /* ===== Load Drive folders ===== */
  const loadFolders = async () => {
    setFolders(await listDriveFolders(accessToken))
  }

  const selectFolder = (id) => {
    setSelectedFolderId(id || '')
    ls.set('driveFolderId', id || '')
  }

  const createFolder = async () => {
    if (!newFolderName.trim()) return
    const id = await findOrCreateFolder(accessToken, newFolderName.trim(), 'root')
    setCreateFolderOpen(false)
    setNewFolderName('')
    await loadFolders()
    selectFolder(id)
  }

  /* ===== Load spreadsheets ===== */
  const loadSheets = async () => {
    if (!accessToken) return
    setSheets(await listSpreadsheets(accessToken))
  }

  /* ===== Helpers: load tabs of a sheet ===== */
  async function fetchTabs(spreadsheetId) {
    const res = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    return (res.data.sheets || []).map(s => s.properties?.title).filter(Boolean)
  }

  /* ===== Pick VIDEO sheet ===== */
  const pickVideoSheet = async (id) => {
    setVideoSheetId(id)
    setRows([])
    const tabs = await fetchTabs(id)
    setVideoTabs(tabs)
    const first = tabs[0] || ''
    setVideoTab(first)
  }

  /* ===== Pick AFF sheet ===== */
  const pickAffSheet = async (id) => {
    setAffSheetId(id)
    setAffItems([])
    setSelectedAffName('')
    const tabs = await fetchTabs(id)
    setAffTabs(tabs)
    const first = tabs[0] || ''
    setAffTab(first)
    if (first) {
      const items = await loadAffiliateItems(accessToken, id, first)
      setAffItems(items)
    }
  }

  const changeAffTab = async (tab) => {
    setAffTab(tab)
    setAffItems([])
    setSelectedAffName('')
    const items = await loadAffiliateItems(accessToken, affSheetId, tab)
    setAffItems(items)
  }

  /* ===== Upload ===== */
  const handleUpload = async () => {
    if (!fileList.length) return message.error('Chưa chọn video')
    if (!videoSheetId || !videoTab) return message.error('Chưa chọn Video Sheet/Tab')

    // affiliate_id = productId của name đã chọn (nếu có)
    const affiliateId = selectedAffName
      ? (affItems.find(x => x.name === selectedAffName)?.productId || '')
      : ''

    setUploading(true)

    const init = fileList.map((f, i) => ({
      key: `${Date.now()}-${i}`,
      fileName: f.name,
      status: 'queued',
      videoURL: '',
      affiliate_id: affiliateId || ''
    }))
    setRows(init)

    const update = (k, p) => setRows(prev => prev.map(x => (x.key === k ? { ...x, ...p } : x)))

    for (let i = 0; i < fileList.length; i++) {
      const rowKey = init[i].key
      try {
        update(rowKey, { status: 'uploading' })

        const uploaded = await uploadVideoMultipart(
          accessToken,
          fileList[i].originFileObj,
          { parentFolderId: selectedFolderId || undefined }
        )

        if (makePublic) await makeFilePublic(accessToken, uploaded.id)

        const url = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`
        update(rowKey, { status: 'writing', videoURL: url })

        // đảm bảo header đúng A:C
        await ensureSheetHeader(accessToken, videoSheetId, videoTab)

        // ghi 3 cột: videoURL, content, affiliate_id(productId)
        await appendRow(accessToken, videoSheetId, videoTab, [
          url,
          content,
          affiliateId
        ])

        update(rowKey, { status: 'done' })
      } catch (e) {
        console.error(e)
        update(rowKey, { status: 'failed' })
      }
    }

    setUploading(false)
    message.success('Upload xong & đã ghi videoURL/content/affiliate_id vào Google Sheet')
  }

  /* ===== Table ===== */
  const columns = [
    { title: 'File', dataIndex: 'fileName' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: s =>
        s === 'done' ? <Tag color="green">Done</Tag> :
        s === 'failed' ? <Tag color="red">Failed</Tag> :
        <Tag>{s}</Tag>
    },
    { title: 'affiliate_id', dataIndex: 'affiliate_id', render: v => v ? <Text code>{v}</Text> : '—' },
    {
      title: 'Video',
      dataIndex: 'videoURL',
      render: v => v ? <a href={v} target="_blank" rel="noreferrer">Open</a> : '—'
    }
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Title level={3}>Upload Video → Drive → Google Sheet (+ affiliate_id)</Title>

      {!accessToken ? (
        <Button type="primary" icon={<GoogleOutlined />} onClick={login}>
          Đăng nhập Google
        </Button>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Text>Đã đăng nhập: <b>{userEmail}</b></Text>

          {/* Drive folder */}
          <Card title="📁 Folder Google Drive">
            <Space>
              <Button onClick={loadFolders} icon={<ReloadOutlined />}>Load</Button>
              <Button icon={<PlusOutlined />} onClick={() => setCreateFolderOpen(true)}>Tạo</Button>
            </Space>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              allowClear
              value={selectedFolderId || undefined}
              onChange={selectFolder}
              options={folders.map(f => ({ label: f.name, value: f.id }))}
              placeholder="Chọn folder (optional)"
            />
          </Card>

          {/* Load sheets */}
          <Card title="📄 Danh sách Google Sheets">
            <Button onClick={loadSheets}>Load Sheets</Button>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              (Dùng list này cho cả Video Sheet & Affiliate Sheet)
            </Text>
          </Card>

          {/* VIDEO SHEET */}
          <Card title="🎬 Video Sheet (nơi ghi videoURL/content/affiliate_id)">
            <Select
              style={{ width: '100%' }}
              value={videoSheetId || undefined}
              onChange={pickVideoSheet}
              options={sheets.map(s => ({ label: s.name, value: s.id }))}
              placeholder="Chọn file Google Sheet để ghi kết quả"
              showSearch
              filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
            {videoSheetLink && (
              <div style={{ marginTop: 8 }}>
                <a href={videoSheetLink} target="_blank" rel="noreferrer">{videoSheetLink}</a>
              </div>
            )}
            {videoTabs.length > 0 && (
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={videoTab || undefined}
                onChange={setVideoTab}
                options={videoTabs.map(t => ({ label: t, value: t }))}
                placeholder="Chọn tab để ghi"
              />
            )}
          </Card>

          {/* AFFILIATE SHEET */}
          <Card title="🛒 Affiliate Sheet (nơi lấy name → productId)">
            <Select
              style={{ width: '100%' }}
              value={affSheetId || undefined}
              onChange={pickAffSheet}
              options={sheets.map(s => ({ label: s.name, value: s.id }))}
              placeholder="Chọn file Google Sheet affiliate (ví dụ file A)"
              showSearch
              filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />

            {affTabs.length > 0 && (
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={affTab || undefined}
                onChange={changeAffTab}
                options={affTabs.map(t => ({ label: t, value: t }))}
                placeholder="Chọn tab affiliate (mặc định tab đầu)"
              />
            )}

            <Select
              style={{ width: '100%', marginTop: 8 }}
              allowClear
              value={selectedAffName || undefined}
              onChange={setSelectedAffName}
              options={affItems.map(x => ({ label: x.name, value: x.name }))}
              placeholder="Chọn name (a01, a02, ...)"
              showSearch
              filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />

            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              Affiliate file format (tab affiliate): <b>col A = name</b>, <b>col B = productId</b> (từ hàng 2).
            </Text>
          </Card>

          {/* Upload */}
          <Card title="⬆️ Upload video">
            <Upload
              multiple
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList }) => setFileList(fileList)}
              accept="video/*"
            >
              <Button icon={<UploadOutlined />}>Chọn video</Button>
            </Upload>

            <TextArea
              rows={3}
              placeholder="Content"
              value={content}
              onChange={e => setContent(e.target.value)}
              style={{ marginTop: 8 }}
            />

            <Checkbox checked={makePublic} onChange={e => setMakePublic(e.target.checked)} style={{ marginTop: 8 }}>
              Public link
            </Checkbox>

            <div style={{ marginTop: 10 }}>
              <Button type="primary" loading={uploading} onClick={handleUpload}>
                Upload & Lưu vào Video Sheet
              </Button>
            </div>

            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              Video Sheet sẽ lưu: <b>videoURL</b>, <b>content</b>, <b>affiliate_id (productId)</b>
            </Text>
          </Card>

          <Divider />
          <Table columns={columns} dataSource={rows} />
        </Space>
      )}

      {/* Create folder modal */}
      <Modal
        open={createFolderOpen}
        onOk={createFolder}
        onCancel={() => setCreateFolderOpen(false)}
        title="Tạo folder Drive"
      >
        <Input
          placeholder="Tên folder"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
        />
      </Modal>
    </div>
  )
}
