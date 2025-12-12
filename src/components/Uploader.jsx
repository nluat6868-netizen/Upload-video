import { useEffect, useMemo, useState } from 'react'
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
  Divider,
  Collapse
} from 'antd'
import {
  UploadOutlined,
  GoogleOutlined,
  FolderOpenOutlined,
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
  listDriveFolders
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

  /* ========== DRIVE FOLDER ========== */
  const [folders, setFolders] = useState([])
  const [selectedFolderId, setSelectedFolderId] = useState(ls.get('driveFolderId', ''))
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  /* ========== GOOGLE SHEET FILE ========== */
  const [sheets, setSheets] = useState([])
  const [loadingSheets, setLoadingSheets] = useState(false)
  const [pickedSheetId, setPickedSheetId] = useState('')
  const [sheetAliasMap, setSheetAliasMap] = useState(ls.get('sheetAliasMap', {}))
  const sheetLink = pickedSheetId
    ? `https://docs.google.com/spreadsheets/d/${pickedSheetId}/edit`
    : ''

  /* ========== TABS ========== */
  const [tabs, setTabs] = useState([])
  const [selectedTabReal, setSelectedTabReal] = useState('')
  const [tabAliasMap, setTabAliasMap] = useState({})

  /* ========== UPLOAD ========== */
  const [fileList, setFileList] = useState([])
  const [content, setContent] = useState('')
  const [makePublic, setMakePublic] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [rows, setRows] = useState([])

  /* ========== LOGIN ========== */
  const login = useGoogleLogin({
    scope: SCOPES,
    prompt: 'consent',
    onSuccess: async ({ access_token }) => {
      setAccessToken(access_token)
      message.success('Đăng nhập Google thành công')
      try {
        const me = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          { headers: { Authorization: `Bearer ${access_token}` } }
        ).then(r => r.json())
        setUserEmail(me?.email || '')
      } catch {}
    }
  })

  /* ========== DRIVE FOLDER ========== */
  const loadFolders = async () => {
    setLoadingFolders(true)
    try {
      setFolders(await listDriveFolders(accessToken))
    } finally {
      setLoadingFolders(false)
    }
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

  /* ========== SHEETS ========== */
  const loadSheets = async () => {
    setLoadingSheets(true)
    try {
      setSheets(await listSpreadsheets(accessToken))
    } finally {
      setLoadingSheets(false)
    }
  }

  const createSheet = async () => {
    const res = await axios.post(
      'https://sheets.googleapis.com/v4/spreadsheets',
      { properties: { title: 'New Sheet ' + new Date().toLocaleString() } },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    await loadSheets()
    setPickedSheetId(res.data.spreadsheetId)
  }

  const pickSheet = async (id) => {
    setPickedSheetId(id)
    setRows([])
    const res = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const realTabs = res.data.sheets.map(s => s.properties.title)
    setTabs(realTabs)
    setSelectedTabReal(realTabs[0] || '')
    const alias = {}
    realTabs.forEach(t => alias[t] = t)
    setTabAliasMap(alias)
  }

  useEffect(() => ls.set('sheetAliasMap', sheetAliasMap), [sheetAliasMap])

  /* ========== UPLOAD ========== */
const handleUpload = async () => {
  if (!fileList.length || !pickedSheetId || !selectedTabReal) {
    message.error('Thiếu file / sheet / tab')
    return
  }

  setUploading(true)

  const init = fileList.map((f, i) => ({
    key: i + '-' + Date.now(),
    fileName: f.name,
    status: 'queued',
    videoURL: ''
  }))
  setRows(init)

  const update = (k, p) =>
    setRows(r => r.map(x => x.key === k ? { ...x, ...p } : x))

  for (let i = 0; i < fileList.length; i++) {
    const rowKey = init[i].key
    try {
      update(rowKey, { status: 'uploading' })

      const uploaded = await uploadVideoMultipart(
        accessToken,
        fileList[i].originFileObj,
        { parentFolderId: selectedFolderId || undefined }
      )

      if (makePublic) {
        await makeFilePublic(accessToken, uploaded.id)
      }

      const url =
        uploaded.webViewLink ||
        `https://drive.google.com/file/d/${uploaded.id}/view`

      update(rowKey, { status: 'writing', videoURL: url })

      // 🔴 FIX QUAN TRỌNG
      await ensureSheetHeader(accessToken, pickedSheetId, selectedTabReal)
      await appendRow(accessToken, pickedSheetId, selectedTabReal, [
        url,
        content
      ])

      update(rowKey, { status: 'done' })
    } catch (e) {
      console.error(e)
      update(rowKey, { status: 'failed' })
    }
  }

  setUploading(false)
  message.success('Upload xong & đã ghi Google Sheet')
}

  /* ========== TABLE ========== */
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
    {
      title: 'Video',
      dataIndex: 'videoURL',
      render: v => v ? <a href={v} target="_blank">Open</a> : '—'
    }
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Title level={3}>Upload Video → Drive → Google Sheet</Title>

      {!accessToken ? (
        <Button type="primary" icon={<GoogleOutlined />} onClick={login}>
          Đăng nhập Google
        </Button>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Text>Đã đăng nhập: <b>{userEmail}</b></Text>

          {/* DRIVE FOLDER */}
          <Card title="📁 Folder Google Drive">
            <Space>
              <Button onClick={loadFolders} icon={<ReloadOutlined />}>Load</Button>
              <Button onClick={() => setCreateFolderOpen(true)} icon={<PlusOutlined />}>Tạo</Button>
            </Space>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              allowClear
              value={selectedFolderId || undefined}
              onChange={selectFolder}
              options={folders.map(f => ({ label: f.name, value: f.id }))}
            />
          </Card>

          {/* SHEET */}
          <Card title="📄 Google Sheet">
            <Space>
              <Button onClick={loadSheets}>Load Sheets</Button>
              <Button icon={<FileAddOutlined />} onClick={createSheet}>Tạo Sheet</Button>
            </Space>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={pickedSheetId || undefined}
              onChange={pickSheet}
              options={sheets.map(s => ({
                label: sheetAliasMap[s.id] || s.name,
                value: s.id
              }))}
            />
            {sheetLink && <a href={sheetLink} target="_blank">{sheetLink}</a>}
          </Card>

          {/* TABS */}
          {tabs.length > 0 && (
            <Card title="🗂️ Tab trong Sheet">
              <Select
                style={{ width: '100%' }}
                value={selectedTabReal}
                onChange={setSelectedTabReal}
                options={tabs.map(t => ({
                  label: tabAliasMap[t] || t,
                  value: t
                }))}
              />
            </Card>
          )}

          {/* UPLOAD */}
          <Card title="⬆️ Upload video (nhiều file)">
            <Upload
              multiple
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList }) => setFileList(fileList)}
            >
              <Button icon={<UploadOutlined />}>Chọn video</Button>
            </Upload>

            <TextArea
              rows={3}
              placeholder="Content"
              value={content}
              onChange={e => setContent(e.target.value)}
            />

            <Checkbox checked={makePublic} onChange={e => setMakePublic(e.target.checked)}>
              Public link
            </Checkbox>

            <Button
              type="primary"
              loading={uploading}
              onClick={handleUpload}
            >
              Upload & Lưu
            </Button>
          </Card>

          <Divider />

          {/* TABLE */}
          <Table columns={columns} dataSource={rows} />
        </Space>
      )}

      {/* CREATE FOLDER MODAL */}
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
