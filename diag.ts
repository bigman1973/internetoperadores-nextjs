import { getAccessToken } from './lib/finanzas/microsoft-graph';

async function main() {
  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const itemId = '01OLVTNNWVXAQUW3PUIVHKOJNKEDH3WGJH';
  
  console.log('DriveId:', driveId);
  console.log('ItemId:', itemId);
  
  // Test 1: Get item with $select
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}?$select=id,name,@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Name:', data.name);
  console.log('Has downloadUrl:', !!data['@microsoft.graph.downloadUrl']);
  
  if (!data['@microsoft.graph.downloadUrl']) {
    console.log('Full response:', JSON.stringify(data, null, 2).slice(0, 500));
    
    // Test 2: Try /content endpoint
    const res2 = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' }
    );
    console.log('\n/content status:', res2.status);
    if (res2.status === 302) {
      console.log('Redirect URL found - use /content endpoint instead');
    }
  }
}
main().catch(e => console.error(e));
