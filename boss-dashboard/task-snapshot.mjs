// One read request per refresh for both sources. Original row numbers remain
// intact so task writes always address the original Task Ledger row.
export async function readTaskSnapshot(sheets, spreadsheetId, includeLedger) {
 const ranges = ["'Task Ledger'!A2:P"];
 if (includeLedger) ranges.push("'Ledger'!A1:H");
 const result = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
 return {
  rows: (result.data.valueRanges?.[0]?.values || []).map((cells,index)=>({ rowNumber:index+2, cells:Array.from({length:16},(_,i)=>cells[i] || '') })),
  executionRows: includeLedger ? result.data.valueRanges?.[1]?.values || [] : [],
 };
}
