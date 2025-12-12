import axios from 'axios'

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
].join(' ')

export function extractSpreadsheetId(input) {
  if (!input) return ''
  if (/^[a-zA-Z0-9-_]{20,}$/.test(input) && !input.includes('http')) return input.trim()
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (m && m[1]) return m[1]
  return input.trim()
}

export async function listSpreadsheets(accessToken) {
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

/**
 * Ensure header A1:C1 for VIDEO SHEET:
 * A: videoURL
 * B: content
 * C: affiliate_id
 */
export async function ensureSheetHeader(accessToken, spreadsheetId, tabName) {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
    `${encodeURIComponent(tabName)}!A1:D1`

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
        values: [['videoURL', 'content', 'affiliate_id', 'name']]
      })
    })
  }
}


/**
 * Append a row into VIDEO SHEET (A:C)
 * values = [videoURL, content, affiliate_id]
 */
export async function appendRow(accessToken, spreadsheetId, tabName, values) {
  const range = `${encodeURIComponent(tabName)}!A:D`
  await axios.post(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append`,
    { values: [values] },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      params: {
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS'
      }
    }
  )
}


/**
 * Load affiliate items from an AFFILIATE SHEET file:
 * Assumption: In affTab, columns are:
 * A: name (a01, a02, ...)
 * B: productId (101, ...)
 *
 * range: A2:B
 * return: [{ name, productId }]
 */
export async function loadAffiliateItems(accessToken, affiliateSpreadsheetId, affTab) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${affiliateSpreadsheetId}/values/${encodeURIComponent(affTab)}!A2:B`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const data = await res.json()
  const rows = data.values || []
  return rows
    .map(r => ({ name: (r?.[0] || '').trim(), productId: (r?.[1] || '').toString().trim() }))
    .filter(x => x.name && x.productId)
}

export async function findOrCreateFolder(accessToken, folderName, parentId = 'root') {
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${folderName.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    'trashed=false'
  ].join(' and ')

  const listRes = await axios.get('https://www.googleapis.com/drive/v3/files', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { q, fields: 'files(id,name)', pageSize: 10 }
  })

  const hit = (listRes.data.files ?? [])[0]
  if (hit?.id) return hit.id

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

  return res.data
}

export async function makeFilePublic(accessToken, fileId) {
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
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=' +
      encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false") +
      '&fields=' + encodeURIComponent('files(id,name)') +
      '&pageSize=200&orderBy=modifiedTime desc',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  return data.files || []
}
