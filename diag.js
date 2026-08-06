const { getAccessToken } = require('./lib/finanzas/microsoft-graph');

async function main() {
  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const itemId = '01OLVTNNWVXAQUW3PUIVHKOJNKEDH3WGJH';
  
  console.log('DriveId:', driveId);
  console.log('ItemId:', itemId);
  
  // Test 1: Get item metadata
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Name:', data.name);
  console.log('Has downloadUrl:', !!data['@microsoft.graph.downloadUrl']);
  
  if (!data['@microsoft.graph.downloadUrl']) {
    // Test 2: Try with $select
    const res2 = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}?$select=id,name,@microsoft.graph.downloadUrl`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data2 = await res2.json();
    console.log('\nWith $select:');
    console.log('Name:', data2.name);
    console.log('Has downloadUrl:', !!data2['@microsoft.graph.downloadUrl']);
    
    // Test 3: Try content endpoint
    const res3 = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' }
    );
    console.log('\nContent endpoint status:', res3.status);
    console.log('Location:', res3.headers.get('location')?.slice(0, 100));
  }
}
main().catch(e => console.error(e));
