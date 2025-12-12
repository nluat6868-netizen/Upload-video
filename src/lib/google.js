import axios from 'axios'

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
].join(' ')

export function extractSpreadsheetId(input) {
  if (!input) return ''
  // Allow plain ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(input) && !input.includes('http')) return input.trim()

  // URL patterns: /spreadsheets/d/<id>
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (m && m[1]) return m[1]
  return input.trim()
}

export async function listSpreadsheets(accessToken) {
  // Needs drive scope (not just drive.file) to list user files.
  const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: 'files(id,name,modifiedTime,owners(displayName,emailAddress))',
      orderBy: 'modifiedTime desc',
      pageSize: 50
    }
  })
  return res.data.files ?? []
}

export async function ensureIndustryTabs(accessToken, spreadsheetId, industryTabs = ['0','1','2']) {
  const getRes = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { fields: 'sheets(properties(sheetId,title))' }
  })
  const existing = new Set((getRes.data.sheets ?? []).map(s => s.properties?.title).filter(Boolean))
  const toAdd = industryTabs.filter(t => !existing.has(t))
  if (!toAdd.length) return

  const requests = toAdd.map(title => ({ addSheet: { properties: { title } } }))
  await axios.post(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    { requests },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  )
}

export async function appendRow(accessToken, spreadsheetId, tabName, values) {
  const range = `${encodeURIComponent(tabName)}!A:C`
  await axios.post(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append`,
    { values: [values] },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      params: { valueInputOption: 'USER_ENTERED' }
    }
  )
}

export async function findOrCreateFolder(accessToken, folderName, parentId = 'root') {
  // Find
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${folderName.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    'trashed=false'
  ].join(' and ')

  const listRes = await axios.get('https://www.googleapis.com/drive/v3/files', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      q,
      fields: 'files(id,name)',
      pageSize: 10
    }
  })

  const hit = (listRes.data.files ?? [])[0]
  if (hit?.id) return hit.id

  // Create
  const createRes = await axios.post(
    'https://www.googleapis.com/drive/v3/files',
    {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      params: { fields: 'id' }
    }
  )
  return createRes.data.id
}

export async function uploadVideoMultipart(accessToken, file, { parentFolderId } = {}) {
  const metadata = {
    name: file.name,
    ...(parentFolderId ? { parents: [parentFolderId] } : {})
  }

  const formData = new FormData()
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  formData.append('file', file)

  const res = await axios.post(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
    formData,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  return res.data // {id, webViewLink, webContentLink}
}

export async function makeFilePublic(accessToken, fileId) {
  // anyone with the link can view
  await axios.post(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    { role: 'reader', type: 'anyone' },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  )
}
export async function listDriveFolders(accessToken) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?q=' +
    encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false") +
    '&fields=' + encodeURIComponent('files(id,name)') +
    '&pageSize=200&orderBy=modifiedTime desc', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
  const data = await res.json()
  return data.files || []
}
export async function ensureSheetHeader(accessToken, spreadsheetId, sheetTab) {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
    `${encodeURIComponent(sheetTab)}!A1:B1`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const data = await res.json()

  if (!data.values || data.values.length === 0) {
    await fetch(url + '?valueInputOption=USER_ENTERED', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [['videoURL', 'content']]
      })
    })
  }
}


