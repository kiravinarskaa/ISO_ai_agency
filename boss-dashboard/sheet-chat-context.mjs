export const CHAT_TABS = ['Ledger', 'Task Ledger', 'Chat History', 'Run Outputs', 'Dashboard Archives', 'Email Delivery'];

// One metadata read and one batch read for the entire workbook snapshot.
// Missing tabs are reported, never created by chat.
export async function readChatWorkbook(sheets, spreadsheetId) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const available = new Set((metadata.data.sheets || []).map(s => s.properties.title));
  const present = CHAT_TABS.filter(name => available.has(name));
  const result = present.length ? await sheets.spreadsheets.values.batchGet({ spreadsheetId,
    ranges: present.map(name => "'" + name.replaceAll("'", "''") + "'"),
  }) : { data: { valueRanges: [] } };
  return { readAt: new Date().toISOString(), tabs: CHAT_TABS.map(name => {
    const index = present.indexOf(name);
    const values = index < 0 ? [] : result.data.valueRanges?.[index]?.values || [];
    return { name, available: index >= 0, headers: values[0] || [], rows: values.slice(1) };
  }) };
}

export function workbookEvidence(snapshot, question) {
  if (!snapshot) return { available: false, reason: 'Workbook snapshot was not loaded.' };
  const terms = [...new Set(String(question || '').toLowerCase().match(/[\p{L}\p{N}-]{3,}/gu) || [])];
  return { readAt: snapshot.readAt, scope: 'Entire configured workbook; independent of dashboard filters', tabs: snapshot.tabs.map(tab => {
    let remaining = 16_000;
    const ranked = tab.rows.map((cells, i) => ({ row: i + 2, cells, score: terms.reduce((sum, term) => sum + (JSON.stringify(cells).toLowerCase().includes(term) ? 1 : 0), 0) }))
      .sort((a, b) => b.score - a.score || b.row - a.row);
    const records = [];
    for (const record of ranked) {
      const size = JSON.stringify(record.cells).length;
      if (size > remaining) continue;
      remaining -= size;
      records.push({ row: record.row, cells: record.cells });
    }
    return { name: tab.name, available: tab.available, headers: tab.headers, totalRows: tab.rows.length,
      includedRows: records.length, truncated: records.length < tab.rows.length, records };
  }) };
}
