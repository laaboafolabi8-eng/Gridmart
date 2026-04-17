import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getGoogleSheetsClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export async function getSpreadsheetData(spreadsheetId: string, range: string = 'Sheet1') {
  const sheets = await getGoogleSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  
  return response.data.values || [];
}

export async function getSpreadsheetMetadata(spreadsheetId: string) {
  const sheets = await getGoogleSheetsClient();
  
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });
  
  return {
    title: response.data.properties?.title,
    sheets: response.data.sheets?.map(s => ({
      title: s.properties?.title,
      sheetId: s.properties?.sheetId,
    }))
  };
}

export async function updateSpreadsheetCell(spreadsheetId: string, range: string, value: string) {
  const sheets = await getGoogleSheetsClient();
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[value]],
    },
  });
}

export async function batchUpdateSpreadsheetCells(
  spreadsheetId: string, 
  updates: { range: string; value: string }[]
) {
  const sheets = await getGoogleSheetsClient();
  
  const data = updates.map(u => ({
    range: u.range,
    values: [[u.value]],
  }));
  
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  });
}

export async function clearAndWriteSheet(
  spreadsheetId: string,
  sheetName: string,
  rows: string[][]
) {
  const sheets = await getGoogleSheetsClient();

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: sheetName,
  });

  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: rows,
      },
    });
  }
}
